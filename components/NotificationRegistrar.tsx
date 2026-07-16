import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabaseClient";
import {
  registerForPushNotificationsAsync,
  associateCachedTokenWithUser,
  cacheFcmToken,
  saveTokenToSupabase,
} from "../lib/notifications";

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
 */
export default function NotificationRegistrar({
  ready = false,
}: NotificationRegistrarProps) {
  const router = useRouter();
  const registrationStarted = useRef(false);
  const associatedForUser = useRef<string | null>(null);
  const lastHandledResponseId = useRef<string | null>(null);

  const navigateFromPushData = (data: PushData) => {
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
      router.push({
        pathname: "/dashboard/orders",
        params: { orderId },
      } as any);
      return;
    }

    const target =
      (typeof data.url === "string" && data.url) ||
      (typeof data.route === "string" && data.route) ||
      "/dashboard/orders";
    try {
      router.push(target as any);
    } catch {
      // Ignore invalid deep links.
    }
  };

  const handleNotificationResponse = (
    response: Notifications.NotificationResponse | null
  ) => {
    if (!response) return;
    const responseId = response.notification.request.identifier;
    if (responseId && lastHandledResponseId.current === responseId) return;
    if (responseId) lastHandledResponseId.current = responseId;
    navigateFromPushData(readPushData(response));
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

    const associate = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!isMounted || !user) return;
        if (associatedForUser.current === user.id) return;
        associatedForUser.current = user.id;
        await associateCachedTokenWithUser();
      } catch (error) {
        console.warn("[NotificationRegistrar] associate failed:", error);
      }
    };

    try {
      associate();

      const auth = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          if (associatedForUser.current !== session.user.id) {
            associatedForUser.current = session.user.id;
            associateCachedTokenWithUser().catch(() => {});
          }
        } else {
          associatedForUser.current = null;
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
            handleNotificationResponse(response);
          } catch (error) {
            console.warn("[NotificationRegistrar] response handler failed:", error);
          }
        }
      );

      if (ready) {
        Notifications.getLastNotificationResponseAsync()
          .then((response) => {
            if (!isMounted) return;
            handleNotificationResponse(response);
          })
          .catch((error) => {
            console.warn("[NotificationRegistrar] last response failed:", error);
          });
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
