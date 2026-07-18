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
import { useAppTheme, type ThemeColors } from "../../../../components/ThemeProvider";
import { ScreenTransition } from "../../../components/anim/ScreenTransition";
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

function SkeletonBlock({
  width,
  height,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  style?: object;
}) {
  const { themeColors } = useAppTheme();
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
          backgroundColor: themeColors.skeleton,
          opacity: anim,
        },
        style,
      ]}
    />
  );
}

function DetailSkeleton() {
  return (
    <View style={{ padding: 20, gap: 16 }}>
      <SkeletonBlock width="60%" height={28} />
      <SkeletonBlock width="40%" height={20} />
      <SkeletonBlock width="100%" height={120} />
      <SkeletonBlock width="100%" height={200} />
      <SkeletonBlock width="100%" height={160} />
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
      <Text style={[styles.infoValue, { color: themeColors.textStrong }]}>{value}</Text>
      <Text style={[styles.infoLabel, { color: themeColors.textSoft }]}>{label}</Text>
    </View>
  );

  const renderPrintTimeline = () => {
    if (!printOrder) return null;

    if (cancelled) {
      return (
        <View style={[styles.cancelledCard, { borderColor: themeColors.dangerSoftBorder }]}>
          <Feather name="x-circle" size={22} color={themeColors.danger} />
          <View style={styles.cancelledTextWrap}>
            <Text style={styles.cancelledTitle}>{t("timeline_cancelled")}</Text>
            <Text style={[styles.cancelledDesc, { color: themeColors.textSoft }]}>
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
          const dotColor = isCurrent ? themeColors.primary : isCompleted ? themeColors.statGreen : themeColors.borderStrong;
          const lineColor = isCompleted ? themeColors.statGreen : themeColors.trackColor;
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
                    color={isCurrent || isCompleted ? themeColors.onAccent : themeColors.textSoft}
                  />
                )}
              </Animated.View>
              <View style={[styles.timelineContent, rtl ? styles.timelineContentRtl : null]}>
                <Text
                  style={[
                    styles.timelineTitle,
                    { color: isCurrent ? themeColors.accent : isCompleted ? themeColors.textStrong : themeColors.textSoft },
                    isCurrent && styles.timelineTitleActive,
                  ]}
                >
                  {t(`timeline_${step.key}`)}
                </Text>
                <Text style={[styles.timelineDesc, { color: themeColors.textSoft }]}>
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
                    backgroundColor: done ? step.color : themeColors.trackColor,
                    borderColor: done ? step.color : themeColors.borderStrong,
                  },
                ]}
              >
                <Feather name={step.icon} size={12} color={done ? themeColors.onAccent : themeColors.textSoft} />
              </View>
              <Text
                style={[
                  styles.libStepLabel,
                  { color: done ? step.color : themeColors.textSoft },
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
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.screenBg }]}>
        <DetailSkeleton />
      </SafeAreaView>
    );
  }

  if (notFound || !orderType) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.screenBg }]}>
        <View style={styles.notFound}>
          <Feather name="alert-circle" size={48} color={themeColors.textSoft} />
          <Text style={[styles.notFoundText, { color: themeColors.textStrong }]}>
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
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.screenBg }]}>
      <ScreenTransition style={styles.safe}>
      <View style={[styles.appBar, { borderBottomColor: themeColors.borderSoft }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Feather name={rtl ? "arrow-right" : "arrow-left"} size={22} color={themeColors.textStrong} />
        </TouchableOpacity>
        <View style={styles.appBarCenter}>
          <Text style={[styles.appBarTitle, { color: themeColors.textStrong }]}>
            {displayOrderId(headerId)}
          </Text>
          {orderType === "print" ? (
            <View style={styles.statusBadgeWrap}>
              <StatusBadge status={headerStatus} />
            </View>
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
        <Text style={[styles.sectionTitle, { color: themeColors.textStrong }]}>
          {t("order_detail_timeline")}
        </Text>
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.borderSoft }]}>
          {orderType === "print" ? renderPrintTimeline() : renderLibraryTimeline()}
        </View>

        <Text style={[styles.sectionTitle, { color: themeColors.textStrong }]}>
          {t("order_detail_info")}
        </Text>
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.borderSoft }]}>
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

        <Text style={[styles.sectionTitle, { color: themeColors.textStrong }]}>
          {t("order_detail_files")}
        </Text>
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.borderSoft }]}>
          {orderType === "print" && printOrder ? (
            isTelegramOrder(printOrder) ? (
              <View style={styles.fileRow}>
                <View style={styles.telegramIcon}>
                  <FontAwesome name="telegram" size={22} color={themeColors.telegramTint} />
                </View>
                <View style={styles.fileMeta}>
                  <Text style={[styles.fileTitle, { color: themeColors.textStrong }]}>
                    {t("order_detail_telegram_upload")}
                  </Text>
                  <Text style={[styles.fileSub, { color: themeColors.textSoft }]}>
                    {t("order_detail_bot_code")}: {printOrder.external_file_link || "—"}
                  </Text>
                  {printOrder.total_pages != null ? (
                    <Text style={[styles.fileSub, { color: themeColors.textSoft }]}>
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
                        <Feather name="file-text" size={20} color={themeColors.statBlue} />
                      </View>
                      <View style={styles.fileMeta}>
                        <Text style={[styles.fileTitle, { color: themeColors.textStrong }]}>
                          {name}
                        </Text>
                        {printOrder.total_pages != null ? (
                          <Text style={[styles.fileSub, { color: themeColors.textSoft }]}>
                            {t("order_detail_pages")}: {printOrder.total_pages}
                          </Text>
                        ) : null}
                      </View>
                      <Feather name="eye" size={18} color={themeColors.primary} />
                    </TouchableOpacity>
                  );
                })
            )
          ) : libraryOrder ? (
            parseOrderItems(libraryOrder.items).map((item, idx) => (
              <View key={idx} style={styles.fileRow}>
                <View style={styles.fileIcon}>
                  <Feather name="shopping-bag" size={18} color={themeColors.statGreen} />
                </View>
                <View style={styles.fileMeta}>
                  <Text style={[styles.fileTitle, { color: themeColors.textStrong }]}>{item.name}</Text>
                  <Text style={[styles.fileSub, { color: themeColors.textSoft }]}>
                    ×{item.quantity} — {item.subtotal} {t("currency")}
                  </Text>
                </View>
              </View>
            ))
          ) : null}
        </View>

        {orderType === "print" && history.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { color: themeColors.textStrong }]}>
              {t("order_detail_history")}
            </Text>
            <View
              style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.borderSoft }]}
            >
              {history.map((entry, idx) => (
                <View
                  key={entry.id}
                  style={[
                    styles.historyRow,
                    idx < history.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: themeColors.borderSoft,
                    },
                  ]}
                >
                  <Text style={styles.historyTime}>
                    {formatOrderDate(entry.time, i18n.language, "time")}
                  </Text>
                  <View style={styles.historyBody}>
                    <Text style={[styles.historyLabel, { color: themeColors.textStrong }]}>
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
          <Feather name="headphones" size={18} color={themeColors.onAccent} />
          <Text style={styles.supportBtnText}>{t("order_detail_contact_support")}</Text>
        </TouchableOpacity>
      </ScrollView>
      </ScreenTransition>
    </SafeAreaView>
  );
}

const getStyles = (
  themeColors: ThemeColors,
  isDark: boolean,
  isCompact: boolean,
  isTablet: boolean
) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: themeColors.screenBg },
    appBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: isCompact ? 16 : 24,
      paddingTop: 20,
      paddingBottom: 24,
      borderBottomWidth: 1,
      backgroundColor: themeColors.screenBg,
      width: "100%",
      maxWidth: isTablet ? 960 : undefined,
      alignSelf: "center",
    },
    backBtn: {
      width: 48,
      minHeight: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    appBarCenter: {
      alignItems: "center",
      gap: 12,
      flex: 1,
      paddingHorizontal: 12,
    },
    statusBadgeWrap: {
      transform: [{ scale: 1.15 }],
      marginVertical: 4,
      maxWidth: "86%",
    },
    appBarTitle: {
      fontSize: isCompact ? 24 : 30,
      lineHeight: isCompact ? 32 : 40,
      fontWeight: "900",
      fontFamily: "monospace",
      letterSpacing: 0.8,
      textAlign: "center",
      color: themeColors.textStrong,
      flexShrink: 1,
    },
    scroll: {
      paddingHorizontal: isCompact ? 16 : 24,
      paddingTop: 8,
      paddingBottom: 56,
      width: "100%",
      maxWidth: isTablet ? 960 : undefined,
      alignSelf: "center",
    },
    sectionTitle: {
      fontSize: 18,
      lineHeight: 26,
      fontWeight: "800",
      marginBottom: 12,
      marginTop: 24,
      textAlign: "right",
      color: themeColors.textStrong,
      flexShrink: 1,
    },
    card: {
      borderRadius: 20,
      borderWidth: 1,
      padding: isCompact ? 18 : 24,
      marginBottom: 4,
      backgroundColor: themeColors.surface,
      borderColor: themeColors.borderSoft,
      shadowColor: themeColors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.14,
      shadowRadius: 16,
      elevation: 3,
    },
    timeline: { gap: 0 },
    timelineStep: {
      flexDirection: "row-reverse",
      alignItems: "flex-start",
      minHeight: 88,
      position: "relative",
    },
    timelineLine: {
      position: "absolute",
      top: 32,
      width: 3,
      height: 64,
      borderRadius: 2,
    },
    timelineDot: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 16,
    },
    timelineContent: { flex: 1, alignItems: "flex-end", paddingBottom: 20 },
    timelineContentRtl: { alignItems: "flex-end" },
    timelineTitle: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "700",
      marginBottom: 4,
      textAlign: "right",
      flexShrink: 1,
    },
    timelineTitleActive: { fontWeight: "800" },
    timelineDesc: { fontSize: 13, lineHeight: 20, textAlign: "right", flexShrink: 1 },
    timelineTime: {
      fontSize: 12,
      lineHeight: 18,
      color: themeColors.accent,
      marginTop: 6,
      fontWeight: "700",
      textAlign: "right",
    },
    cancelledCard: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 16,
      padding: 18,
      borderRadius: 18,
      borderWidth: 1,
      backgroundColor: themeColors.dangerSoftBg,
    },
    cancelledTextWrap: { flex: 1, alignItems: "flex-end" },
    cancelledTitle: { color: themeColors.danger, fontWeight: "800", fontSize: 16, lineHeight: 24 },
    cancelledDesc: { fontSize: 13, lineHeight: 20, marginTop: 4, textAlign: "right" },
    infoRow: {
      flexDirection: isCompact ? "column" : "row-reverse",
      justifyContent: "space-between",
      alignItems: "flex-start",
      minHeight: 48,
      paddingVertical: 12,
      gap: isCompact ? 4 : 20,
    },
    infoLabel: {
      fontSize: 13,
      lineHeight: 20,
      fontWeight: "600",
      flex: isCompact ? 0 : 1,
      textAlign: "right",
      width: isCompact ? "100%" : undefined,
      color: themeColors.textSoft,
      flexShrink: 1,
    },
    infoValue: {
      fontSize: 15,
      lineHeight: 23,
      fontWeight: "700",
      flex: isCompact ? 0 : 1.2,
      textAlign: isCompact ? "right" : "left",
      width: isCompact ? "100%" : undefined,
      flexShrink: 1,
      color: themeColors.textStrong,
    },
    fileRow: {
      flexDirection: isCompact ? "column" : "row-reverse",
      alignItems: isCompact ? "flex-end" : "center",
      gap: 16,
      minHeight: 88,
      padding: 16,
      marginBottom: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: themeColors.borderSoft,
      backgroundColor: themeColors.surfaceMuted,
    },
    fileIcon: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: themeColors.statBlueBg,
      alignItems: "center",
      justifyContent: "center",
    },
    telegramIcon: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: themeColors.telegramTintBg,
      alignItems: "center",
      justifyContent: "center",
    },
    fileMeta: { flex: isCompact ? 0 : 1, alignItems: "flex-end", width: isCompact ? "100%" : undefined },
    fileTitle: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "700",
      textAlign: "right",
      flexShrink: 1,
    },
    fileSub: {
      fontSize: 13,
      lineHeight: 20,
      marginTop: 4,
      textAlign: "right",
      flexShrink: 1,
    },
    historyRow: {
      flexDirection: isCompact ? "column" : "row-reverse",
      alignItems: "flex-start",
      gap: 16,
      paddingVertical: 16,
    },
    historyTime: {
      fontSize: 13,
      lineHeight: 20,
      fontWeight: "700",
      color: themeColors.accent,
      minWidth: 64,
      textAlign: "right",
    },
    historyBody: { flex: 1, alignItems: "flex-end" },
    historyLabel: {
      fontSize: 14,
      lineHeight: 21,
      fontWeight: "600",
      textAlign: "right",
      flexShrink: 1,
    },
    supportBtn: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: themeColors.accent,
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 20,
      minHeight: 56,
      marginTop: 28,
      shadowColor: themeColors.accent,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.26,
      shadowRadius: 14,
      elevation: 6,
    },
    supportBtnText: {
      color: themeColors.onAccent,
      fontWeight: "800",
      fontSize: 16,
      lineHeight: 24,
      textAlign: "center",
      flexShrink: 1,
    },
    libBadge: {
      backgroundColor: themeColors.successSoftBg,
      borderColor: themeColors.successSoftBorder,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    libBadgeText: {
      color: themeColors.success,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: "800",
      textAlign: "center",
      flexShrink: 1,
    },
    libTimelineRow: {
      flexDirection: isCompact ? "column" : "row-reverse",
      justifyContent: "space-between",
      gap: isCompact ? 14 : 8,
    },
    libStep: {
      alignItems: "center",
      flex: isCompact ? 0 : 1,
      flexDirection: isCompact ? "row-reverse" : "column",
      gap: isCompact ? 10 : 0,
    },
    libStepCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    libStepLabel: {
      fontSize: 11,
      lineHeight: 17,
      fontWeight: "700",
      textAlign: isCompact ? "right" : "center",
      flexShrink: 1,
    },
    notFound: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
    notFoundText: { fontSize: 15, textAlign: "center" },
    backBtnPrimary: {
      backgroundColor: themeColors.accent,
      borderRadius: 18,
      paddingHorizontal: 24,
      paddingVertical: 16,
      minHeight: 56,
      justifyContent: "center",
    },
    backBtnPrimaryText: { color: themeColors.onAccent, fontWeight: "800", fontSize: 15 },
  });
