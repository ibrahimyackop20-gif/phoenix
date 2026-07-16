import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

/**
 * Push notification service (Firebase Cloud Messaging via expo-notifications).
 *
 * Module-load side effects are wrapped so a native/FCM failure cannot kill
 * the release process before React mounts.
 */

export const DEFAULT_CHANNEL_ID = "phoenix_alerts";

const PROMPT_ASKED_KEY = "notifications.permission_prompt_asked";
const CACHED_TOKEN_KEY = "notifications.cached_fcm_token";

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (error) {
  console.error("[notifications] setNotificationHandler failed:", error);
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
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
  } catch (error) {
    console.warn("[notifications] Failed to create Android channel:", error);
  }
}

export async function cacheFcmToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHED_TOKEN_KEY, token);
  } catch (error) {
    console.warn("[notifications] Failed to cache FCM token:", error);
  }
}

export async function getCachedFcmToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CACHED_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
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
  } catch (error) {
    console.warn("[notifications] Permission check failed:", error);
    return false;
  }
}

export async function saveTokenToSupabase(token: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
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
  } catch (error) {
    console.warn("[notifications] saveTokenToSupabase exception:", error);
  }
}

export async function associateCachedTokenWithUser(): Promise<void> {
  try {
    const token = await getCachedFcmToken();
    if (!token) return;
    await saveTokenToSupabase(token);
  } catch (error) {
    console.warn("[notifications] associateCachedTokenWithUser failed:", error);
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
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
    console.warn("[notifications] Failed to register push:", err?.message || err);
    return null;
  }
}
