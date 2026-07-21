/**
 * Expo app config — embeds EXPO_PUBLIC_* into `extra` so release APKs
 * always receive credentials even when Metro inline-env misses them.
 *
 * Android versionCode:
 *   Prefer ANDROID_VERSION_CODE from the environment (set by CI) so every
 *   GitHub Actions production build gets a unique, Play Store–safe integer.
 *   Local / default builds fall back to app.json → android.versionCode.
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

function readPositiveInt(name, fallback) {
  const raw = process.env[name];
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = parseInt(raw.trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
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

  const baseVersionCode =
    typeof appJson.expo?.android?.versionCode === "number"
      ? appJson.expo.android.versionCode
      : 1;
  const versionCode = readPositiveInt("ANDROID_VERSION_CODE", baseVersionCode);

  console.log(
    `[app.config] android.versionCode=${versionCode}` +
      (process.env.ANDROID_VERSION_CODE
        ? " (from ANDROID_VERSION_CODE)"
        : " (from app.json fallback)")
  );

  return {
    ...appJson,
    expo: {
      ...appJson.expo,
      android: {
        ...(appJson.expo.android || {}),
        versionCode,
      },
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
