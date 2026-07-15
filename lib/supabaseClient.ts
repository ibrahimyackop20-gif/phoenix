/**
 * Singleton Supabase clients with environment variable validation.
 *
 * Clients are created lazily on first access (not at module-load time)
 * so that a missing env var produces a descriptive error instead of
 * an opaque crash that kills the JS thread before React mounts.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

const REQUIRED_ENV = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_CENTRAL_SUPABASE_URL",
  "EXPO_PUBLIC_CENTRAL_SUPABASE_ANON_KEY",
] as const;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[Supabase Init] Missing required environment variable: ${name}. ` +
        "Ensure your .env file is in the project root and contains this variable. " +
        "For EAS builds, verify eas.json or EAS Secrets include it."
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Lazy singleton instances
// ---------------------------------------------------------------------------

let _supabase: SupabaseClient | null = null;
let _centralSupabase: SupabaseClient | null = null;

/**
 * Primary (local project) Supabase client.
 *
 * Uses EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.
 */
export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = getEnv("EXPO_PUBLIC_SUPABASE_URL");
    const key = getEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");

    _supabase = createClient(url, key, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _supabase;
}

/**
 * Central Supabase client (cross-project SSO / shared auth).
 *
 * Uses EXPO_PUBLIC_CENTRAL_SUPABASE_URL and EXPO_PUBLIC_CENTRAL_SUPABASE_ANON_KEY.
 */
export function getCentralSupabase(): SupabaseClient {
  if (!_centralSupabase) {
    const url = getEnv("EXPO_PUBLIC_CENTRAL_SUPABASE_URL");
    const key = getEnv("EXPO_PUBLIC_CENTRAL_SUPABASE_ANON_KEY");

    _centralSupabase = createClient(url, key, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _centralSupabase;
}

// ---------------------------------------------------------------------------
// Backward-compatible exports
//
// Every file in the project imports `supabase` or `centralSupabase` as plain
// values.  We keep this working via ES module live-binding: the getter runs
// once, caches the result, and every subsequent read returns the same instance.
//
// NOTE: These are module-level property reads that trigger on first import,
// but the getEnv() guard now throws a READABLE error instead of letting
// createClient(undefined, undefined) crash opaquely.
// ---------------------------------------------------------------------------

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabase(), prop, receiver);
  },
});

export const centralSupabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getCentralSupabase(), prop, receiver);
  },
});
