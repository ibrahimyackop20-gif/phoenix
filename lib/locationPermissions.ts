import { Alert, Platform } from "react-native";
import * as Linking from "expo-linking";
import * as Location from "expo-location";

/**
 * Location access — requested ONLY when the user explicitly asks for
 * current location (Use Current Location / Detect My Location / حدد موقعي)
 * during Home Delivery flows. Never at app launch. Never for Pickup.
 * Uses expo-location foreground APIs only.
 */

export type LocationCoords = {
  latitude: number;
  longitude: number;
};

function isGranted(status: Location.PermissionStatus): boolean {
  return status === Location.PermissionStatus.GRANTED || status === "granted";
}

function isPermanentlyDenied(
  response: Location.LocationPermissionResponse
): boolean {
  return (
    !isGranted(response.status) &&
    response.canAskAgain === false &&
    response.status === Location.PermissionStatus.DENIED
  );
}

function showDeniedDialog(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "صلاحية الموقع مطلوبة",
      "يحتاج التطبيق إلى إذن الموقع لاستخدام موقعك الحالي وتعبئة عنوان التوصيل بدقة. يمكنك أيضاً تحديد الموقع يدوياً على الخريطة.",
      [
        {
          text: "إلغاء",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "إعادة المحاولة",
          onPress: () => {
            void ensureLocationPermission().then(resolve);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

function showBlockedDialog(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "صلاحية الموقع مرفوضة",
      "تم رفض صلاحية الموقع. افتح إعدادات التطبيق للسماح بالوصول إلى الموقع.",
      [
        {
          text: "إلغاء",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "فتح إعدادات التطبيق",
          onPress: () => {
            void Linking.openSettings().finally(() => resolve(false));
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/**
 * Ensures foreground location permission when the user taps Detect / Use Current Location.
 */
export async function ensureLocationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return true;

  const current = await Location.getForegroundPermissionsAsync();
  if (isGranted(current.status)) return true;

  if (isPermanentlyDenied(current)) {
    return showBlockedDialog();
  }

  const requested = await Location.requestForegroundPermissionsAsync();
  if (isGranted(requested.status)) return true;

  if (isPermanentlyDenied(requested)) {
    return showBlockedDialog();
  }

  return showDeniedDialog();
}

/**
 * Permission gate then read the device GPS position (existing delivery flow).
 */
export async function getCurrentLocationWithPermission(): Promise<LocationCoords | null> {
  const allowed = await ensureLocationPermission();
  if (!allowed) return null;

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}
