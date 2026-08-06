import * as DocumentPicker from "expo-document-picker";

/**
 * Opens system Document Picker directly. No media-library permission
 * request — Android system pickers (SAF / photo picker) don't need one.
 */
export async function pickDocumentWithPermission(
  options: DocumentPicker.DocumentPickerOptions
): Promise<DocumentPicker.DocumentPickerResult> {
  return DocumentPicker.getDocumentAsync(options);
}
