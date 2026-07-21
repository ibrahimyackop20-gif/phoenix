import React, { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Linking,
  Alert,
  Modal,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabaseClient";
import {
  createRealtimeChannel,
  teardownRealtimeChannel,
} from "../../../lib/realtimeChannel";
import StatusBadge from "../../../components/StatusBadge";
import { Feather, FontAwesome, Ionicons } from "@expo/vector-icons";
import {
  downloadTelegramFile,
  openTelegramBot,
} from "../../../lib/telegramApi";

interface DeliveryAddressData {
  title: string;
  area: string;
  formatted_address: string | null;
  latitude: string | null;
  longitude: string | null;
  phone_number: string | null;
  nearby_landmark: string | null;
}

interface OrderWithProfile {
  id: string;
  file_name: string;
  file_url: string;
  copies: number;
  color_mode: string;
  paper_type?: string;
  num_copies?: number;
  a4_color_type?: string;
  order_type?: string;
  total_pages?: number;
  a4_paper_type?: string;
  a4_print_side?: string;
  total_price?: number;
  external_file_link?: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  delivery_address_id?: string;
  delivery_zone?: string;
  shipping_cost?: number;
  payment_method?: string;
  payment_status?: string;
  receipt_url?: string;
  width_cm?: number;
  length_meters?: number;
  cancelled_at?: string | null;
  cancelled_by?: "customer" | "admin" | null;
  profiles: {
    full_name: string;
    phone_number: string | null;
  } | null;
  delivery_addresses: DeliveryAddressData | null;
}

interface Inquiry {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  admin_reply: string | null;
  is_read: boolean;
  created_at: string;
  profiles: {
    full_name: string;
  } | null;
}

type Tab = "orders" | "inquiries";

export default function AdminScreen() {
  const { width } = useWindowDimensions();
  const isSmallScreen = width < 375;
  const isTablet = width >= 768;

  const [orders, setOrders] = useState<OrderWithProfile[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [adminMeta, setAdminMeta] = useState<{ id: string; name: string } | null>(null);
  const [actionModal, setActionModal] = useState<{
    orderId: string;
    action: "Accepted" | "Rejected" | "Cancelled";
  } | null>(null);
  const [actionReason, setActionReason] = useState("");

  // Reply state
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*, profiles(full_name, phone_number), delivery_addresses(title, area, formatted_address, latitude, longitude, phone_number, nearby_landmark)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Fetch Orders Error:", error.message);
    }
    setOrders((data as unknown as OrderWithProfile[]) || []);
  };

  const fetchInquiries = async () => {
    const { data, error } = await supabase
      .from("inquiries")
      .select("*, profiles(full_name)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Fetch Inquiries Error:", error.message);
    }
    setInquiries((data as unknown as Inquiry[]) || []);
  };

  const loadAll = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      setAdminMeta({
        id: user.id,
        name: profile?.full_name || user.email || "Admin",
      });
    }
    await Promise.all([fetchOrders(), fetchInquiries()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();

    const ordersChannel = createRealtimeChannel("admin-orders-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
      })
      .subscribe();

    const inquiriesChannel = createRealtimeChannel("admin-inquiries-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "inquiries" }, () => {
        fetchInquiries();
      })
      .subscribe();

    return () => {
      teardownRealtimeChannel(ordersChannel);
      teardownRealtimeChannel(inquiriesChannel);
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchOrders(), fetchInquiries()]);
    setRefreshing(false);
    showToast("تم تحديث البيانات");
  };

  const updateStatus = async (
    orderId: string,
    newStatus: string,
    reason?: string
  ) => {
    setUpdatingId(orderId);

    const payload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === "Cancelled") {
      payload.cancelled_by = "admin";
      payload.cancelled_at = new Date().toISOString();
    }

    if (reason?.trim() && (newStatus === "Rejected" || newStatus === "Cancelled")) {
      payload.status_reason = reason.trim();
    }

    let { error } = await supabase.from("orders").update(payload).eq("id", orderId);

    if (error && payload.status_reason && /status_reason|column/i.test(error.message)) {
      delete payload.status_reason;
      ({ error } = await supabase.from("orders").update(payload).eq("id", orderId));
    }

    if (error) {
      console.error("❌ Status Update Error:", error.message);
      showToast(`فشل تحديث الحالة: ${error.message}`, "error");
    } else {
      if (adminMeta?.id) {
        const { error: histErr } = await supabase.from("order_status_history").insert({
          order_id: orderId,
          action: newStatus,
          admin_id: adminMeta.id,
          admin_name: adminMeta.name,
          reason: reason?.trim() || null,
        });
        if (histErr) console.warn("[order_status_history]", histErr.message);
      }

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: newStatus,
                ...(newStatus === "Cancelled"
                  ? { cancelled_by: "admin" as const }
                  : {}),
              }
            : o
        )
      );
      showToast("تم تحديث حالة الطلب بنجاح");
    }
    setUpdatingId(null);
    setActionModal(null);
    setActionReason("");
  };

  const openPendingAction = (
    orderId: string,
    action: "Accepted" | "Rejected" | "Cancelled"
  ) => {
    setActionReason("");
    setActionModal({ orderId, action });
  };

  const downloadFile = (fileUrl: string | null) => {
    if (!fileUrl) return;
    Linking.openURL(fileUrl).catch(() => {
      showToast("فشل فتح رابط الملف", "error");
    });
  };

  const handleTelegramDownload = async (fileId: string) => {
    showToast("جاري تجهيز الرابط...");
    try {
      const data = await downloadTelegramFile(fileId);

      if (data.ok && data.download_url) {
        await Linking.openURL(data.download_url);
      } else if (data.error === "too_large") {
        showToast(
          "الملف أكبر من 20MB — افتح تليجرام لتحميله",
          "error"
        );
        await openTelegramBot();
      } else {
        showToast(data.message || "فشل تحميل الملف", "error");
      }
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || "خطأ في الاتصال", "error");
    }
  };

  const handleReply = async (inquiryId: string) => {
    if (!replyText.trim()) return;
    setSendingReply(true);

    const { error: updateError } = await supabase
      .from("inquiries")
      .update({
        admin_reply: replyText,
        is_read: true,
      })
      .eq("id", inquiryId);

    if (updateError) {
      console.error("❌ Reply Update Error:", updateError.message);
      showToast(`فشل إرسال الرد: ${updateError.message}`, "error");
    } else {
      setInquiries((prev) =>
        prev.map((inq) =>
          inq.id === inquiryId
            ? { ...inq, admin_reply: replyText, is_read: true }
            : inq
        )
      );
      setReplyingTo(null);
      setReplyText("");
      showToast("تم إرسال الرد بنجاح");
    }
    setSendingReply(false);
  };

  const markAsRead = async (inquiryId: string) => {
    await supabase
      .from("inquiries")
      .update({ is_read: true })
      .eq("id", inquiryId);

    setInquiries((prev) =>
      prev.map((inq) =>
        inq.id === inquiryId ? { ...inq, is_read: true } : inq
      )
    );
  };

  const filteredOrders = orders.filter((order) => {
    const q = searchQuery.trim().toLowerCase();
    const orderNo = order.id.slice(0, 8).toLowerCase();
    const phone = (order.profiles?.phone_number || "").toLowerCase();
    const name = (order.profiles?.full_name || "").toLowerCase();
    const file = (order.file_name || "").toLowerCase();
    const matchesSearch =
      q === "" ||
      orderNo.includes(q) ||
      name.includes(q) ||
      phone.includes(q.replace(/\s/g, "")) ||
      file.includes(q);
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = orders.filter((o) => o.status === "Pending").length;
  const printingCount = orders.filter((o) => o.status === "Printing").length;
  const completedCount = orders.filter((o) => o.status === "Completed").length;
  const unreadInquiries = inquiries.filter((i) => !i.is_read).length;

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const stats = [
    { label: "إجمالي الطلبات", value: orders.length, icon: "package" as const, color: "#a1a1aa", bg: "rgba(161, 161, 170, 0.08)" },
    { label: "قيد الانتظار", value: pendingCount, icon: "clock" as const, color: "#fbbf24", bg: "rgba(251, 191, 36, 0.08)" },
    { label: "جاري الطباعة", value: printingCount, icon: "printer" as const, color: "#60a5fa", bg: "rgba(96, 165, 250, 0.08)" },
    { label: "مكتمل", value: completedCount, icon: "check-circle" as const, color: "#34d399", bg: "rgba(52, 211, 153, 0.08)" },
  ];

  const filterStatuses = [
    { key: "all", label: "الكل" },
    { key: "Pending", label: "قيد الانتظار" },
    { key: "Accepted", label: "مقبول" },
    { key: "Printing", label: "جاري الطباعة" },
    { key: "Ready", label: "جاهز" },
    { key: "Out for Delivery", label: "في الطريق" },
    { key: "Completed", label: "مكتمل" },
    { key: "Rejected", label: "مرفوض" },
    { key: "Cancelled", label: "ملغي" },
  ];

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

      <Modal
        visible={!!actionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setActionModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {actionModal?.action === "Accepted" && "تأكيد قبول الطلب"}
              {actionModal?.action === "Rejected" && "تأكيد رفض الطلب"}
              {actionModal?.action === "Cancelled" && "تأكيد إلغاء الطلب"}
            </Text>
            <Text style={styles.modalBody}>
              {actionModal?.action === "Accepted" &&
                "سيتم قبول الطلب وإيقاف عدّاد إلغاء العميل."}
              {actionModal?.action === "Rejected" &&
                "سيتم رفض الطلب. يمكنك كتابة سبب اختياري."}
              {actionModal?.action === "Cancelled" &&
                "سيتم إلغاء الطلب من قبل الإدارة. يمكنك كتابة سبب اختياري."}
            </Text>
            {(actionModal?.action === "Rejected" ||
              actionModal?.action === "Cancelled") && (
              <TextInput
                value={actionReason}
                onChangeText={setActionReason}
                placeholder="السبب (اختياري)..."
                placeholderTextColor="#71717a"
                style={styles.reasonInput}
                textAlign="right"
                multiline
              />
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => {
                  setActionModal(null);
                  setActionReason("");
                }}
              >
                <Text style={styles.modalCancelText}>رجوع</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  actionModal?.action === "Accepted" && { backgroundColor: "#059669" },
                  actionModal?.action === "Rejected" && { backgroundColor: "#dc2626" },
                  actionModal?.action === "Cancelled" && { backgroundColor: "#475569" },
                ]}
                disabled={!!updatingId}
                onPress={() => {
                  if (!actionModal) return;
                  updateStatus(
                    actionModal.orderId,
                    actionModal.action,
                    actionModal.action === "Accepted" ? undefined : actionReason
                  );
                }}
              >
                {updatingId ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>تأكيد</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Welcome Native Header */}
      <View style={[styles.header, isTablet && styles.centeredContent]}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>لوحة الإدارة</Text>
          <Text style={styles.headerSubtitle}>إدارة طلبات الطباعة واستفسارات الطلاب</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color="#f4f4f5" />
          ) : (
            <Feather name="refresh-cw" size={16} color="#f4f4f5" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, isTablet && styles.centeredContent]} showsVerticalScrollIndicator={false}>
        {/* Statistics Section (Responsive: 1 per row on small screens, 2 per row on standard screens) */}
        <View style={styles.statsGrid}>
          {stats.map((stat, i) => (
            <View
              key={i}
              style={[
                styles.statCard,
                { width: isSmallScreen ? "100%" : isTablet ? "23.5%" : "48%" },
              ]}
            >
              <View style={styles.statTopRow}>
                <View style={[styles.statIconBadge, { backgroundColor: stat.bg }]}>
                  <Feather name={stat.icon} size={16} color={stat.color} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
              </View>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Tab Selection Navigation */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === "orders" ? styles.tabButtonActive : styles.tabButtonInactive]}
            onPress={() => setActiveTab("orders")}
          >
            <Text style={[styles.tabButtonText, activeTab === "orders" ? styles.whiteText : styles.mutedText]}>
              الطلبات ({orders.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === "inquiries" ? styles.tabButtonActive : styles.tabButtonInactive]}
            onPress={() => setActiveTab("inquiries")}
          >
            <Text style={[styles.tabButtonText, activeTab === "inquiries" ? styles.whiteText : styles.mutedText]}>
              الاستفسارات {unreadInquiries > 0 ? `(${unreadInquiries})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === "orders" ? (
          <View style={styles.tabContainer}>
            {/* Search Input Box */}
            <View style={styles.searchWrapper}>
              <View style={styles.searchBar}>
                <Feather name="search" size={16} color="#71717a" style={styles.searchIcon} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="بحث برقم الطلب أو الاسم أو الهاتف..."
                  placeholderTextColor="#71717a"
                  style={styles.searchInput}
                  textAlign="right"
                />
              </View>
            </View>

            {/* Horizontal Scrollable Status Badges Filters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.statusFiltersScroll}
              style={styles.statusFiltersView}
            >
              {filterStatuses.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setStatusFilter(f.key)}
                  style={[
                    styles.filterBadge,
                    statusFilter === f.key ? styles.filterBadgeActive : styles.filterBadgeInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterBadgeText,
                      statusFilter === f.key ? styles.whiteText : styles.mutedText,
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Orders Feed */}
            {filteredOrders.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="package" size={48} color="#27272a" />
                <Text style={styles.emptyTitle}>لا توجد طلبات</Text>
                <Text style={styles.emptyText}>لم يتم العثور على نتائج مطابقة</Text>
              </View>
            ) : (
              <View style={styles.feedList}>
                {filteredOrders.map((order) => (
                  <View key={order.id} style={styles.mobileCard}>
                    {/* Header Row */}
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.studentName}>
                        {order.profiles?.full_name || "طالب غير معروف"}
                      </Text>
                      <StatusBadge status={order.status} />
                    </View>

                    {/* Meta Parameters Grid */}
                    <View style={styles.cardBody}>
                      <View style={styles.metaRow}>
                        <Text style={styles.metaValue}>{order.id}</Text>
                        <Text style={styles.metaLabel}>رقم الطلب</Text>
                      </View>

                      <View style={styles.metaRow}>
                        <Text style={styles.metaValue}>{order.file_name}</Text>
                        <Text style={styles.metaLabel}>اسم الملف</Text>
                      </View>

                      <View style={styles.metaRow}>
                        <Text style={styles.metaValue}>
                          {order.order_type === "a4_print" ? "A4" : "رول"} (
                          {order.a4_paper_type || order.paper_type || "عادي"})
                        </Text>
                        <Text style={styles.metaLabel}>حجم الورق</Text>
                      </View>

                      <View style={styles.metaRow}>
                        <Text style={styles.metaValue}>
                          {order.num_copies ?? order.copies ?? 1} نسخة
                        </Text>
                        <Text style={styles.metaLabel}>النسخ</Text>
                      </View>

                      <View style={styles.metaRow}>
                        <Text style={styles.metaValue}>
                          {(order.a4_color_type || order.color_mode) === "color" ? "ملوّن" : "أبيض/أسود"}
                        </Text>
                        <Text style={styles.metaLabel}>اللون</Text>
                      </View>

                      {order.total_price != null && (
                        <View style={styles.metaRow}>
                          <Text style={styles.priceValue}>
                            {order.total_price.toLocaleString()} د.ع
                          </Text>
                          <Text style={styles.metaLabel}>السعر الإجمالي</Text>
                        </View>
                      )}

                      <View style={styles.metaRow}>
                        <Text style={styles.metaValue}>{formatDate(order.created_at)}</Text>
                        <Text style={styles.metaLabel}>التاريخ</Text>
                      </View>
                    </View>

                    {/* Action Buttons Stacked Vertically */}
                    <View style={styles.cardActions}>
                      {order.file_url ? (
                        <TouchableOpacity style={styles.cardActionBtn} onPress={() => downloadFile(order.file_url)}>
                          <Feather name="download" size={16} color="#ffffff" style={styles.btnIcon} />
                          <Text style={styles.cardActionBtnText}>تحميل المستند</Text>
                        </TouchableOpacity>
                      ) : order.external_file_link ? (
                        <TouchableOpacity
                          style={[styles.cardActionBtn, styles.telegramActionBtn]}
                          onPress={() =>
                            order.external_file_link!.startsWith("http")
                              ? downloadFile(order.external_file_link!)
                              : handleTelegramDownload(order.external_file_link!)
                          }
                        >
                          <FontAwesome name="telegram" size={16} color="#29b6f6" style={styles.btnIcon} />
                          <Text style={[styles.cardActionBtnText, { color: "#29b6f6" }]}>
                            {order.external_file_link.startsWith("http")
                              ? "فتح الرابط"
                              : "تحميل من تليجرام"}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.noFileBadge}>
                          <Text style={styles.noFileText}>لا يوجد مستند مرفق</Text>
                        </View>
                      )}

                      {order.status === "Pending" && (
                        <View style={styles.pendingActionsRow}>
                          <TouchableOpacity
                            style={[styles.pendingActionBtn, styles.acceptBtn]}
                            disabled={updatingId === order.id}
                            onPress={() => openPendingAction(order.id, "Accepted")}
                          >
                            <Feather name="check-circle" size={14} color="#34d399" />
                            <Text style={[styles.pendingActionText, { color: "#34d399" }]}>قبول</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.pendingActionBtn, styles.rejectBtn]}
                            disabled={updatingId === order.id}
                            onPress={() => openPendingAction(order.id, "Rejected")}
                          >
                            <Feather name="x-circle" size={14} color="#f87171" />
                            <Text style={[styles.pendingActionText, { color: "#f87171" }]}>رفض</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.pendingActionBtn, styles.cancelAdminBtn]}
                            disabled={updatingId === order.id}
                            onPress={() => openPendingAction(order.id, "Cancelled")}
                          >
                            <Feather name="slash" size={14} color="#94a3b8" />
                            <Text style={[styles.pendingActionText, { color: "#94a3b8" }]}>إلغاء</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      <TouchableOpacity
                        style={styles.cardSecondaryBtn}
                        onPress={() => {
                          Alert.alert("تحديث حالة الطلب", "اختر الحالة الجديدة للطلب:", [
                            { text: "قيد الانتظار", onPress: () => updateStatus(order.id, "Pending") },
                            { text: "مقبول", onPress: () => updateStatus(order.id, "Accepted") },
                            { text: "جاري الطباعة", onPress: () => updateStatus(order.id, "Printing") },
                            { text: "جاهز", onPress: () => updateStatus(order.id, "Ready") },
                            { text: "في الطريق", onPress: () => updateStatus(order.id, "Out for Delivery") },
                            { text: "مكتمل", onPress: () => updateStatus(order.id, "Completed") },
                            { text: "مرفوض", onPress: () => updateStatus(order.id, "Rejected") },
                            { text: "ملغي (إدارة)", onPress: () => updateStatus(order.id, "Cancelled") },
                            { text: "إلغاء", style: "cancel" },
                          ]);
                        }}
                      >
                        <Feather name="edit-3" size={16} color="#a1a1aa" style={styles.btnIcon} />
                        <Text style={styles.cardSecondaryBtnText}>تغيير حالة الطلب</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          /* Inquiries Feed Tab */
          <View style={styles.tabContainer}>
            {inquiries.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="message-square" size={48} color="#27272a" />
                <Text style={styles.emptyTitle}>لا توجد استفسارات</Text>
              </View>
            ) : (
              <View style={styles.feedList}>
                {inquiries.map((inq) => (
                  <View key={inq.id} style={[styles.mobileCard, !inq.is_read && styles.unreadCard]}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.studentName}>
                        {inq.profiles?.full_name || "طالب غير معروف"}
                      </Text>
                      {!inq.is_read && <View style={styles.unreadMarker} />}
                    </View>

                    <View style={styles.cardBody}>
                      <View style={styles.metaRow}>
                        <Text style={styles.metaSubjectValue}>{inq.subject}</Text>
                        <Text style={styles.metaLabel}>الموضوع</Text>
                      </View>
                      <View style={styles.inquiryMessageBlock}>
                        <Text style={styles.inquiryMessageText}>{inq.message}</Text>
                      </View>
                      <View style={styles.metaRow}>
                        <Text style={styles.metaValue}>{formatDate(inq.created_at)}</Text>
                        <Text style={styles.metaLabel}>التاريخ</Text>
                      </View>
                    </View>

                    {inq.admin_reply ? (
                      <View style={styles.replyBox}>
                        <Text style={styles.replyTitle}>الرد المرسل:</Text>
                        <Text style={styles.replyContent}>{inq.admin_reply}</Text>
                      </View>
                    ) : (
                      <View style={styles.cardActions}>
                        {replyingTo === inq.id ? (
                          <View style={styles.replyInputContainer}>
                            <TextInput
                              value={replyText}
                              onChangeText={setReplyText}
                              placeholder="اكتب الرد هنا..."
                              placeholderTextColor="#71717a"
                              style={styles.replyTextInput}
                              textAlign="right"
                              multiline
                            />
                            <View style={styles.replyFormButtons}>
                              <TouchableOpacity
                                style={styles.sendReplyBtn}
                                onPress={() => handleReply(inq.id)}
                                disabled={sendingReply}
                              >
                                {sendingReply ? (
                                  <ActivityIndicator size="small" color="#ffffff" />
                                ) : (
                                  <Text style={styles.sendReplyText}>إرسال الرد</Text>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.cancelReplyBtn} onPress={() => setReplyingTo(null)}>
                                <Text style={styles.cancelReplyText}>إلغاء</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.cardActionBtn}
                            onPress={() => {
                              setReplyingTo(inq.id);
                              markAsRead(inq.id);
                            }}
                          >
                            <Feather name="corner-up-left" size={16} color="#ffffff" style={styles.btnIcon} />
                            <Text style={styles.cardActionBtnText}>كتابة رد واستقبال</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
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
    flex: 1,
    flexShrink: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#ea580c",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#71717a",
    marginTop: 4,
    textAlign: "right",
    flexShrink: 1,
  },
  refreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  centeredContent: {
    width: "100%",
    maxWidth: 1100,
    alignSelf: "center",
  },
  statsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginVertical: 16,
    gap: 12,
  },
  statCard: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 16,
    padding: 16,
    alignItems: "flex-end",
  },
  statTopRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },
  statIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  statLabel: {
    fontSize: 11,
    color: "#71717a",
    marginTop: 4,
    textAlign: "right",
  },
  tabsRow: {
    flexDirection: "row-reverse",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  tabButtonActive: {
    backgroundColor: "#ea580c",
    borderColor: "#ea580c",
  },
  tabButtonInactive: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
    flexShrink: 1,
  },
  whiteText: {
    color: "#ffffff",
  },
  mutedText: {
    color: "#71717a",
  },
  tabContainer: {
    paddingHorizontal: 20,
  },
  searchWrapper: {
    marginBottom: 12,
    width: "100%",
  },
  searchBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  searchIcon: {
    marginLeft: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    color: "#f4f4f5",
    fontSize: 14,
  },
  statusFiltersView: {
    marginBottom: 16,
  },
  statusFiltersScroll: {
    gap: 8,
    flexDirection: "row-reverse",
  },
  filterBadge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeActive: {
    backgroundColor: "#ea580c",
    borderColor: "#ea580c",
  },
  filterBadgeInactive: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
  },
  filterBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 12,
    color: "#71717a",
  },
  feedList: {
    gap: 16,
  },
  mobileCard: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 16,
    padding: 16,
    width: "100%",
  },
  unreadCard: {
    borderColor: "rgba(234, 88, 12, 0.3)",
    backgroundColor: "rgba(234, 88, 12, 0.02)",
  },
  unreadMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ea580c",
  },
  cardHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: "#27272a",
    paddingBottom: 12,
    marginBottom: 12,
    gap: 8,
    flexWrap: "wrap",
  },
  studentName: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "right",
    flexShrink: 1,
  },
  cardBody: {
    gap: 8,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  metaLabel: {
    fontSize: 12,
    color: "#71717a",
    fontWeight: "500",
    flexShrink: 0,
  },
  metaValue: {
    fontSize: 13,
    color: "#e4e4e7",
    textAlign: "left",
    flexShrink: 1,
  },
  metaSubjectValue: {
    fontSize: 13,
    color: "#ea580c",
    fontWeight: "bold",
    textAlign: "left",
    flexShrink: 1,
  },
  inquiryMessageBlock: {
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 12,
    padding: 12,
    marginVertical: 4,
  },
  inquiryMessageText: {
    fontSize: 13,
    color: "#a1a1aa",
    lineHeight: 18,
    textAlign: "right",
  },
  priceValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#10b981", // modern Stripe-like emerald green
    flexShrink: 1,
  },
  cardActions: {
    gap: 8,
  },
  cardActionBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ea580c",
    borderRadius: 12,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: "100%",
  },
  cardActionBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
    flexShrink: 1,
  },
  telegramActionBtn: {
    backgroundColor: "rgba(41, 182, 246, 0.1)",
    borderColor: "rgba(41, 182, 246, 0.2)",
    borderWidth: 1,
  },
  btnIcon: {
    marginLeft: 4,
  },
  noFileBadge: {
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#27272a",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  noFileText: {
    color: "#a1a1aa",
    fontSize: 12,
    textAlign: "center",
  },
  cardSecondaryBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#27272a",
    borderWidth: 1,
    borderColor: "#3f3f46",
    borderRadius: 12,
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: "100%",
  },
  cardSecondaryBtnText: {
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
    flexShrink: 1,
  },
  replyBox: {
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 12,
    padding: 12,
    alignItems: "flex-end",
    gap: 4,
  },
  replyTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#ea580c",
  },
  replyContent: {
    fontSize: 13,
    color: "#ffffff",
    lineHeight: 18,
    textAlign: "right",
  },
  replyInputContainer: {
    gap: 8,
  },
  replyTextInput: {
    minHeight: 80,
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 12,
    padding: 12,
    color: "#f4f4f5",
    fontSize: 13,
    textAlignVertical: "top",
  },
  replyFormButtons: {
    flexDirection: "column",
    gap: 8,
  },
  sendReplyBtn: {
    backgroundColor: "#22c55e",
    borderRadius: 12,
    minHeight: 48,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sendReplyText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  cancelReplyBtn: {
    backgroundColor: "#27272a",
    borderRadius: 12,
    minHeight: 48,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelReplyText: {
    color: "#a1a1aa",
    fontSize: 13,
  },
  pendingActionsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  pendingActionBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  acceptBtn: {
    backgroundColor: "rgba(52, 211, 153, 0.12)",
    borderColor: "rgba(52, 211, 153, 0.28)",
  },
  rejectBtn: {
    backgroundColor: "rgba(248, 113, 113, 0.12)",
    borderColor: "rgba(248, 113, 113, 0.28)",
  },
  cancelAdminBtn: {
    backgroundColor: "rgba(148, 163, 184, 0.12)",
    borderColor: "rgba(148, 163, 184, 0.28)",
  },
  pendingActionText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#18181b",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#27272a",
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f4f4f5",
    textAlign: "center",
    marginBottom: 8,
  },
  modalBody: {
    fontSize: 13,
    color: "#a1a1aa",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 12,
  },
  reasonInput: {
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 12,
    padding: 12,
    color: "#f4f4f5",
    minHeight: 80,
    marginBottom: 14,
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row-reverse",
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#27272a",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    color: "#a1a1aa",
    fontWeight: "600",
  },
  modalConfirmBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmText: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
