import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../../../lib/supabaseClient";
import { Feather, FontAwesome } from "@expo/vector-icons";

interface DailySale {
  date: string;
  total: number;
  count: number;
}

export default function FinanceScreen() {
  const router = useRouter();
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalShipping, setTotalShipping] = useState(0);
  const [totalPrintingCost, setTotalPrintingCost] = useState(0);
  const [dailySales, setDailySales] = useState<DailySale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFinance = async () => {
      try {
        const { data: orders } = await supabase
          .from("sales_orders")
          .select("total, shipping_cost, created_at")
          .order("created_at", { ascending: false });

        if (orders) {
          const revenue = orders.reduce((sum: number, o: { total: number | null }) => sum + (o.total || 0), 0);
          const shipping = orders.reduce((sum: number, o: { shipping_cost: number | null }) => sum + (o.shipping_cost || 0), 0);
          setTotalRevenue(revenue);
          setTotalOrders(orders.length);
          setTotalShipping(shipping);

          const last7: DailySale[] = [];
          for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const dayOrders = orders.filter(
              (o: { created_at: string | null }) => o.created_at?.slice(0, 10) === dateStr
            );
            last7.push({
              date: d.toLocaleDateString("ar-SA", { weekday: "short", day: "numeric" }),
              total: dayOrders.reduce((s: number, o: { total: number | null }) => s + (o.total || 0), 0),
              count: dayOrders.length,
            });
          }
          setDailySales(last7);
        }

        const { data: printOrders } = await supabase
          .from("orders")
          .select("total_cost")
          .eq("status", "Completed");

        if (printOrders) {
          const printCost = printOrders.reduce((s: number, o: { total_cost: number | null }) => s + (o.total_cost || 0), 0);
          setTotalPrintingCost(printCost);
        }
      } catch (err) {
        console.error("Error fetching finance data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFinance();
  }, []);

  const totalProfit = totalRevenue - totalShipping - totalPrintingCost;
  const maxBarValue = Math.max(...dailySales.map((d) => d.total), 1);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>لوحة المالية</Text>
          <Text style={styles.headerSubtitle}>متابعة الإيرادات والأرباح</Text>
        </View>

        <TouchableOpacity
          onPress={() => router.push("/admin" as any)}
          style={styles.backBtn}
        >
          <Feather name="arrow-right" size={16} color="#a1a1aa" />
          <Text style={styles.backBtnText}>لوحة الإدارة</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Metric Cards Grid */}
        <View style={styles.metricGrid}>
          {/* Revenue */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(16, 185, 129, 0.1)" }]}>
                <Feather name="dollar-sign" size={18} color="#10b981" />
              </View>
              <Text style={styles.metricLabel}>إجمالي الإيرادات</Text>
            </View>
            <Text style={[styles.metricValue, { color: "#10b981" }]}>
              {totalRevenue.toLocaleString()}
            </Text>
            <Text style={styles.currencyText}>د.ع</Text>
          </View>

          {/* Profit */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(234, 88, 12, 0.1)" }]}>
                <Feather name="trending-up" size={18} color="#ea580c" />
              </View>
              <Text style={styles.metricLabel}>صافي الأرباح</Text>
            </View>
            <Text style={[styles.metricValue, totalProfit >= 0 ? { color: "#ea580c" } : { color: "#ef4444" }]}>
              {totalProfit.toLocaleString()}
            </Text>
            <Text style={styles.currencyText}>د.ع</Text>
          </View>

          {/* Orders */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(251, 191, 36, 0.1)" }]}>
                <Feather name="shopping-bag" size={18} color="#fbbf24" />
              </View>
              <Text style={styles.metricLabel}>عدد الطلبات</Text>
            </View>
            <Text style={[styles.metricValue, { color: "#fbbf24" }]}>
              {totalOrders}
            </Text>
            <Text style={styles.currencyText}>طلب</Text>
          </View>

          {/* Costs */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(239, 68, 68, 0.1)" }]}>
                <Feather name="credit-card" size={18} color="#ef4444" />
              </View>
              <Text style={styles.metricLabel}>إجمالي التكاليف</Text>
            </View>
            <Text style={[styles.metricValue, { color: "#ef4444" }]}>
              {(totalShipping + totalPrintingCost).toLocaleString()}
            </Text>
            <Text style={styles.currencyText}>د.ع</Text>
          </View>
        </View>

        {/* Costs Details Breakdowns */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>تفاصيل التكاليف</Text>

          <View style={styles.breakdownRow}>
            <View style={styles.breakdownItem}>
              <View style={styles.breakdownHeader}>
                <Feather name="truck" size={14} color="#60a5fa" />
                <Text style={styles.breakdownLabel}>تكاليف التوصيل</Text>
              </View>
              <Text style={[styles.breakdownValue, { color: "#60a5fa" }]}>
                {totalShipping.toLocaleString()} د.ع
              </Text>
            </View>

            <View style={styles.breakdownItem}>
              <View style={styles.breakdownHeader}>
                <Feather name="printer" size={14} color="#a78bfa" />
                <Text style={styles.breakdownLabel}>تكاليف الطباعة</Text>
              </View>
              <Text style={[styles.breakdownValue, { color: "#a78bfa" }]}>
                {totalPrintingCost.toLocaleString()} د.ع
              </Text>
            </View>
          </View>
        </View>

        {/* Sales Chart Bar Representation */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>المبيعات - آخر 7 أيام</Text>

          <View style={styles.chartContainer}>
            {dailySales.map((day, i) => {
              const heightPercentage = maxBarValue > 0 ? (day.total / maxBarValue) * 100 : 0;
              return (
                <View key={i} style={styles.chartBarWrapper}>
                  {/* Total Value */}
                  <Text style={styles.barValueText}>
                    {day.total > 0 ? `${(day.total / 1000).toFixed(0)}K` : "0"}
                  </Text>

                  {/* Dynamic Bar */}
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${Math.max(heightPercentage, 4)}%` },
                      ]}
                    />
                  </View>

                  {/* Day Date */}
                  <Text style={styles.barLabelText}>{day.date}</Text>
                  <Text style={styles.barCountText}>{day.count} طلب</Text>
                </View>
              );
            })}
          </View>

          {/* Sum details */}
          <View style={styles.chartFooter}>
            <Text style={styles.footerText}>
              إجمالي الفترة:{" "}
              <Text style={styles.whiteText}>
                {dailySales.reduce((s, d) => s + d.total, 0).toLocaleString()} د.ع
              </Text>
            </Text>
            <Text style={styles.footerText}>
              عدد الطلبات:{" "}
              <Text style={styles.whiteText}>
                {dailySales.reduce((s, d) => s + d.count, 0)}
              </Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#09090b", // zinc-950
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderColor: "#18181b",
  },
  headerTextContainer: {
    alignItems: "flex-end",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#f97316",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#71717a",
    marginTop: 4,
  },
  backBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backBtnText: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "bold",
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  metricGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 12,
  },
  metricCard: {
    width: "48%", // 2 columns layout on mobile
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 16,
    padding: 16,
    alignItems: "flex-end",
  },
  metricHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  metricLabel: {
    fontSize: 10,
    color: "#71717a",
    fontWeight: "500",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  currencyText: {
    fontSize: 9,
    color: "#71717a",
    marginTop: 2,
  },
  card: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 20,
    padding: 20,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 16,
    textAlign: "right",
  },
  breakdownRow: {
    flexDirection: "row-reverse",
    gap: 12,
  },
  breakdownItem: {
    flex: 1,
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 12,
    padding: 12,
    alignItems: "flex-end",
  },
  breakdownHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  breakdownLabel: {
    fontSize: 10,
    color: "#71717a",
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: "bold",
  },
  chartContainer: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 160,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: "#27272a",
  },
  chartBarWrapper: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  barValueText: {
    fontSize: 8,
    color: "#71717a",
    fontWeight: "500",
  },
  barTrack: {
    width: 14,
    height: 100,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
  },
  barFill: {
    width: "100%",
    borderRadius: 4,
    backgroundColor: "#ea580c",
  },
  barLabelText: {
    fontSize: 8,
    color: "#71717a",
    marginTop: 4,
  },
  barCountText: {
    fontSize: 7,
    color: "#71717a",
  },
  chartFooter: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginTop: 12,
  },
  footerText: {
    fontSize: 11,
    color: "#71717a",
  },
  whiteText: {
    color: "#f4f4f5",
    fontWeight: "bold",
  },
});
