import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "expo-router";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { supabase } from "../lib/supabaseClient";
import {
  registerForPushNotificationsAsync,
  associateCachedTokenWithUser,
  cacheFcmToken,
  saveTokenToSupabase,
} from "../lib/notifications";
import { shouldSuppressPushNavigation } from "../lib/postAuthNavigation";
import { isGoogleAuthCallbackUrl } from "../lib/googleAuth";

interface NotificationRegistrarProps {
  /** True once splash/onboarding has finished — triggers first-launch permission. */
  ready?: boolean;
}

type PushData = {
  order_id?: string;
  orderId?: string;
  notification_id?: string;
  notificationId?: string;
  url?: string;
  route?: string;
  [key: string]: unknown;
};

/** Survive remounts (Google OAuth deep-link remount resets component refs). */
let lastHandledResponseIdGlobal: string | null = null;
let coldStartLastResponseChecked = false;

function readPushData(
  response: Notifications.NotificationResponse
): PushData {
  const raw = response.notification.request.content.data;
  if (!raw || typeof raw !== "object") return {};
  return raw as PushData;
}

/**
 * Headless push notification wiring:
 * - After splash (ready=true): request permission on first launch, register FCM, cache token.
 * - After login: associate the cached FCM token with the authenticated user.
 * - Token refresh keeps local cache + Supabase in sync.
 * - Tap opens Order Details when order_id is present; otherwise Orders list.
 *
 * IMPORTANT: getLastNotificationResponseAsync() returns the same stale tap across
 * remounts. Without process-level dedupe + clear, Google Sign-In remount steals
 * navigation to /dashboard/orders after an intentional /dashboard replace.
 */
export default function NotificationRegistrar({
  ready = false,
}: NotificationRegistrarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const registrationStarted = useRef(false);

  const navigateFromPushData = (data: PushData, source: string) => {
    if (shouldSuppressPushNavigation()) {
      console.log("[NotificationRegistrar][NAV] suppressed (post-auth window)", {
        source,
        currentRoute: pathnameRef.current,
        data,
      });
      return;
    }

    const orderId =
      (typeof data.order_id === "string" && data.order_id) ||
      (typeof data.orderId === "string" && data.orderId) ||
      null;
    const notificationId =
      (typeof data.notification_id === "string" && data.notification_id) ||
      (typeof data.notificationId === "string" && data.notificationId) ||
      null;

    if (notificationId) {
      void supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notificationId);
    }

    if (orderId) {
      const target = `/dashboard/orders/${orderId}`;
      console.log("[NotificationRegistrar][NAV] push → order detail", {
        source,
        currentRoute: pathnameRef.current,
        navigationTarget: target,
        selectedTab: "orders",
      });
      router.push(target as any);
      return;
    }

    const target =
      (typeof data.url === "string" && data.url) ||
      (typeof data.route === "string" && data.route) ||
      "/dashboard/orders";
    console.log("[NotificationRegistrar][NAV] push → list/route", {
      source,
      currentRoute: pathnameRef.current,
      navigationTarget: target,
      selectedTab: String(target).includes("orders") ? "orders" : "other",
      finalScreen: target,
    });
    try {
      router.push(target as any);
    } catch {
      // Ignore invalid deep links.
    }
  };

  const handleNotificationResponse = (
    response: Notifications.NotificationResponse | null,
    source: string
  ) => {
    if (!response) return;
    const responseId = response.notification.request.identifier;
    if (responseId && lastHandledResponseIdGlobal === responseId) {
      console.log("[NotificationRegistrar][NAV] skip duplicate response", {
        source,
        responseId,
      });
      return;
    }
    if (responseId) lastHandledResponseIdGlobal = responseId;
    navigateFromPushData(readPushData(response), source);
    try {
      Notifications.clearLastNotificationResponse();
    } catch {
      // older native builds
    }
  };

  // 1. First-launch permission + FCM registration — runs after splash, no auth required.
  useEffect(() => {
    if (!ready || registrationStarted.current) return;
    registrationStarted.current = true;
    registerForPushNotificationsAsync().catch((error) => {
      console.warn("[NotificationRegistrar] registration failed:", error);
    });
  }, [ready]);

  // 2. Auth / token / tap listeners
  useEffect(() => {
    let isMounted = true;
    let authSub: { subscription: { unsubscribe: () => void } } | null = null;
    let tokenSub: { remove: () => void } | null = null;
    let receivedSub: { remove: () => void } | null = null;
    let responseSub: { remove: () => void } | null = null;
    let associatedForUser: string | null = null;

    const associate = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!isMounted || !user) return;
        if (associatedForUser === user.id) return;
        associatedForUser = user.id;
        await associateCachedTokenWithUser();
      } catch (error) {
        console.warn("[NotificationRegistrar] associate failed:", error);
      }
    };

    try {
      associate();

      const auth = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          if (associatedForUser !== session.user.id) {
            associatedForUser = session.user.id;
            associateCachedTokenWithUser().catch(() => {});
          }
        } else {
          associatedForUser = null;
        }
      });
      authSub = auth.data;

      tokenSub = Notifications.addPushTokenListener(async (token) => {
        try {
          if (!token?.data) return;
          const value = token.data as string;
          await cacheFcmToken(value);
          await saveTokenToSupabase(value);
        } catch (error) {
          console.warn("[NotificationRegistrar] token listener failed:", error);
        }
      });

      receivedSub = Notifications.addNotificationReceivedListener(() => {});

      responseSub = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          try {
            handleNotificationResponse(response, "live-tap");
          } catch (error) {
            console.warn("[NotificationRegistrar] response handler failed:", error);
          }
        }
      );

      // Cold-start / last-response: only once per JS process (not per remount).
      if (ready && !coldStartLastResponseChecked) {
        coldStartLastResponseChecked = true;
        (async () => {
          try {
            const initialUrl = await Linking.getInitialURL();
            if (initialUrl && isGoogleAuthCallbackUrl(initialUrl)) {
              console.log(
                "[NotificationRegistrar][NAV] skip cold-start push — Google auth callback",
                { initialUrl, currentRoute: pathnameRef.current }
              );
              try {
                Notifications.clearLastNotificationResponse();
              } catch {
                // ignore
              }
              return;
            }
            if (shouldSuppressPushNavigation()) {
              console.log(
                "[NotificationRegistrar][NAV] skip cold-start push — post-auth suppress"
              );
              return;
            }
            const response = await Notifications.getLastNotificationResponseAsync();
            if (!isMounted) return;
            console.log("[NotificationRegistrar][NAV] cold-start last response", {
              hasResponse: !!response,
              currentRoute: pathnameRef.current,
              responseId: response?.notification.request.identifier ?? null,
            });
            handleNotificationResponse(response, "cold-start-last");
          } catch (error) {
            console.warn("[NotificationRegistrar] last response failed:", error);
          }
        })();
      }
    } catch (error) {
      console.warn("[NotificationRegistrar] listener setup failed:", error);
    }

    return () => {
      isMounted = false;
      try {
        authSub?.subscription.unsubscribe();
        tokenSub?.remove();
        receivedSub?.remove();
        responseSub?.remove();
      } catch {
        // ignore cleanup errors
      }
    };
  }, [router, ready]);

  return null;
}
