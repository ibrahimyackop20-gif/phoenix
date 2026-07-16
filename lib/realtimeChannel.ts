import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

/**
 * Supabase returns an existing RealtimeChannel when `.channel(name)` is called
 * with a name that is already registered. Calling `.on('postgres_changes', …)`
 * on a channel that has already been `.subscribe()`'d throws:
 *   cannot add postgres_changes callbacks for realtime:<name> after subscribe()
 *
 * Always tear down any prior channel with the same topic before binding handlers.
 */
export function createRealtimeChannel(name: string): RealtimeChannel {
  const topic = name.startsWith("realtime:") ? name : `realtime:${name}`;

  for (const existing of supabase.getChannels()) {
    if (existing.topic === topic || existing.topic === name) {
      supabase.removeChannel(existing);
    }
  }

  return supabase.channel(name);
}

/** Cleanup helper — unsubscribe and drop from the client registry. */
export function teardownRealtimeChannel(
  channel: RealtimeChannel | null | undefined
): void {
  if (!channel) return;
  try {
    channel.unsubscribe();
  } catch {
    // ignore
  }
  try {
    supabase.removeChannel(channel);
  } catch {
    // ignore
  }
}
