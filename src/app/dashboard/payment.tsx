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
import { useAppTheme } from "../../../components/ThemeProvider";

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
      <View style={[styles.loadingContainer, { backgroundColor: "#0F172A" }]}>
        <ActivityIndicator size="large" color="#FF5A1F" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: "#0F172A" }]}>
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
          <Text style={[styles.title, { color: "#FFFFFF" }]}>{t("payment_management")}</Text>
          <Text style={[styles.subtitle, { color: "#94A3B8" }]}>{t("payment_management_desc")}</Text>
        </View>

        {/* Balance cards grid */}
        <View style={[styles.metricsRow, isCompact && styles.stackedRow]}>
          <View style={[styles.metricCard, styles.metricCardPrimary, { backgroundColor: "rgba(255,90,31,0.12)", borderColor: "rgba(255,90,31,0.32)" }]}>
            <Ionicons name="wallet-outline" size={24} color="#FF5A1F" />
            <Text style={styles.metricValuePrimary}>{walletBalance.toLocaleString()} {t("currency")}</Text>
            <Text style={styles.metricLabel}>{t("wallet_balance")}</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: "#1E293B", borderColor: "rgba(255,255,255,0.08)" }]}>
            <Feather name="dollar-sign" size={24} color="#F59E0B" />
            <Text style={[styles.metricValue, { color: "#FFFFFF" }]}>{totalDue.toLocaleString()} {t("currency")}</Text>
            <Text style={styles.metricLabel}>{t("total_due")}</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: "#1E293B", borderColor: "rgba(255,255,255,0.08)" }]}>
            <Feather name="check-circle" size={24} color="#10B981" />
            <Text style={[styles.metricValue, { color: "#FFFFFF" }]}>{completedTotal.toLocaleString()} {t("currency")}</Text>
            <Text style={styles.metricLabel}>{t("completed")}</Text>
          </View>
        </View>

        {/* Transfer Instructions */}
        <View style={[styles.glassCard, { backgroundColor: "#1E293B", borderColor: "rgba(255,255,255,0.08)" }]}>
          <View style={styles.cardHeader}>
            <Feather name="info" size={20} color="#FF5A1F" />
            <Text style={[styles.cardTitle, { color: "#FFFFFF" }]}>{t("transfer_instructions")}</Text>
          </View>

          <View style={styles.instructionsContainer}>
            {zaincashNum ? (
              <View style={[styles.paymentAccountBox, { backgroundColor: "#0F172A", borderColor: "rgba(255,255,255,0.08)" }]}>
                <View style={styles.paymentAccountHeader}>
                  <TouchableOpacity onPress={() => copyPaymentNumber(zaincashNum)} style={styles.copyBtn}>
                    <Feather name="copy" size={18} color="#FF5A1F" />
                  </TouchableOpacity>
                  <Text style={[styles.paymentAccountTitle, { color: "#FFFFFF" }]}>{paymentLabels["Zain Cash"]}</Text>
                </View>
                <Text style={styles.paymentAccountNum}>{zaincashNum}</Text>
                <Text style={styles.paymentAccountDesc}>{t("send_invoice_amount")}</Text>
              </View>
            ) : null}

            {asiaNum ? (
              <View style={[styles.paymentAccountBox, { backgroundColor: "#0F172A", borderColor: "rgba(255,255,255,0.08)" }]}>
                <View style={styles.paymentAccountHeader}>
                  <TouchableOpacity onPress={() => copyPaymentNumber(asiaNum)} style={styles.copyBtn}>
                    <Feather name="copy" size={18} color="#FF5A1F" />
                  </TouchableOpacity>
                  <Text style={[styles.paymentAccountTitle, { color: "#FFFFFF" }]}>{paymentLabels["AsiaHawala"]}</Text>
                </View>
                <Text style={styles.paymentAccountNum}>{asiaNum}</Text>
                <Text style={styles.paymentAccountDesc}>{t("send_invoice_amount")}</Text>
              </View>
            ) : null}

            <View style={[styles.paymentAccountBox, { backgroundColor: "#0F172A", borderColor: "rgba(255,255,255,0.08)" }]}>
              <Text style={styles.cashTitle}>{t("cod_label")}</Text>
              <Text style={styles.paymentAccountDesc}>{t("cod_desc")}</Text>
            </View>
          </View>
        </View>

        {/* Wallet topup form */}
        <View style={[styles.glassCard, { backgroundColor: "#1E293B", borderColor: "rgba(255,255,255,0.08)" }]}>
          <View style={styles.cardHeader}>
            <Feather name="file-text" size={20} color="#FF5A1F" />
            <Text style={[styles.cardTitle, { color: "#FFFFFF" }]}>{t("wallet_topup_request")}</Text>
          </View>
          <Text style={[styles.topupTip, { color: "#94A3B8" }]}>
            {t("topup_tip")}
          </Text>

          {uploadSuccess && screenshotUrl ? (
            <View style={styles.successBlock}>
              <Feather name="check" size={28} color="#10B981" style={styles.successIcon} />
              <Text style={styles.successTitleText}>{t("wallet_topup_success")}</Text>
              <Text style={styles.successDescText}>{t("wallet_topup_success_desc")}</Text>
            </View>
          ) : (
            <View style={styles.topupForm}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: "#FFFFFF" }]}>{t("topup_amount_label")}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: "#0F172A", borderColor: "rgba(255,255,255,0.1)" }]}>
                  <TextInput
                    value={topupAmount}
                    onChangeText={setTopupAmount}
                    keyboardType="number-pad"
                    placeholder={t("topup_amount_placeholder")}
                    placeholderTextColor={themeColors.textMuted}
                    style={[styles.textInput, { color: "#FFFFFF" }]}
                    textAlign="right"
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleScreenshotPicker}
                disabled={uploading || !topupAmount || Number(topupAmount) <= 0}
                style={[
                  styles.screenshotPickerDashed,
                  { borderColor: "#FF5A1F" },
                  (!topupAmount || Number(topupAmount) <= 0) && styles.screenshotPickerDisabled,
                ]}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <View style={styles.screenshotPickerInner}>
                    <Feather name="upload" size={20} color="#FFFFFF" />
                    <Text style={[styles.screenshotPickerText, { color: "#FFFFFF" }]}>{t("upload_screenshot_btn")}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Quick order stats summary */}
        <View style={[styles.glassCard, { backgroundColor: "#1E293B", borderColor: "rgba(255,255,255,0.08)" }]}>
          <View style={styles.cardHeader}>
            <Feather name="clock" size={20} color="#FF5A1F" />
            <Text style={[styles.cardTitle, { color: "#FFFFFF" }]}>{t("order_summary")}</Text>
          </View>
          <View style={styles.orderSummaryGrid}>
            <View style={styles.summaryBox}>
              <Text style={[styles.summaryVal, { color: "#FFFFFF" }]}>{orders.length}</Text>
              <Text style={[styles.summaryLbl, { color: "#94A3B8" }]}>{t("total_orders")}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={[styles.summaryVal, { color: "#F59E0B" }]}>
                {orders.filter((o) => o.status === "Pending").length}
              </Text>
              <Text style={[styles.summaryLbl, { color: "#94A3B8" }]}>{t("pending")}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={[styles.summaryVal, { color: "#10B981" }]}>{completedOrders.length}</Text>
              <Text style={[styles.summaryLbl, { color: "#94A3B8" }]}>{t("completed")}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F172A",
  },
  toastSuccess: {
    backgroundColor: "rgba(16,185,129,0.12)",
    borderColor: "rgba(16,185,129,0.28)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  toastError: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderColor: "rgba(239,68,68,0.28)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  toastText: {
    color: "#FFFFFF",
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
    color: "#FFFFFF",
    textAlign: "right",
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: "#94A3B8",
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
    backgroundColor: "#1E293B",
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 3,
  },
  stackedRow: {
    flexDirection: "column",
  },
  metricCardPrimary: {
    backgroundColor: "rgba(255,90,31,0.12)",
    borderColor: "rgba(255,90,31,0.32)",
  },
  metricValuePrimary: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "900",
    color: "#FF5A1F",
    textAlign: "center",
    flexShrink: 1,
  },
  metricValue: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    flexShrink: 1,
  },
  metricLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: "#94A3B8",
    fontWeight: "600",
    textAlign: "center",
    flexShrink: 1,
  },
  glassCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    backgroundColor: "#1E293B",
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000000",
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
    color: "#FFFFFF",
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
    backgroundColor: "#0F172A",
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000000",
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
    color: "#FFFFFF",
    flexShrink: 1,
    textAlign: "right",
  },
  copyBtn: {
    width: 44,
    minHeight: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,90,31,0.12)",
  },
  paymentAccountNum: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "800",
    color: "#FF5A1F",
    fontFamily: "monospace",
    marginVertical: 6,
    textAlign: "right",
    flexShrink: 1,
  },
  paymentAccountDesc: {
    fontSize: 13,
    lineHeight: 20,
    color: "#94A3B8",
    textAlign: "right",
    flexShrink: 1,
  },
  cashTitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "800",
    color: "#F59E0B",
    marginBottom: 8,
  },
  topupTip: {
    fontSize: 13,
    marginBottom: 20,
    textAlign: "right",
    lineHeight: 20,
    color: "#94A3B8",
    flexShrink: 1,
  },
  successBlock: {
    alignItems: "center",
    backgroundColor: "rgba(16,185,129,0.1)",
    borderColor: "rgba(16,185,129,0.26)",
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
  },
  successIcon: {
    marginBottom: 8,
  },
  successTitleText: {
    color: "#10B981",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
    flexShrink: 1,
  },
  successDescText: {
    color: "#94A3B8",
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
    color: "#FFFFFF",
    textAlign: "right",
    flexShrink: 1,
  },
  inputWrapper: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0F172A",
    borderColor: "rgba(255,255,255,0.1)",
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: "#FFFFFF",
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
    backgroundColor: "#FF5A1F",
    borderColor: "#FF5A1F",
    shadowColor: "#FF5A1F",
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
    color: "#FFFFFF",
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
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  summaryVal: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "900",
    marginBottom: 6,
    color: "#FFFFFF",
  },
  summaryLbl: {
    fontSize: 12,
    lineHeight: 18,
    color: "#94A3B8",
    fontWeight: "600",
    textAlign: "center",
    flexShrink: 1,
  },
});
