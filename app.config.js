/**
 * Expo app config — embeds EXPO_PUBLIC_* into `extra` so release APKs
 * always receive credentials even when Metro inline-env misses them.
 */
const appJson = require("./app.json");

const REQUIRED_PUBLIC_ENV = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_CENTRAL_SUPABASE_URL",
  "EXPO_PUBLIC_CENTRAL_SUPABASE_ANON_KEY",
];

function read(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

module.exports = () => {
  const env = {
    EXPO_PUBLIC_SUPABASE_URL: read("EXPO_PUBLIC_SUPABASE_URL"),
    EXPO_PUBLIC_SUPABASE_ANON_KEY: read("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
    EXPO_PUBLIC_CENTRAL_SUPABASE_URL: read("EXPO_PUBLIC_CENTRAL_SUPABASE_URL"),
    EXPO_PUBLIC_CENTRAL_SUPABASE_ANON_KEY: read(
      "EXPO_PUBLIC_CENTRAL_SUPABASE_ANON_KEY"
    ),
    EXPO_PUBLIC_WEB_URL: read("EXPO_PUBLIC_WEB_URL"),
  };

  const missing = REQUIRED_PUBLIC_ENV.filter((name) => !env[name]);
  if (missing.length > 0) {
    console.warn(
      `[app.config] Missing EXPO_PUBLIC env vars: ${missing.join(", ")}. ` +
        "Set them in EAS Environment Variables (preview/production) or a local .env."
    );
  } else {
    console.log("[app.config] All required EXPO_PUBLIC_* variables are present.");
  }

  return {
    ...appJson,
    expo: {
      ...appJson.expo,
      extra: {
        ...(appJson.expo.extra || {}),
        // Public client config (safe to embed). Used as fallback by supabaseClient.
        supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL,
        supabaseAnonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        centralSupabaseUrl: env.EXPO_PUBLIC_CENTRAL_SUPABASE_URL,
        centralSupabaseAnonKey: env.EXPO_PUBLIC_CENTRAL_SUPABASE_ANON_KEY,
        webUrl: env.EXPO_PUBLIC_WEB_URL,
      },
    },
  };
};
