import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter, Link, usePathname, useNavigation } from "expo-router";
import { supabase } from "../../../lib/supabaseClient";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

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
  const router = useRouter();
  const pathname = usePathname();
  const navigation = useNavigation();
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
          iconColor: "#ea580c",
          bgColor: "rgba(234, 88, 12, 0.1)",
        },
        {
          key: "pending",
          labelKey: "pending",
          value: pendingOrders,
          icon: "clock",
          iconColor: "#fbbf24",
          bgColor: "rgba(251, 191, 36, 0.1)",
        },
        {
          key: "printing",
          labelKey: "printing",
          value: printingOrders,
          icon: "printer",
          iconColor: "#60a5fa",
          bgColor: "rgba(96, 165, 250, 0.1)",
        },
        {
          key: "completed",
          labelKey: "completed",
          value: completedOrders,
          icon: "check-circle",
          iconColor: "#34d399",
          bgColor: "rgba(52, 211, 153, 0.1)",
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
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Welcome Banner */}
      <View style={styles.welcomeContainer}>
        <Text style={[styles.welcomeTitle, { color: themeColors.text }]}>
          {t("welcome_title")} <Text style={styles.gradientText}>{fullName || t("welcome_fallback")}</Text>
        </Text>
        <Text style={[styles.welcomeSubtitle, { color: themeColors.textMuted }]}>{t("welcome_dashboard")}</Text>
      </View>

      {/* Stats Grid */}
      <View style={styles.gridContainer}>
        {stats.map((stat) => (
          <View key={stat.key} style={[styles.statCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
            <View style={styles.cardHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: stat.bgColor }]}>
                <Feather name={stat.icon} size={20} color={stat.iconColor} />
              </View>
              <Text style={[styles.statValue, { color: themeColors.text }]}>{stat.value}</Text>
            </View>
            <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>{t(stat.labelKey)}</Text>
          </View>
        ))}
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsContainer}>
        <Link href={"/dashboard/new-order" as any} asChild>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
            <View style={styles.actionInner}>
              <View style={[styles.actionIconWrapper, styles.primaryIconBg]}>
                <Feather name="plus-circle" size={24} color="#ea580c" />
              </View>
              <View style={styles.actionTexts}>
                <Text style={[styles.actionTitle, { color: themeColors.text }]}>{t("new_print_order")}</Text>
                <Text style={[styles.actionSubtitle, { color: themeColors.textMuted }]}>{t("new_print_order_desc")}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </Link>

        <Link href={"/dashboard/orders" as any} asChild>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
            <View style={styles.actionInner}>
              <View style={[styles.actionIconWrapper, styles.secondaryIconBg]}>
                <Feather name="clipboard" size={24} color="#fb923c" />
              </View>
              <View style={styles.actionTexts}>
                <Text style={[styles.actionTitle, { color: themeColors.text }]}>{t("my_orders")}</Text>
                <Text style={[styles.actionSubtitle, { color: themeColors.textMuted }]}>{t("my_orders_desc")}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeContainer: {
    marginBottom: 24,
    alignItems: "flex-end",
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "bold",
  },
  gradientText: {
    color: "#ea580c",
  },
  welcomeSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  gridContainer: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "bold",
  },
  statLabel: {
    fontSize: 13,
    textAlign: "right",
  },
  actionsContainer: {
    gap: 16,
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
  },
  actionInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 16,
  },
  actionIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryIconBg: {
    backgroundColor: "rgba(234, 88, 12, 0.1)",
  },
  secondaryIconBg: {
    backgroundColor: "rgba(251, 146, 60, 0.1)",
  },
  actionTexts: {
    flex: 1,
    alignItems: "flex-end",
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 13,
  },
});
