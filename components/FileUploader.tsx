import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { pickDocumentWithPermission } from "../lib/filePermissions";
import { Feather } from "@expo/vector-icons";

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

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export default function FileUploader({
  onFileSelect,
  uploading,
  uploadProgress,
  onError,
  onOversizedFile,
  file,
  onRemove,
}: FileUploaderProps) {
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

      const asset = result.assets[0];
      const fileSize = asset.size || 0;

      // Case A: file > 50MB → notify parent to show link input
      if (fileSize > MAX_FILE_SIZE) {
        const sizeMB = parseFloat((fileSize / 1024 / 1024).toFixed(1));
        onOversizedFile?.(asset.name, sizeMB);
        return;
      }

      // Check MIME type support
      const isPdf = asset.mimeType === "application/pdf" || asset.name.endsWith(".pdf");
      const isImg = asset.mimeType?.startsWith("image/") || 
                    /\.(png|jpg|jpeg|webp)$/i.test(asset.name);

      if (!isPdf && !isImg) {
        onError?.("نوع الملف غير مدعوم. استخدم PDF أو صور (PNG, JPG)");
        return;
      }

      const fileObj: FileMock = {
        name: asset.name,
        size: fileSize,
        type: asset.mimeType || (isPdf ? "application/pdf" : "image/jpeg"),
        uri: asset.uri,
      };

      // Emulate image optimization UX if file is a large image (> 5MB)
      if (isImg && fileSize > 5 * 1024 * 1024) {
        setCompressing(true);
        // Simulate local mobile image optimization time for UX parity
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
      onError?.("فشل اختيار الملف. الرجاء المحاولة مرة أخرى.");
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
    if (type.startsWith("image/")) return "#f97316"; // secondary representation
    return "#ea580c"; // primary representation
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " بايت";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " كيلوبايت";
    return (bytes / (1024 * 1024)).toFixed(1) + " ميجابايت";
  };

  return (
    <View style={styles.container}>
      {/* Compressing indicator */}
      {compressing && (
        <View style={styles.compressingContainer}>
          <ActivityIndicator size="small" color="#ea580c" />
          <Text style={styles.compressingText}>
            جاري تحسين جودة الصورة للرفع السريع...
          </Text>
        </View>
      )}

      {!selectedFile && !compressing ? (
        <TouchableOpacity onPress={handlePickFile} style={styles.uploadZone}>
          <View style={styles.uploadZoneContent}>
            <View style={styles.uploadIconWrapper}>
              <Feather name="upload" size={24} color="#ea580c" />
            </View>
            <View style={styles.uploadTextWrapper}>
              <Text style={styles.uploadTitle}>اضغط لتحميل ملف أو صورة</Text>
              <Text style={styles.uploadSubtitle}>
                PDF أو صور (PNG, JPG) - الحد الأقصى 50 ميجابايت
              </Text>
              <Text style={styles.uploadHint}>
                الملفات الأكبر؟ سيظهر خيار لصق رابط خارجي تلقائياً
              </Text>
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
                <Feather name="x" size={20} color="#71717a" />
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
                  ? "تم الرفع بنجاح ✓"
                  : `جاري الرفع... ${uploadProgress || 0}%`}
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: "#ea580c",
  },
  uploadZone: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#27272a",
    borderStyle: "dashed",
    backgroundColor: "#18181b",
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
    color: "#f4f4f5",
    textAlign: "center",
  },
  uploadSubtitle: {
    fontSize: 12,
    color: "#71717a",
    marginTop: 4,
    textAlign: "center",
  },
  uploadHint: {
    fontSize: 10,
    color: "#71717a",
    marginTop: 2,
    textAlign: "center",
  },
  fileCard: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
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
    color: "#f4f4f5",
  },
  fileSize: {
    fontSize: 11,
    color: "#71717a",
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
    backgroundColor: "#27272a",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#ea580c", // matches gradient start
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    color: "#a1a1aa",
    marginTop: 6,
    textAlign: "center",
  },
});
