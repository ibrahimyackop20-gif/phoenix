import { Alert, Platform } from "react-native";
import * as Linking from "expo-linking";
import * as ImagePicker from "expo-image-picker";

/**
 * Camera access — requested ONLY when the user opens camera
 * (Take Photo / Scan Document / Capture Image). Never at launch.
 * Uses expo-image-picker camera APIs.
 * Does not request Storage or Location.
 */

function isGranted(response: ImagePicker.CameraPermissionResponse): boolean {
  return (
    response.granted === true || response.status === "granted"
  );
}

function isPermanentlyDenied(
  response: ImagePicker.CameraPermissionResponse
): boolean {
  return (
    !isGranted(response) &&
    response.canAskAgain === false &&
    response.status === "denied"
  );
}

function showDeniedDialog(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "صلاحية الكاميرا مطلوبة",
      "يحتاج التطبيق إلى إذن الكاميرا لالتقاط الصور أو مسح المستندات. لن نستخدم الكاميرا إلا عند اختيارك لذلك.",
      [
        {
          text: "إلغاء",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "إعادة المحاولة",
          onPress: () => {
            void ensureCameraPermission().then(resolve);
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
      "صلاحية الكاميرا مرفوضة",
      "تم رفض إذن الكاميرا بشكل دائم. لتفعيل الالتقاط، افتح إعدادات التطبيق وفعّل صلاحية الكاميرا ثم أعد المحاولة.",
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
 * Ensures Camera permission when the user initiates Take Photo / Scan / Capture.
 * @returns true if the camera UI may open; false if the user cancelled.
 */
export async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS === "web") return true;

  const current = await ImagePicker.getCameraPermissionsAsync();
  if (isGranted(current)) return true;

  if (isPermanentlyDenied(current)) {
    return showBlockedDialog();
  }

  const requested = await ImagePicker.requestCameraPermissionsAsync();
  if (isGranted(requested)) return true;

  if (isPermanentlyDenied(requested)) {
    return showBlockedDialog();
  }

  return showDeniedDialog();
}

/**
 * Permission gate then open the system camera (existing Expo camera flow).
 * Does not request Storage or Location.
 */
export async function launchCameraWithPermission(
  options?: ImagePicker.ImagePickerOptions
): Promise<ImagePicker.ImagePickerResult> {
  const allowed = await ensureCameraPermission();
  if (!allowed) {
    return { canceled: true, assets: null };
  }
  return ImagePicker.launchCameraAsync(options);
}
