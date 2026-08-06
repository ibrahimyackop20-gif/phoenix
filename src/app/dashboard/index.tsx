import React, { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useRouter, Link, usePathname, useNavigation } from "expo-router";
import { supabase } from "../../../lib/supabaseClient";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme, type ThemeColors } from "../../../components/ThemeProvider";
import { ScreenTransition } from "../../components/anim/ScreenTransition";
import StatusBadge from "../../../components/StatusBadge";
import { displayOrderId, formatOrderDate } from "../../../lib/ordersShared";

interface StatItem {
  key: string;
  labelKey: string;
  value: number;
  icon: any;
}

/** Statuses that no longer need customer attention — a "latest order" card prefers anything before this. */
const RESOLVED_STATUSES = new Set(["Completed", "Cancelled", "Rejected"]);

interface LatestOrder {
  id: string;
  status: string;
  created_at: string;
}

export default function DashboardIndex() {
  const { t, i18n } = useTranslation();
  const { themeColors } = useAppTheme();
  const styles = useMemo(() => getStyles(themeColors), [themeColors]);
  const router = useRouter();
  const pathname = usePathname();
  const navigation = useNavigation();
  const { width, fontScale } = useWindowDimensions();
  const isCompact = width < 390 || fontScale >= 1.3;
  const isTablet = width >= 700;
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [stats, setStats] = useState<StatItem[]>([]);
  const [latestOrder, setLatestOrder] = useState<LatestOrder | null>(null);

  useEffect(() => {
    const state = navigation.getState?.();
    console.log("[DashboardIndex][NAV] final screen rendered", {
      currentRoute: pathname,
      selectedTab: "dashboard",
      navigatorStateRoutes: state?.routes?.map((r: { name?: string }) => r.name) ?? null,
      index: state?.index ?? null,
    });
  }, [pathname, navigation]);

  const fetchDashboardData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // 1. Fetch user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        setFullName(profile.full_name || "");
      }

      // 2. Fetch orders (status + id/created_at for the latest-order preview — same query, no new call)
      const { data: orders } = await supabase
        .from("orders")
        .select("id, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const totalOrders = orders?.length || 0;
      const pendingOrders = orders?.filter((o: { status: string }) => o.status === "Pending").length || 0;
      const printingOrders = orders?.filter((o: { status: string }) => o.status === "Printing").length || 0;
      const completedOrders = orders?.filter((o: { status: string }) => o.status === "Completed").length || 0;

      const statsList: StatItem[] = [
        { key: "total", labelKey: "total_orders", value: totalOrders, icon: "package" },
        { key: "pending", labelKey: "pending", value: pendingOrders, icon: "clock" },
        { key: "printing", labelKey: "printing", value: printingOrders, icon: "printer" },
        { key: "completed", labelKey: "completed", value: completedOrders, icon: "check-circle" },
      ];

      setStats(statsList);

      // Prefer the most recent order that still needs attention; fall back to the latest overall.
      const active = orders?.find((o: { status: string }) => !RESOLVED_STATUSES.has(o.status));
      const latest = active || orders?.[0] || null;
      setLatestOrder(latest ? { id: latest.id, status: latest.status, created_at: latest.created_at } : null);
    } catch (err) {
      console.error("Error loading dashboard metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.screenBg }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  return (
    <ScreenTransition style={styles.container}>
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        isTablet && styles.tabletContent,
        isCompact && styles.compactContent,
      ]}
      style={styles.container}
    >
      {/* Greeting */}
      <View style={styles.welcomeContainer}>
        <Text style={styles.welcomeTitle}>
          {t("welcome_title")} <Text style={styles.welcomeName}>{fullName || t("welcome_fallback")}</Text>
        </Text>
        <Text style={styles.welcomeSubtitle}>{t("welcome_dashboard")}</Text>
      </View>

      {/* Primary Action */}
      <Link href={"/dashboard/new-order" as any} asChild>
        <TouchableOpacity style={styles.primaryAction} activeOpacity={0.9}>
          <View style={styles.primaryActionInner}>
            <View style={styles.primaryActionIcon}>
              <Feather name="printer" size={26} color={themeColors.onAccent} />
            </View>
            <View style={styles.primaryActionTexts}>
              <Text style={styles.primaryActionTitle}>{t("new_print_order")}</Text>
              <Text style={styles.primaryActionSubtitle}>{t("new_print_order_desc")}</Text>
            </View>
            <Feather name="arrow-left" size={20} color={themeColors.onAccentMuted} />
          </View>
        </TouchableOpacity>
      </Link>

      {/* Latest order preview — only when the customer has one */}
      {latestOrder ? (
        <Link href={`/dashboard/orders/${latestOrder.id}` as any} asChild>
          <TouchableOpacity style={styles.latestCard} activeOpacity={0.85}>
            <View style={styles.latestCardRow}>
              <Feather name="chevron-left" size={18} color={themeColors.textFaint} />
              <View style={styles.latestCardTexts}>
                <View style={styles.latestCardTop}>
                  <StatusBadge status={latestOrder.status} />
                  <Text style={styles.latestCardId}>{displayOrderId(latestOrder.id)}</Text>
                </View>
                <Text style={styles.latestCardMeta}>
                  {t("latest_order_title")} · {formatOrderDate(latestOrder.created_at, i18n.language)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Link>
      ) : null}

      {/* Compact order stats */}
      <View style={styles.statsStrip}>
        {stats.map((stat, idx) => (
          <React.Fragment key={stat.key}>
            {idx > 0 ? <View style={styles.statDivider} /> : null}
            <View style={styles.statCell}>
              <Feather name={stat.icon} size={15} color={themeColors.textFaint} style={styles.statIcon} />
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>
                {t(stat.labelKey)}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* My Orders */}
      <Link href={"/dashboard/orders" as any} asChild>
        <TouchableOpacity style={styles.ordersRow} activeOpacity={0.7}>
          <Feather name="chevron-left" size={18} color={themeColors.textFaint} />
          <View style={styles.ordersRowTexts}>
            <Text style={styles.ordersTitle}>{t("my_orders")}</Text>
            <Text style={styles.ordersSubtitle}>{t("my_orders_desc")}</Text>
          </View>
          <View style={styles.ordersIcon}>
            <Feather name="clipboard" size={18} color={themeColors.textSoft} />
          </View>
        </TouchableOpacity>
      </Link>
    </ScrollView>
    </ScreenTransition>
  );
}

const getStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.screenBg,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    width: "100%",
  },
  tabletContent: {
    maxWidth: 720,
    alignSelf: "center",
  },
  compactContent: {
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Greeting
  welcomeContainer: {
    marginBottom: 20,
    alignItems: "flex-end",
  },
  welcomeTitle: {
    color: c.textStrong,
    fontSize: 24,
    lineHeight: 34,
    fontWeight: "800",
    textAlign: "right",
    flexShrink: 1,
  },
  welcomeName: {
    color: c.accent,
  },
  welcomeSubtitle: {
    color: c.textSoft,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
    textAlign: "right",
    flexShrink: 1,
  },

  // Primary CTA
  primaryAction: {
    width: "100%",
    padding: 18,
    backgroundColor: c.accent,
    borderRadius: 16,
    marginBottom: 14,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  primaryActionInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 14,
  },
  primaryActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: c.onAccentSoftBg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  primaryActionTexts: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  primaryActionTitle: {
    color: c.onAccent,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "800",
    textAlign: "right",
    flexShrink: 1,
  },
  primaryActionSubtitle: {
    color: c.onAccentMuted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "500",
    marginTop: 3,
    textAlign: "right",
    flexShrink: 1,
  },

  // Latest order preview
  latestCard: {
    width: "100%",
    backgroundColor: c.surface,
    borderColor: c.borderSoft,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  latestCardRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  latestCardTexts: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    gap: 6,
  },
  latestCardTop: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  latestCardId: {
    color: c.textStrong,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  latestCardMeta: {
    color: c.textFaint,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
    textAlign: "right",
  },

  // Compact stats strip
  statsStrip: {
    flexDirection: "row-reverse",
    alignItems: "stretch",
    backgroundColor: c.surface,
    borderColor: c.borderSoft,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: c.borderSoft,
    marginVertical: 2,
  },
  statIcon: {
    marginBottom: 2,
  },
  statValue: {
    color: c.textStrong,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  statLabel: {
    color: c.textFaint,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    textAlign: "center",
  },

  // My Orders (secondary)
  ordersRow: {
    width: "100%",
    minHeight: 64,
    backgroundColor: c.surface,
    borderColor: c.borderSoft,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  ordersIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: c.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ordersRowTexts: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  ordersTitle: {
    color: c.textStrong,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
  },
  ordersSubtitle: {
    color: c.textSoft,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
    flexShrink: 1,
    textAlign: "right",
  },
});
