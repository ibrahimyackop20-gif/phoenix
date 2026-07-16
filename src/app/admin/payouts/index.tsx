import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../../lib/supabaseClient";
import {
  createRealtimeChannel,
  teardownRealtimeChannel,
} from "../../../../lib/realtimeChannel";
import { Feather, FontAwesome, Ionicons } from "@expo/vector-icons";

interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  details: string;
  status: string;
  created_at: string;
  processed_at: string | null;
  profiles?: { full_name: string | null; phone_number: string | null } | null;
}

const METHOD_LABELS: Record<string, string> = {
  zaincash: "زين كاش",
  asiahawala: "آسيا حوالة",
  cash: "نقداً",
};

export default function AdminPayoutsScreen() {
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchRequests = async () => {
    try {
      let { data, error } = await supabase
        .from("withdrawals")
        .select("*, profiles(full_name, phone_number)")
        .order("created_at", { ascending: false });

      if (error) {
        const fallback = await supabase
          .from("withdrawals")
          .select("*")
          .order("created_at", { ascending: false });
        data = fallback.data;
      }

      setRequests((data || []) as WithdrawalRequest[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();

    const channel = createRealtimeChannel("admin-withdrawals-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawals" }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => {
      teardownRealtimeChannel(channel);
    };
  }, []);

  const handleApprove = (req: WithdrawalRequest) => {
    Alert.alert("تأكيد التحويل", `هل أنت متأكد من تحويل ${req.amount.toLocaleString()} د.ع؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "نعم، تم التحويل",
        onPress: async () => {
          setProcessing(req.id);
          try {
            const { error } = await supabase
              .from("withdrawals")
              .update({ status: "completed", processed_at: new Date().toISOString() })
              .eq("id", req.id);

            if (error) throw error;

            setRequests((prev) =>
              prev.map((r) =>
                r.id === req.id
                  ? { ...r, status: "completed", processed_at: new Date().toISOString() }
                  : r
              )
            );
            showToast("تم تأكيد التحويل ✓");

            await supabase.from("notifications").insert({
              user_id: req.user_id,
              title: "تم تحويل أرباحك بنجاح! 💰",
              message: `تم تحويل ${req.amount.toLocaleString()} د.ع إلى حساب ${METHOD_LABELS[req.method] || req.method} الخاص بك (${req.details})`,
              is_read: false,
            });
          } catch (err) {
            showToast("فشل تأكيد التحويل", "error");
          } finally {
            setProcessing(null);
          }
        },
      },
    ]);
  };

  const handleReject = (req: WithdrawalRequest) => {
    Alert.alert("تأكيد الرفض", "هل تريد رفض هذا الطلب وإعادة المبلغ لرصيد المستخدم؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "رفض الطلب",
        style: "destructive",
        onPress: async () => {
          setProcessing(req.id);
          try {
            const { error } = await supabase
              .from("withdrawals")
              .update({ status: "rejected", processed_at: new Date().toISOString() })
              .eq("id", req.id);

            if (error) throw error;

            const { data: profile } = await supabase
              .from("profiles")
              .select("balance")
              .eq("id", req.user_id)
              .single();

            if (profile) {
              const newBalance = (profile.balance || 0) + req.amount;
              await supabase
                .from("profiles")
                .update({ balance: newBalance })
                .eq("id", req.user_id);
            }

            setRequests((prev) =>
              prev.map((r) =>
                r.id === req.id
                  ? { ...r, status: "rejected", processed_at: new Date().toISOString() }
                  : r
              )
            );
            showToast("تم رفض الطلب وإعادة المبلغ");

            await supabase.from("notifications").insert({
              user_id: req.user_id,
              title: "تم رفض طلب السحب ❌",
              message: `تم رفض طلب سحب ${req.amount.toLocaleString()} د.ع وإعادة المبلغ إلى رصيدك`,
              is_read: false,
            });
          } catch (err) {
            showToast("فشل رفض الطلب", "error");
          } finally {
            setProcessing(null);
          }
        },
      },
    ]);
  };

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const pendingTotal = pendingRequests.reduce((sum, r) => sum + r.amount, 0);
  const completedTotal = requests
    .filter((r) => r.status === "completed")
    .reduce((sum, r) => sum + r.amount, 0);

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
          <Text style={styles.headerTitle}>إدارة السحوبات</Text>
          <Text style={styles.headerSubtitle}>مراجعة وتأكيد طلبات سحب الأرباح</Text>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={fetchRequests}>
          <Feather name="refresh-cw" size={16} color="#f4f4f5" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Stats Grid */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Feather name="clock" size={16} color="#fbbf24" style={styles.statIcon} />
            <Text style={[styles.statValue, { color: "#fbbf24" }]}>{pendingRequests.length}</Text>
            <Text style={styles.statLabel}>طلبات معلقة</Text>
          </View>

          <View style={styles.statCard}>
            <Feather name="dollar-sign" size={16} color="#ea580c" style={styles.statIcon} />
            <Text style={[styles.statValue, { color: "#ea580c" }]}>
              {pendingTotal.toLocaleString()} د.ع
            </Text>
            <Text style={styles.statLabel}>قيد المعالجة</Text>
          </View>

          <View style={styles.statCard}>
            <Feather name="check-circle" size={16} color="#10b981" style={styles.statIcon} />
            <Text style={[styles.statValue, { color: "#10b981" }]}>
              {completedTotal.toLocaleString()} د.ع
            </Text>
            <Text style={styles.statLabel}>تم تحويلها</Text>
          </View>
        </View>

        {/* Requests List */}
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>طلبات سحب الأرباح</Text>

          {requests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Feather name="credit-card" size={48} color="#27272a" />
              <Text style={styles.emptyText}>لا توجد طلبات سحب حالياً</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {requests.map((req) => {
                const isPending = req.status === "pending";
                const isCompleted = req.status === "completed";
                const isRejected = req.status === "rejected";

                return (
                  <View
                    key={req.id}
                    style={[
                      styles.requestCard,
                      isPending && styles.pendingCard,
                      isRejected && styles.rejectedCard,
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.requestCode}>
                        #{req.id.slice(0, 8).toUpperCase()}
                      </Text>
                      {isPending ? (
                        <View style={styles.pendingBadge}>
                          <Text style={styles.pendingBadgeText}>معلق</Text>
                        </View>
                      ) : isCompleted ? (
                        <View style={styles.completedBadge}>
                          <Text style={styles.completedBadgeText}>مكتمل</Text>
                        </View>
                      ) : (
                        <View style={styles.rejectedBadge}>
                          <Text style={styles.rejectedBadgeText}>مرفوض</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.cardBody}>
                      <Text style={styles.cardText}>المستخدم: {req.profiles?.full_name || "—"}</Text>
                      <Text style={styles.cardText}>رقم الهاتف: {req.profiles?.phone_number || "—"}</Text>
                      <Text style={styles.cardText}>طريقة السحب: {METHOD_LABELS[req.method] || req.method}</Text>
                      <Text style={styles.cardText}>تفاصيل الحساب: {req.details}</Text>
                      <Text style={styles.amountText}>المبلغ: {req.amount.toLocaleString()} د.ع</Text>
                      <Text style={styles.dateText}>التاريخ: {new Date(req.created_at).toLocaleDateString("ar-SA")}</Text>
                    </View>

                    {isPending && (
                      <View style={styles.cardFooter}>
                        <TouchableOpacity
                          style={styles.approveBtn}
                          onPress={() => handleApprove(req)}
                          disabled={processing === req.id}
                        >
                          {processing === req.id ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text style={styles.approveBtnText}>تأكيد التحويل</Text>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.rejectBtn}
                          onPress={() => handleReject(req)}
                          disabled={processing === req.id}
                        >
                          <Text style={styles.rejectBtnText}>رفض</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
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
    gap: 20,
  },
  statsRow: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
  },
  statIcon: {
    marginBottom: 6,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "bold",
  },
  statLabel: {
    fontSize: 9,
    color: "#71717a",
    marginTop: 4,
  },
  listSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f4f4f5",
    textAlign: "right",
  },
  emptyContainer: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#71717a",
    fontSize: 13,
  },
  list: {
    gap: 12,
  },
  requestCard: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 16,
    padding: 16,
  },
  pendingCard: {
    borderColor: "rgba(251, 191, 36, 0.2)",
  },
  rejectedCard: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: "#27272a",
    paddingBottom: 10,
    marginBottom: 10,
  },
  requestCode: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#71717a",
  },
  pendingBadge: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  pendingBadgeText: {
    color: "#fbbf24",
    fontSize: 10,
    fontWeight: "bold",
  },
  completedBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  completedBadgeText: {
    color: "#10b981",
    fontSize: 10,
    fontWeight: "bold",
  },
  rejectedBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  rejectedBadgeText: {
    color: "#ef4444",
    fontSize: 10,
    fontWeight: "bold",
  },
  cardBody: {
    alignItems: "flex-end",
    gap: 4,
    marginBottom: 14,
  },
  cardText: {
    fontSize: 12,
    color: "#a1a1aa",
  },
  amountText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#ea580c",
    marginVertical: 4,
  },
  dateText: {
    fontSize: 9,
    color: "#71717a",
  },
  cardFooter: {
    flexDirection: "row-reverse",
    gap: 8,
    borderTopWidth: 1,
    borderColor: "#27272a",
    paddingTop: 12,
  },
  approveBtn: {
    flex: 1,
    backgroundColor: "#ea580c",
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "bold",
  },
  rejectBtn: {
    backgroundColor: "#27272a",
    borderWidth: 1,
    borderColor: "#ef4444",
    height: 38,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtnText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "bold",
  },
});
