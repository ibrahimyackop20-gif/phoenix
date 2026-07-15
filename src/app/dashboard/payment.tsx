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
      triggerToast("يرجى إدخال مبلغ شحن صحيح أولاً", "error");
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
        triggerToast("أنت غير مسجل الدخول", "error");
        return;
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `${session.session.user.id}-${Date.now()}.${fileExt}`;
      const filePath = `receipts/${fileName}`;

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

      // Insert topup request into supabase
      const { error: dbError } = await supabase.from("wallet_requests").insert({
        user_id: session.session.user.id,
        amount: Number(topupAmount),
        screenshot_url: pubUrl,
        status: "Pending",
      });

      if (dbError) {
        throw new Error(dbError.message);
      }

      setScreenshotUrl(pubUrl);
      setUploadSuccess(true);
      triggerToast("تم رفع إثبات الدفع بنجاح");
      setTopupAmount("");
      loadData();
    } catch (err: any) {
      triggerToast(err.message || "فشل رفع الملف", "error");
    } finally {
      setUploading(false);
    }
  };

  const copyPaymentNumber = (num: string) => {
    Clipboard.setString(num);
    triggerToast(t("copied_success"));
  };

  const paymentLabels: Record<string, string> = {
    "Zain Cash": "زين كاش",
    AsiaHawala: "آسيا حوالة",
    COD: "الدفع عند الاستلام",
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
          <Text style={[styles.title, { color: themeColors.text }]}>{t("payment_management")}</Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>{t("payment_management_desc")}</Text>
        </View>

        {/* Balance cards grid */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.metricCardPrimary, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
            <Ionicons name="wallet-outline" size={18} color="#ea580c" />
            <Text style={styles.metricValuePrimary}>{walletBalance.toLocaleString()} {t("currency")}</Text>
            <Text style={styles.metricLabel}>{t("wallet_balance")}</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
            <Feather name="dollar-sign" size={18} color="#fb923c" />
            <Text style={[styles.metricValue, { color: themeColors.text }]}>{totalDue.toLocaleString()} {t("currency")}</Text>
            <Text style={styles.metricLabel}>{t("total_due")}</Text>
          </View>

          <View style={[styles.metricCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
            <Feather name="check-circle" size={18} color="#34d399" />
            <Text style={[styles.metricValue, { color: themeColors.text }]}>{completedTotal.toLocaleString()} {t("currency")}</Text>
            <Text style={styles.metricLabel}>{t("completed")}</Text>
          </View>
        </View>

        {/* Transfer Instructions */}
        <View style={[styles.glassCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          <View style={styles.cardHeader}>
            <Feather name="info" size={16} color="#ea580c" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t("transfer_instructions")}</Text>
          </View>

          <View style={styles.instructionsContainer}>
            {zaincashNum ? (
              <View style={[styles.paymentAccountBox, { backgroundColor: themeColors.background, borderColor: themeColors.cardBorder }]}>
                <View style={styles.paymentAccountHeader}>
                  <TouchableOpacity onPress={() => copyPaymentNumber(zaincashNum)} style={styles.copyBtn}>
                    <Feather name="copy" size={14} color="#ea580c" />
                  </TouchableOpacity>
                  <Text style={[styles.paymentAccountTitle, { color: themeColors.text }]}>{paymentLabels["Zain Cash"]}</Text>
                </View>
                <Text style={styles.paymentAccountNum}>{zaincashNum}</Text>
                <Text style={styles.paymentAccountDesc}>{t("send_invoice_amount")}</Text>
              </View>
            ) : null}

            {asiaNum ? (
              <View style={[styles.paymentAccountBox, { backgroundColor: themeColors.background, borderColor: themeColors.cardBorder }]}>
                <View style={styles.paymentAccountHeader}>
                  <TouchableOpacity onPress={() => copyPaymentNumber(asiaNum)} style={styles.copyBtn}>
                    <Feather name="copy" size={14} color="#ea580c" />
                  </TouchableOpacity>
                  <Text style={[styles.paymentAccountTitle, { color: themeColors.text }]}>{paymentLabels["AsiaHawala"]}</Text>
                </View>
                <Text style={styles.paymentAccountNum}>{asiaNum}</Text>
                <Text style={styles.paymentAccountDesc}>{t("send_invoice_amount")}</Text>
              </View>
            ) : null}

            <View style={[styles.paymentAccountBox, { backgroundColor: themeColors.background, borderColor: themeColors.cardBorder }]}>
              <Text style={styles.cashTitle}>{t("cod_label")}</Text>
              <Text style={styles.paymentAccountDesc}>{t("cod_desc")}</Text>
            </View>
          </View>
        </View>

        {/* Wallet topup form */}
        <View style={[styles.glassCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          <View style={styles.cardHeader}>
            <Feather name="file-text" size={16} color="#ea580c" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t("wallet_topup_request")}</Text>
          </View>
          <Text style={[styles.topupTip, { color: themeColors.textMuted }]}>
            {t("topup_tip")}
          </Text>

          {uploadSuccess && screenshotUrl ? (
            <View style={styles.successBlock}>
              <Feather name="check" size={24} color="#34d399" style={styles.successIcon} />
              <Text style={styles.successTitleText}>{t("wallet_topup_success")}</Text>
              <Text style={styles.successDescText}>{t("wallet_topup_success_desc")}</Text>
            </View>
          ) : (
            <View style={styles.topupForm}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>{t("topup_amount_label")}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: themeColors.background, borderColor: themeColors.cardBorder }]}>
                  <TextInput
                    value={topupAmount}
                    onChangeText={setTopupAmount}
                    keyboardType="number-pad"
                    placeholder={t("topup_amount_placeholder")}
                    placeholderTextColor={themeColors.textMuted}
                    style={[styles.textInput, { color: themeColors.text }]}
                    textAlign="right"
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleScreenshotPicker}
                disabled={uploading || !topupAmount || Number(topupAmount) <= 0}
                style={[
                  styles.screenshotPickerDashed,
                  { borderColor: themeColors.cardBorder },
                  (!topupAmount || Number(topupAmount) <= 0) && styles.screenshotPickerDisabled,
                ]}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#ea580c" />
                ) : (
                  <View style={styles.screenshotPickerInner}>
                    <Feather name="upload" size={18} color={themeColors.textMuted} />
                    <Text style={[styles.screenshotPickerText, { color: themeColors.textMuted }]}>{t("upload_screenshot_btn")}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Quick order stats summary */}
        <View style={[styles.glassCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          <View style={styles.cardHeader}>
            <Feather name="clock" size={16} color="#ea580c" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t("order_summary")}</Text>
          </View>
          <View style={styles.orderSummaryGrid}>
            <View style={styles.summaryBox}>
              <Text style={[styles.summaryVal, { color: themeColors.text }]}>{orders.length}</Text>
              <Text style={[styles.summaryLbl, { color: themeColors.textMuted }]}>{t("total_orders")}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={[styles.summaryVal, { color: "#fb923c" }]}>
                {orders.filter((o) => o.status === "Pending").length}
              </Text>
              <Text style={[styles.summaryLbl, { color: themeColors.textMuted }]}>{t("pending")}</Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={[styles.summaryVal, { color: "#34d399" }]}>{completedOrders.length}</Text>
              <Text style={[styles.summaryLbl, { color: themeColors.textMuted }]}>{t("completed")}</Text>
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
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  toastSuccess: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderColor: "rgba(52, 211, 153, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 10,
  },
  toastError: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 10,
  },
  toastText: {
    color: "#f4f4f5",
    fontSize: 13,
    textAlign: "center",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: "flex-end",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  metricsRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  metricCardPrimary: {
    backgroundColor: "rgba(234, 88, 12, 0.05)",
  },
  metricValuePrimary: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#ea580c",
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "bold",
  },
  metricLabel: {
    fontSize: 9,
    color: "#71717a",
  },
  glassCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "bold",
  },
  instructionsContainer: {
    gap: 12,
  },
  paymentAccountBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: "flex-end",
  },
  paymentAccountHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 4,
  },
  paymentAccountTitle: {
    fontSize: 12,
    fontWeight: "bold",
  },
  copyBtn: {
    padding: 4,
  },
  paymentAccountNum: {
    fontSize: 14,
    color: "#ea580c",
    fontFamily: "monospace",
    marginVertical: 4,
  },
  paymentAccountDesc: {
    fontSize: 10,
    color: "#71717a",
  },
  cashTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#fb923c",
    marginBottom: 4,
  },
  topupTip: {
    fontSize: 11,
    marginBottom: 16,
    textAlign: "right",
    lineHeight: 16,
  },
  successBlock: {
    alignItems: "center",
    backgroundColor: "rgba(52, 211, 153, 0.08)",
    borderColor: "rgba(52, 211, 153, 0.15)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
  },
  successIcon: {
    marginBottom: 8,
  },
  successTitleText: {
    color: "#34d399",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  successDescText: {
    color: "#71717a",
    fontSize: 11,
    textAlign: "center",
  },
  topupForm: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "right",
  },
  inputWrapper: {
    borderWidth: 1,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
  },
  screenshotPickerDashed: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  screenshotPickerDisabled: {
    opacity: 0.5,
  },
  screenshotPickerInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  screenshotPickerText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  orderSummaryGrid: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    gap: 8,
  },
  summaryBox: {
    flex: 1,
    alignItems: "center",
  },
  summaryVal: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  summaryLbl: {
    fontSize: 10,
  },
});
