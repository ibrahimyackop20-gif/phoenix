/**
 * Google Sign-In via Supabase OAuth + Expo AuthSession.
 *
 * Production / native builds use phoenixprintapp://auth/google.
 * Expo Go cannot complete OAuth reliably (custom scheme not owned by Expo Go;
 * iOS AuthSession often returns type "dismiss"). Use a development/release build.
 */

import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import Constants from "expo-constants";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { isPrimaryAdminEmail, resolveAuthEmail } from "./adminAccess";

WebBrowser.maybeCompleteAuthSession();

export type GoogleAuthStatus =
  | "success"
  | "cancelled"
  | "error"
  | "offline"
  | "expo_go_unsupported";

export type GoogleAuthResult = {
  status: GoogleAuthStatus;
  session?: Session | null;
  message?: string;
};

/** Deep-link reserved for Google OAuth (must match Supabase Redirect URLs). */
export const GOOGLE_AUTH_REDIRECT_URI = "phoenixprintapp://auth/google";

/** Path segment used by SSOCatcher / deep-link handlers. */
export const GOOGLE_AUTH_REDIRECT_PATH = "auth/google";

export function isExpoGoRuntime(): boolean {
  return Constants.appOwnership === "expo";
}

export function getGoogleAuthRedirectUri(): string {
  // Always force the custom scheme for native/dev builds.
  // makeRedirectUri is logged only for diagnostics.
  const makeRedirectUriResult = makeRedirectUri({
    scheme: "phoenixprintapp",
    path: GOOGLE_AUTH_REDIRECT_PATH,
    native: GOOGLE_AUTH_REDIRECT_URI,
  });

  console.log("[GoogleAuth][DEBUG] makeRedirectUri()", {
    result: makeRedirectUriResult,
    using: GOOGLE_AUTH_REDIRECT_URI,
    appOwnership: Constants.appOwnership,
  });

  return GOOGLE_AUTH_REDIRECT_URI;
}

/** Destination after Google session — same rules as email login. */
export function getPostGoogleAuthDestination(session: Session): "/dashboard" | "/admin" {
  const email = resolveAuthEmail(session.user, session.user.email);
  if (isPrimaryAdminEmail(email)) return "/admin";
  return "/dashboard";
}

export async function establishSessionFromRedirectUrl(
  url: string
): Promise<{ session: Session | null; errorMessage?: string }> {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    return { session: null, errorMessage: String(errorCode) };
  }

  const error =
    (params.error as string | undefined) ||
    (params.error_description as string | undefined);
  if (error) {
    return { session: null, errorMessage: error };
  }

  const code = params.code as string | undefined;
  if (code) {
    const { data, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      // Code may already be consumed by AuthSession — fall back to current session.
      const {
        data: { session: existing },
      } = await supabase.auth.getSession();
      if (existing) {
        console.log(
          "[GoogleAuth] exchangeCode failed but session already present",
          exchangeError.message
        );
        return { session: existing };
      }
      return { session: null, errorMessage: exchangeError.message };
    }
    return { session: data.session };
  }

  const access_token = params.access_token as string | undefined;
  const refresh_token = params.refresh_token as string | undefined;
  if (access_token && refresh_token) {
    const { data, error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (sessionError) {
      return { session: null, errorMessage: sessionError.message };
    }
    return { session: data.session };
  }

  try {
    const parsed = Linking.parse(url);
    const qp = parsed.queryParams || {};
    const fallbackCode =
      typeof qp.code === "string"
        ? qp.code
        : Array.isArray(qp.code)
          ? qp.code[0]
          : undefined;
    if (fallbackCode) {
      const { data, error: exchangeError } =
        await supabase.auth.exchangeCodeForSession(fallbackCode);
      if (exchangeError) {
        const {
          data: { session: existing },
        } = await supabase.auth.getSession();
        if (existing) return { session: existing };
        return { session: null, errorMessage: exchangeError.message };
      }
      return { session: data.session };
    }
  } catch {
    // ignore
  }

  return {
    session: null,
    errorMessage: "Missing OAuth credentials in redirect URL",
  };
}

/** True if this deep link is the Google OAuth app callback. */
export function isGoogleAuthCallbackUrl(url: string): boolean {
  return url.includes("auth/google") || url.includes("/auth/google");
}

/**
 * Completes Google auth from a deep-link URL (Linking / SSOCatcher fallback).
 * Safe if AuthSession already exchanged the code (reuses existing session).
 */
export async function completeGoogleAuthFromUrl(
  url: string
): Promise<GoogleAuthResult> {
  console.log("[GoogleAuth][NAV] completeGoogleAuthFromUrl", url);
  const { session, errorMessage } = await establishSessionFromRedirectUrl(url);
  if (!session) {
    return {
      status: "error",
      message: errorMessage || "Failed to establish session from callback URL",
    };
  }
  console.log("[GoogleAuth][NAV] session established (from URL)", {
    userId: session.user.id,
    email: session.user.email,
    destination: getPostGoogleAuthDestination(session),
  });
  return { status: "success", session };
}

async function getExistingSessionIfAny(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Starts Google OAuth and returns a session on the primary Supabase client.
 */
export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase is not configured",
    };
  }

  // Expo Go cannot own phoenixprintapp://; iOS often reports AuthSession "dismiss".
  if (isExpoGoRuntime()) {
    console.warn(
      "[GoogleAuth] Expo Go detected — Google OAuth requires a development or release build."
    );
    return {
      status: "expo_go_unsupported",
      message:
        "Google Sign-In requires a development or release build (not Expo Go).",
    };
  }

  try {
    const redirectTo = getGoogleAuthRedirectUri();

    console.log("[GoogleAuth][DEBUG] redirectTo (final)", {
      redirectTo,
      appOwnership: Constants.appOwnership,
      executionEnvironment: Constants.executionEnvironment,
    });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    console.log("[GoogleAuth][DEBUG] OAuth URL (raw string)", data?.url ?? null);

    if (error) {
      console.error("[GoogleAuth] signInWithOAuth error:", error.message);
      const offline =
        /network|fetch|offline|internet|failed to fetch/i.test(error.message);
      return {
        status: offline ? "offline" : "error",
        message: error.message,
      };
    }

    if (!data?.url) {
      return {
        status: "error",
        message: "No OAuth URL returned from Supabase",
      };
    }

    const oauthUrlOpened = data.url;

    try {
      const authorizeUrl = new URL(oauthUrlOpened);
      const redirectToDecoded = authorizeUrl.searchParams.get("redirect_to");
      console.log("[GoogleAuth][DEBUG] authorize redirect_to", {
        redirectToDecoded,
        matchesAppRedirect: redirectToDecoded === redirectTo,
      });
      if (
        redirectToDecoded &&
        (redirectToDecoded.includes("localhost") ||
          redirectToDecoded.includes("127.0.0.1"))
      ) {
        return {
          status: "error",
          message:
            "OAuth redirect resolved to localhost. Add phoenixprintapp://auth/google to Supabase Redirect URLs.",
        };
      }
    } catch {
      // non-fatal
    }

    console.log("[GoogleAuth][DEBUG] openAuthSessionAsync", {
      urlOpened: oauthUrlOpened,
      returnUrlWaitingFor: redirectTo,
    });

    const browserResult = await WebBrowser.openAuthSessionAsync(
      oauthUrlOpened,
      redirectTo
    );

    console.log("[GoogleAuth][DEBUG] AuthSession result", {
      type: browserResult.type,
      finalCallbackUrl:
        browserResult.type === "success"
          ? (browserResult as { url?: string }).url ?? null
          : null,
    });

    // Android sometimes delivers the callback via Linking while AuthSession
    // reports cancel/dismiss — session may already exist.
    if (browserResult.type === "cancel" || browserResult.type === "dismiss") {
      const existing = await getExistingSessionIfAny();
      if (existing) {
        console.log(
          "[GoogleAuth][NAV] AuthSession dismissed but session exists — treating as success",
          { email: existing.user.email }
        );
        return { status: "success", session: existing };
      }
      console.warn(
        "[GoogleAuth] AuthSession cancelled/dismissed with no session. " +
          "On Expo Go / iOS this is often a platform limitation."
      );
      return { status: "cancelled" };
    }

    if (browserResult.type !== "success" || !browserResult.url) {
      const existing = await getExistingSessionIfAny();
      if (existing) {
        return { status: "success", session: existing };
      }
      return {
        status: "error",
        message: "Google sign-in did not complete",
      };
    }

    const returnedUrl = browserResult.url;
    console.log("[GoogleAuth][DEBUG] Final callback URL", returnedUrl);

    const { session, errorMessage } =
      await establishSessionFromRedirectUrl(returnedUrl);

    if (!session) {
      const offline =
        !!errorMessage &&
        /network|fetch|offline|internet|failed to fetch/i.test(errorMessage);
      return {
        status: offline ? "offline" : "error",
        message: errorMessage || "Failed to establish session",
      };
    }

    console.log("[GoogleAuth][NAV] session established", {
      userId: session.user.id,
      email: session.user.email,
      destination: getPostGoogleAuthDestination(session),
      authState: "authenticated",
    });

    return { status: "success", session };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GoogleAuth] unexpected error:", message);
    const offline = /network|fetch|offline|internet|failed to fetch/i.test(
      message
    );
    return {
      status: offline ? "offline" : "error",
      message,
    };
  }
}
