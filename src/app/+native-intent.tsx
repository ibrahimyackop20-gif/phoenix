/**
 * Intercept native deep links BEFORE Expo Router resolves them to screens.
 *
 * Google OAuth returns: phoenixprintapp://auth/google?code=...
 * There is no `/auth/google` route — without this file, Expo Router shows
 * "Unmatched Route" while AuthSession / SSOCatcher exchange the code.
 *
 * Returning a falsy value stops the linking listener from navigating
 * (see expo-router `link/linking.js`: `if (href) listener(href)`).
 * Linking.addEventListener in SSOCatcher still receives the raw URL.
 *
 * @see https://docs.expo.dev/router/advanced/native-intent/
 */

import { GOOGLE_AUTH_REDIRECT_PATH, isGoogleAuthCallbackUrl } from "../../lib/googleAuth";

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  try {
    if (isGoogleAuthCallbackUrl(path) || path.includes(GOOGLE_AUTH_REDIRECT_PATH)) {
      console.log("[NativeIntent] suppress Expo Router for Google OAuth callback", {
        path,
        initial,
      });
      // Do not navigate — AuthSession / SSOCatcher own this URL.
      return null;
    }
    return path;
  } catch (err) {
    console.warn("[NativeIntent] redirectSystemPath error — passing path through", err);
    return path;
  }
}
