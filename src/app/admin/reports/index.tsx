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
import { supabase } from "../../../../lib/supabaseClient";
import { Feather, FontAwesome, Ionicons } from "@expo/vector-icons";

interface Order {
  id: string;
  status: string;
  copies: number;
  color_mode: string;
  num_copies?: number;
  a4_color_type?: string;
  total_price?: number;
  created_at: string;
}

interface DayData {
  label: string;
  count: number;
}

export default function ReportsScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [bwPrice, setBwPrice] = useState(150);
  const [colorPrice, setColorPrice] = useState(500);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    try {
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, status, copies, color_mode, num_copies, a4_color_type, total_price, created_at")
        .order("created_at", { ascending: false });

      setOrders(ordersData || []);

      const { count } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "student");

      setTotalStudents(count || 0);

      const { data: settings } = await supabase
        .from("site_settings")
        .select("key, value")
        .in("key", ["bw_page_price", "color_page_price"]);

      if (settings) {
        for (const s of settings) {
          if (s.key === "bw_page_price") setBwPrice(Number(s.value) || 150);
          if (s.key === "color_page_price") setColorPrice(Number(s.value) || 500);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    showToast("تم تحديث البيانات");
  };

  const pendingCount = orders.filter((o) => o.status === "Pending").length;
  const printingCount = orders.filter((o) => o.status === "Printing").length;
  const completedCount = orders.filter((o) => o.status === "Completed").length;
  const rejectedCount = orders.filter((o) => o.status === "Rejected").length;

  const totalRevenue = orders
    .filter((o) => o.status === "Completed")
    .reduce((acc, o) => {
      if (o.total_price != null) return acc + o.total_price;
      const price = (o.a4_color_type || o.color_mode) === "color" ? colorPrice : bwPrice;
      return acc + (o.num_copies ?? o.copies ?? 1) * price;
    }, 0);

  const getLast7Days = (): DayData[] => {
    const days: DayData[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const label = date.toLocaleDateString("ar-SA", { weekday: "short" });
      const count = orders.filter(
        (o) => o.created_at?.split("T")[0] === dateStr
      ).length;
      days.push({ label, count });
    }
    return days;
  };

  const dailyData = getLast7Days();
  const maxDaily = Math.max(...dailyData.map((d) => d.count), 1);

  const statusData = [
    { label: "قيد الانتظار", count: pendingCount, color: "#fbbf24", bg: "rgba(251, 191, 36, 0.1)" },
    { label: "جاري الطباعة", count: printingCount, color: "#60a5fa", bg: "rgba(96, 165, 250, 0.1)" },
    { label: "مكتمل", count: completedCount, color: "#10b981", bg: "rgba(16, 185, 129, 0.1)" },
    { label: "مرفوض", count: rejectedCount, color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" },
  ];
  const totalForDist = orders.length || 1;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {toast && (
        <View style={[styles.toastAlert, toast.type === "error" ? styles.toastError : styles.toastSuccess]}>
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>التقارير والإحصائيات</Text>
          <Text style={styles.headerSubtitle}>مؤشرات أداء الطباعة الإجمالية وحالة الطلبات</Text>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color="#f4f4f5" />
          ) : (
            <Feather name="refresh-cw" size={16} color="#f4f4f5" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Metric Cards Grid */}
        <View style={styles.metricGrid}>
          {/* Students */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(96, 165, 250, 0.1)" }]}>
                <Feather name="users" size={16} color="#60a5fa" />
              </View>
              <Text style={styles.metricLabel}>إجمالي الطلاب</Text>
            </View>
            <Text style={styles.metricValue}>{totalStudents}</Text>
          </View>

          {/* Orders */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(234, 88, 12, 0.1)" }]}>
                <Feather name="package" size={16} color="#ea580c" />
              </View>
              <Text style={styles.metricLabel}>إجمالي الطلبات</Text>
            </View>
            <Text style={styles.metricValue}>{orders.length}</Text>
          </View>

          {/* Completed */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(16, 185, 129, 0.1)" }]}>
                <Feather name="check-circle" size={16} color="#10b981" />
              </View>
              <Text style={styles.metricLabel}>الطلبات المكتملة</Text>
            </View>
            <Text style={styles.metricValue}>{completedCount}</Text>
          </View>

          {/* Revenue */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(251, 191, 36, 0.1)" }]}>
                <Feather name="dollar-sign" size={16} color="#fbbf24" />
              </View>
              <Text style={styles.metricLabel}>الإيرادات المقدّرة</Text>
            </View>
            <Text style={[styles.metricValue, { fontSize: 13 }]} numberOfLines={1}>
              {totalRevenue.toLocaleString()} د.ع
            </Text>
          </View>
        </View>

        {/* Weekly Bar Chart */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>الطلبات خلال الأسبوع</Text>

          <View style={styles.chartContainer}>
            {dailyData.map((day, i) => {
              const height = (day.count / maxDaily) * 100;
              return (
                <View key={i} style={styles.barColumn}>
                  <Text style={styles.barValText}>{day.count}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: `${Math.max(height, 5)}%` }]} />
                  </View>
                  <Text style={styles.barLabel}>{day.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Status Distribution percentages progress-bars */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>توزيع حالات الطلبات</Text>

          <View style={styles.distContainer}>
            {statusData.map((item, idx) => {
              const pct = (item.count / totalForDist) * 100;
              return (
                <View key={idx} style={styles.distRow}>
                  <View style={styles.distLabelRow}>
                    <Text style={styles.distCountText}>{item.count} طلب ({pct.toFixed(0)}%)</Text>
                    <Text style={[styles.distLabel, { color: item.color }]}>{item.label}</Text>
                  </View>

                  <View style={styles.distTrack}>
                    <View
                      style={[
                        styles.distFill,
                        {
                          width: `${pct}%`,
                          backgroundColor: item.color,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
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
  toastAlert: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    zIndex: 99,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  toastSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  toastError: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  toastText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
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
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    alignItems: "center",
    justifyContent: "center",
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
    width: "48%",
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
    marginBottom: 8,
  },
  iconWrapper: {
    width: 28,
    height: 28,
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
    color: "#f4f4f5",
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
    marginBottom: 20,
    textAlign: "right",
  },
  chartContainer: {
    flexDirection: "row-reverse",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 140,
    paddingTop: 10,
  },
  barColumn: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  barValText: {
    fontSize: 9,
    color: "#71717a",
  },
  barTrack: {
    width: 14,
    height: 80,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  barFill: {
    width: "100%",
    borderRadius: 4,
    backgroundColor: "#ea580c",
  },
  barLabel: {
    fontSize: 9,
    color: "#71717a",
    marginTop: 4,
  },
  distContainer: {
    gap: 16,
  },
  distRow: {
    gap: 8,
  },
  distLabelRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  distLabel: {
    fontSize: 12,
    fontWeight: "bold",
  },
  distCountText: {
    fontSize: 11,
    color: "#71717a",
  },
  distTrack: {
    height: 8,
    backgroundColor: "#09090b",
    borderRadius: 4,
    overflow: "hidden",
    width: "100%",
  },
  distFill: {
    height: "100%",
    borderRadius: 4,
  },
});
