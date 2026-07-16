/**
 * Client helpers that call the existing Vercel Telegram backend
 * (same routes as saite.phonix web app). Token stays server-side.
 */

import Constants from "expo-constants";
import { Linking } from "react-native";

export const TELEGRAM_BOT_USERNAME = "PhonixPrint1_bot";
export const TELEGRAM_BOT_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`;

type PublicExtra = { webUrl?: string };

function getExtra(): PublicExtra {
  return (
    (Constants.expoConfig?.extra as PublicExtra | undefined) ||
    ((Constants as any).manifest?.extra as PublicExtra | undefined) ||
    {}
  );
}

/** Base URL for the web app hosting /api/telegram* routes. */
export function getWebBaseUrl(): string {
  const fromProcess = process.env.EXPO_PUBLIC_WEB_URL;
  if (typeof fromProcess === "string" && fromProcess.trim().length > 0) {
    return fromProcess.trim().replace(/\/$/, "");
  }
  const fromExtra = getExtra().webUrl;
  if (typeof fromExtra === "string" && fromExtra.trim().length > 0) {
    return fromExtra.trim().replace(/\/$/, "");
  }
  return "";
}

function requireWebBaseUrl(): string {
  const base = getWebBaseUrl();
  if (!base) {
    throw new Error(
      "EXPO_PUBLIC_WEB_URL is not configured. Set it to the Vercel web app URL (e.g. https://phoenix-print.vercel.app)."
    );
  }
  return base;
}

export async function openTelegramBot(): Promise<void> {
  await Linking.openURL(TELEGRAM_BOT_URL);
}

/** Same notify payload as web: POST /api/telegram/notify (fire-and-forget). */
export function notifyTelegramAdmin(payload: {
  studentName: string;
  totalPrice: number;
  fileSource: string;
  orderType: string;
}): void {
  try {
    const base = getWebBaseUrl();
    if (!base) {
      console.warn("[telegram] EXPO_PUBLIC_WEB_URL missing — skip notify");
      return;
    }
    fetch(`${base}/api/telegram/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      /* never block student flow */
    });
  } catch {
    /* ignore */
  }
}

/**
 * Same as web admin: GET /api/admin/download-telegram?file_id=...
 * Returns download_url or structured error (too_large / not_found).
 */
export async function downloadTelegramFile(fileId: string): Promise<{
  ok: boolean;
  download_url?: string;
  error?: string;
  message?: string;
}> {
  const base = requireWebBaseUrl();
  const res = await fetch(
    `${base}/api/admin/download-telegram?file_id=${encodeURIComponent(fileId)}`
  );
  return res.json();
}

/**
 * Same as web: GET /api/telegram/file?file_id=...
 * Resolves Telegram file metadata / download URL when needed.
 */
export async function resolveTelegramFile(fileId: string): Promise<{
  ok?: boolean;
  file_path?: string;
  file_size?: number;
  download_url?: string;
  error?: string;
}> {
  const base = requireWebBaseUrl();
  const res = await fetch(
    `${base}/api/telegram/file?file_id=${encodeURIComponent(fileId)}`
  );
  return res.json();
}

/** Webhook health check: GET /api/telegram */
export async function checkTelegramWebhook(): Promise<{ status?: string }> {
  const base = requireWebBaseUrl();
  const res = await fetch(`${base}/api/telegram`);
  return res.json();
}
