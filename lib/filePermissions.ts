import { Alert, Platform } from "react-native";
import * as Linking from "expo-linking";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

/**
 * Files & Photos access — requested ONLY at upload/pick time (never at launch).
 * Uses expo-image-picker Media Library APIs (Android 13+ READ_MEDIA_IMAGES).
 * Does not request Camera or Location.
 */

function isGranted(
  response: ImagePicker.MediaLibraryPermissionResponse
): boolean {
  return (
    response.granted === true ||
    response.accessPrivileges === "limited" ||
    response.status === "granted"
  );
}

function isPermanentlyDenied(
  response: ImagePicker.MediaLibraryPermissionResponse
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
      "صلاحية مطلوبة",
      "يحتاج التطبيق إلى إذن الوصول إلى الملفات والصور حتى تتمكن من رفع ملف أو اختيار صورة أو PDF من جهازك.",
      [
        {
          text: "إلغاء",
          style: "cancel",
          onPress: () => resolve(false),
        },
        {
          text: "إعادة المحاولة",
          onPress: () => {
            void ensureFilesAndPhotosPermission().then(resolve);
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
      "الصلاحية مرفوضة",
      "تم رفض إذن الملفات والصور بشكل دائم. للسماح بالرفع، افتح إعدادات التطبيق وفعّل صلاحية الصور/الوسائط ثم أعد المحاولة.",
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
 * Ensures Files & Photos permission when the user initiates an upload/pick.
 * @returns true if the existing picker may run; false if the user cancelled.
 */
export async function ensureFilesAndPhotosPermission(): Promise<boolean> {
  if (Platform.OS === "web") return true;

  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (isGranted(current)) return true;

  if (isPermanentlyDenied(current)) {
    return showBlockedDialog();
  }

  const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (isGranted(requested)) return true;

  if (isPermanentlyDenied(requested)) {
    return showBlockedDialog();
  }

  return showDeniedDialog();
}

/** DocumentPicker wrapper: permission gate then existing picker options. */
export async function pickDocumentWithPermission(
  options: DocumentPicker.DocumentPickerOptions
): Promise<DocumentPicker.DocumentPickerResult> {
  const allowed = await ensureFilesAndPhotosPermission();
  if (!allowed) {
    return { canceled: true, assets: null };
  }
  return DocumentPicker.getDocumentAsync(options);
}
