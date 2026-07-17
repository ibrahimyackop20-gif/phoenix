import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Animated,
  I18nManager,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather, FontAwesome } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { supabase } from "../../../../lib/supabaseClient";
import {
  createRealtimeChannel,
  teardownRealtimeChannel,
} from "../../../../lib/realtimeChannel";
import { useAppTheme } from "../../../../components/ThemeProvider";
import StatusBadge from "../../../../components/StatusBadge";
import {
  buildPrintStatusHistory,
  formatOrderDate,
  displayOrderId,
  getColorModeLabel,
  getDeliveryMethodLabel,
  getLibraryStatusLabel,
  getLibraryStepIndex,
  getPaperSizeLabel,
  getPaymentLabel,
  getPrintSideLabel,
  getPrintStatusLabel,
  getPrintTimelineIndex,
  getPrintTotal,
  isCancelledStatus,
  isTelegramOrder,
  LIBRARY_STEPS,
  parseOrderItems,
  PRINT_TIMELINE,
  type LibraryOrder,
  type PrintOrder,
} from "../../../../lib/ordersShared";

const PHOENIX_ORANGE = "#ea580c";

function SkeletonBlock({
  width,
  height,
  style,
  isDark,
}: {
  width: number | `${number}%`;
  height: number;
  style?: object;
  isDark: boolean;
}) {
  const anim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.75, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: 10,
          backgroundColor: isDark ? "#3f3f46" : "#e5e7eb",
          opacity: anim,
        },
        style,
      ]}
    />
  );
}

function DetailSkeleton({ isDark }: { isDark: boolean }) {
  return (
    <View style={{ padding: 20, gap: 16 }}>
      <SkeletonBlock width="60%" height={28} isDark={isDark} />
      <SkeletonBlock width="40%" height={20} isDark={isDark} />
      <SkeletonBlock width="100%" height={120} isDark={isDark} />
      <SkeletonBlock width="100%" height={200} isDark={isDark} />
      <SkeletonBlock width="100%" height={160} isDark={isDark} />
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const isCompact = width < 390 || fontScale >= 1.3;
  const isTablet = width >= 700;
  const styles = useMemo(
    () => getStyles(themeColors, isDark, isCompact, isTablet),
    [themeColors, isDark, isCompact, isTablet]
  );
  const rtl = i18n.language === "ar" || I18nManager.isRTL;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [orderType, setOrderType] = useState<"print" | "library" | null>(null);
  const [printOrder, setPrintOrder] = useState<PrintOrder | null>(null);
  const [libraryOrder, setLibraryOrder] = useState<LibraryOrder | null>(null);
  const [history, setHistory] = useState<
    { id: string; time: string; labelKey: string; status?: string }[]
  >([]);
  const [bwPrice, setBwPrice] = useState(0);
  const [colorPrice, setColorPrice] = useState(0);
  const [statusPulse] = useState(() => new Animated.Value(1));
  const prevStatus = useRef<string | null>(null);

  const orderId = Array.isArray(id) ? id[0] : id;

  const loadPrices = useCallback(async () => {
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
  }, []);

  const loadHistory = useCallback(async (oid: string, order: PrintOrder) => {
    const { data } = await supabase
      .from("notifications")
      .select("id, created_at, message")
      .eq("order_id", oid)
      .eq("type", "order_status")
      .order("created_at", { ascending: true });
    setHistory(buildPrintStatusHistory(order, data || []));
  }, []);

  const fetchOrder = useCallback(async () => {
    if (!orderId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setNotFound(true);
        return;
      }

      const isUuid = orderId.includes("-");
      let printQuery = supabase
        .from("orders")
        .select(
          "*, profiles(full_name), delivery_addresses(title, area, formatted_address)"
        )
        .eq("user_id", user.id);

      if (isUuid) {
        printQuery = printQuery.eq("id", orderId);
      } else {
        printQuery = printQuery.ilike("id", `${orderId.toLowerCase()}%`);
      }

      const { data: printData, error: printErr } = await printQuery.maybeSingle();

      if (printData && !printErr) {
        const po: PrintOrder = { ...printData, type: "print" };
        setPrintOrder(po);
        setOrderType("print");
        await loadHistory(po.id, po);
        setNotFound(false);
        return;
      }

      let libQuery = supabase.from("sales_orders").select("*").eq("buyer_id", user.id);
      if (isUuid) {
        libQuery = libQuery.eq("id", orderId);
      } else {
        libQuery = libQuery.ilike("id", `${orderId.toLowerCase()}%`);
      }

      const { data: libData, error: libErr } = await libQuery.maybeSingle();
      if (libData && !libErr) {
        setLibraryOrder({ ...libData, type: "library" });
        setOrderType("library");
        setNotFound(false);
        return;
      }

      setNotFound(true);
    } catch (err) {
      console.error("[order-detail] fetch error:", err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [orderId, loadHistory]);

  useEffect(() => {
    loadPrices();
    fetchOrder();
  }, [fetchOrder, loadPrices]);

  useEffect(() => {
    if (!printOrder?.id) return;
    const oid = printOrder.id;

    const notifChannel = createRealtimeChannel(`order-detail-notif-${oid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `order_id=eq.${oid}`,
        },
        () => {
          setPrintOrder((prev) => {
            if (prev) void loadHistory(oid, prev);
            return prev;
          });
        }
      )
      .subscribe();

    return () => teardownRealtimeChannel(notifChannel);
  }, [printOrder?.id, loadHistory]);

  useEffect(() => {
    if (!printOrder?.id) return;
    const oid = printOrder.id;

    const channel = createRealtimeChannel(`order-detail-${oid}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${oid}`,
        },
        (payload) => {
          const updated = payload.new as PrintOrder;
          setPrintOrder((prev) => {
            if (!prev) return prev;
            const merged = { ...prev, ...updated, type: "print" as const };
            void loadHistory(oid, merged);
            return merged;
          });
        }
      )
      .subscribe();

    return () => teardownRealtimeChannel(channel);
  }, [printOrder?.id, loadHistory]);

  useEffect(() => {
    if (!libraryOrder?.id) return;

    const channel = createRealtimeChannel(`order-detail-lib-${libraryOrder.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sales_orders",
          filter: `id=eq.${libraryOrder.id}`,
        },
        (payload) => {
          const updated = payload.new as LibraryOrder;
          setLibraryOrder((prev) =>
            prev ? { ...prev, ...updated, type: "library" } : prev
          );
        }
      )
      .subscribe();

    return () => teardownRealtimeChannel(channel);
  }, [libraryOrder?.id]);

  const currentStatus = printOrder?.status || libraryOrder?.status || "";
  useEffect(() => {
    if (!currentStatus || prevStatus.current === currentStatus) {
      prevStatus.current = currentStatus;
      return;
    }
    prevStatus.current = currentStatus;
    Animated.sequence([
      Animated.timing(statusPulse, { toValue: 1.08, duration: 180, useNativeDriver: true }),
      Animated.spring(statusPulse, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [currentStatus, statusPulse]);

  const timelineIndex = printOrder ? getPrintTimelineIndex(printOrder.status) : -1;
  const cancelled = printOrder ? isCancelledStatus(printOrder.status) : false;

  const openFile = (url: string) => {
    if (url) Linking.openURL(url);
  };

  const renderInfoRow = (label: string, value: string) => (
    <View style={styles.infoRow} key={label}>
      <Text style={[styles.infoValue, { color: themeColors.text }]}>{value}</Text>
      <Text style={[styles.infoLabel, { color: themeColors.textMuted }]}>{label}</Text>
    </View>
  );

  const renderPrintTimeline = () => {
    if (!printOrder) return null;

    if (cancelled) {
      return (
        <View style={[styles.cancelledCard, { borderColor: "rgba(239,68,68,0.3)" }]}>
          <Feather name="x-circle" size={22} color="#ef4444" />
          <View style={styles.cancelledTextWrap}>
            <Text style={styles.cancelledTitle}>{t("timeline_cancelled")}</Text>
            <Text style={[styles.cancelledDesc, { color: themeColors.textMuted }]}>
              {t("timeline_cancelled_desc")}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.timeline}>
        {PRINT_TIMELINE.map((step, idx) => {
          const isCompleted = timelineIndex > idx;
          const isCurrent = timelineIndex === idx;
          const isFuture = timelineIndex < idx;
          const dotColor = isCurrent ? PHOENIX_ORANGE : isCompleted ? "#34d399" : isDark ? "#3f3f46" : "#d1d5db";
          const lineColor = isCompleted ? "#34d399" : isDark ? "#27272a" : "#e5e7eb";
          const timestamp =
            idx === 0
              ? formatOrderDate(printOrder.created_at, i18n.language)
              : isCurrent || isCompleted
              ? formatOrderDate(printOrder.updated_at || printOrder.created_at, i18n.language)
              : "";

          return (
            <View key={step.key} style={styles.timelineStep}>
              {idx < PRINT_TIMELINE.length - 1 && (
                <View
                  style={[
                    styles.timelineLine,
                    { backgroundColor: lineColor, [rtl ? "right" : "left"]: 19 },
                  ]}
                />
              )}
              <Animated.View
                style={[
                  styles.timelineDot,
                  {
                    backgroundColor: isFuture ? "transparent" : dotColor,
                    borderColor: dotColor,
                    transform: isCurrent ? [{ scale: statusPulse }] : undefined,
                  },
                ]}
              >
                {!isFuture && (
                  <Feather
                    name={step.icon}
                    size={12}
                    color={isCurrent || isCompleted ? "#fff" : themeColors.textMuted}
                  />
                )}
              </Animated.View>
              <View style={[styles.timelineContent, rtl ? styles.timelineContentRtl : null]}>
                <Text
                  style={[
                    styles.timelineTitle,
                    { color: isCurrent ? PHOENIX_ORANGE : isCompleted ? themeColors.text : themeColors.textMuted },
                    isCurrent && styles.timelineTitleActive,
                  ]}
                >
                  {t(`timeline_${step.key}`)}
                </Text>
                <Text style={[styles.timelineDesc, { color: themeColors.textMuted }]}>
                  {t(`timeline_${step.key}_desc`)}
                </Text>
                {(isCompleted || isCurrent) && timestamp ? (
                  <Text style={styles.timelineTime}>{timestamp}</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderLibraryTimeline = () => {
    if (!libraryOrder) return null;
    const currentStep = getLibraryStepIndex(libraryOrder.status);

    return (
      <View style={styles.libTimelineRow}>
        {LIBRARY_STEPS.map((step, idx) => {
          const done = idx <= currentStep;
          return (
            <View key={step.key} style={styles.libStep}>
              <View
                style={[
                  styles.libStepCircle,
                  {
                    backgroundColor: done ? step.color : isDark ? "#27272a" : "#e5e7eb",
                    borderColor: done ? step.color : isDark ? "#3f3f46" : "#d1d5db",
                  },
                ]}
              >
                <Feather name={step.icon} size={12} color={done ? "#fff" : themeColors.textMuted} />
              </View>
              <Text
                style={[
                  styles.libStepLabel,
                  { color: done ? step.color : themeColors.textMuted },
                ]}
              >
                {t(step.labelKey)}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
        <DetailSkeleton isDark={isDark} />
      </SafeAreaView>
    );
  }

  if (notFound || !orderType) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
        <View style={styles.notFound}>
          <Feather name="alert-circle" size={48} color={themeColors.textMuted} />
          <Text style={[styles.notFoundText, { color: themeColors.text }]}>
            {t("order_detail_not_found")}
          </Text>
          <TouchableOpacity style={styles.backBtnPrimary} onPress={() => router.back()}>
            <Text style={styles.backBtnPrimaryText}>{t("order_detail_back")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const headerId = printOrder?.id || libraryOrder?.id || "";
  const headerStatus = printOrder?.status || libraryOrder?.status || "";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.background }]}>
      <View style={[styles.appBar, { borderBottomColor: themeColors.cardBorder }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Feather name={rtl ? "arrow-right" : "arrow-left"} size={22} color={themeColors.text} />
        </TouchableOpacity>
        <View style={styles.appBarCenter}>
          <Text style={[styles.appBarTitle, { color: themeColors.text }]}>
            {displayOrderId(headerId)}
          </Text>
          {orderType === "print" ? (
            <StatusBadge status={headerStatus} />
          ) : (
            <View style={styles.libBadge}>
              <Text style={styles.libBadgeText}>
                {getLibraryStatusLabel(headerStatus, t)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
          {t("order_detail_timeline")}
        </Text>
        <View style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          {orderType === "print" ? renderPrintTimeline() : renderLibraryTimeline()}
        </View>

        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
          {t("order_detail_info")}
        </Text>
        <View style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          {orderType === "print" && printOrder ? (
            <>
              {renderInfoRow(t("order_detail_order_number"), displayOrderId(printOrder.id))}
              {printOrder.profiles?.full_name
                ? renderInfoRow(t("order_detail_customer"), printOrder.profiles.full_name)
                : null}
              {renderInfoRow(
                t("order_detail_created"),
                formatOrderDate(printOrder.created_at, i18n.language)
              )}
              {renderInfoRow(
                t("order_detail_updated"),
                formatOrderDate(printOrder.updated_at || printOrder.created_at, i18n.language)
              )}
              {renderInfoRow(t("order_detail_paper_size"), getPaperSizeLabel(printOrder, t))}
              {renderInfoRow(
                t("order_detail_paper_type"),
                printOrder.a4_paper_type || printOrder.paper_type || "—"
              )}
              {renderInfoRow(t("order_detail_color_mode"), getColorModeLabel(printOrder, t))}
              {printOrder.order_type !== "roll_print"
                ? renderInfoRow(t("order_detail_print_side"), getPrintSideLabel(printOrder, t))
                : null}
              {renderInfoRow(
                t("order_detail_copies"),
                String(printOrder.num_copies ?? printOrder.copies ?? 1)
              )}
              {printOrder.total_pages != null
                ? renderInfoRow(t("order_detail_pages"), String(printOrder.total_pages))
                : null}
              {renderInfoRow(
                t("order_detail_price"),
                `${getPrintTotal(printOrder, bwPrice, colorPrice).toLocaleString()} ${t("currency")}`
              )}
              {printOrder.payment_method
                ? renderInfoRow(
                    t("order_detail_payment"),
                    getPaymentLabel(printOrder.payment_method, t)
                  )
                : null}
              {renderInfoRow(t("order_detail_delivery"), getDeliveryMethodLabel(printOrder, t))}
              {printOrder.description?.trim()
                ? renderInfoRow(t("order_detail_notes"), printOrder.description.trim())
                : null}
            </>
          ) : libraryOrder ? (
            <>
              {renderInfoRow(t("order_detail_order_number"), displayOrderId(libraryOrder.id))}
              {renderInfoRow(
                t("order_detail_created"),
                formatOrderDate(libraryOrder.created_at, i18n.language)
              )}
              {renderInfoRow(
                t("order_detail_updated"),
                formatOrderDate(libraryOrder.updated_at || libraryOrder.created_at, i18n.language)
              )}
              {libraryOrder.store_name
                ? renderInfoRow(t("order_detail_store"), libraryOrder.store_name)
                : null}
              {renderInfoRow(
                t("order_detail_price"),
                `${libraryOrder.total.toLocaleString()} ${t("currency")}`
              )}
              {libraryOrder.payment_method
                ? renderInfoRow(
                    t("order_detail_payment"),
                    getPaymentLabel(libraryOrder.payment_method, t)
                  )
                : null}
              {libraryOrder.delivery_zone
                ? renderInfoRow(t("order_detail_delivery"), libraryOrder.delivery_zone)
                : null}
            </>
          ) : null}
        </View>

        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
          {t("order_detail_files")}
        </Text>
        <View style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          {orderType === "print" && printOrder ? (
            isTelegramOrder(printOrder) ? (
              <View style={styles.fileRow}>
                <View style={styles.telegramIcon}>
                  <FontAwesome name="telegram" size={22} color="#29b6f6" />
                </View>
                <View style={styles.fileMeta}>
                  <Text style={[styles.fileTitle, { color: themeColors.text }]}>
                    {t("order_detail_telegram_upload")}
                  </Text>
                  <Text style={[styles.fileSub, { color: themeColors.textMuted }]}>
                    {t("order_detail_bot_code")}: {printOrder.external_file_link || "—"}
                  </Text>
                  {printOrder.total_pages != null ? (
                    <Text style={[styles.fileSub, { color: themeColors.textMuted }]}>
                      {t("order_detail_pages")}: {printOrder.total_pages}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              (printOrder.file_url || printOrder.file_name || "")
                .split(",")
                .filter(Boolean)
                .map((url, idx) => {
                  const names = (printOrder.file_name || "").split(",");
                  const name = names[idx]?.trim() || t("print_file");
                  return (
                    <TouchableOpacity
                      key={`${url}-${idx}`}
                      style={styles.fileRow}
                      onPress={() => openFile(url.trim())}
                    >
                      <View style={styles.fileIcon}>
                        <Feather name="file-text" size={20} color="#60a5fa" />
                      </View>
                      <View style={styles.fileMeta}>
                        <Text style={[styles.fileTitle, { color: themeColors.text }]}>
                          {name}
                        </Text>
                        {printOrder.total_pages != null ? (
                          <Text style={[styles.fileSub, { color: themeColors.textMuted }]}>
                            {t("order_detail_pages")}: {printOrder.total_pages}
                          </Text>
                        ) : null}
                      </View>
                      <Feather name="eye" size={18} color={PHOENIX_ORANGE} />
                    </TouchableOpacity>
                  );
                })
            )
          ) : libraryOrder ? (
            parseOrderItems(libraryOrder.items).map((item, idx) => (
              <View key={idx} style={styles.fileRow}>
                <View style={styles.fileIcon}>
                  <Feather name="shopping-bag" size={18} color="#34d399" />
                </View>
                <View style={styles.fileMeta}>
                  <Text style={[styles.fileTitle, { color: themeColors.text }]}>{item.name}</Text>
                  <Text style={[styles.fileSub, { color: themeColors.textMuted }]}>
                    ×{item.quantity} — {item.subtotal} {t("currency")}
                  </Text>
                </View>
              </View>
            ))
          ) : null}
        </View>

        {orderType === "print" && history.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
              {t("order_detail_history")}
            </Text>
            <View
              style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}
            >
              {history.map((entry, idx) => (
                <View
                  key={entry.id}
                  style={[
                    styles.historyRow,
                    idx < history.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: themeColors.cardBorder,
                    },
                  ]}
                >
                  <Text style={styles.historyTime}>
                    {formatOrderDate(entry.time, i18n.language, "time")}
                  </Text>
                  <View style={styles.historyBody}>
                    <Text style={[styles.historyLabel, { color: themeColors.text }]}>
                      {entry.labelKey === "order_detail_history_status"
                        ? getPrintStatusLabel(entry.status || "", t)
                        : entry.labelKey === "order_detail_history_updated"
                        ? entry.status || t(entry.labelKey)
                        : t(entry.labelKey)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <TouchableOpacity
          style={styles.supportBtn}
          onPress={() => router.push("/dashboard/contact" as any)}
        >
          <Feather name="headphones" size={18} color="#fff" />
          <Text style={styles.supportBtnText}>{t("order_detail_contact_support")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (
  themeColors: { background: string; cardBg: string; cardBorder: string; text: string; textMuted: string },
  isDark: boolean,
  isCompact: boolean,
  isTablet: boolean
) =>
  StyleSheet.create({
    safe: { flex: 1 },
    appBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      width: "100%",
      maxWidth: isTablet ? 900 : undefined,
      alignSelf: "center",
    },
    backBtn: { width: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
    appBarCenter: { alignItems: "center", gap: 8, flex: 1, paddingHorizontal: 8 },
    appBarTitle: { fontSize: 16, fontWeight: "700", fontFamily: "monospace", textAlign: "center" },
    scroll: {
      padding: 20,
      paddingBottom: 48,
      width: "100%",
      maxWidth: isTablet ? 900 : undefined,
      alignSelf: "center",
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: "700",
      marginBottom: 10,
      marginTop: 8,
      textAlign: "right",
    },
    card: {
      borderRadius: 20,
      borderWidth: 1,
      padding: 16,
      marginBottom: 8,
    },
    timeline: { gap: 0 },
    timelineStep: {
      flexDirection: "row-reverse",
      alignItems: "flex-start",
      minHeight: 72,
      position: "relative",
    },
    timelineLine: {
      position: "absolute",
      top: 28,
      width: 2,
      height: 52,
    },
    timelineDot: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 12,
    },
    timelineContent: { flex: 1, alignItems: "flex-end", paddingBottom: 16 },
    timelineContentRtl: { alignItems: "flex-end" },
    timelineTitle: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
    timelineTitleActive: { fontWeight: "800" },
    timelineDesc: { fontSize: 11, lineHeight: 16, textAlign: "right" },
    timelineTime: { fontSize: 10, color: PHOENIX_ORANGE, marginTop: 4, fontWeight: "600" },
    cancelledCard: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: "rgba(239,68,68,0.08)",
    },
    cancelledTextWrap: { flex: 1, alignItems: "flex-end" },
    cancelledTitle: { color: "#ef4444", fontWeight: "700", fontSize: 14 },
    cancelledDesc: { fontSize: 11, marginTop: 4, textAlign: "right" },
    infoRow: {
      flexDirection: isCompact ? "column" : "row-reverse",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingVertical: 8,
      gap: 12,
    },
    infoLabel: { fontSize: 12, flex: isCompact ? 0 : 1, textAlign: "right", width: isCompact ? "100%" : undefined },
    infoValue: {
      fontSize: 12,
      fontWeight: "600",
      flex: isCompact ? 0 : 1.2,
      textAlign: isCompact ? "right" : "left",
      width: isCompact ? "100%" : undefined,
      flexShrink: 1,
    },
    fileRow: {
      flexDirection: isCompact ? "column" : "row-reverse",
      alignItems: isCompact ? "flex-end" : "center",
      gap: 12,
      paddingVertical: 10,
    },
    fileIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: "rgba(96,165,250,0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    telegramIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: "rgba(41,182,246,0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    fileMeta: { flex: isCompact ? 0 : 1, alignItems: "flex-end", width: isCompact ? "100%" : undefined },
    fileTitle: { fontSize: 13, fontWeight: "600", textAlign: "right", flexShrink: 1 },
    fileSub: { fontSize: 11, marginTop: 2, textAlign: "right", flexShrink: 1 },
    historyRow: {
      flexDirection: isCompact ? "column" : "row-reverse",
      alignItems: "flex-start",
      gap: 12,
      paddingVertical: 10,
    },
    historyTime: {
      fontSize: 12,
      fontWeight: "700",
      color: PHOENIX_ORANGE,
      minWidth: 48,
      textAlign: "right",
    },
    historyBody: { flex: 1, alignItems: "flex-end" },
    historyLabel: { fontSize: 13, fontWeight: "500", textAlign: "right" },
    supportBtn: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: PHOENIX_ORANGE,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
      minHeight: 48,
      marginTop: 20,
    },
    supportBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    libBadge: {
      backgroundColor: "rgba(52,211,153,0.12)",
      borderColor: "rgba(52,211,153,0.25)",
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    libBadgeText: { color: "#34d399", fontSize: 11, fontWeight: "600" },
    libTimelineRow: {
      flexDirection: isCompact ? "column" : "row-reverse",
      justifyContent: "space-between",
      gap: isCompact ? 10 : 0,
    },
    libStep: {
      alignItems: "center",
      flex: isCompact ? 0 : 1,
      flexDirection: isCompact ? "row-reverse" : "column",
      gap: isCompact ? 10 : 0,
    },
    libStepCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    libStepLabel: { fontSize: 9, textAlign: isCompact ? "right" : "center", flexShrink: 1 },
    notFound: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
    notFoundText: { fontSize: 15, textAlign: "center" },
    backBtnPrimary: {
      backgroundColor: PHOENIX_ORANGE,
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    backBtnPrimaryText: { color: "#fff", fontWeight: "700" },
  });
