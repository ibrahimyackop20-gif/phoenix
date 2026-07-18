import React, { useEffect, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Clipboard,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { pickDocumentWithPermission } from "../../../lib/filePermissions";
import { supabase } from "../../../lib/supabaseClient";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme, type ThemeColors } from "../../../components/ThemeProvider";
import { ScreenTransition } from "../../components/anim/ScreenTransition";

interface Order {
  id: string;
  copies: number;
  color_mode: string;
  num_copies?: number;
  a4_color_type?: string;
  total_price?: number;
  status: string;
  payment_method: string;
}

export default function PaymentScreen() {
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const styles = useMemo(() => getStyles(themeColors), [themeColors]);
  const { width, fontScale } = useWindowDimensions();
  const isCompact = width < 390 || fontScale >= 1.3;
  const isTablet = width >= 700;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");

  const [bwPrice, setBwPrice] = useState(0);
  const [colorPrice, setColorPrice] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [zaincashNum, setZaincashNum] = useState("");
  const [asiaNum, setAsiaNum] = useState("");

  // Feedbacks
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const triggerToast = (msg: string, type: "success" | "error" = "success") => {
    if (type === "success") {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  const loadData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch print orders
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, copies, color_mode, num_copies, a4_color_type, total_price, status, payment_method")
        .eq("user_id", user.id);

      setOrders((ordersData || []) as Order[]);

      // 2. Fetch page pricing config
      const { data: settings } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ["bw_page_price", "color_page_price"]);

      if (settings) {
        for (const s of settings) {
          if (s.key === "bw_page_price") setBwPrice(Number(s.value) || 0);
          if (s.key === "color_page_price") setColorPrice(Number(s.value) || 0);
        }
      }

      // 3. Fetch wallet profile balance
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .maybeSingle();

      setWalletBalance(profile?.balance ?? 0);

      // 4. Fetch Zain Cash / AsiaHawala credentials
      const { data: payData } = await supabase.from("payment_settings").select("key, value");
      if (payData) {
        for (const p of payData) {
          if (p.key === "zaincash_number" && p.value) setZaincashNum(p.value);
          if (p.key === "asiahawala_number" && p.value) setAsiaNum(p.value);
        }
      }
    } catch (err) {
      console.error("Error loading payment data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getTotal = (item: Order) => {
    if (item.total_price != null) return item.total_price;
    const rate = item.color_mode === "color" ? colorPrice : bwPrice;
    return (item.num_copies || 0) * rate * item.copies;
  };

  // Metrics calculators
  const totalDue = useMemo(() => {
    return orders
      .filter((o) => o.status !== "Completed" && o.payment_method === "Zain Cash")
      .reduce((sum, o) => sum + getTotal(o), 0);
  }, [orders, bwPrice, colorPrice]);

  const completedTotal = useMemo(() => {
    return orders.filter((o) => o.status === "Completed").reduce((sum, o) => sum + getTotal(o), 0);
  }, [orders, bwPrice, colorPrice]);

  const completedOrders = useMemo(() => {
    return orders.filter((o) => o.status === "Completed");
  }, [orders]);

  const handleScreenshotPicker = async () => {
    if (!topupAmount || Number(topupAmount) <= 0) {
      triggerToast(t("pay_enter_topup_first"), "error");
      return;
    }

    try {
      setUploading(true);
      const res = await pickDocumentWithPermission({
        type: "image/*",
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        setUploading(false);
        return;
      }

      const file = res.assets[0];
      const { data: session } = await supabase.auth.getSession();
      if (!session || !session.session?.user) {
        triggerToast(t("pay_not_logged_in"), "error");
        return;
      }

      const fileExt = (file.name?.split(".").pop() || "jpg").toLowerCase();
      const userId = session.session.user.id;
      // Path must start with auth uid so Storage RLS + delete-account cleanup match
      const filePath = `${userId}/receipt-${Date.now()}.${fileExt}`;

      const response = await fetch(file.uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, arrayBuffer, { contentType: file.mimeType || "image/jpeg" });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // Generate public URL
      const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(filePath);
      const pubUrl = urlData.publicUrl;

      // Insert top-up request (table is wallet_topups; column is receipt_url)
      const { error: dbError } = await supabase.from("wallet_topups").insert({
        user_id: userId,
        amount: Number(topupAmount),
        receipt_url: pubUrl,
        status: "pending",
      });

      if (dbError) {
        throw new Error(dbError.message);
      }

      setScreenshotUrl(pubUrl);
      setUploadSuccess(true);
      triggerToast(t("pay_receipt_uploaded"));
      setTopupAmount("");
      loadData();
    } catch (err: any) {
      triggerToast(err.message || t("pay_upload_failed"), "error");
    } finally {
      setUploading(false);
    }
  };

  const copyPaymentNumber = (num: string) => {
    Clipboard.setString(num);
    triggerToast(t("copied_success"));
  };

  const paymentLabels: Record<string, string> = {
    "Zain Cash": t("pay_zaincash"),
    AsiaHawala: t("pay_asia"),
    COD: t("pay_cod_short"),
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.screenBg }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.screenBg }]}>
      <ScreenTransition style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isTablet && styles.tabletContent]}
        keyboardShouldPersistTaps="handled"
      >
        {successMsg && (
          <View style={styles.toastSuccess}>
            <Text style={styles.toastText}>{successMsg}</Text>
          </View>
        )}
        {errorMsg && (
          <View style={styles.toastError}>
            <Text style={styles.toastText}>{errorMsg}</Text>
          </View>
        )}

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.textStrong }]}>{t("payment_management")}</Text>
          <Text style={[styles.subtitle, { color: themeColors.textSoft }]}>{t("payment_management_desc")}</Text>
        </View>

        {/* Balance cards grid */}
        <View style={[styles.metricsRow, isCompact && styles.stackedRow]}>
          <View style={[styles.metricCard, styles.metricCardPrimary, { backgroundColor: themeColors.accentSoftBg, borderColor: themeColors.accentSoftBorder }]}>
            <Ionicons name="wallet-outline" size={24} color={themeColors.accent} />
            <Text style={styles.metricValuePrimary}>{walletBalance.toLocaleString()} {t("currency")}</Text>
            <Text style={styles.metricLabel}>{t("wallet_balance")}</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: themeColors.surface, borderColor: themeColors.borderSoft }]}>
            <Feather name="dollar-sign" size={24} color={themeColors.warning} />
            <Text style={[styles.metricValue, { color: themeColors.textStrong }]}>{totalDue.toLocaleString()} {t("currency")}</Text>
            <Text style={styles.metricLabel}>{t("total_due")}</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: themeColors.surface, borderColor: themeColors.borderSoft }]}>
            <Feather name="check-circle" size={24} color={themeColors.success} />
            <Text style={[styles.metricValue, { color: themeColors.textStrong }]}>{completedTotal.toLocaleString()} {t("currency")}</Text>
            <Text style={styles.metricLabel}>{t("completed")}</Text>
          </View>
        </View>

        {/* Transfer Instructions */}
        <View style={[styles.glassCard, { backgroundColor: themeColors.surface, borderColor: themeColors.borderSoft }]}>
          <View style={styles.cardHeader}>
            <Feather name="info" size={20} color={themeColors.accent} />
            <Text style={[styles.cardTitle, { color: themeColors.textStrong }]}>{t("transfer_instructions")}</Text>
          </View>

          <View style={styles.instructionsContainer}>
            {zaincashNum ? (
              <View style={[styles.paymentAccountBox, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.borderSoft }]}>
                <View style={styles.paymentAccountHeader}>
                  <TouchableOpacity onPress={() => copyPaymentNumber(zaincashNum)} style={styles.copyBtn}>
                    <Feather name="copy" size={18} color={themeColors.accent} />
                  </TouchableOpacity>
                  <Text style={[styles.paymentAccountTitle, { color: themeColors.textStrong }]}>{paymentLabels["Zain Cash"]}</Text>
                </View>
                <Text style={styles.paymentAccountNum}>{zaincashNum}</Text>
                <Text style={styles.paymentAccountDesc}>{t("send_invoice_amount")}</Text>
              </View>
            ) : null}

            {asiaNum ? (
              <View style={[styles.paymentAccountBox, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.borderSoft }]}>
                <View style={styles.paymentAccountHeader}>
                  <TouchableOpacity onPress={() => copyPaymentNumber(asiaNum)} style={styles.copyBtn}>
                    <Feather name="copy" size={18} color={themeColors.accent} />
                  </TouchableOpacity>
                  <Text style={[styles.paymentAccountTitle, { color: themeColors.textStrong }]}>{paymentLabels["AsiaHawala"]}</Text>
                </View>
                <Text style={styles.paymentAccountNum}>{asiaNum}</Text>
                <Text style={styles.paymentAccountDesc}>{t("send_invoice_amount")}</Text>
              </View>
            ) : null}

            <View style={[styles.paymentAccountBox, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.borderSoft }]}>
              <Text style={styles.cashTitle}>{t("cod_label")}</Text>
              <Text style={styles.paymentAccountDesc}>{t("cod_desc")}</Text>
            </View>
          </View>
        </View>

        {/* Wallet topup form */}
        <View style={[styles.glassCard, { backgroundColor: themeColors.surface, borderColor: themeColors.borderSoft }]}>
          <View style={styles.cardHeader}>
            <Feather name="file-text" size={20} color={themeColors.accent} />
            <Text style={[styles.cardTitle, { color: themeColors.textStrong }]}>{t("wallet_topup_request")}</Text>
          </View>
          <Text style={[styles.topupTip, { color: themeColors.textSoft }]}>
            {t("topup_tip")}
          </Text>

          {uploadSuccess && screenshotUrl ? (
            <View style={styles.successBlock}>
              <Feather name="check" size={28} color={themeColors.success} style={styles.successIcon} />
              <Text style={styles.successTitleText}>{t("wallet_topup_success")}</Text>
              <Text style={styles.successDescText}>{t("wallet_topup_success_desc")}</Text>
            </View>
          ) : (
            <View style={styles.topupForm}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.textStrong }]}>{t("topup_amount_label")}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: themeColors.surfaceMuted, borderColor: themeColors.borderSoft }]}>
                  <TextInput
                    value={topupAmount}
                    onChangeText={setTopupAmount}
                    keyboardType="number-pad"
                    placeholder={t("topup_amount_placeholder")}
                    placeholderTextColor={themeColors.textMuted}
                    style={[styles.textInput, { color: themeColors.textStrong }]}
                    textAlign="right"
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleScreenshotPicker}
                disabled={uploading || !topupAmount || Number(topupAmount) <= 0}
                style={[
                  styles.screenshotPickerDashed,
                  { borderColor: themeColors.accent },
                  (!topupAmount || Number(topupAmount) <= 0) && styles.screenshotPickerDisabled,
                ]}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={themeColors.onAccent} />
                ) : (
                  <View style={styles.screenshotPickerInner}>
                    <Feather name="upload" size={20} color={themeColors.onAccent} />
                    <Text style={[styles.screenshotPickerText, { color: themeColors.onAccent }]}>{t("upload_screenshot_btn")}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Quick order stats summary */}
        <View style={[styles.glassCard, { backgroundColor: themeColors.surface, borderColor: themeColors.borderSoft }]}>
          <View style={styles.cardHeader}>
            <Feather name="clock" size={20} color={themeColors.accent} />
            <Text style={[styles.cardTitle, { color: themeColors.textStrong }]}>{t("order_summary")}</Text>
          </View>
          <View style={styles.orderSummaryGrid}>
            <View style={styles.summaryBox}>
              <Text style={[styles.summaryVal, { color: themeColors.textStrong }]}>{orders.length}</Text>
              <Text style={[styles.summaryLbl, { color: themeColors.textSoft }]}>{t("total_orders")}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={[styles.summaryVal, { color: themeColors.warning }]}>
                {orders.filter((o) => o.status === "Pending").length}
              </Text>
              <Text style={[styles.summaryLbl, { color: themeColors.textSoft }]}>{t("pending")}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={[styles.summaryVal, { color: themeColors.success }]}>{completedOrders.length}</Text>
              <Text style={[styles.summaryLbl, { color: themeColors.textSoft }]}>{t("completed")}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
      </ScreenTransition>
    </SafeAreaView>
  );
}

const getStyles = (themeColors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.screenBg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: themeColors.screenBg,
  },
  toastSuccess: {
    backgroundColor: themeColors.successSoftBg,
    borderColor: themeColors.successSoftBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  toastError: {
    backgroundColor: themeColors.dangerSoftBg,
    borderColor: themeColors.dangerSoftBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  toastText: {
    color: themeColors.textStrong,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
    flexShrink: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 56,
    width: "100%",
  },
  tabletContent: {
    maxWidth: 960,
    alignSelf: "center",
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "flex-end",
    marginTop: 8,
    marginBottom: 32,
  },
  title: {
    fontSize: 30,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: -0.4,
    color: themeColors.textStrong,
    textAlign: "right",
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: themeColors.textSoft,
    marginTop: 8,
    textAlign: "right",
    flexShrink: 1,
  },
  metricsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    minWidth: 120,
    minHeight: 128,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: themeColors.surface,
    borderColor: themeColors.borderSoft,
    shadowColor: themeColors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 3,
  },
  stackedRow: {
    flexDirection: "column",
  },
  metricCardPrimary: {
    backgroundColor: themeColors.accentSoftBg,
    borderColor: themeColors.accentSoftBorder,
  },
  metricValuePrimary: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "900",
    color: themeColors.accent,
    textAlign: "center",
    flexShrink: 1,
  },
  metricValue: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "800",
    color: themeColors.textStrong,
    textAlign: "center",
    flexShrink: 1,
  },
  metricLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: themeColors.textSoft,
    fontWeight: "600",
    textAlign: "center",
    flexShrink: 1,
  },
  glassCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    backgroundColor: themeColors.surface,
    borderColor: themeColors.borderSoft,
    shadowColor: themeColors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "800",
    color: themeColors.textStrong,
    textAlign: "right",
    flexShrink: 1,
  },
  instructionsContainer: {
    gap: 16,
  },
  paymentAccountBox: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    minHeight: 112,
    alignItems: "flex-end",
    justifyContent: "center",
    backgroundColor: themeColors.surfaceMuted,
    borderColor: themeColors.borderSoft,
    shadowColor: themeColors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  paymentAccountHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 8,
  },
  paymentAccountTitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "800",
    color: themeColors.textStrong,
    flexShrink: 1,
    textAlign: "right",
  },
  copyBtn: {
    width: 44,
    minHeight: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: themeColors.accentSoftBg,
  },
  paymentAccountNum: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "800",
    color: themeColors.accent,
    fontFamily: "monospace",
    marginVertical: 6,
    textAlign: "right",
    flexShrink: 1,
  },
  paymentAccountDesc: {
    fontSize: 13,
    lineHeight: 20,
    color: themeColors.textSoft,
    textAlign: "right",
    flexShrink: 1,
  },
  cashTitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "800",
    color: themeColors.warning,
    marginBottom: 8,
  },
  topupTip: {
    fontSize: 13,
    marginBottom: 20,
    textAlign: "right",
    lineHeight: 20,
    color: themeColors.textSoft,
    flexShrink: 1,
  },
  successBlock: {
    alignItems: "center",
    backgroundColor: themeColors.successSoftBg,
    borderColor: themeColors.successSoftBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
  },
  successIcon: {
    marginBottom: 8,
  },
  successTitleText: {
    color: themeColors.success,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
    flexShrink: 1,
  },
  successDescText: {
    color: themeColors.textSoft,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    flexShrink: 1,
  },
  topupForm: {
    gap: 20,
  },
  inputGroup: {
    gap: 10,
  },
  inputLabel: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    color: themeColors.textStrong,
    textAlign: "right",
    flexShrink: 1,
  },
  inputWrapper: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: themeColors.surfaceMuted,
    borderColor: themeColors.borderSoft,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: themeColors.textStrong,
    paddingVertical: 0,
  },
  screenshotPickerDashed: {
    borderWidth: 1,
    borderRadius: 18,
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: themeColors.accent,
    borderColor: themeColors.accent,
    shadowColor: themeColors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  screenshotPickerDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  screenshotPickerInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  screenshotPickerText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "800",
    color: themeColors.onAccent,
    textAlign: "center",
    flexShrink: 1,
  },
  orderSummaryGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryBox: {
    flex: 1,
    minWidth: 104,
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    padding: 14,
    backgroundColor: themeColors.surfaceMuted,
    borderWidth: 1,
    borderColor: themeColors.borderSoft,
  },
  summaryVal: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "900",
    marginBottom: 6,
    color: themeColors.textStrong,
  },
  summaryLbl: {
    fontSize: 12,
    lineHeight: 18,
    color: themeColors.textSoft,
    fontWeight: "600",
    textAlign: "center",
    flexShrink: 1,
  },
});
