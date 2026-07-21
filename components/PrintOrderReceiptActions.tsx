import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "./ThemeProvider";
import {
  generatePrintReceiptPdf,
  sharePrintReceiptPdf,
  type PrintReceiptData,
} from "../lib/printOrderReceipt";

type Props = {
  data: PrintReceiptData;
};

export default function PrintOrderReceiptActions({ data }: Props) {
  const { t } = useTranslation();
  const { themeColors } = useAppTheme();
  const [busy, setBusy] = useState<"download" | "share" | null>(null);

  const qrUri = useMemo(
    () =>
      `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=6&data=${encodeURIComponent(data.order.id)}`,
    [data.order.id]
  );

  const run = async (mode: "download" | "share") => {
    if (busy) return;
    setBusy(mode);
    try {
      const uri = await generatePrintReceiptPdf(data, t);
      await sharePrintReceiptPdf(
        uri,
        data.order.id,
        t("receipt_share_title", {
          id: data.order.id.slice(0, 8).toUpperCase(),
        })
      );
    } catch (err) {
      console.error("[PrintOrderReceipt]", err);
      Alert.alert(t("receipt_error_title"), t("receipt_error_body"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.qrCard,
          {
            backgroundColor: themeColors.surfaceMuted,
            borderColor: themeColors.borderSoft,
          },
        ]}
      >
        <Image source={{ uri: qrUri }} style={styles.qrImage} />
        <View style={styles.qrMeta}>
          <Text style={[styles.qrTitle, { color: themeColors.textStrong }]}>
            {t("receipt_qr_title")}
          </Text>
          <Text style={[styles.qrHint, { color: themeColors.textSoft }]}>
            {t("receipt_qr_hint")}
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[
            styles.btn,
            {
              backgroundColor: themeColors.accent,
              opacity: busy ? 0.7 : 1,
            },
          ]}
          disabled={!!busy}
          onPress={() => run("download")}
        >
          {busy === "download" ? (
            <ActivityIndicator size="small" color={themeColors.onAccent} />
          ) : (
            <Feather name="download" size={16} color={themeColors.onAccent} />
          )}
          <Text style={[styles.btnText, { color: themeColors.onAccent }]}>
            {t("receipt_download")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btnOutline,
            {
              borderColor: themeColors.accentSoftBorder,
              backgroundColor: themeColors.accentSoftBg,
              opacity: busy ? 0.7 : 1,
            },
          ]}
          disabled={!!busy}
          onPress={() => run("share")}
        >
          {busy === "share" ? (
            <ActivityIndicator size="small" color={themeColors.accent} />
          ) : (
            <Feather name="share-2" size={16} color={themeColors.accent} />
          )}
          <Text style={[styles.btnText, { color: themeColors.accent }]}>
            {t("receipt_share")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  qrCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  qrImage: {
    width: 84,
    height: 84,
    borderRadius: 10,
    backgroundColor: "#ffffff",
  },
  qrMeta: { flex: 1, alignItems: "flex-end" },
  qrTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  qrHint: { fontSize: 12, lineHeight: 18, textAlign: "right" },
  actionsRow: {
    flexDirection: "row-reverse",
    gap: 10,
    flexWrap: "wrap",
  },
  btn: {
    flexGrow: 1,
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnOutline: {
    flexGrow: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
