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

interface StatItem {
  key: string;
  labelKey: string;
  value: number;
  icon: any;
  iconColor: string;
  bgColor: string;
}

export default function DashboardIndex() {
  const { t } = useTranslation();
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

      // 2. Fetch orders status
      const { data: orders } = await supabase
        .from("orders")
        .select("status")
        .eq("user_id", user.id);

      const totalOrders = orders?.length || 0;
      const pendingOrders = orders?.filter((o: { status: string }) => o.status === "Pending").length || 0;
      const printingOrders = orders?.filter((o: { status: string }) => o.status === "Printing").length || 0;
      const completedOrders = orders?.filter((o: { status: string }) => o.status === "Completed").length || 0;

      const statsList: StatItem[] = [
        {
          key: "total",
          labelKey: "total_orders",
          value: totalOrders,
          icon: "package",
          iconColor: themeColors.primary,
          bgColor: themeColors.primarySoftBg,
        },
        {
          key: "pending",
          labelKey: "pending",
          value: pendingOrders,
          icon: "clock",
          iconColor: themeColors.statAmber,
          bgColor: themeColors.statAmberBg,
        },
        {
          key: "printing",
          labelKey: "printing",
          value: printingOrders,
          icon: "printer",
          iconColor: themeColors.statBlue,
          bgColor: themeColors.statBlueBg,
        },
        {
          key: "completed",
          labelKey: "completed",
          value: completedOrders,
          icon: "check-circle",
          iconColor: themeColors.statGreen,
          bgColor: themeColors.statGreenBg,
        },
      ];

      setStats(statsList);
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
          {t("welcome_title")}{" "}
          <Text style={styles.gradientText}>{fullName || t("welcome_fallback")}</Text>
          {" 👋"}
        </Text>
        <Text style={styles.welcomeSubtitle}>{t("welcome_dashboard")}</Text>
      </View>

      {/* Primary Action */}
      <Link href={"/dashboard/new-order" as any} asChild>
        <TouchableOpacity style={styles.primaryAction}>
          <View style={[styles.primaryActionInner, isCompact && styles.actionInnerCompact]}>
            <View style={styles.primaryActionIcon}>
              <Feather name="printer" size={30} color={themeColors.onAccent} />
            </View>
            <View style={styles.primaryActionTexts}>
              <Text style={styles.primaryActionTitle}>{t("new_print_order")}</Text>
              <Text style={styles.primaryActionSubtitle}>{t("new_print_order_desc")}</Text>
            </View>
            <View style={styles.primaryActionArrow}>
              <Feather name="arrow-left" size={22} color={themeColors.onAccent} />
            </View>
          </View>
        </TouchableOpacity>
      </Link>

      {/* Statistics */}
      <View style={styles.gridContainer}>
        {stats.map((stat) => (
          <View
            key={stat.key}
            style={styles.statCard}
          >
            <View style={[styles.iconWrapper, { backgroundColor: stat.bgColor }]}>
              <Feather name={stat.icon} size={26} color={stat.iconColor} />
            </View>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{t(stat.labelKey)}</Text>
          </View>
        ))}
      </View>

      {/* My Orders */}
      <Link href={"/dashboard/orders" as any} asChild>
        <TouchableOpacity style={styles.ordersCard}>
          <View style={[styles.ordersCardInner, isCompact && styles.actionInnerCompact]}>
            <View style={styles.ordersIcon}>
              <Feather name="clipboard" size={26} color={themeColors.brandTint} />
            </View>
            <View style={styles.ordersTexts}>
              <Text style={styles.ordersTitle}>{t("my_orders")}</Text>
              <Text style={styles.ordersSubtitle}>{t("my_orders_desc")}</Text>
            </View>
            <View style={styles.ordersArrow}>
              <Feather name="chevron-left" size={22} color={themeColors.textSoft} />
            </View>
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
    padding: 24,
    paddingBottom: 48,
    width: "100%",
  },
  tabletContent: {
    maxWidth: 960,
    alignSelf: "center",
  },
  compactContent: {
    paddingHorizontal: 14,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeContainer: {
    marginBottom: 32,
    alignItems: "flex-end",
  },
  welcomeTitle: {
    color: c.textStrong,
    fontSize: 30,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -0.4,
    textAlign: "right",
    flexShrink: 1,
  },
  gradientText: {
    color: c.brandTint,
  },
  welcomeSubtitle: {
    color: c.textSoft,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 8,
    textAlign: "right",
    flexShrink: 1,
  },
  primaryAction: {
    width: "100%",
    minHeight: 128,
    padding: 24,
    backgroundColor: c.accent,
    borderRadius: 20,
    marginBottom: 32,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 8,
  },
  primaryActionInner: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 16,
  },
  primaryActionIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
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
    fontSize: 21,
    lineHeight: 29,
    fontWeight: "800",
    textAlign: "right",
    flexShrink: 1,
  },
  primaryActionSubtitle: {
    color: c.onAccentMuted,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "500",
    marginTop: 5,
    textAlign: "right",
    flexShrink: 1,
  },
  primaryActionArrow: {
    width: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  gridContainer: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "stretch",
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    flexBasis: "46%",
    flexGrow: 1,
    minWidth: 140,
    minHeight: 152,
    backgroundColor: c.surface,
    borderColor: c.borderSoft,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    alignItems: "flex-end",
    justifyContent: "space-between",
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  statValue: {
    color: c.textStrong,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    textAlign: "right",
  },
  statLabel: {
    color: c.textSoft,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
  },
  ordersCard: {
    width: "100%",
    minHeight: 112,
    backgroundColor: c.surface,
    borderColor: c.borderSoft,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    shadowColor: c.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  ordersCardInner: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 16,
  },
  actionInnerCompact: {
    gap: 12,
  },
  ordersIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: c.accentSoftBg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ordersTexts: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  ordersTitle: {
    color: c.textStrong,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "700",
    textAlign: "right",
    flexShrink: 1,
  },
  ordersSubtitle: {
    color: c.textSoft,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
    flexShrink: 1,
    textAlign: "right",
  },
  ordersArrow: {
    width: 36,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
