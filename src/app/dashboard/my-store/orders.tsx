import React, { useEffect, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Link } from "expo-router";
import { supabase } from "../../../../lib/supabaseClient";
import {
  createRealtimeChannel,
  teardownRealtimeChannel,
} from "../../../../lib/realtimeChannel";
import { Feather } from "@expo/vector-icons";

interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

interface SellerOrder {
  id: string;
  buyer_id: string;
  total: number;
  status: string;
  seller_status: string;
  reject_reason: string | null;
  items: OrderItem[] | string;
  created_at: string;
  governorate?: string;
  delivery_zone?: string;
  shipping_cost?: number;
  full_address?: string;
  profiles?: { full_name: string | null; phone_number: string | null } | null;
}

const SELLER_STATUSES: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: "بانتظار الموافقة", icon: "clock", color: "#fb923c" },
  accepted: { label: "تم القبول", icon: "check-circle", color: "#34d399" },
  processing: { label: "قيد التجهيز", icon: "package", color: "#60a5fa" },
  delivered: { label: "تم التسليم", icon: "truck", color: "#c084fc" },
  rejected: { label: "مرفوض", icon: "x-circle", color: "#f87171" },
};

const STATUS_PROGRESSION = ["accepted", "processing", "delivered"];

function parseOrderItems(items: OrderItem[] | string): OrderItem[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  try {
    return JSON.parse(items);
  } catch {
    return [];
  }
}

export default function SellerOrdersScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const router = useRouter();
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const contentWidth = Math.min(windowWidth, 960);

  // Success/error notifications
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const triggerToast = (msg: string, type: "success" | "error" = "success") => {
    if (type === "success") {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  const fetchOrders = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("sales_orders")
        .select("*, profiles:buyer_id(full_name, phone_number)")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Fetch seller orders error:", error.message);
      }

      setOrders((data as SellerOrder[]) || []);
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
    triggerToast("تم تحديث الطلبات");
  };

  useEffect(() => {
    fetchOrders();

    const channel = createRealtimeChannel("seller-orders-rt-rn")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales_orders" },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      teardownRealtimeChannel(channel);
    };
  }, []);

  // Accept Order
  const handleAccept = async (orderId: string, buyerId: string) => {
    setProcessing(orderId);
    try {
      const { error } = await supabase
        .from("sales_orders")
        .update({ seller_status: "accepted" })
        .eq("id", orderId);

      if (error) {
        triggerToast("فشل قبول الطلب", "error");
      } else {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, seller_status: "accepted" } : o))
        );
        triggerToast("تم قبول الطلب ✓");

        // Notify buyer
        await supabase.from("notifications").insert({
          user_id: buyerId,
          title: "تم قبول طلبك! ✅",
          message: `تم قبول طلبك #${orderId.slice(0, 8).toUpperCase()} من قبل البائع وسيتم تجهيزه قريباً`,
          is_read: false,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(null);
    }
  };

  // Reject Order + Wallet Refund
  const handleReject = async () => {
    if (!rejectingOrderId) return;
    const order = orders.find((o) => o.id === rejectingOrderId);
    if (!order) return;

    setProcessing(rejectingOrderId);
    try {
      const { error } = await supabase
        .from("sales_orders")
        .update({
          seller_status: "rejected",
          reject_reason: rejectReason.trim() || "لم يتم تحديد السبب",
        })
        .eq("id", rejectingOrderId);

      if (error) {
        triggerToast("فشل رفض الطلب", "error");
      } else {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === rejectingOrderId
              ? {
                  ...o,
                  seller_status: "rejected",
                  reject_reason: rejectReason.trim() || "لم يتم تحديد السبب",
                }
              : o
          )
        );

        // Refund buyer wallet
        const { data: buyerProfile } = await supabase
          .from("profiles")
          .select("balance")
          .eq("id", order.buyer_id)
          .maybeSingle();

        if (buyerProfile) {
          const newBalance = (buyerProfile.balance || 0) + order.total;
          await supabase
            .from("profiles")
            .update({ balance: newBalance })
            .eq("id", order.buyer_id);
        }

        triggerToast("تم رفض الطلب وإعادة المبلغ للمشتري");

        // Notify buyer
        await supabase.from("notifications").insert({
          user_id: order.buyer_id,
          title: "تم رفض طلبك واسترداد المبلغ ❌💰",
          message: `تم رفض طلبك #${rejectingOrderId.slice(0, 8).toUpperCase()} وتمت إعادة ${order.total} د.ع إلى رصيدك. السبب: ${rejectReason.trim() || "لم يتم تحديد السبب"}`,
          is_read: false,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRejectingOrderId(null);
      setRejectReason("");
      setProcessing(null);
    }
  };

  // Update Status
  const handleStatusUpdate = async (orderId: string, newStatus: string, buyerId: string) => {
    setProcessing(orderId);
    try {
      const { error } = await supabase
        .from("sales_orders")
        .update({ seller_status: newStatus })
        .eq("id", orderId);

      if (error) {
        triggerToast("فشل تحديث الحالة", "error");
      } else {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, seller_status: newStatus } : o))
        );
        const label = SELLER_STATUSES[newStatus]?.label || newStatus;
        triggerToast(`تم تحديث الحالة: ${label}`);

        // Notify buyer
        await supabase.from("notifications").insert({
          user_id: buyerId,
          title: "تحديث حالة طلبك",
          message: `طلبك #${orderId.slice(0, 8).toUpperCase()} الآن: "${label}"`,
          is_read: false,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setStatusMenuId(null);
      setProcessing(null);
    }
  };

  const pendingCount = useMemo(() => orders.filter((o) => o.seller_status === "pending").length, [orders]);
  const acceptedCount = useMemo(
    () => orders.filter((o) => ["accepted", "processing", "delivered"].includes(o.seller_status)).length,
    [orders]
  );
  const totalSales = useMemo(() => orders.reduce((sum, o) => sum + o.total, 0), [orders]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {successMsg && (
        <View style={styles.toastSuccess}>
          <Text style={styles.toastText}>{successMsg}</Text>
        </View>
      )}
      {errorMsg && (
        <View style={styles.toastError}>
          <Text style={styles.toastText}>{errorMsg}</Text>
        </View>
      )}

      {/* Reject reason modal */}
      <Modal visible={rejectingOrderId != null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Feather name="alert-triangle" size={18} color="#ef4444" />
              <Text style={styles.modalTitle}>رفض الطلب</Text>
            </View>
            <Text style={styles.modalSubtitle}>يرجى كتابة سبب الرفض ليتم إعلام المشتري:</Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="مثال: الكتاب غير متوفر حالياً..."
              placeholderTextColor="#71717a"
              multiline
              numberOfLines={3}
              style={styles.modalTextArea}
              textAlign="right"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setRejectingOrderId(null);
                  setRejectReason("");
                }}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleReject} style={styles.confirmRejectButton}>
                <Text style={styles.confirmRejectText}>تأكيد الرفض</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={[styles.header, { width: contentWidth, alignSelf: "center" }]}>
        <TouchableOpacity onPress={handleRefresh} disabled={refreshing} style={styles.refreshButton}>
          <Feather name="refresh-cw" size={16} color="#f4f4f5" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Link href={"/dashboard/my-store" as any} asChild>
              <TouchableOpacity>
                <Feather name="arrow-right" size={20} color="#f4f4f5" />
              </TouchableOpacity>
            </Link>
            <Text style={styles.title}>طلبات متجري</Text>
          </View>
          <Text style={styles.subtitle}>
            {orders.length} طلب — {pendingCount} بانتظار الموافقة
          </Text>
        </View>
      </View>

      {/* Metrics Row */}
      <View style={[styles.metricsRow, { width: contentWidth, alignSelf: "center" }]}>
        <View style={styles.metricBox}>
          <Text style={[styles.metricValue, { color: "#fb923c" }]}>{pendingCount}</Text>
          <Text style={styles.metricLabel}>بانتظار الموافقة</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={[styles.metricValue, { color: "#34d399" }]}>{acceptedCount}</Text>
          <Text style={styles.metricLabel}>طلبات مقبولة</Text>
        </View>
        <View style={styles.metricBox}>
          <Text style={[styles.metricValue, { color: "#ea580c" }]}>{totalSales.toLocaleString()} د.ع</Text>
          <Text style={styles.metricLabel}>إجمالي المبيعات</Text>
        </View>
      </View>

      {/* Orders List */}
      {orders.length === 0 ? (
        <View style={[styles.emptyContainer, { width: contentWidth, alignSelf: "center" }]}>
          <Feather name="shopping-bag" size={64} color="#27272a" />
          <Text style={styles.emptyTitle}>لا توجد طلبات بعد</Text>
          <Text style={styles.emptySubtitle}>عندما يشتري أحد من متجرك ستظهر طلبات الزبائن هنا</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { width: contentWidth, alignSelf: "center" },
          ]}
          renderItem={({ item }) => {
            const parsedItems = parseOrderItems(item.items);
            const statusConfig = SELLER_STATUSES[item.seller_status] || SELLER_STATUSES.pending;
            const isNew = item.seller_status === "pending";
            const isRejected = item.seller_status === "rejected";
            const canProgress = STATUS_PROGRESSION.includes(item.seller_status);
            const currentProgressIdx = STATUS_PROGRESSION.indexOf(item.seller_status);
            const nextStatuses = STATUS_PROGRESSION.slice(currentProgressIdx + 1);

            return (
              <View style={[styles.orderCard, isNew && styles.orderCardNew, isRejected && styles.orderCardRejected]}>
                {/* Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.headerLeft}>
                    <Text style={styles.orderTotal}>{item.total.toLocaleString()} د.ع</Text>
                  </View>
                  <View style={styles.headerRight}>
                    <Text style={styles.orderId}>#{item.id.slice(0, 8).toUpperCase()}</Text>
                    {isNew && <Text style={styles.newBadge}>🔔 جديد</Text>}
                    <View style={[styles.statusTag, { borderColor: `${statusConfig.color}40`, backgroundColor: `${statusConfig.color}15` }]}>
                      <Text style={[styles.statusTagText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                    </View>
                  </View>
                </View>

                {/* Buyer info */}
                <View style={styles.buyerRow}>
                  <Text style={styles.buyerText}>
                    الزبون: <Text style={styles.boldText}>{item.profiles?.full_name || "مشتري"}</Text>
                  </Text>
                  {item.profiles?.phone_number ? (
                    <Text style={styles.buyerPhone}>{item.profiles.phone_number}</Text>
                  ) : null}
                </View>

                {item.full_address ? (
                  <View style={styles.addressRow}>
                    <Feather name="map-pin" size={10} color="#ea580c" style={styles.pinIcon} />
                    <Text style={styles.addressText}>
                      {item.governorate} — {item.delivery_zone} — {item.full_address}
                    </Text>
                  </View>
                ) : null}

                {/* Items */}
                <View style={styles.itemsBlock}>
                  {parsedItems.map((prod, idx) => (
                    <View key={idx} style={styles.itemRow}>
                      <Text style={styles.itemSubtotal}>{prod.subtotal} د.ع</Text>
                      <View style={styles.itemNameWrapper}>
                        <Feather name="package" size={12} color="#71717a" />
                        <Text style={styles.itemName}>{prod.name}</Text>
                        <Text style={styles.itemQty}>×{prod.quantity}</Text>
                      </View>
                    </View>
                  ))}
                  {item.shipping_cost != null && item.shipping_cost > 0 ? (
                    <View style={styles.shippingRow}>
                      <Text style={styles.shippingCost}>{item.shipping_cost} د.ع</Text>
                      <Text style={styles.shippingLabel}>رسوم التوصيل</Text>
                    </View>
                  ) : null}
                </View>

                {isRejected && item.reject_reason ? (
                  <View style={styles.rejectReasonBlock}>
                    <Text style={styles.rejectReasonText}>سبب الرفض: {item.reject_reason}</Text>
                  </View>
                ) : null}

                {/* Actions */}
                <View style={styles.cardActions}>
                  {isNew && (
                    <View style={styles.actionButtonsRow}>
                      <TouchableOpacity
                        onPress={() => handleAccept(item.id, item.buyer_id)}
                        disabled={processing === item.id}
                        style={styles.acceptButton}
                      >
                        <Text style={styles.actionButtonText}>قبول الطلب</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setRejectingOrderId(item.id)}
                        disabled={processing === item.id}
                        style={styles.rejectButton}
                      >
                        <Text style={styles.rejectButtonText}>رفض الطلب</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {canProgress && nextStatuses.length > 0 && (
                    <View style={styles.statusUpdateWrapper}>
                      <TouchableOpacity
                        onPress={() => setStatusMenuId(statusMenuId === item.id ? null : item.id)}
                        style={styles.updateStatusButton}
                      >
                        <Feather name="chevron-down" size={14} color="#ea580c" />
                        <Text style={styles.updateStatusButtonText}>تحديث حالة التجهيز</Text>
                      </TouchableOpacity>

                      {statusMenuId === item.id && (
                        <View style={styles.statusDropdown}>
                          {nextStatuses.map((statusKey) => (
                            <TouchableOpacity
                              key={statusKey}
                              onPress={() => handleStatusUpdate(item.id, statusKey, item.buyer_id)}
                              style={styles.dropdownItem}
                            >
                              <Text style={styles.dropdownItemText}>{SELLER_STATUSES[statusKey]?.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}

                  {!isRejected && (
                    <Link
                      href={{
                        pathname: "/dashboard/chat" as any,
                        params: { conv: item.id },
                      }}
                      asChild
                    >
                      <TouchableOpacity style={styles.chatButton}>
                        <Feather name="message-square" size={12} color="#71717a" style={styles.chatIcon} />
                        <Text style={styles.chatButtonText}>مراسلة المشتري</Text>
                      </TouchableOpacity>
                    </Link>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b", // zinc-950
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
  },
  toastSuccess: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderColor: "rgba(52, 211, 153, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 10,
  },
  toastError: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 10,
  },
  toastText: {
    color: "#f4f4f5",
    fontSize: 13,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f87171",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#a1a1aa",
    marginBottom: 12,
    textAlign: "right",
  },
  modalTextArea: {
    backgroundColor: "#09090b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    color: "#f4f4f5",
    fontSize: 13,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#27272a",
  },
  cancelButtonText: {
    color: "#f4f4f5",
    fontSize: 13,
  },
  confirmRejectButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#ef4444",
  },
  confirmRejectText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  refreshButton: {
    width: 40,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 180,
    alignItems: "flex-end",
  },
  titleRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#f4f4f5",
    flexShrink: 1,
    textAlign: "right",
  },
  subtitle: {
    fontSize: 12,
    color: "#a1a1aa",
    marginTop: 4,
  },
  metricsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 20,
  },
  metricBox: {
    flex: 1,
    minWidth: 100,
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
  metricLabel: {
    fontSize: 9,
    color: "#71717a",
    marginTop: 2,
    textAlign: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#71717a",
    textAlign: "center",
    paddingHorizontal: 32,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  orderCard: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  orderCardNew: {
    borderColor: "rgba(251, 146, 60, 0.4)",
    borderWidth: 1.5,
  },
  orderCardRejected: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "rgba(39, 39, 42, 0.5)",
    paddingBottom: 10,
    marginBottom: 10,
  },
  headerRight: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    flexShrink: 1,
    alignItems: "center",
    gap: 8,
  },
  orderId: {
    fontSize: 11,
    color: "#71717a",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  newBadge: {
    fontSize: 10,
    color: "#fb923c",
    fontWeight: "bold",
  },
  statusTag: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusTagText: {
    fontSize: 9,
    fontWeight: "bold",
  },
  orderTotal: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#ea580c",
  },
  headerLeft: {},
  buyerRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  buyerText: {
    fontSize: 12,
    color: "#a1a1aa",
    flexShrink: 1,
  },
  boldText: {
    color: "#f4f4f5",
    fontWeight: "bold",
  },
  buyerPhone: {
    fontSize: 12,
    color: "#71717a",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  addressRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    marginBottom: 10,
  },
  pinIcon: {
    marginLeft: 2,
  },
  addressText: {
    fontSize: 11,
    color: "#71717a",
    textAlign: "right",
    flex: 1,
  },
  itemsBlock: {
    backgroundColor: "#09090b",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  itemNameWrapper: {
    flexDirection: "row-reverse",
    flex: 1,
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  itemName: {
    fontSize: 12,
    color: "#f4f4f5",
    flexShrink: 1,
    textAlign: "right",
  },
  itemQty: {
    fontSize: 11,
    color: "#71717a",
  },
  itemSubtotal: {
    fontSize: 12,
    color: "#a1a1aa",
  },
  shippingRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(39, 39, 42, 0.5)",
    paddingTop: 6,
    marginTop: 6,
  },
  shippingLabel: {
    fontSize: 11,
    color: "#71717a",
  },
  shippingCost: {
    fontSize: 11,
    color: "#a1a1aa",
  },
  rejectReasonBlock: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  rejectReasonText: {
    color: "#ef4444",
    fontSize: 11,
    textAlign: "right",
  },
  cardActions: {
    gap: 8,
  },
  actionButtonsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  acceptButton: {
    flex: 1,
    minWidth: 120,
    minHeight: 38,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
  },
  rejectButton: {
    flex: 1,
    minWidth: 120,
    minHeight: 38,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectButtonText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "bold",
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "bold",
  },
  statusUpdateWrapper: {
    position: "relative",
    width: "100%",
  },
  updateStatusButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 38,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(234, 88, 12, 0.1)",
    borderColor: "rgba(234, 88, 12, 0.25)",
    borderWidth: 1,
  },
  updateStatusButtonText: {
    color: "#ea580c",
    fontSize: 12,
    fontWeight: "bold",
  },
  statusDropdown: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#09090b",
    alignItems: "center",
  },
  dropdownItemText: {
    color: "#f4f4f5",
    fontSize: 12,
    fontWeight: "600",
  },
  chatButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 32,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderColor: "#27272a",
    borderWidth: 1,
    marginTop: 4,
  },
  chatIcon: {
    marginLeft: 4,
  },
  chatButtonText: {
    color: "#71717a",
    fontSize: 11,
    fontWeight: "500",
  },
});
