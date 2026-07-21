import { useEffect, useState } from "react";
import {
  formatCountdownMs,
  getRemainingMsFromServer,
  syncServerTime,
} from "../../lib/serverTime";

const CANCEL_WINDOW_MINUTES = 2;
const TICK_MS = 1000;
const RESYNC_MS = 30_000;

export type OrderCancelCountdown = {
  /** True while status is Pending and server-synced window has time left. */
  canCancel: boolean;
  /** True when Pending but the 2-minute window has elapsed (server-based). */
  windowExpired: boolean;
  remainingMs: number;
  formatted: string;
  /** Less than or equal to 30 seconds remaining. */
  isUrgent: boolean;
  synced: boolean;
};

/**
 * Live countdown for the 2-minute cancellation window.
 * Uses Supabase server time (not device clock) via syncServerTime().
 */
export function useOrderCancelCountdown(
  createdAt: string | undefined,
  status: string
): OrderCancelCountdown {
  const [remainingMs, setRemainingMs] = useState(0);
  const [synced, setSynced] = useState(false);

  const isPending = status === "Pending";

  useEffect(() => {
    if (!isPending || !createdAt) {
      setSynced(true);
      setRemainingMs(0);
      return;
    }

    let cancelled = false;

    const runSync = async () => {
      await syncServerTime(true);
      if (!cancelled) {
        setSynced(true);
        setRemainingMs(getRemainingMsFromServer(createdAt, CANCEL_WINDOW_MINUTES));
      }
    };

    runSync();
    const resyncId = setInterval(() => {
      syncServerTime(true).then(() => {
        if (!cancelled) {
          setRemainingMs(getRemainingMsFromServer(createdAt, CANCEL_WINDOW_MINUTES));
        }
      });
    }, RESYNC_MS);

    return () => {
      cancelled = true;
      clearInterval(resyncId);
    };
  }, [createdAt, isPending]);

  useEffect(() => {
    if (!isPending || !createdAt || !synced) return;

    const tick = () => {
      setRemainingMs(getRemainingMsFromServer(createdAt, CANCEL_WINDOW_MINUTES));
    };

    tick();
    const tickId = setInterval(tick, TICK_MS);
    return () => clearInterval(tickId);
  }, [createdAt, isPending, synced]);

  const canCancel = isPending && synced && remainingMs > 0;
  const windowExpired = isPending && synced && remainingMs === 0;

  return {
    canCancel,
    windowExpired,
    remainingMs,
    formatted: formatCountdownMs(remainingMs),
    isUrgent: canCancel && remainingMs <= 30_000,
    synced,
  };
}
