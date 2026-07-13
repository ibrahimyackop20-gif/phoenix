import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  Image,
  Alert,
} from "react-native";
import { supabase } from "../../../../lib/supabaseClient";
import { Feather, FontAwesome, Ionicons } from "@expo/vector-icons";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  phone_number: string | null;
  created_at: string;
}

export default function AdminUsersScreen() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsers((data as Profile[]) || []);
    } catch (err) {
      console.error(err);
      showToast("فشل تحميل المستخدمين", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
    showToast("تم تحديث البيانات");
  };

  useEffect(() => {
    fetchUsers();

    const channel = supabase
      .channel("admin-users-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleRole = async (userId: string, currentRole: string) => {
    setUpdatingId(userId);
    const newRole = currentRole === "admin" ? "student" : "admin";

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", userId);

      if (error) throw error;

      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      showToast(`تم تغيير الدور إلى ${newRole === "admin" ? "مدير" : "طالب"}`);
    } catch (err: any) {
      showToast("فشل تحديث الدور", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteUser = (userId: string) => {
    Alert.alert("تأكيد الحذف", "هل أنت متأكد من حذف هذا الحساب؟ لا يمكن التراجع عن هذا الإجراء.", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف الحساب",
        style: "destructive",
        onPress: async () => {
          setUpdatingId(userId);
          try {
            const { error } = await supabase.from("profiles").delete().eq("id", userId);
            if (error) throw error;

            setUsers((prev) => prev.filter((u) => u.id !== userId));
            showToast("تم حذف الحساب بنجاح");
          } catch (err: any) {
            showToast("فشل حذف الحساب", "error");
          } finally {
            setUpdatingId(null);
          }
        },
      },
    ]);
  };

  const filteredUsers = users.filter(
    (u) =>
      searchQuery === "" ||
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone_number?.includes(searchQuery)
  );

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const adminCount = users.filter((u) => u.role === "admin").length;
  const studentCount = users.filter((u) => u.role === "student").length;

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
          <Text style={styles.headerTitle}>إدارة المستخدمين</Text>
          <Text style={styles.headerSubtitle}>عرض وإدارة صلاحيات حسابات الطلاب</Text>
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
        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Feather name="users" size={16} color="#f97316" style={styles.statIcon} />
            <Text style={styles.statValue}>{users.length}</Text>
            <Text style={styles.statLabel}>المجموع</Text>
          </View>

          <View style={styles.statCard}>
            <Feather name="user" size={16} color="#60a5fa" style={styles.statIcon} />
            <Text style={styles.statValue}>{studentCount}</Text>
            <Text style={styles.statLabel}>الطلاب</Text>
          </View>

          <View style={styles.statCard}>
            <Feather name="shield" size={16} color="#fbbf24" style={styles.statIcon} />
            <Text style={styles.statValue}>{adminCount}</Text>
            <Text style={styles.statLabel}>المديرين</Text>
          </View>
        </View>

        {/* Filter input */}
        <View style={styles.filterCard}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="بحث بالاسم أو رقم الهاتف..."
            placeholderTextColor="#71717a"
            style={styles.searchInput}
            textAlign="right"
          />
        </View>

        {/* Users list */}
        <View style={styles.listSection}>
          {filteredUsers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Feather name="users" size={48} color="#27272a" />
              <Text style={styles.emptyText}>لا يوجد مستخدمون مطابقون</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {filteredUsers.map((u) => (
                <View key={u.id} style={styles.userCard}>
                  <View style={styles.cardHeader}>
                    {/* User profile image/avatar */}
                    <View style={styles.avatarContainer}>
                      {u.avatar_url ? (
                        <Image source={{ uri: u.avatar_url }} style={styles.avatarImage} />
                      ) : (
                        <Feather name="user" size={20} color="#71717a" />
                      )}
                    </View>

                    <View style={styles.userInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.userName}>{u.full_name || "—"}</Text>
                        <View style={[styles.roleBadge, u.role === "admin" ? styles.adminBadge : styles.studentBadge]}>
                          <Text style={[styles.roleBadgeText, u.role === "admin" ? styles.adminText : styles.studentText]}>
                            {u.role === "admin" ? "مدير" : "طالب"}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.userPhone}>{u.phone_number || "—"}</Text>
                      <Text style={styles.userJoined}>انضم: {formatDate(u.created_at)}</Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      onPress={() => toggleRole(u.id, u.role)}
                      disabled={updatingId === u.id}
                      style={styles.roleActionBtn}
                    >
                      {updatingId === u.id ? (
                        <ActivityIndicator size="small" color="#ea580c" />
                      ) : (
                        <Text style={styles.roleActionBtnText}>
                          {u.role === "admin" ? "تنزيل لطالب" : "ترقية لمدير"}
                        </Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => deleteUser(u.id)}
                      disabled={updatingId === u.id}
                      style={styles.deleteActionBtn}
                    >
                      <Text style={styles.deleteActionBtnText}>حذف الحساب</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
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
    fontSize: 16,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  statLabel: {
    fontSize: 10,
    color: "#71717a",
    marginTop: 4,
  },
  filterCard: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 12,
    padding: 12,
  },
  searchInput: {
    height: 40,
    backgroundColor: "#09090b",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#27272a",
    paddingHorizontal: 12,
    color: "#f4f4f5",
    fontSize: 13,
  },
  listSection: {
    gap: 12,
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
  userCard: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 16,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#27272a",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  userInfo: {
    flex: 1,
    alignItems: "flex-end",
    gap: 2,
  },
  nameRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  userName: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  roleBadge: {
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: "bold",
  },
  adminBadge: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
  },
  adminText: {
    color: "#fbbf24",
  },
  studentBadge: {
    backgroundColor: "rgba(96, 165, 250, 0.1)",
  },
  studentText: {
    color: "#60a5fa",
  },
  userPhone: {
    fontSize: 12,
    color: "#a1a1aa",
  },
  userJoined: {
    fontSize: 9,
    color: "#71717a",
    marginTop: 2,
  },
  cardActions: {
    flexDirection: "row-reverse",
    gap: 8,
    borderTopWidth: 1,
    borderColor: "#27272a",
    paddingTop: 12,
  },
  roleActionBtn: {
    flex: 1,
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  roleActionBtnText: {
    color: "#f4f4f5",
    fontSize: 12,
    fontWeight: "bold",
  },
  deleteActionBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    height: 36,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteActionBtnText: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "bold",
  },
});
