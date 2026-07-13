import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../../../lib/supabaseClient";
import InvoiceGenerator from "../../../components/InvoiceGenerator";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  store_name?: string;
}

interface SalesOrder {
  id: string;
  total: number;
  status: string;
  seller_status?: string;
  reject_reason?: string | null;
  order_type?: string;
  items: OrderItem[] | string;
  created_at: string;
  store_name?: string;
  governorate?: string;
  delivery_zone?: string;
  shipping_cost?: number;
  full_address?: string;
}

const STEPS = [
  { key: "pending", label: "قيد التجهيز", icon: "clock" as const, color: "#fb923c" },
  { key: "shipped", label: "تم الشحن", icon: "truck" as const, color: "#60a5fa" },
  { key: "ready", label: "جاهز للتسليم", icon: "package" as const, color: "#c084fc" },
  { key: "delivered", label: "تم الاستلام", icon: "check-circle" as const, color: "#34d399" },
];

function parseOrderItems(items: OrderItem[] | string): OrderItem[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  try {
    return JSON.parse(items);
  } catch {
    return [];
  }
}

function getStepIndex(status: string): number {
  return STEPS.findIndex((s) => s.key === status);
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function PurchasesScreen() {
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const fetchOrders = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // User profile info for invoices
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone_number")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        setCustomerName(profile.full_name || "");
        setCustomerPhone(profile.phone_number || "");
      }

      const { data, error } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Fetch sales orders error:", error.message);
      } else {
        setOrders(data || []);
      }
    } catch (err) {
      console.error("Purchases general error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    if (params.checkoutSuccess === "true") {
      setShowSuccess(true);
      router.setParams({ checkoutSuccess: undefined });
    }
  }, [params]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  // ── Confetti checkout Success screen ──────────────
  if (showSuccess) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.successContent}>
          <View style={styles.successBadge}>
            <Feather name="check" size={48} color="#ffffff" />
          </View>
          <Text style={[styles.successTitle, { color: themeColors.text }]}>{t("order_placed_success") || "تم تسجيل طلبك بنجاح!"}</Text>
          <Text style={[styles.successSubtitle, { color: themeColors.textMuted }]}>{t("order_placed_success_desc") || "فريق التوصيل سيتواصل معك قريباً لتوصيل المشتريات"}</Text>
          <View style={styles.successActions}>
            <TouchableOpacity onPress={() => setShowSuccess(false)} style={styles.primaryBtnCompact}>
              <Text style={styles.btnTextCompact}>{t("track_my_purchases") || "تتبع مشترياتي"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/dashboard" as any)} style={styles.secondaryBtnCompact}>
              <Text style={styles.secondaryBtnTextCompact}>{t("browse_library") || "تصفح المكتبة"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push("/dashboard" as any)} style={styles.refreshButton}>
          <Feather name="arrow-right" size={18} color={themeColors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: themeColors.text }]}>{t("my_purchases")}</Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>{t("my_purchases_desc") || "تتبع مشترياتك وطلباتك من المكتبة والمتاجر"}</Text>
        </View>
      </View>

      {orders.length === 0 ? (
        <View style={styles.emptyCard}>
          <Feather name="shopping-bag" size={64} color={themeColors.textMuted} />
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>{t("no_purchases") || "لا توجد مشتريات"}</Text>
          <Text style={[styles.emptySubtitle, { color: themeColors.textMuted }]}>{t("no_purchases_desc") || "لم تقم بأي عمليات شراء من المكتبة أو المتاجر بعد"}</Text>
          <TouchableOpacity onPress={() => router.push("/dashboard" as any)} style={styles.primaryBtnCompact}>
            <Text style={styles.btnTextCompact}>{t("browse_library") || "تصفح المكتبة"}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const currentStep = getStepIndex(item.status);
            const itemsList = parseOrderItems(item.items);
            const isRejected = item.seller_status === "rejected";
            const showInvoice = !isRejected;
            const itemsSubtotal = itemsList.reduce((sum, i) => sum + i.subtotal, 0);

            return (
              <View style={[styles.orderCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }, isRejected && styles.orderCardRejected]}>
                {/* Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.headerLeft}>
                    {showInvoice && (
                      <InvoiceGenerator
                        data={{
                          orderId: item.id,
                          orderDate: item.created_at,
                          customerName: customerName,
                          customerPhone: customerPhone,
                          storeName: item.store_name || t("library"),
                          items: itemsList,
                          subtotal: itemsSubtotal,
                          shippingCost: item.shipping_cost || 0,
                          total: item.total,
                          governorate: item.governorate || "",
                          deliveryZone: item.delivery_zone || "",
                          fullAddress: item.full_address || "",
                        }}
                      />
                    )}
                    <Text style={styles.totalPrice}>
                      {item.total.toLocaleString()} {t("currency")}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      item.status === "delivered" && styles.statusBadgeSuccess,
                      isRejected && styles.statusBadgeRejected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        item.status === "delivered" && styles.statusBadgeTextSuccess,
                        isRejected && styles.statusBadgeTextRejected,
                      ]}
                    >
                      {isRejected ? t("status_rejected") : (t(item.status) || item.status)}
                    </Text>
                  </View>
                </View>

                {/* Store Name & Date */}
                <View style={styles.storeLocationRow}>
                  {item.store_name ? (
                    <View style={styles.storeRow}>
                      <Feather name="home" size={12} color="#34d399" />
                      <Text style={styles.storeNameText}>{item.store_name}</Text>
                    </View>
                  ) : (
                    <View style={styles.storeRow}>
                      <Feather name="home" size={12} color="#34d399" />
                      <Text style={styles.storeNameText}>{t("library")}</Text>
                    </View>
                  )}
                  <Text style={[styles.orderDateText, { color: themeColors.textMuted }]}>{formatDate(item.created_at)}</Text>
                </View>

                {/* Items Block */}
                <View style={[styles.itemsBlock, { backgroundColor: themeColors.background }]}>
                  {itemsList.map((prod, idx) => (
                    <View key={idx} style={styles.itemRow}>
                      <Text style={[styles.itemSubtotal, { color: themeColors.textMuted }]}>
                        {prod.subtotal.toLocaleString()} {t("currency")}
                      </Text>
                      <View style={styles.itemNameWrapper}>
                        <Text style={[styles.itemName, { color: themeColors.text }]}>{prod.name}</Text>
                        <Text style={styles.itemQty}>×{prod.quantity}</Text>
                      </View>
                    </View>
                  ))}
                  {item.shipping_cost != null && item.shipping_cost > 0 ? (
                    <View style={styles.shippingRow}>
                      <Text style={[styles.itemSubtotal, { color: themeColors.textMuted }]}>
                        {item.shipping_cost.toLocaleString()} {t("currency")}
                      </Text>
                      <Text style={styles.shippingLabel}>{t("delivery_fee")}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Rejection Notice */}
                {isRejected && (
                  <View style={styles.rejectedBlock}>
                    <Feather
                      name="alert-circle"
                      size={20}
                      color="#ef4444"
                      style={styles.rejectedIcon}
                    />
                    <Text style={styles.rejectedTitle}>{t("order_rejected_note")}</Text>
                    {item.reject_reason ? (
                      <Text style={styles.rejectedReason}>{item.reject_reason}</Text>
                    ) : null}
                  </View>
                )}

                {/* Progress Block */}
                {!isRejected && (
                  <View style={styles.progressBlock}>
                    <View style={styles.progressCirclesRow}>
                      {STEPS.map((step, idx) => {
                        const isCompleted = idx <= currentStep;
                        const isCurrent = idx === currentStep;

                        return (
                          <View key={step.key} style={styles.progressStepNode}>
                            <View
                              style={[
                                styles.stepCircle,
                                {
                                  backgroundColor: isCompleted ? "#34d399" : (isDark ? "#27272a" : "#e5e7eb"),
                                  borderColor: isCompleted ? "#34d399" : (isDark ? "#3f3f46" : "#d1d5db"),
                                },
                                isCurrent && styles.stepCircleCurrent,
                              ]}
                            >
                              <Feather
                                name={step.icon}
                                size={10}
                                color={isCompleted || isCurrent ? "#ffffff" : themeColors.textMuted}
                              />
                            </View>
                            <Text
                              style={[
                                styles.stepLabelText,
                                { color: themeColors.textMuted },
                                isCompleted && styles.stepLabelCompleted,
                              ]}
                            >
                              {t(step.key) || step.label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
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
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    alignItems: "flex-end",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  emptyCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  primaryBtnCompact: {
    backgroundColor: "#ea580c",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  btnTextCompact: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  secondaryBtnCompact: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  secondaryBtnTextCompact: {
    color: "#ea580c",
    fontSize: 13,
    fontWeight: "bold",
  },
  successContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  successBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 32,
  },
  successActions: {
    flexDirection: "row-reverse",
    gap: 16,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  orderCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  orderCardRejected: {
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  cardHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  statusBadge: {
    backgroundColor: "rgba(251, 146, 60, 0.15)",
    borderColor: "rgba(251, 146, 60, 0.3)",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusBadgeRejected: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  statusBadgeText: {
    color: "#fb923c",
    fontSize: 9,
    fontWeight: "bold",
  },
  statusBadgeTextRejected: {
    color: "#ef4444",
  },
  statusBadgeSuccess: {
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    borderColor: "rgba(52, 211, 153, 0.3)",
  },
  statusBadgeTextSuccess: {
    color: "#34d399",
  },
  headerLeft: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  totalPrice: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#ea580c",
  },
  storeLocationRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  storeNameText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#ea580c",
  },
  storeRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  orderDateText: {
    fontSize: 11,
  },
  itemsBlock: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  itemNameWrapper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  itemName: {
    fontSize: 12,
  },
  itemQty: {
    fontSize: 11,
    color: "#71717a",
  },
  itemSubtotal: {
    fontSize: 12,
  },
  shippingRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(113, 113, 122, 0.2)",
    paddingTop: 6,
    marginTop: 6,
  },
  shippingLabel: {
    fontSize: 11,
    color: "#71717a",
  },
  rejectedBlock: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  rejectedIcon: {
    marginBottom: 6,
  },
  rejectedTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#ef4444",
  },
  rejectedReason: {
    fontSize: 11,
    color: "#ef4444",
    marginTop: 4,
    textAlign: "center",
  },
  progressBlock: {
    marginTop: 8,
  },
  progressCirclesRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressStepNode: {
    alignItems: "center",
    flex: 1,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stepCircleCurrent: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  stepLabelText: {
    fontSize: 9,
  },
  stepLabelCompleted: {
    color: "#34d399",
    fontWeight: "bold",
  },
});
