/**
 * Contact Us — sends form payload to website API or Supabase Edge Function.
 * Never embeds SMTP credentials in the client.
 */

import Constants from "expo-constants";
import { getWebBaseUrl } from "./telegramApi";

export const CONTACT_EMAIL = "designerphonex@gmail.com";
export const CONTACT_WHATSAPP_E164 = "9647860893809";
export const CONTACT_WHATSAPP_DISPLAY = "+9647860893809";
export const CONTACT_TELEGRAM_USER = "ar_phonex_pr";
export const CONTACT_TELEGRAM_URL = `https://t.me/${CONTACT_TELEGRAM_USER}`;
export const CONTACT_WHATSAPP_URL = `https://wa.me/${CONTACT_WHATSAPP_E164}`;
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;
export const CONTACT_TEL = `tel:+${CONTACT_WHATSAPP_E164}`;

type PublicExtra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

function getExtra(): PublicExtra {
  return (
    (Constants.expoConfig?.extra as PublicExtra | undefined) ||
    ((Constants as any).manifest?.extra as PublicExtra | undefined) ||
    {}
  );
}

function getSupabaseUrl(): string {
  const fromProcess = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (typeof fromProcess === "string" && fromProcess.trim()) {
    return fromProcess.trim().replace(/\/$/, "");
  }
  return (getExtra().supabaseUrl || "").replace(/\/$/, "");
}

function getAnonKey(): string {
  const fromProcess = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (typeof fromProcess === "string" && fromProcess.trim()) {
    return fromProcess.trim();
  }
  return getExtra().supabaseAnonKey || "";
}

export type ContactPayload = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

export type ContactResult =
  | { ok: true; channels?: string[] }
  | { ok: false; error: string; message?: string };

async function postJson(
  url: string,
  body: ContactPayload,
  headers: Record<string, string> = {}
): Promise<ContactResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      error: String(data.error || "server_error"),
      message: typeof data.message === "string" ? data.message : undefined,
    };
  }
  return { ok: true, channels: data.channels };
}

/**
 * Preferred: website `/api/contact` (EXPO_PUBLIC_WEB_URL).
 * Fallback: Supabase Edge Function `contact`.
 */
export async function sendContactMessage(
  payload: ContactPayload
): Promise<ContactResult> {
  const webBase = getWebBaseUrl();
  if (webBase) {
    try {
      const webResult = await postJson(`${webBase}/api/contact`, payload);
      if (webResult.ok) return webResult;
      // Fall through to Edge Function if web returns soft failure after deploy lag
      console.warn("[contact] web API failed, trying Edge Function:", webResult);
    } catch (err) {
      console.warn("[contact] web API unreachable, trying Edge Function:", err);
    }
  }

  const supabaseUrl = getSupabaseUrl();
  const anonKey = getAnonKey();
  if (!supabaseUrl || !anonKey) {
    return { ok: false, error: "not_configured" };
  }

  return postJson(`${supabaseUrl}/functions/v1/contact`, payload, {
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
  });
}
