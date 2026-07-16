import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CONTACT_TO =
  Deno.env.get("CONTACT_EMAIL_TO")?.trim() || "designerphonex@gmail.com";

interface ContactBody {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendViaResend(payload: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }

  const from =
    Deno.env.get("CONTACT_EMAIL_FROM")?.trim() ||
    "Phoenix Print <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [CONTACT_TO],
      reply_to: payload.email,
      subject: `[Phoenix Print Contact] ${payload.subject}`,
      text:
        `Name: ${payload.name}\n` +
        `Email: ${payload.email}\n` +
        `Subject: ${payload.subject}\n\n` +
        `${payload.message}`,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend failed (${res.status}): ${errText}`);
  }
}

async function sendViaFormSubmit(payload: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<"formsubmit" | "formsubmit_pending_activation"> {
  const res = await fetch(`https://formsubmit.co/ajax/${CONTACT_TO}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://phoenix-print.vercel.app",
      Referer: "https://phoenix-print.vercel.app/",
    },
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      _replyto: payload.email,
      _subject: `[Phoenix Print Contact] ${payload.subject}`,
      message: payload.message,
      _template: "table",
      _captcha: "false",
    }),
  });

  const data = await res.json().catch(() => ({}));
  const msg = String(data.message || "");

  // First-time FormSubmit: activation email is sent to CONTACT_TO (real mail).
  if (/activation|activate form/i.test(msg)) {
    return "formsubmit_pending_activation";
  }

  if (!res.ok || data.success === "false" || data.error) {
    throw new Error(msg || `FormSubmit failed (${res.status})`);
  }
  return "formsubmit";
}

async function notifyTelegram(payload: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
  const chatId = Deno.env.get("ADMIN_CHAT_ID")?.trim();
  if (!token || !chatId) return false;

  const text =
    `📩 <b>Contact Us</b>\n\n` +
    `👤 <b>Name:</b> ${payload.name}\n` +
    `✉️ <b>Email:</b> ${payload.email}\n` +
    `📋 <b>Subject:</b> ${payload.subject}\n\n` +
    `${payload.message}`;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
  const data = await res.json().catch(() => ({}));
  return Boolean(data.ok);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const body = (await req.json()) as ContactBody;
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();

    if (!name || !email || !subject || !message) {
      return jsonResponse({ ok: false, error: "validation_required" }, 400);
    }
    if (!isValidEmail(email)) {
      return jsonResponse({ ok: false, error: "validation_email" }, 400);
    }
    if (message.length < 10) {
      return jsonResponse({ ok: false, error: "validation_message_short" }, 400);
    }

    const payload = { name, email, subject, message };
    const channels: string[] = [];
    let emailOk = false;

    // Prefer Resend (server secret). Fall back to FormSubmit (no secret).
    try {
      if (Deno.env.get("RESEND_API_KEY")?.trim()) {
        await sendViaResend(payload);
        channels.push("resend");
        emailOk = true;
      } else {
        const channel = await sendViaFormSubmit(payload);
        channels.push(channel);
        emailOk = true;
      }
    } catch (emailErr) {
      console.error("[contact] email delivery failed:", emailErr);
    }

    // Ops notify — also acts as delivery fallback if email provider is not ready
    let telegramOk = false;
    try {
      telegramOk = await notifyTelegram(payload);
      if (telegramOk) channels.push("telegram");
    } catch (tgErr) {
      console.warn("[contact] telegram notify skipped:", tgErr);
    }

    if (!emailOk && !telegramOk) {
      return jsonResponse(
        {
          ok: false,
          error: "email_failed",
          message:
            "No delivery channel succeeded. Configure RESEND_API_KEY or TELEGRAM_BOT_TOKEN+ADMIN_CHAT_ID.",
        },
        502
      );
    }

    return jsonResponse({
      ok: true,
      to: CONTACT_TO,
      channels,
    });
  } catch (err) {
    console.error("[contact] unexpected:", err);
    return jsonResponse({ ok: false, error: "server_error" }, 500);
  }
});
