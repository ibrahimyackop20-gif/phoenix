/**
 * Singleton Supabase clients with fail-safe environment handling.
 *
 * Credentials are resolved from (in order):
 * 1. process.env.EXPO_PUBLIC_* (Metro inline / EAS)
 * 2. Constants.expoConfig.extra (app.config.js embed — reliable for release APKs)
 *
 * Missing credentials must NEVER crash the JS thread.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type ClientKind = "primary" | "central";

let _supabase: SupabaseClient | null = null;
let _centralSupabase: SupabaseClient | null = null;
let _configLogged = false;

type PublicExtra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  centralSupabaseUrl?: string;
  centralSupabaseAnonKey?: string;
  webUrl?: string;
};

function getExtra(): PublicExtra {
  const extra =
    (Constants.expoConfig?.extra as PublicExtra | undefined) ||
    ((Constants as any).manifest?.extra as PublicExtra | undefined) ||
    {};
  return extra || {};
}

function readEnv(name: string, extraKey: keyof PublicExtra): string | undefined {
  const fromProcess = process.env[name];
  if (typeof fromProcess === "string" && fromProcess.trim().length > 0) {
    return fromProcess.trim();
  }
  const fromExtra = getExtra()[extraKey];
  if (typeof fromExtra === "string" && fromExtra.trim().length > 0) {
    return fromExtra.trim();
  }
  return undefined;
}

export function getMissingSupabaseEnv(): string[] {
  const checks: Array<[string, string | undefined]> = [
    ["EXPO_PUBLIC_SUPABASE_URL", readEnv("EXPO_PUBLIC_SUPABASE_URL", "supabaseUrl")],
    [
      "EXPO_PUBLIC_SUPABASE_ANON_KEY",
      readEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "supabaseAnonKey"),
    ],
    [
      "EXPO_PUBLIC_CENTRAL_SUPABASE_URL",
      readEnv("EXPO_PUBLIC_CENTRAL_SUPABASE_URL", "centralSupabaseUrl"),
    ],
    [
      "EXPO_PUBLIC_CENTRAL_SUPABASE_ANON_KEY",
      readEnv("EXPO_PUBLIC_CENTRAL_SUPABASE_ANON_KEY", "centralSupabaseAnonKey"),
    ],
  ];
  return checks.filter(([, value]) => !value).map(([name]) => name);
}

export function isSupabaseConfigured(): boolean {
  return getMissingSupabaseEnv().length === 0;
}

function logMissingConfigOnce(): void {
  if (_configLogged) return;
  _configLogged = true;
  const missing = getMissingSupabaseEnv();
  if (missing.length === 0) return;
  console.error(
    "[Supabase Init] Missing required environment variables:",
    missing.join(", "),
    "— Supabase calls will fail softly. Set these in EAS Environment Variables (or .env for local builds)."
  );
}

function createSafeClient(
  kind: ClientKind,
  url: string | undefined,
  key: string | undefined
): SupabaseClient {
  const safeUrl = url || "https://invalid.supabase.co";
  const safeKey = key || "missing-anon-key";

  if (!url || !key) {
    console.error(
      `[Supabase Init] ${kind} client started in DISABLED mode (missing URL or anon key).`
    );
  } else {
    console.log(`[Supabase Init] ${kind} client configured.`);
  }

  try {
    return createClient(safeUrl, safeKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: Boolean(url && key),
        persistSession: Boolean(url && key),
        detectSessionInUrl: false,
        // PKCE is required for reliable mobile OAuth (Google) redirects.
        flowType: "pkce",
      },
    });
  } catch (error) {
    console.error(`[Supabase Init] Failed to create ${kind} client:`, error);
    return createClient("https://invalid.supabase.co", "missing-anon-key", {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }
}

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    logMissingConfigOnce();
    _supabase = createSafeClient(
      "primary",
      readEnv("EXPO_PUBLIC_SUPABASE_URL", "supabaseUrl"),
      readEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "supabaseAnonKey")
    );
  }
  return _supabase;
}

export function getCentralSupabase(): SupabaseClient {
  if (!_centralSupabase) {
    logMissingConfigOnce();
    _centralSupabase = createSafeClient(
      "central",
      readEnv("EXPO_PUBLIC_CENTRAL_SUPABASE_URL", "centralSupabaseUrl"),
      readEnv("EXPO_PUBLIC_CENTRAL_SUPABASE_ANON_KEY", "centralSupabaseAnonKey")
    );
  }
  return _centralSupabase;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    try {
      const client = getSupabase();
      const value = Reflect.get(client, prop, receiver);
      return typeof value === "function" ? value.bind(client) : value;
    } catch (error) {
      console.error("[Supabase] Proxy get failed:", prop, error);
      return undefined;
    }
  },
});

export const centralSupabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    try {
      const client = getCentralSupabase();
      const value = Reflect.get(client, prop, receiver);
      return typeof value === "function" ? value.bind(client) : value;
    } catch (error) {
      console.error("[Supabase] Central proxy get failed:", prop, error);
      return undefined;
    }
  },
});
