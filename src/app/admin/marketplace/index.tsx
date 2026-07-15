import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../../lib/supabaseClient";
import { Feather, FontAwesome, Ionicons } from "@expo/vector-icons";

interface Category {
  id: string;
  name: string;
}

interface StoreData {
  id: string;
  name: string;
  is_verified: boolean;
  created_at: string;
  profiles?: { full_name: string | null } | null;
  owner_id: string;
}

interface SalesOrder {
  id: string;
  total: number;
  status: string;
  created_at: string;
  store_name?: string;
  items: { name: string; quantity: number; price: number; subtotal: number }[] | string;
  profiles?: { full_name: string | null } | null;
}

const statusLabels: Record<string, string> = {
  pending: "قيد التجهيز",
  shipped: "تم الشحن",
  ready: "جاهز للتسليم",
  delivered: "تم الاستلام",
};

function parseSaleItems(items: unknown): { name: string; quantity: number; price: number; subtotal: number }[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  try {
    return JSON.parse(items as string);
  } catch {
    return [];
  }
}

export default function AdminMarketplaceScreen() {
  const [tab, setTab] = useState<"categories" | "stores" | "sales">("categories");
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<StoreData[]>([]);
  const [sales, setSales] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    try {
      const { data: cats } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      setCategories(cats || []);

      const { data: storesData } = await supabase
        .from("stores")
        .select("*, profiles:owner_id(full_name)")
        .order("created_at", { ascending: false });
      setStores((storesData as StoreData[]) || []);

      const { data: salesData } = await supabase
        .from("sales_orders")
        .select("*, profiles:buyer_id(full_name)")
        .order("created_at", { ascending: false });
      setSales((salesData as SalesOrder[]) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("admin-sales-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sales_orders" }, () => {
        fetchData();
        showToast("🔔 طلب مبيعات جديد!");
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setAddingCat(true);

    try {
      const { error } = await supabase
        .from("categories")
        .insert({ name: newCatName.trim() });

      if (error) throw error;
      showToast("تم إضافة التصنيف");
      setNewCatName("");
      fetchData();
    } catch (err) {
      showToast("فشل إضافة التصنيف", "error");
    } finally {
      setAddingCat(false);
    }
  };

  const handleDeleteCategory = (id: string) => {
    Alert.alert("تأكيد الحذف", "هل تريد حذف هذا التصنيف؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("categories").delete().eq("id", id);
          if (error) {
            showToast("فشل حذف التصنيف", "error");
          } else {
            setCategories((prev) => prev.filter((c) => c.id !== id));
            showToast("تم حذف التصنيف");
          }
        },
      },
    ]);
  };

  const toggleVerify = async (storeId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from("stores")
        .update({ is_verified: !currentValue })
        .eq("id", storeId);

      if (error) throw error;

      setStores((prev) =>
        prev.map((s) =>
          s.id === storeId ? { ...s, is_verified: !currentValue } : s
        )
      );
      showToast(!currentValue ? "تم توثيق المتجر" : "تم إلغاء التوثيق");
    } catch (err) {
      showToast("فشل التحديث", "error");
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const { data: orderRow, error } = await supabase
        .from("sales_orders")
        .update({ status: newStatus })
        .eq("id", orderId)
        .select("buyer_id")
        .single();

      if (error) throw error;

      setSales((prev) =>
        prev.map((s) => (s.id === orderId ? { ...s, status: newStatus } : s))
      );
      showToast("تم تحديث حالة الطلب ✓");

      if (orderRow?.buyer_id) {
        const label = statusLabels[newStatus] || newStatus;
        await supabase.from("notifications").insert({
          user_id: orderRow.buyer_id,
          title: "تحديث حالة الطلب",
          message: `تحديث جديد: طلبك #${orderId.slice(0, 8).toUpperCase()} الآن في مرحلة "${label}"`,
          is_read: false,
        });
      }
    } catch (err) {
      showToast("فشل تحديث الحالة", "error");
    }
  };

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
          <Text style={styles.headerTitle}>إدارة السوق</Text>
          <Text style={styles.headerSubtitle}>إدارة التصنيفات، المتاجر وطلبات المبيعات</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Navigation Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === "categories" ? styles.tabBtnActive : styles.tabBtnInactive]}
            onPress={() => setTab("categories")}
          >
            <Text style={[styles.tabBtnText, tab === "categories" ? styles.whiteText : styles.mutedText]}>
              التصنيفات
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tab === "stores" ? styles.tabBtnActive : styles.tabBtnInactive]}
            onPress={() => setTab("stores")}
          >
            <Text style={[styles.tabBtnText, tab === "stores" ? styles.whiteText : styles.mutedText]}>
              المتاجر
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tab === "sales" ? styles.tabBtnActive : styles.tabBtnInactive]}
            onPress={() => setTab("sales")}
          >
            <Text style={[styles.tabBtnText, tab === "sales" ? styles.whiteText : styles.mutedText]}>
              المبيعات
            </Text>
          </TouchableOpacity>
        </View>

        {/* Categories Tab Content */}
        {tab === "categories" && (
          <View style={styles.tabContent}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>إضافة تصنيف جديد</Text>
              <View style={styles.addCatForm}>
                <TextInput
                  value={newCatName}
                  onChangeText={setNewCatName}
                  placeholder="مثال: هندسة معمارية"
                  placeholderTextColor="#71717a"
                  style={styles.textInput}
                  textAlign="right"
                />
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleAddCategory}
                  disabled={addingCat}
                >
                  {addingCat ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.submitBtnText}>إضافة</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.listContainer}>
              <Text style={styles.listTitle}>التصنيفات المتاحة</Text>
              {categories.map((c) => (
                <View key={c.id} style={styles.listItem}>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteCategory(c.id)}>
                    <Feather name="trash-2" size={14} color="#ef4444" />
                  </TouchableOpacity>
                  <Text style={styles.listItemText}>{c.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Stores Tab Content */}
        {tab === "stores" && (
          <View style={styles.tabContent}>
            <View style={styles.listContainer}>
              <Text style={styles.listTitle}>المتاجر المسجلة</Text>
              {stores.length === 0 ? (
                <Text style={styles.emptyText}>لا توجد متاجر حالياً</Text>
              ) : (
                stores.map((s) => (
                  <View key={s.id} style={styles.listItem}>
                    <TouchableOpacity
                      onPress={() => toggleVerify(s.id, s.is_verified)}
                      style={[
                        styles.verifyBtn,
                        s.is_verified ? styles.verifiedBtnBg : styles.unverifiedBtnBg,
                      ]}
                    >
                      <Text style={[styles.verifyBtnText, s.is_verified ? styles.verifiedText : styles.unverifiedText]}>
                        {s.is_verified ? "إلغاء التوثيق" : "توثيق"}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.storeInfoContainer}>
                      <View style={styles.storeNameRow}>
                        <Text style={styles.storeNameText}>{s.name}</Text>
                        {s.is_verified && (
                          <Ionicons name="checkmark-circle" size={14} color="#10b981" style={{ marginRight: 4 }} />
                        )}
                      </View>
                      <Text style={styles.storeOwnerText}>
                        المالك: {s.profiles?.full_name || "—"}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {/* Sales Orders Tab Content */}
        {tab === "sales" && (
          <View style={styles.tabContent}>
            <View style={styles.listContainer}>
              <Text style={styles.listTitle}>طلبات مبيعات المتجر</Text>
              {sales.length === 0 ? (
                <Text style={styles.emptyText}>لا توجد طلبات مبيعات</Text>
              ) : (
                sales.map((order) => {
                  const parsedItems = parseSaleItems(order.items);
                  const isPending = order.status === "pending";
                  const isShipped = order.status === "shipped";
                  const isReady = order.status === "ready";
                  const isDelivered = order.status === "delivered";

                  return (
                    <View key={order.id} style={styles.saleOrderCard}>
                      <View style={styles.orderCardHeader}>
                        <Text style={styles.orderCode}>
                          #{order.id.slice(0, 8).toUpperCase()}
                        </Text>
                        <View style={[styles.statusBadge, isDelivered ? styles.successBadge : styles.pendingBadge]}>
                          <Text style={[styles.statusBadgeText, isDelivered ? styles.successText : styles.pendingText]}>
                            {statusLabels[order.status] || order.status}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.orderCardBody}>
                        <Text style={styles.orderText}>المشتري: {order.profiles?.full_name || "—"}</Text>
                        <Text style={styles.orderText}>المتجر: {order.store_name || "—"}</Text>
                        <Text style={styles.orderText}>التاريخ: {new Date(order.created_at).toLocaleDateString("ar-SA")}</Text>

                        {/* Items list */}
                        <View style={styles.itemsBox}>
                          {parsedItems.map((item, idx) => (
                            <Text key={idx} style={styles.itemRowText}>
                              - {item.name} ({item.quantity}x) — {item.price} د.ع
                            </Text>
                          ))}
                        </View>

                        <Text style={styles.orderTotalText}>
                          الإجمالي: {order.total.toLocaleString()} د.ع
                        </Text>
                      </View>

                      {/* Status changer buttons */}
                      <View style={styles.orderCardFooter}>
                        <TouchableOpacity
                          style={styles.statusActionBtn}
                          onPress={() => {
                            Alert.alert("تحديث حالة المبيعات", "اختر الحالة الجديدة لطلب البيع:", [
                              { text: "قيد التجهيز", onPress: () => updateOrderStatus(order.id, "pending") },
                              { text: "تم الشحن", onPress: () => updateOrderStatus(order.id, "shipped") },
                              { text: "جاهز للتسليم", onPress: () => updateOrderStatus(order.id, "ready") },
                              { text: "تم الاستلام", onPress: () => updateOrderStatus(order.id, "delivered") },
                              { text: "إلغاء", style: "cancel" },
                            ]);
                          }}
                        >
                          <Text style={styles.statusActionBtnText}>تغيير حالة الطلب</Text>
                          <Feather name="edit-3" size={12} color="#a1a1aa" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}
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
  scrollContent: {
    padding: 20,
    gap: 20,
  },
  tabsRow: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  tabBtnActive: {
    backgroundColor: "#ea580c",
    borderColor: "#ea580c",
  },
  tabBtnInactive: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  whiteText: {
    color: "#ffffff",
  },
  mutedText: {
    color: "#71717a",
  },
  tabContent: {
    gap: 16,
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
  addCatForm: {
    flexDirection: "row-reverse",
    gap: 10,
  },
  textInput: {
    flex: 1,
    height: 44,
    backgroundColor: "#09090b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#27272a",
    paddingHorizontal: 12,
    color: "#f4f4f5",
    fontSize: 13,
  },
  submitBtn: {
    backgroundColor: "#ea580c",
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  listContainer: {
    gap: 12,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f4f4f5",
    textAlign: "right",
    marginBottom: 4,
  },
  listItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 12,
    padding: 14,
  },
  listItemText: {
    color: "#f4f4f5",
    fontSize: 14,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  verifyBtn: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  verifiedBtnBg: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  unverifiedBtnBg: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  verifyBtnText: {
    fontSize: 11,
    fontWeight: "bold",
  },
  verifiedText: {
    color: "#ef4444",
  },
  unverifiedText: {
    color: "#10b981",
  },
  storeInfoContainer: {
    alignItems: "flex-end",
  },
  storeNameRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  storeNameText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  storeOwnerText: {
    fontSize: 11,
    color: "#71717a",
    marginTop: 2,
  },
  emptyText: {
    color: "#71717a",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 24,
  },
  saleOrderCard: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  orderCardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: "#27272a",
    paddingBottom: 10,
  },
  orderCode: {
    fontSize: 13,
    fontFamily: "monospace",
    color: "#a1a1aa",
  },
  statusBadge: {
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  pendingBadge: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
  },
  pendingText: {
    color: "#fbbf24",
  },
  successBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
  },
  successText: {
    color: "#10b981",
  },
  orderCardBody: {
    alignItems: "flex-end",
    gap: 4,
  },
  orderText: {
    fontSize: 12,
    color: "#a1a1aa",
  },
  itemsBox: {
    width: "100%",
    backgroundColor: "#09090b",
    borderRadius: 10,
    padding: 10,
    marginVertical: 6,
    alignItems: "flex-end",
    gap: 2,
  },
  itemRowText: {
    fontSize: 11,
    color: "#71717a",
  },
  orderTotalText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#10b981",
    marginTop: 4,
  },
  orderCardFooter: {
    borderTopWidth: 1,
    borderColor: "#27272a",
    paddingTop: 10,
    alignItems: "flex-start",
  },
  statusActionBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  statusActionBtnText: {
    color: "#a1a1aa",
    fontSize: 11,
  },
});
