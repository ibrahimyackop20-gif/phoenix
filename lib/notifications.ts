import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { supabase } from "./supabaseClient";

/**
 * Push notification service (Firebase Cloud Messaging via expo-notifications).
 *
 * Flow:
 * 1. After splash on first launch → request permission once (no auth required).
 * 2. If granted → fetch FCM token and cache it locally.
 * 3. After login → associate the cached token with the authenticated user in Supabase.
 * 4. If denied → respect the decision; never re-prompt (enable later from Settings).
 */

export const DEFAULT_CHANNEL_ID = "phoenix_alerts";

const PROMPT_ASKED_KEY = "notifications.permission_prompt_asked";
const CACHED_TOKEN_KEY = "notifications.cached_fcm_token";

// WhatsApp/Telegram-like: always surface in the system tray (banner + list),
// with sound, while the notification remains until the user dismisses it.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: "إشعارات Phoenix Print",
    description: "إشعارات الطلبات والتنبيهات الفورية",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    enableLights: true,
    lightColor: "#ea580c",
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function cacheFcmToken(token: string): Promise<void> {
  await AsyncStorage.setItem(CACHED_TOKEN_KEY, token);
}

export async function getCachedFcmToken(): Promise<string | null> {
  return AsyncStorage.getItem(CACHED_TOKEN_KEY);
}

/**
 * Request notification permission at most once (first app launch).
 * Subsequent launches never re-prompt — denied users can enable from Settings.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  const alreadyGranted =
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

  if (alreadyGranted) {
    await AsyncStorage.setItem(PROMPT_ASKED_KEY, "1");
    return true;
  }

  const alreadyAsked = (await AsyncStorage.getItem(PROMPT_ASKED_KEY)) === "1";
  if (alreadyAsked || !settings.canAskAgain) {
    return false;
  }

  const request = await Notifications.requestPermissionsAsync();
  await AsyncStorage.setItem(PROMPT_ASKED_KEY, "1");

  return (
    request.granted ||
    request.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/**
 * Persist an FCM token for the current user in Supabase.
 * No-ops when there is no authenticated session (token stays cached locally).
 */
export async function saveTokenToSupabase(token: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const device =
    [Device.manufacturer, Device.modelName].filter(Boolean).join(" ") ||
    "unknown";

  const { error } = await supabase.from("user_devices").upsert(
    {
      user_id: user.id,
      fcm_token: token,
      device,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "fcm_token" }
  );

  if (error) {
    console.warn("[notifications] Failed to save FCM token:", error.message);
  }
}

/**
 * After login: attach the locally cached FCM token to the authenticated user.
 */
export async function associateCachedTokenWithUser(): Promise<void> {
  const token = await getCachedFcmToken();
  if (!token) return;
  await saveTokenToSupabase(token);
}

/**
 * First-launch / post-splash registration (does NOT require auth):
 * channel → permission (once) → FCM token → local cache → Supabase if logged in.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("[notifications] Push requires a physical device.");
    return null;
  }

  await ensureAndroidChannel();

  const granted = await ensureNotificationPermission();
  if (!granted) {
    console.log("[notifications] Notification permission not granted.");
    return null;
  }

  try {
    const tokenResponse = await Notifications.getDevicePushTokenAsync();
    const token = tokenResponse.data as string;
    if (token) {
      console.log(
        "[notifications] FCM device token registered:",
        typeof token === "string" ? `${token.slice(0, 24)}…` : token
      );
      await cacheFcmToken(token);
      await saveTokenToSupabase(token);
    }
    return token;
  } catch (err: any) {
    console.warn("[notifications] Failed to get FCM token:", err?.message);
    return null;
  }
}
