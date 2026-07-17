import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../../../lib/supabaseClient";
import {
  createRealtimeChannel,
  teardownRealtimeChannel,
} from "../../../../lib/realtimeChannel";
import { Feather } from "@expo/vector-icons";

interface WalletTopup {
  id: string;
  user_id: string;
  amount: number;
  receipt_url: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  profiles?: { full_name: string | null; phone_number: string | null } | null;
}

export default function FinanceScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const isNarrow = width < 420;
  const router = useRouter();
  const [requests, setRequests] = useState<WalletTopup[]>([]);
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
        .from("wallet_topups")
        .select("*, profiles(full_name, phone_number)")
        .order("created_at", { ascending: false });

      if (error) {
        const fallback = await supabase
          .from("wallet_topups")
          .select("*")
          .order("created_at", { ascending: false });
        data = fallback.data;
      }

      setRequests((data || []) as WalletTopup[]);
    } catch (err) {
      console.error("Error fetching wallet topups:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();

    const channel = createRealtimeChannel("admin-wallet-topups-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_topups" }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => {
      teardownRealtimeChannel(channel);
    };
  }, []);

  const handleApprove = (req: WalletTopup) => {
    Alert.alert("تأكيد الشحن", `إضافة ${req.amount.toLocaleString()} د.ع إلى محفظة المستخدم؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "نعم، تأكيد",
        onPress: async () => {
          setProcessing(req.id);
          try {
            const { data: profile, error: profileErr } = await supabase
              .from("profiles")
              .select("balance")
              .eq("id", req.user_id)
              .single();

            if (profileErr) throw profileErr;

            const newBalance = (profile?.balance || 0) + req.amount;
            const { error: balanceErr } = await supabase
              .from("profiles")
              .update({ balance: newBalance })
              .eq("id", req.user_id);

            if (balanceErr) throw balanceErr;

            const { error } = await supabase
              .from("wallet_topups")
              .update({ status: "approved" })
              .eq("id", req.id);

            if (error) throw error;

            setRequests((prev) =>
              prev.map((r) => (r.id === req.id ? { ...r, status: "approved" } : r))
            );
            showToast("تم شحن المحفظة بنجاح ✓");

            await supabase.from("notifications").insert({
              user_id: req.user_id,
              title: "تم شحن محفظتك ✓",
              message: `تمت إضافة ${req.amount.toLocaleString()} د.ع إلى رصيد محفظتك بعد مراجعة الوصل.`,
              is_read: false,
            });
          } catch (err) {
            console.error(err);
            showToast("فشل تأكيد الشحن", "error");
          } finally {
            setProcessing(null);
          }
        },
      },
    ]);
  };

  const handleReject = (req: WalletTopup) => {
    Alert.alert("تأكيد الرفض", "هل تريد رفض طلب الشحن هذا؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "رفض الطلب",
        style: "destructive",
        onPress: async () => {
          setProcessing(req.id);
          try {
            const { error } = await supabase
              .from("wallet_topups")
              .update({ status: "rejected" })
              .eq("id", req.id);

            if (error) throw error;

            setRequests((prev) =>
              prev.map((r) => (r.id === req.id ? { ...r, status: "rejected" } : r))
            );
            showToast("تم رفض الطلب");

            await supabase.from("notifications").insert({
              user_id: req.user_id,
              title: "تم رفض طلب الشحن",
              message: `تم رفض طلب شحن بمبلغ ${req.amount.toLocaleString()} د.ع. يرجى التحقق من الوصل وإعادة المحاولة.`,
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
  const approvedTotal = requests
    .filter((r) => r.status === "approved")
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

      <View style={[styles.header, isTablet && styles.centeredContent]}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>طلبات المحفظة</Text>
          <Text style={styles.headerSubtitle}>مراجعة وتأكيد طلبات شحن المحفظة</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.refreshBtn} onPress={fetchRequests}>
            <Feather name="refresh-cw" size={16} color="#f4f4f5" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/admin" as any)}
            style={styles.backBtn}
          >
            <Feather name="arrow-right" size={16} color="#a1a1aa" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, isTablet && styles.centeredContent]}>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { width: isNarrow ? "100%" : isTablet ? "31.5%" : "48%" }]}>
            <Feather name="clock" size={16} color="#fbbf24" style={styles.statIcon} />
            <Text style={[styles.statValue, { color: "#fbbf24" }]}>{pendingRequests.length}</Text>
            <Text style={styles.statLabel}>طلبات معلقة</Text>
          </View>

          <View style={[styles.statCard, { width: isNarrow ? "100%" : isTablet ? "31.5%" : "48%" }]}>
            <Feather name="dollar-sign" size={16} color="#ea580c" style={styles.statIcon} />
            <Text style={[styles.statValue, { color: "#ea580c" }]}>
              {pendingTotal.toLocaleString()} د.ع
            </Text>
            <Text style={styles.statLabel}>قيد المراجعة</Text>
          </View>

          <View style={[styles.statCard, { width: isNarrow ? "100%" : isTablet ? "31.5%" : "48%" }]}>
            <Feather name="check-circle" size={16} color="#10b981" style={styles.statIcon} />
            <Text style={[styles.statValue, { color: "#10b981" }]}>
              {approvedTotal.toLocaleString()} د.ع
            </Text>
            <Text style={styles.statLabel}>تم اعتمادها</Text>
          </View>
        </View>

        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>طلبات شحن المحفظة</Text>

          {requests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Feather name="credit-card" size={48} color="#27272a" />
              <Text style={styles.emptyText}>لا توجد طلبات شحن حالياً</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {requests.map((req) => {
                const isPending = req.status === "pending";
                const isApproved = req.status === "approved";
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
                      ) : isApproved ? (
                        <View style={styles.completedBadge}>
                          <Text style={styles.completedBadgeText}>معتمد</Text>
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
                      <Text style={styles.amountText}>المبلغ: {req.amount.toLocaleString()} د.ع</Text>
                      <Text style={styles.dateText}>
                        التاريخ: {new Date(req.created_at).toLocaleDateString("ar-SA")}
                      </Text>

                      {req.receipt_url ? (
                        <TouchableOpacity
                          style={styles.receiptPreview}
                          onPress={() => Linking.openURL(req.receipt_url!)}
                        >
                          <Image
                            source={{ uri: req.receipt_url }}
                            style={styles.receiptImage}
                            resizeMode="cover"
                          />
                          <Text style={styles.receiptLink}>عرض الوصل</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.cardText}>لا يوجد وصل مرفق</Text>
                      )}
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
                            <Text style={styles.approveBtnText}>اعتماد وإضافة الرصيد</Text>
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
    backgroundColor: "#09090b",
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
    flex: 1,
    flexShrink: 1,
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
    textAlign: "right",
  },
  headerActions: {
    flexDirection: "row-reverse",
    gap: 8,
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
  backBtn: {
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
  centeredContent: {
    width: "100%",
    maxWidth: 1000,
    alignSelf: "center",
  },
  statsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  statCard: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    minHeight: 104,
  },
  statIcon: {
    marginBottom: 6,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
  },
  statLabel: {
    fontSize: 9,
    color: "#71717a",
    marginTop: 4,
    textAlign: "center",
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
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    color: "#71717a",
    fontSize: 14,
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
    gap: 12,
  },
  pendingCard: {
    borderColor: "rgba(251, 191, 36, 0.35)",
  },
  rejectedCard: {
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
  cardHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  requestCode: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  pendingBadge: {
    backgroundColor: "rgba(251, 191, 36, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pendingBadgeText: {
    color: "#fbbf24",
    fontSize: 11,
    fontWeight: "700",
  },
  completedBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  completedBadgeText: {
    color: "#10b981",
    fontSize: 11,
    fontWeight: "700",
  },
  rejectedBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  rejectedBadgeText: {
    color: "#ef4444",
    fontSize: 11,
    fontWeight: "700",
  },
  cardBody: {
    gap: 6,
    alignItems: "flex-end",
  },
  cardText: {
    color: "#d4d4d8",
    fontSize: 13,
    textAlign: "right",
    flexShrink: 1,
  },
  amountText: {
    color: "#ea580c",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
  },
  dateText: {
    color: "#71717a",
    fontSize: 12,
    textAlign: "right",
  },
  receiptPreview: {
    marginTop: 8,
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#27272a",
  },
  receiptImage: {
    width: "100%",
    height: 160,
    backgroundColor: "#09090b",
  },
  receiptLink: {
    color: "#60a5fa",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 8,
  },
  cardFooter: {
    flexDirection: "row-reverse",
    gap: 8,
    marginTop: 4,
    flexWrap: "wrap",
  },
  approveBtn: {
    flex: 1,
    minWidth: 180,
    backgroundColor: "#ea580c",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  approveBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 1,
  },
  rejectBtn: {
    paddingHorizontal: 18,
    minHeight: 48,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3f3f46",
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtnText: {
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
