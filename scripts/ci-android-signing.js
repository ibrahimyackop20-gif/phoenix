#!/usr/bin/env node
/**
 * CI-only helper.
 *
 * Injects a `release` signing config into the *generated* android/app/build.gradle
 * (produced by `expo prebuild`) so that `:app:bundleRelease` is signed with a real
 * release keystore.
 *
 * IMPORTANT:
 *   - This only ever touches the generated, gitignored `android/` folder during CI.
 *   - It NEVER modifies committed application code.
 *   - If the required signing env vars / keystore are missing, it does nothing and
 *     the build falls back to the Expo/RN template default (debug signing), which is
 *     NOT suitable for Play Store distribution.
 */
const fs = require("fs");
const path = require("path");

const GRADLE = path.join("android", "app", "build.gradle");
const KEYSTORE = path.join("android", "app", "release.keystore");

const REQUIRED_ENV = [
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
];

const hasEnv = REQUIRED_ENV.every((k) => (process.env[k] || "").length > 0);
const hasKeystore = fs.existsSync(KEYSTORE);

if (!hasEnv || !hasKeystore) {
  console.warn(
    "[ci-android-signing] Release signing secrets/keystore not found. " +
      "Skipping — the AAB will use the default debug signing and is NOT Play-ready."
  );
  process.exit(0);
}

if (!fs.existsSync(GRADLE)) {
  console.error(
    `[ci-android-signing] ${GRADLE} not found. Run 'expo prebuild' before this step.`
  );
  process.exit(1);
}

let gradle = fs.readFileSync(GRADLE, "utf8");

if (gradle.includes("signingConfigs.release")) {
  console.log(
    "[ci-android-signing] Release signing already configured. Nothing to do."
  );
  process.exit(0);
}

// Step 1: Point the release buildType at a (soon-to-exist) release signing config.
// The Expo/RN template's release buildType uses `signingConfig signingConfigs.debug`.
// Do this BEFORE injecting the release signingConfig so the regex matches only the
// buildType block (the debug buildType keeps its own `signingConfigs.debug`).
const before = gradle;
gradle = gradle.replace(
  /(release\s*\{[^]*?signingConfig\s+signingConfigs\.)debug/,
  "$1release"
);
if (gradle === before) {
  console.error(
    "[ci-android-signing] Could not repoint the release buildType signingConfig. " +
      "The generated build.gradle format may have changed."
  );
  process.exit(1);
}

// Step 2: Inject the `release` signing config inside the existing `signingConfigs {` block.
const releaseSigningConfig = `
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH") ?: "release.keystore")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }`;

const anchor = "signingConfigs {";
const idx = gradle.indexOf(anchor);
if (idx === -1) {
  console.error(
    "[ci-android-signing] Could not find the 'signingConfigs {' block in build.gradle."
  );
  process.exit(1);
}
const insertAt = idx + anchor.length;
gradle = gradle.slice(0, insertAt) + releaseSigningConfig + gradle.slice(insertAt);

fs.writeFileSync(GRADLE, gradle, "utf8");
console.log("[ci-android-signing] Release signing configured successfully.");
