import type { DocumentPickerAsset } from "expo-document-picker";

export type NormalizedDocumentFile = {
  name: string;
  size: number;
  type: string;
  uri: string;
};

/**
 * Android SAF (via expo-document-picker) can return null/undefined for
 * DISPLAY_NAME and MIME type even on a successful pick. SDK 54 TypeScript
 * types mark `name` as required `string`, but the Kotlin bridge still forwards
 * Cursor.getString() nulls. Normalize once at the picker boundary so the rest
 * of the app always sees a complete File-like object.
 */
export function normalizeDocumentAsset(
  asset: DocumentPickerAsset
): NormalizedDocumentFile {
  const uri = typeof asset.uri === "string" ? asset.uri : String(asset.uri ?? "");
  if (!uri) {
    throw new Error("DocumentPicker asset is missing uri");
  }

  const rawName =
    typeof asset.name === "string" && asset.name.trim().length > 0
      ? asset.name.trim()
      : null;

  const nameFromUri = (() => {
    try {
      const path = uri.split("?")[0] ?? uri;
      const segment = path.substring(path.lastIndexOf("/") + 1);
      return segment ? decodeURIComponent(segment) : null;
    } catch {
      return null;
    }
  })();

  const name = rawName || nameFromUri || `document-${Date.now()}`;

  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";

  const rawMime =
    typeof asset.mimeType === "string" && asset.mimeType.trim().length > 0
      ? asset.mimeType.trim()
      : null;

  let type = rawMime;
  if (!type) {
    if (ext === "pdf") type = "application/pdf";
    else if (ext === "png") type = "image/png";
    else if (ext === "jpg" || ext === "jpeg") type = "image/jpeg";
    else if (ext === "webp") type = "image/webp";
    else if (ext === "gif") type = "image/gif";
    else type = "application/octet-stream";
  }

  const size =
    typeof asset.size === "number" && Number.isFinite(asset.size)
      ? asset.size
      : 0;

  return { name, size, type, uri };
}

export function isPdfFile(
  file: Pick<NormalizedDocumentFile, "name" | "type">
): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export function isImageFile(
  file: Pick<NormalizedDocumentFile, "name" | "type">
): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/i.test(file.name)
  );
}
