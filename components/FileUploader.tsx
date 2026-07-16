import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { pickDocumentWithPermission } from "../lib/filePermissions";
import {
  isImageFile,
  isPdfFile,
  normalizeDocumentAsset,
  type NormalizedDocumentFile,
} from "../lib/normalizeDocumentAsset";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "./ThemeProvider";

interface FileMock {
  name: string;
  size: number;
  type: string;
  uri: string;
}

interface FileUploaderProps {
  onFileSelect: (file: FileMock) => void;
  uploading?: boolean;
  uploadProgress?: number;
  onError?: (message: string) => void;
  onOversizedFile?: (fileName: string, sizeMB: number) => void;
  file?: FileMock | null;
  onRemove?: () => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB — keep in sync with direct upload limit

export { MAX_FILE_SIZE };

export default function FileUploader({
  onFileSelect,
  uploading,
  uploadProgress,
  onError,
  onOversizedFile,
  file,
  onRemove,
}: FileUploaderProps) {
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const styles = getStyles(themeColors, isDark);

  const [internalSelectedFile, setInternalSelectedFile] = useState<FileMock | null>(null);
  const [compressing, setCompressing] = useState(false);

  const selectedFile = file !== undefined ? file : internalSelectedFile;

  const handlePickFile = async () => {
    try {
      const result = await pickDocumentWithPermission({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      let fileObj: NormalizedDocumentFile;
      try {
        fileObj = normalizeDocumentAsset(result.assets[0]);
      } catch {
        onError?.(t("upload_read_failed"));
        return;
      }

      const fileSize = fileObj.size;

      if (fileSize > MAX_FILE_SIZE) {
        const sizeMB = parseFloat((fileSize / 1024 / 1024).toFixed(1));
        onOversizedFile?.(fileObj.name, sizeMB);
        return;
      }

      const isPdf = isPdfFile(fileObj);
      const isImg = isImageFile(fileObj);

      if (!isPdf && !isImg) {
        onError?.(t("upload_unsupported"));
        return;
      }

      if (isImg && fileSize > 5 * 1024 * 1024) {
        setCompressing(true);
        setTimeout(() => {
          setCompressing(false);
          if (file === undefined) {
            setInternalSelectedFile(fileObj);
          }
          onFileSelect(fileObj);
        }, 1500);
      } else {
        if (file === undefined) {
          setInternalSelectedFile(fileObj);
        }
        onFileSelect(fileObj);
      }
    } catch (err) {
      console.error("❌ Document Picker error:", err);
      onError?.(t("upload_pick_failed"));
    }
  };

  const removeFile = () => {
    if (onRemove) {
      onRemove();
    } else {
      setInternalSelectedFile(null);
    }
  };

  const getFileIconName = (type: string) => {
    if (type.startsWith("image/")) return "image";
    return "file-text";
  };

  const getFileIconColor = (type: string) => {
    if (type.startsWith("image/")) return "#f97316";
    return themeColors.primary;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} ${t("upload_unit_b")}`;
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} ${t("upload_unit_kb")}`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} ${t("upload_unit_mb")}`;
  };

  return (
    <View style={styles.container}>
      {compressing && (
        <View style={styles.compressingContainer}>
          <ActivityIndicator size="small" color={themeColors.primary} />
          <Text style={styles.compressingText}>{t("upload_compressing")}</Text>
        </View>
      )}

      {!selectedFile && !compressing ? (
        <TouchableOpacity onPress={handlePickFile} style={styles.uploadZone}>
          <View style={styles.uploadZoneContent}>
            <View style={styles.uploadIconWrapper}>
              <Feather name="upload" size={24} color={themeColors.primary} />
            </View>
            <View style={styles.uploadTextWrapper}>
              <Text style={styles.uploadTitle}>{t("upload_tap_title")}</Text>
              <Text style={styles.uploadSubtitle}>{t("upload_tap_subtitle")}</Text>
              <Text style={styles.uploadHint}>{t("upload_tap_hint")}</Text>
            </View>
          </View>
        </TouchableOpacity>
      ) : selectedFile ? (
        <View style={styles.fileCard}>
          <View style={styles.cardHeader}>
            <View style={styles.fileInfo}>
              <Feather
                name={getFileIconName(selectedFile.type) as any}
                size={32}
                color={getFileIconColor(selectedFile.type)}
                style={styles.fileIcon}
              />
              <View style={styles.textColumn}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {selectedFile.name}
                </Text>
                <Text style={styles.fileSize}>{formatSize(selectedFile.size)}</Text>
              </View>
            </View>

            {!uploading && (
              <TouchableOpacity onPress={removeFile} style={styles.removeButton}>
                <Feather name="x" size={20} color={themeColors.textMuted} />
              </TouchableOpacity>
            )}

            {uploading && uploadProgress === 100 && (
              <Feather name="check-circle" size={20} color="#22c55e" />
            )}
          </View>

          {uploading && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${uploadProgress || 0}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {uploadProgress === 100
                  ? t("upload_done")
                  : t("upload_progress", { pct: uploadProgress || 0 })}
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const getStyles = (themeColors: any, _isDark: boolean) =>
  StyleSheet.create({
    container: {
      marginVertical: 8,
    },
    compressingContainer: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: 16,
      marginBottom: 12,
      borderRadius: 12,
      backgroundColor: "rgba(234, 88, 12, 0.05)",
      borderColor: "rgba(234, 88, 12, 0.2)",
      borderWidth: 1,
    },
    compressingText: {
      fontSize: 12,
      fontWeight: "500",
      color: themeColors.primary,
    },
    uploadZone: {
      padding: 24,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: themeColors.cardBorder,
      borderStyle: "dashed",
      backgroundColor: themeColors.background,
      alignItems: "center",
      justifyContent: "center",
    },
    uploadZoneContent: {
      alignItems: "center",
      gap: 12,
    },
    uploadIconWrapper: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: "rgba(234, 88, 12, 0.1)",
      alignItems: "center",
      justifyContent: "center",
    },
    uploadTextWrapper: {
      alignItems: "center",
    },
    uploadTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: themeColors.text,
      textAlign: "center",
    },
    uploadSubtitle: {
      fontSize: 12,
      color: themeColors.textMuted,
      marginTop: 4,
      textAlign: "center",
    },
    uploadHint: {
      fontSize: 10,
      color: themeColors.textMuted,
      marginTop: 2,
      textAlign: "center",
    },
    fileCard: {
      backgroundColor: themeColors.cardBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    },
    cardHeader: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "space-between",
    },
    fileInfo: {
      flexDirection: "row-reverse",
      alignItems: "center",
      flex: 1,
      gap: 12,
    },
    fileIcon: {
      marginLeft: 4,
    },
    textColumn: {
      alignItems: "flex-end",
      flex: 1,
    },
    fileName: {
      fontSize: 14,
      fontWeight: "500",
      color: themeColors.text,
    },
    fileSize: {
      fontSize: 11,
      color: themeColors.textMuted,
      marginTop: 2,
    },
    removeButton: {
      padding: 4,
    },
    progressContainer: {
      marginTop: 12,
    },
    progressBarBg: {
      height: 6,
      backgroundColor: themeColors.inputBg,
      borderRadius: 3,
      overflow: "hidden",
    },
    progressBarFill: {
      height: "100%",
      backgroundColor: themeColors.primary,
      borderRadius: 3,
    },
    progressText: {
      fontSize: 11,
      color: themeColors.textMuted,
      marginTop: 6,
      textAlign: "center",
    },
  });
