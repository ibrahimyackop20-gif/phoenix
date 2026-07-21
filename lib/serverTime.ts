/**
 * Keeps a client-side offset against Supabase server time so countdowns
 * do not rely on the device clock.
 */

import { supabase } from "./supabaseClient";

let serverOffsetMs = 0;
let lastSyncAt = 0;

const RESYNC_INTERVAL_MS = 30_000;

/** Returns an approximate server "now" in epoch milliseconds. */
export function getServerNowMs(): number {
  return Date.now() + serverOffsetMs;
}

/** Sync client clock offset against PostgreSQL now(). */
export async function syncServerTime(force = false): Promise<void> {
  const now = Date.now();
  if (!force && lastSyncAt > 0 && now - lastSyncAt < RESYNC_INTERVAL_MS) {
    return;
  }

  const { data, error } = await supabase.rpc("get_server_timestamp");
  if (error || !data) {
    console.warn("[serverTime] sync failed:", error?.message);
    return;
  }

  const serverMs = new Date(String(data)).getTime();
  if (Number.isFinite(serverMs)) {
    serverOffsetMs = serverMs - now;
    lastSyncAt = now;
  }
}

/** Milliseconds remaining until created_at + windowMinutes (server-based). */
export function getRemainingMsFromServer(
  createdAt: string,
  windowMinutes = 2
): number {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return 0;
  const deadlineMs = createdMs + windowMinutes * 60 * 1000;
  return Math.max(0, deadlineMs - getServerNowMs());
}

/** Format milliseconds as MM:SS for countdown display. */
export function formatCountdownMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
