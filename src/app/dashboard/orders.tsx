import React, { useEffect, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  ScrollView,
  SafeAreaView,
  Linking,
} from "react-native";
import { supabase } from "../../../lib/supabaseClient";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

interface PrintOrder {
  id: string;
  type: "print";
  file_name: string;
  file_url: string;
  copies: number;
  color_mode: string;
  num_copies?: number;
  a4_color_type?: string;
  order_type?: string;
  total_pages?: number;
  total_price?: number;
  description: string | null;
  status: string;
  payment_method: string | null;
  created_at: string;
}

interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  store_name?: string;
}

interface LibraryOrder {
  id: string;
  type: "library";
  total: number;
  status: string;
  items: OrderItem[] | string;
  created_at: string;
  store_name?: string;
  governorate?: string;
  delivery_zone?: string;
  shipping_cost?: number;
}

type UnifiedOrder = PrintOrder | LibraryOrder;
type FilterType = "all" | "print" | "library";

function parseOrderItems(items: OrderItem[] | string): OrderItem[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  try {
    return JSON.parse(items);
  } catch {
    return [];
  }
}

const LIBRARY_STEPS = [
  { key: "pending", label: "قيد التجهيز", icon: "clock" as const, color: "#fb923c" },
  { key: "shipped", label: "تم الشحن", icon: "truck" as const, color: "#60a5fa" },
  { key: "ready", label: "جاهز للتسليم", icon: "package" as const, color: "#c084fc" },
  { key: "delivered", label: "تم الاستلام", icon: "check-circle" as const, color: "#34d399" },
];

function getLibraryStepIndex(status: string): number {
  return LIBRARY_STEPS.findIndex((s) => s.key === status);
}

const PRINT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  Pending: { label: "قيد الانتظار", color: "#fb923c" },
  Printing: { label: "جاري الطباعة", color: "#60a5fa" },
  Completed: { label: "مكتمل", color: "#34d399" },
  Rejected: { label: "مرفوض", color: "#f87171" },
};

export default function OrdersScreen() {
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

  const [bwPrice, setBwPrice] = useState(0);
  const [colorPrice, setColorPrice] = useState(0);

  // Success message
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const fetchOrders = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // 1. Fetch print orders
      const { data: printData, error: printErr } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (printErr) {
        console.error("Fetch Print Orders Error:", printErr.message);
      }

      const printOrders: PrintOrder[] = (printData || []).map((o) => ({
        ...o,
        type: "print" as const,
      }));

      // 2. Fetch library purchases
      const { data: libData, error: libErr } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false });

      if (libErr) {
        console.error("Fetch Library Orders Error:", libErr.message);
      }

      const libOrders: LibraryOrder[] = (libData || []).map((o) => ({
        ...o,
        type: "library" as const,
      }));

      // Merge and sort by date
      const merged = [...printOrders, ...libOrders].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setOrders(merged);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
    triggerToast("تم تحديث البيانات");
  };

  useEffect(() => {
    fetchOrders();

    // Fetch site prices
    const loadPrices = async () => {
      try {
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
      } catch (err) {
        console.error(err);
      }
    };
    loadPrices();

    // Real-time listeners
    const printChannel = supabase
      .channel("student-orders-realtime-rn")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            setOrders((prev) =>
              prev.map((order) =>
                order.id === payload.new.id
                  ? ({ ...order, ...payload.new, type: "print" as const } as any)
                  : order
              )
            );
            const statusLabels: Record<string, string> = {
              Pending: "قيد الانتظار",
              Printing: "جاري الطباعة",
              Completed: "مكتمل",
              Rejected: "مرفوض",
            };
            const newStatus = payload.new.status;
            triggerToast(`تم تحديث حالة طلب الطباعة: ${statusLabels[newStatus] || newStatus}`);
          } else if (payload.eventType === "INSERT") {
            fetchOrders();
          }
        }
      )
      .subscribe();

    const libChannel = supabase
      .channel("my-purchases-rt-rn")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sales_orders" },
        (payload) => {
          setOrders((prev) =>
            prev.map((o) => (o.id === payload.new.id ? { ...o, status: payload.new.status } : o))
          );
          triggerToast("تم تحديث حالة طلب المكتبة");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(printChannel);
      supabase.removeChannel(libChannel);
    };
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPrice = (order: PrintOrder) => {
    return (order.a4_color_type || order.color_mode) === "color" ? colorPrice : bwPrice;
  };

  const getTotal = (order: PrintOrder) => {
    return order.total_price ?? (order.num_copies ?? order.copies ?? 1) * getPrice(order);
  };

  const paymentLabels: Record<string, string> = {
    zaincash: "زين كاش",
    asiahawala: "آسيا حوالة",
    wallet: "رصيد المحفظة",
    cod: "عند الاستلام",
  };

  const filteredOrders = useMemo(() => {
    return filter === "all" ? orders : orders.filter((o) => o.type === filter);
  }, [orders, filter]);

  const printCount = useMemo(() => orders.filter((o) => o.type === "print").length, [orders]);
  const libCount = useMemo(() => orders.filter((o) => o.type === "library").length, [orders]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {successMsg && (
        <View style={styles.toastSuccess}>
          <Text style={styles.toastText}>{successMsg}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleRefresh} disabled={refreshing} style={styles.refreshButton}>
          <Feather name="refresh-cw" size={16} color={themeColors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: themeColors.text }]}>{t("my_orders")}</Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>{t("my_orders_desc")}</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        <TouchableOpacity
          onPress={() => setFilter("all")}
          style={[styles.tabButton, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }, filter === "all" && styles.tabButtonActive]}
        >
          <Feather name="filter" size={12} color={filter === "all" ? "#ffffff" : themeColors.textMuted} style={styles.tabIcon} />
          <Text style={[styles.tabText, { color: themeColors.textMuted }, filter === "all" && styles.tabTextActive]}>
            {t("all")} ({orders.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilter("print")}
          style={[styles.tabButton, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }, filter === "print" && styles.tabButtonActivePrint]}
        >
          <Feather name="printer" size={12} color={filter === "print" ? "#ffffff" : themeColors.textMuted} style={styles.tabIcon} />
          <Text style={[styles.tabText, { color: themeColors.textMuted }, filter === "print" && styles.tabTextActive]}>
            {t("printing_services")} ({printCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilter("library")}
          style={[styles.tabButton, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }, filter === "library" && styles.tabButtonActiveLib]}
        >
          <Feather name="shopping-bag" size={12} color={filter === "library" ? "#ffffff" : themeColors.textMuted} style={styles.tabIcon} />
          <Text style={[styles.tabText, { color: themeColors.textMuted }, filter === "library" && styles.tabTextActive]}>
            {t("my_purchases")} ({libCount})
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {filteredOrders.length === 0 ? (
        <View style={styles.emptyCard}>
          <Feather name="package" size={64} color={themeColors.textMuted} />
          <Text style={[styles.emptyTitle, { color: themeColors.text }]}>{t("no_orders")}</Text>
          <Text style={[styles.emptySubtitle, { color: themeColors.textMuted }]}>
            {filter === "print"
              ? t("no_print_orders")
              : filter === "library"
              ? t("no_library_orders")
              : t("orders_empty_hint")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isPrint = item.type === "print";

            return (
              <View style={[styles.orderCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
                {/* Type Tag Header */}
                <View style={styles.cardHeader}>
                  <Text style={styles.orderId}>#{item.id.slice(0, 8).toUpperCase()}</Text>
                  {isPrint ? (
                    <View style={styles.printTag}>
                      <Feather name="printer" size={10} color="#60a5fa" />
                      <Text style={styles.printTagText}>{t("print_order")}</Text>
                    </View>
                  ) : (
                    <View style={styles.libTag}>
                      <Feather name="shopping-bag" size={10} color="#34d399" />
                      <Text style={styles.libTagText}>{t("library_purchase")}</Text>
                    </View>
                  )}
                </View>

                {/* Print Order Detail */}
                {isPrint ? (
                  <View style={styles.cardBody}>
                    <View style={styles.printRow}>
                      <View style={styles.printBadgeIcon}>
                        <Feather name="file-text" size={20} color="#60a5fa" />
                      </View>
                      <View style={styles.printDetails}>
                        <Text numberOfLines={1} style={[styles.fileName, { color: themeColors.text }]}>
                          {item.file_name || t("print_file")}
                        </Text>
                        <Text style={[styles.fileParams, { color: themeColors.textMuted }]}>
                          {item.copies} {t("copies") || "نسخ"} ·{" "}
                          {item.color_mode === "color" ? t("color") : t("grayscale")} ·{" "}
                          {formatDate(item.created_at)}
                        </Text>
                        {item.description ? (
                          <Text style={[styles.fileDesc, { backgroundColor: themeColors.background, color: themeColors.text }]}>{item.description}</Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Progress tracking */}
                    <View style={styles.progressBlock}>
                      <View style={styles.progressBarBg}>
                        <View
                          style={[
                            styles.progressBarActive,
                            {
                              width:
                                item.status === "Completed"
                                  ? "100%"
                                  : item.status === "Printing"
                                  ? "50%"
                                  : "5%",
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.progressLabels}>
                        {[
                          { key: "Pending", labelKey: "pending" },
                          { key: "Printing", labelKey: "printing" },
                          { key: "Completed", labelKey: "completed" },
                        ].map((step) => {
                          const isActive =
                            item.status === step.key ||
                            (step.key === "Pending" && item.status !== "Rejected") ||
                            (step.key === "Printing" && item.status === "Completed");

                          return (
                            <Text
                              key={step.key}
                              style={[styles.progressLabelText, isActive && styles.progressLabelTextActive]}
                            >
                              {t(step.labelKey)}
                            </Text>
                          );
                        })}
                      </View>
                    </View>

                    {/* Expand details button */}
                    <TouchableOpacity
                      onPress={() => setExpandedOrder(expandedOrder === item.id ? null : item.id)}
                      style={styles.expandButton}
                    >
                      <Feather
                        name={expandedOrder === item.id ? "chevron-up" : "chevron-down"}
                        size={14}
                        color="#ea580c"
                      />
                      <Text style={styles.expandButtonText}>{t("invoice_details")}</Text>
                    </TouchableOpacity>

                    {expandedOrder === item.id && (
                      <View style={[styles.expandedInfo, { backgroundColor: themeColors.background }]}>
                        <View style={styles.infoRow}>
                          <Text style={[styles.infoValue, { color: themeColors.text }]}>
                            {(item.total_price ?? getTotal(item)).toLocaleString()} {t("currency")}
                          </Text>
                          <Text style={styles.infoLabel}>{t("total_price") || "التكلفة الإجمالية"}</Text>
                        </View>
                        {item.payment_method ? (
                          <View style={styles.infoRow}>
                            <Text style={[styles.infoValue, { color: themeColors.text }]}>
                              {paymentLabels[item.payment_method] || item.payment_method}
                            </Text>
                            <Text style={styles.infoLabel}>{t("payment_method_label")}</Text>
                          </View>
                        ) : null}
                        {item.file_url ? (
                          <TouchableOpacity
                            onPress={() => Linking.openURL(item.file_url)}
                            style={styles.linkButton}
                          >
                            <Feather name="external-link" size={12} color="#ea580c" />
                            <Text style={styles.linkButtonText}>{t("download_view_file")}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}

                    {item.status === "Rejected" && (
                      <View style={styles.rejectedNotice}>
                        <Text style={styles.rejectedNoticeText}>
                          {t("order_rejected_note")}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : (
                  // Library purchases detail
                  <View style={styles.cardBody}>
                    <View style={styles.libraryMeta}>
                      <Text style={styles.libraryPrice}>{item.total.toLocaleString()} {t("currency")}</Text>
                      <View style={styles.libraryMetaRight}>
                        {item.store_name ? (
                          <View style={styles.storeRow}>
                            <Feather name="home" size={12} color="#34d399" />
                            <Text style={styles.storeName}>{item.store_name}</Text>
                          </View>
                        ) : null}
                        <Text style={[styles.libraryDate, { color: themeColors.textMuted }]}>{formatDate(item.created_at)}</Text>
                      </View>
                    </View>

                    {/* Items list */}
                    <View style={[styles.libraryItemsBlock, { backgroundColor: themeColors.background }]}>
                      {parseOrderItems(item.items).map((prod, idx) => (
                        <View key={idx} style={styles.libItemRow}>
                          <Text style={[styles.libItemSubtotal, { color: themeColors.textMuted }]}>{prod.subtotal} {t("currency")}</Text>
                          <Text style={[styles.libItemName, { color: themeColors.text }]}>
                            {prod.name} <Text style={styles.libItemQty}>×{prod.quantity}</Text>
                          </Text>
                        </View>
                      ))}
                      {item.shipping_cost != null && item.shipping_cost > 0 ? (
                        <View style={styles.libShippingRow}>
                          <Text style={[styles.libItemSubtotal, { color: themeColors.textMuted }]}>{item.shipping_cost} {t("currency")}</Text>
                          <Text style={styles.libShippingLabel}>{t("delivery_fee")}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Progress tracker */}
                    <View style={styles.libraryProgress}>
                      <View style={styles.libProgressNodes}>
                        {LIBRARY_STEPS.map((step, idx) => {
                          const currentStep = getLibraryStepIndex(item.status);
                          const isCompleted = idx <= currentStep;

                          return (
                            <View key={step.key} style={styles.libStepNode}>
                              <View
                                style={[
                                  styles.libStepCircle,
                                  {
                                    backgroundColor: isCompleted ? "#34d399" : (isDark ? "#27272a" : "#e5e7eb"),
                                    borderColor: isCompleted ? "#34d399" : (isDark ? "#3f3f46" : "#d1d5db"),
                                  },
                                ]}
                              >
                                <Feather
                                  name={step.icon}
                                  size={10}
                                  color={isCompleted ? "#ffffff" : themeColors.textMuted}
                                />
                              </View>
                              <Text
                                style={[
                                  styles.libStepLabelText,
                                  { color: themeColors.textMuted },
                                  isCompleted && styles.libStepLabelTextActive,
                                ]}
                              >
                                {t(step.key) || step.label}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
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
    backgroundColor: "#09090b", // zinc-950
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#09090b",
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
  toastText: {
    color: "#f4f4f5",
    fontSize: 13,
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    alignItems: "flex-end",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  subtitle: {
    fontSize: 12,
    color: "#a1a1aa",
    marginTop: 4,
  },
  tabsRow: {
    flexDirection: "row-reverse",
    paddingHorizontal: 20,
    gap: 8,
    height: 46,
    marginBottom: 16,
  },
  tabButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 38,
  },
  tabButtonActive: {
    backgroundColor: "#ea580c",
    borderColor: "#ea580c",
  },
  tabButtonActivePrint: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  tabButtonActiveLib: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
  },
  tabIcon: {
    marginLeft: 6,
  },
  tabText: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "bold",
  },
  tabTextActive: {
    color: "#ffffff",
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
    color: "#f4f4f5",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#71717a",
    textAlign: "center",
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  orderCard: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  orderId: {
    fontSize: 11,
    color: "#71717a",
    fontFamily: "monospace",
  },
  printTag: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(96, 165, 250, 0.1)",
    borderColor: "rgba(96, 165, 250, 0.2)",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  printTagText: {
    color: "#60a5fa",
    fontSize: 10,
    fontWeight: "bold",
  },
  libTag: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderColor: "rgba(52, 211, 153, 0.2)",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  libTagText: {
    color: "#34d399",
    fontSize: 10,
    fontWeight: "bold",
  },
  cardBody: {},
  printRow: {
    flexDirection: "row-reverse",
    gap: 12,
    marginBottom: 14,
  },
  printBadgeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(96, 165, 250, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  printDetails: {
    flex: 1,
    alignItems: "flex-end",
  },
  fileName: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 4,
  },
  fileParams: {
    fontSize: 11,
    color: "#71717a",
  },
  fileDesc: {
    fontSize: 11,
    color: "#a1a1aa",
    backgroundColor: "#09090b",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 6,
    textAlign: "right",
  },
  progressBlock: {
    marginTop: 10,
    marginBottom: 14,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: "#27272a",
    borderRadius: 2,
    width: "100%",
  },
  progressBarActive: {
    height: "100%",
    backgroundColor: "#3b82f6",
    borderRadius: 2,
  },
  progressLabels: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: 8,
  },
  progressLabelText: {
    fontSize: 10,
    color: "#71717a",
  },
  progressLabelTextActive: {
    color: "#3b82f6",
    fontWeight: "bold",
  },
  expandButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 4,
  },
  expandButtonText: {
    color: "#ea580c",
    fontSize: 11,
    fontWeight: "bold",
  },
  expandedInfo: {
    backgroundColor: "#09090b",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    gap: 8,
  },
  infoRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  infoLabel: {
    fontSize: 11,
    color: "#71717a",
  },
  infoValue: {
    fontSize: 11,
    color: "#f4f4f5",
    fontWeight: "bold",
  },
  linkButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(39, 39, 42, 0.5)",
    paddingTop: 8,
  },
  linkButtonText: {
    color: "#ea580c",
    fontSize: 11,
    fontWeight: "bold",
  },
  rejectedNotice: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  rejectedNoticeText: {
    color: "#ef4444",
    fontSize: 11,
    textAlign: "center",
  },
  libraryMeta: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  libraryMetaRight: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  libraryPrice: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#34d399",
  },
  storeRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  storeName: {
    fontSize: 11,
    color: "#34d399",
    fontWeight: "bold",
  },
  libraryDate: {
    fontSize: 11,
    color: "#71717a",
  },
  libraryItemsBlock: {
    backgroundColor: "#09090b",
    borderRadius: 12,
    padding: 12,
    gap: 6,
    marginBottom: 14,
  },
  libItemRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  libItemName: {
    fontSize: 12,
    color: "#f4f4f5",
  },
  libItemQty: {
    fontSize: 11,
    color: "#71717a",
  },
  libItemSubtotal: {
    fontSize: 12,
    color: "#a1a1aa",
  },
  libShippingRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(39, 39, 42, 0.5)",
    paddingTop: 6,
    marginTop: 6,
  },
  libShippingLabel: {
    fontSize: 11,
    color: "#71717a",
  },
  libraryProgress: {
    marginTop: 10,
  },
  libProgressNodes: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  libStepNode: {
    alignItems: "center",
    flex: 1,
  },
  libStepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  libStepLabelText: {
    fontSize: 8,
    color: "#71717a",
    textAlign: "center",
  },
  libStepLabelTextActive: {
    color: "#34d399",
    fontWeight: "bold",
  },
});
