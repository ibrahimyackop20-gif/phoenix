import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ScrollView,
  I18nManager,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../../../lib/supabaseClient";
import {
  createRealtimeChannel,
  teardownRealtimeChannel,
} from "../../../../lib/realtimeChannel";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme, type ThemeColors } from "../../../../components/ThemeProvider";
import StatusBadge from "../../../../components/StatusBadge";
import OrderCancelSection from "../../../../components/OrderCancelSection";
import { AnimatedCard } from "../../../components/anim/AnimatedCard";
import { ScreenTransition } from "../../../components/anim/ScreenTransition";
import { SkeletonCard } from "../../../components/anim/Skeleton";
import {
  displayOrderId,
  formatOrderDate,
  getLibraryStatusLabel,
  getPrintStatusLabel,
  getPrintTotal,
  type LibraryOrder,
  type PrintOrder,
  type UnifiedOrder,
} from "../../../../lib/ordersShared";

type FilterType = "all" | "print" | "library";

const PRINT_STATUS_KEYS: Record<string, string> = {
  Pending: "pending",
  Accepted: "badge_accepted",
  Printing: "printing",
  Completed: "completed",
  Rejected: "status_rejected",
  Cancelled: "timeline_cancelled",
  "Out for Delivery": "badge_out_delivery",
};

export default function OrdersScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { themeColors } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const isCompact = width < 390 || fontScale >= 1.3;
  const isTablet = width >= 700;
  const styles = getStyles(themeColors, isCompact, isTablet);
  const { highlight, orderId } = useLocalSearchParams<{
    highlight?: string;
    orderId?: string;
  }>();
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    console.log("[OrdersScreen][NAV] final screen rendered", {
      currentRoute: "/dashboard/orders",
      selectedTab: "orders",
      highlight: highlight ?? null,
      orderId: orderId ?? null,
    });
  }, [highlight, orderId]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [bwPrice, setBwPrice] = useState(0);
  const [colorPrice, setColorPrice] = useState(0);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const deepLinkHandled = useRef(false);
  const rtl = i18n.language === "ar" || I18nManager.isRTL;

  const triggerToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const getPrintStatusLabelLocal = useCallback(
    (status: string) => {
      const key = PRINT_STATUS_KEYS[status];
      return key ? t(key) : status;
    },
    [t]
  );

  const fetchOrders = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: printData, error: printErr } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (printErr) {
        console.error("Fetch Print Orders Error:", printErr.message);
      }

      const printOrders: PrintOrder[] = (printData || []).map((o: Omit<PrintOrder, "type">) => ({
        ...o,
        type: "print" as const,
      }));

      const { data: libData, error: libErr } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false });

      if (libErr) {
        console.error("Fetch Library Orders Error:", libErr.message);
      }

      const libOrders: LibraryOrder[] = (libData || []).map((o: Omit<LibraryOrder, "type">) => ({
        ...o,
        type: "library" as const,
      }));

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
    triggerToast(t("orders_toast_refreshed"));
  };

  const openOrderDetail = useCallback(
    (order: UnifiedOrder) => {
      router.push(`/dashboard/orders/${order.id}` as any);
    },
    [router]
  );

  useEffect(() => {
    if (orders.length === 0 || deepLinkHandled.current) return;

    const deepId = orderId
      ? String(Array.isArray(orderId) ? orderId[0] : orderId)
      : highlight
      ? String(Array.isArray(highlight) ? highlight[0] : highlight).toUpperCase()
      : null;

    if (!deepId) return;

    const match = orders.find(
      (o) =>
        o.id === deepId || o.id.slice(0, 8).toUpperCase() === deepId.toUpperCase()
    );
    if (match) {
      deepLinkHandled.current = true;
      if (match.type === "library") setFilter("library");
      else if (match.type === "print") setFilter("print");
      openOrderDetail(match);
    }
  }, [highlight, orderId, orders, openOrderDetail]);

  useEffect(() => {
    fetchOrders();

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

    const printChannel = createRealtimeChannel("student-orders-realtime-rn")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const updated = payload.new as Record<string, unknown>;
            setOrders((prev) =>
              prev.map((order) =>
                order.id === updated.id
                  ? ({ ...order, ...updated, type: "print" as const } as PrintOrder)
                  : order
              )
            );
            const newStatus = String(updated.status || "");
            if (newStatus !== "Cancelled") {
              triggerToast(
                t("orders_toast_print_status", {
                  status: getPrintStatusLabelLocal(newStatus),
                })
              );
            }
          } else if (payload.eventType === "INSERT") {
            fetchOrders();
          }
        }
      )
      .subscribe();

    const libChannel = createRealtimeChannel("my-purchases-rt-rn")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sales_orders" },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          setOrders((prev) =>
            prev.map((o) =>
              o.id === updated.id
                ? ({ ...o, ...updated, type: "library" as const } as LibraryOrder)
                : o
            )
          );
          triggerToast(t("orders_toast_library_updated"));
        }
      )
      .subscribe();

    return () => {
      teardownRealtimeChannel(printChannel);
      teardownRealtimeChannel(libChannel);
    };
  }, [t, getPrintStatusLabelLocal]);

  const filteredOrders = useMemo(() => {
    return filter === "all" ? orders : orders.filter((o) => o.type === filter);
  }, [orders, filter]);

  const printCount = useMemo(() => orders.filter((o) => o.type === "print").length, [orders]);
  const libCount = useMemo(() => orders.filter((o) => o.type === "library").length, [orders]);

  const keyExtractor = useCallback((item: UnifiedOrder) => item.id, []);

  const getOrderPrice = (item: UnifiedOrder) => {
    if (item.type === "library") {
      return `${item.total.toLocaleString()} ${t("currency")}`;
    }
    return `${getPrintTotal(item, bwPrice, colorPrice).toLocaleString()} ${t("currency")}`;
  };

  const getOrderStatus = (item: UnifiedOrder) => {
    if (item.type === "print") return getPrintStatusLabel(item.status, t);
    return getLibraryStatusLabel(item.status, t);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.skeletonList}>
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenTransition style={styles.container}>
      {successMsg && (
        <View style={styles.toastSuccess}>
          <Text style={styles.toastText}>{successMsg}</Text>
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity onPress={handleRefresh} disabled={refreshing} style={styles.refreshButton}>
          <Feather name="refresh-cw" size={16} color={themeColors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: themeColors.text }]}>{t("my_orders")}</Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>{t("my_orders_desc")}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        <TouchableOpacity
          onPress={() => setFilter("all")}
          style={[styles.tabButton, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }, filter === "all" && styles.tabButtonActive]}
        >
          <Feather name="filter" size={12} color={filter === "all" ? themeColors.onAccent : themeColors.textMuted} style={styles.tabIcon} />
          <Text style={[styles.tabText, { color: themeColors.textMuted }, filter === "all" && styles.tabTextActive]}>
            {t("all")} ({orders.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilter("print")}
          style={[styles.tabButton, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }, filter === "print" && styles.tabButtonActivePrint]}
        >
          <Feather name="printer" size={12} color={filter === "print" ? themeColors.onAccent : themeColors.textMuted} style={styles.tabIcon} />
          <Text style={[styles.tabText, { color: themeColors.textMuted }, filter === "print" && styles.tabTextActive]}>
            {t("printing_services")} ({printCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilter("library")}
          style={[styles.tabButton, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }, filter === "library" && styles.tabButtonActiveLib]}
        >
          <Feather name="shopping-bag" size={12} color={filter === "library" ? themeColors.onAccent : themeColors.textMuted} style={styles.tabIcon} />
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
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={11}
          updateCellsBatchingPeriod={50}
          renderItem={({ item, index }) => {
            const isPrint = item.type === "print";
            const updatedAt = item.updated_at || item.created_at;

            return (
              <AnimatedCard index={index}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => openOrderDetail(item)}
                style={[styles.orderCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardTopLeft}>
                    {isPrint ? (
                      <View style={styles.printTag}>
                        <Feather name="printer" size={10} color={themeColors.statBlue} />
                        <Text style={styles.printTagText}>{t("print_order")}</Text>
                      </View>
                    ) : (
                      <View style={styles.libTag}>
                        <Feather name="shopping-bag" size={10} color={themeColors.statGreen} />
                        <Text style={styles.libTagText}>{t("library_purchase")}</Text>
                      </View>
                    )}
                    {isPrint ? (
                      <StatusBadge status={item.status} />
                    ) : (
                      <View style={styles.libStatusPill}>
                        <Text style={styles.libStatusText}>{getOrderStatus(item)}</Text>
                      </View>
                    )}
                  </View>
                  <Feather
                    name={rtl ? "chevron-left" : "chevron-right"}
                    size={20}
                    color={themeColors.textMuted}
                    style={styles.chevron}
                  />
                </View>

                <Text style={[styles.orderNumber, { color: themeColors.text }]}>
                  {displayOrderId(item.id)}
                </Text>

                <View style={styles.metaGrid}>
                  <View style={styles.metaItem}>
                    <Text style={[styles.metaLabel, { color: themeColors.textMuted }]}>
                      {t("order_detail_price")}
                    </Text>
                    <Text style={[styles.metaValue, { color: themeColors.primary }]}>{getOrderPrice(item)}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={[styles.metaLabel, { color: themeColors.textMuted }]}>
                      {t("order_list_status")}
                    </Text>
                    <Text style={[styles.metaValue, { color: themeColors.text }]}>
                      {getOrderStatus(item)}
                    </Text>
                  </View>
                </View>

                <View style={styles.datesRow}>
                  <View style={styles.dateCol}>
                    <Text style={[styles.dateLabel, { color: themeColors.textMuted }]}>
                      {t("order_detail_created")}
                    </Text>
                    <Text style={[styles.dateValue, { color: themeColors.text }]}>
                      {formatOrderDate(item.created_at, i18n.language)}
                    </Text>
                  </View>
                  <View style={styles.dateCol}>
                    <Text style={[styles.dateLabel, { color: themeColors.textMuted }]}>
                      {t("orders_list_updated")}
                    </Text>
                    <Text style={[styles.dateValue, { color: themeColors.text }]}>
                      {formatOrderDate(updatedAt, i18n.language)}
                    </Text>
                  </View>
                </View>

                {isPrint && item.status === "Rejected" && (
                  <View style={styles.rejectedNotice}>
                    <Text style={styles.rejectedNoticeText}>{t("order_rejected_note")}</Text>
                  </View>
                )}

                {isPrint && (
                  <OrderCancelSection
                    orderId={item.id}
                    createdAt={item.created_at}
                    status={item.status}
                    onCancelled={() => {
                      setOrders((prev) =>
                        prev.map((o) =>
                          o.id === item.id && o.type === "print"
                            ? ({
                                ...o,
                                status: "Cancelled",
                                cancelled_by: "customer",
                              } as PrintOrder)
                            : o
                        )
                      );
                      triggerToast(t("order_cancel_success"));
                    }}
                    onError={(message) => triggerToast(message)}
                  />
                )}
              </TouchableOpacity>
              </AnimatedCard>
            );
          }}
        />
      )}
      </ScreenTransition>
    </SafeAreaView>
  );
}

const getStyles = (
  themeColors: ThemeColors,
  isCompact: boolean,
  isTablet: boolean
) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: themeColors.background },
    loadingContainer: {
      flex: 1,
      backgroundColor: themeColors.background,
      alignItems: "center",
      justifyContent: "center",
    },
    toastSuccess: {
      backgroundColor: themeColors.statGreenBg,
      borderColor: themeColors.statGreenBorder,
      borderWidth: 1,
      borderRadius: 12,
      padding: 14,
      marginHorizontal: 20,
      marginTop: 10,
    },
    toastText: { color: themeColors.text, fontSize: 13, textAlign: "center" },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 12,
      width: "100%",
      maxWidth: isTablet ? 900 : undefined,
      alignSelf: "center",
    },
    refreshButton: {
      width: 40,
      minHeight: 40,
      borderRadius: 12,
      backgroundColor: themeColors.cardBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    headerText: { alignItems: "flex-end", flex: 1, marginLeft: 12 },
    title: { fontSize: 24, fontWeight: "bold" },
    subtitle: { fontSize: 12, marginTop: 4 },
    tabsRow: {
      flexDirection: "row-reverse",
      paddingHorizontal: 20,
      gap: 8,
      minHeight: 46,
      marginBottom: 16,
      maxWidth: isTablet ? 900 : undefined,
      alignSelf: "center",
    },
    tabButton: {
      flexDirection: "row-reverse",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 16,
      minHeight: 38,
      paddingVertical: 9,
    },
    tabButtonActive: { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
    tabButtonActivePrint: { backgroundColor: themeColors.blueStrong, borderColor: themeColors.blueStrong },
    tabButtonActiveLib: { backgroundColor: themeColors.success, borderColor: themeColors.success },
    tabIcon: { marginLeft: 6 },
    tabText: { fontSize: 12, fontWeight: "bold", flexShrink: 1, textAlign: "center" },
    tabTextActive: { color: themeColors.onAccent },
    emptyCard: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
    emptyTitle: { fontSize: 16, fontWeight: "bold", marginTop: 16, marginBottom: 8 },
    emptySubtitle: { fontSize: 13, textAlign: "center", lineHeight: 18 },
    skeletonList: {
      paddingHorizontal: 20,
      paddingTop: 16,
      gap: 12,
      width: "100%",
      maxWidth: isTablet ? 900 : undefined,
      alignSelf: "center",
    },
    listContent: {
      paddingHorizontal: 20,
      paddingBottom: 40,
      width: "100%",
      maxWidth: isTablet ? 900 : undefined,
      alignSelf: "center",
    },
    orderCard: {
      borderWidth: 1,
      borderRadius: 20,
      padding: 16,
      marginBottom: 14,
    },
    cardTop: {
      flexDirection: "row-reverse",
      flexWrap: "wrap",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    cardTopLeft: {
      flexDirection: "row-reverse",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
      flex: 1,
    },
    chevron: { marginRight: 4 },
    printTag: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 4,
      backgroundColor: themeColors.statBlueBg,
      borderColor: themeColors.statBlueBorder,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    printTagText: { color: themeColors.statBlue, fontSize: 10, fontWeight: "bold" },
    libTag: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 4,
      backgroundColor: themeColors.statGreenBg,
      borderColor: themeColors.statGreenBorder,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    libTagText: { color: themeColors.statGreen, fontSize: 10, fontWeight: "bold" },
    libStatusPill: {
      backgroundColor: themeColors.statGreenBg,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    libStatusText: { color: themeColors.statGreen, fontSize: 10, fontWeight: "600" },
    orderNumber: {
      fontSize: 17,
      fontWeight: "700",
      fontFamily: "monospace",
      textAlign: "right",
      marginBottom: 12,
    },
    metaGrid: {
      flexDirection: isCompact ? "column" : "row-reverse",
      gap: 12,
      marginBottom: 12,
    },
    metaItem: { flex: isCompact ? 0 : 1, alignItems: "flex-end" },
    metaLabel: { fontSize: 10, marginBottom: 2 },
    metaValue: { fontSize: 13, fontWeight: "700" },
    datesRow: {
      flexDirection: isCompact ? "column" : "row-reverse",
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: themeColors.cardBorder,
      paddingTop: 10,
    },
    dateCol: { flex: isCompact ? 0 : 1, alignItems: "flex-end" },
    dateLabel: { fontSize: 10, marginBottom: 2 },
    dateValue: { fontSize: 11, fontWeight: "500" },
    rejectedNotice: {
      backgroundColor: themeColors.dangerSoftBg,
      borderColor: themeColors.dangerSoftBorder,
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
      marginTop: 10,
    },
    rejectedNoticeText: { color: themeColors.danger, fontSize: 11, textAlign: "center" },
  });
