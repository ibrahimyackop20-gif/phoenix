/**
 * Ops Telegram alerts for print-order status changes.
 * Invoked by DB trigger notify_order_status_change via pg_net.
 *
 * Secrets (Edge Function env):
 *   TELEGRAM_BOT_TOKEN
 *   ADMIN_CHAT_ID
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type TgEvent =
  | "accepted"
  | "rejected"
  | "admin_cancelled"
  | "customer_cancelled"
  | "printing"
  | "out_for_delivery"
  | "completed"
  | "pending"
  | "status";

type Body = {
  event?: TgEvent | string;
  order_id?: string;
  order_number?: string;
  customer_name?: string;
  phone?: string;
  status?: string;
  cancelled_by?: string;
  time?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildMessage(body: Body): string | null {
  const event = (body.event || "").trim();
  const orderNo = esc(body.order_number || body.order_id?.slice(0, 8)?.toUpperCase() || "—");
  const name = esc(body.customer_name || "Unknown");
  const phone = esc(body.phone || "—");
  const time = esc(body.time || new Date().toISOString());

  const details =
    `\n\n🧾 <b>Order:</b> #${orderNo}` +
    `\n👤 <b>Customer:</b> ${name}` +
    `\n📞 <b>Phone:</b> ${phone}` +
    `\n🕒 <b>Time:</b> ${time}`;

  switch (event) {
    case "customer_cancelled":
      return (
        `❌ <b>Order Cancelled by Customer</b>` +
        details +
        `\n\n📝 <b>Reason:</b> Cancelled by customer`
      );
    case "admin_cancelled":
      return (
        `❌ <b>Order Cancelled by Administration</b>` +
        details +
        `\n\n📝 <b>Reason:</b> Cancelled by administration`
      );
    case "accepted":
      return `✅ <b>Order Accepted</b>` + details;
    case "rejected":
      return `🚫 <b>Order Rejected</b>` + details;
    default:
      return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
    const chatId = Deno.env.get("ADMIN_CHAT_ID")?.trim();
    if (!token || !chatId) {
      console.warn("[notify-order-telegram] TELEGRAM_BOT_TOKEN or ADMIN_CHAT_ID missing");
      return json({ ok: false, error: "telegram_not_configured" }, 200);
    }

    const body = (await req.json()) as Body;
    const text = buildMessage(body);
    if (!text) {
      return json({ ok: true, skipped: true });
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      console.error("[notify-order-telegram] Telegram API error:", data);
      return json({ ok: false, error: "telegram_send_failed", detail: data }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("[notify-order-telegram]", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
