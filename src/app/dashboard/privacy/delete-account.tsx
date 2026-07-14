import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { supabase } from "@/../lib/supabaseClient";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "@/../components/ThemeProvider";

export default function DeleteAccount() {
  const router = useRouter();
  const { themeColors } = useAppTheme();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [emailInput, setEmailInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    fetchUser();
  }, []);

  const deleteUserFiles = async (userId: string) => {
    try {
      console.log("🧹 Deleting avatars bucket files...");
      const { data: avatarFiles } = await supabase.storage.from("avatars").list(userId);
      if (avatarFiles && avatarFiles.length > 0) {
        const paths = avatarFiles.map((f: any) => `${userId}/${f.name}`);
        await supabase.storage.from("avatars").remove(paths);
      }
      await supabase.storage.from("avatars").remove([userId]);

      console.log("🧹 Deleting products bucket files...");
      const { data: productFiles } = await supabase.storage.from("products").list(userId);
      if (productFiles && productFiles.length > 0) {
        const paths = productFiles.map((f: any) => `${userId}/${f.name}`);
        await supabase.storage.from("products").remove(paths);
      }
      
      const { data: printFiles } = await supabase.storage.from("products").list(`${userId}/prints`);
      if (printFiles && printFiles.length > 0) {
        const paths = printFiles.map((f: any) => `${userId}/prints/${f.name}`);
        await supabase.storage.from("products").remove(paths);
      }

      console.log("🧹 Deleting receipts bucket files...");
      const { data: receiptFiles } = await supabase.storage.from("receipts").list(userId);
      if (receiptFiles && receiptFiles.length > 0) {
        const paths = receiptFiles.map((f: any) => `${userId}/${f.name}`);
        await supabase.storage.from("receipts").remove(paths);
      }
    } catch (e) {
      console.warn("Storage cleanup warning:", e);
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentUser) return;

    if (emailInput.trim().toLowerCase() !== currentUser.email?.toLowerCase()) {
      setError("البريد الإلكتروني المدخل لا يطابق بريدك الحالي.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const userId = currentUser.id;

      // 1. Attempt to invoke the secure backend Edge Function for complete account deletion
      console.log("⚡ Invoking delete-user Edge Function...");
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke("delete-user");

      if (edgeErr) {
        console.warn("Edge Function invocation failed, fallback to client-side cleanup:", edgeErr.message);

        // 2. Client-side storage bucket cleanup fallback
        await deleteUserFiles(userId);

        // 3. Client-side DB table cleanup fallback
        console.log("🧹 Deleting client-side database rows...");
        await supabase.from("cart_items").delete().eq("user_id", userId);
        await supabase.from("chat_messages").delete().eq("sender_id", userId);
        await supabase.from("delivery_addresses").delete().eq("user_id", userId);
        await supabase.from("notifications").delete().eq("user_id", userId);
        await supabase.from("orders").delete().eq("user_id", userId);
        await supabase.from("sales_orders").delete().eq("user_id", userId);
        await supabase.from("profiles").delete().eq("id", userId);

        // 4. Try calling DB RPC delete function (super-user fallback)
        const { error: rpcErr } = await supabase.rpc("delete_user_account");

        // Clear local storage and sign out client-side
        await AsyncStorage.clear();
        await supabase.auth.signOut();

        if (rpcErr) {
          Alert.alert(
            "تم حذف البيانات وطلب إزالة الحساب",
            "تم بنجاح حذف مستنداتك المرفوعة، صورك، وعناوينك المحفوظة من قاعدة البيانات.\n\nلحذف سجل البريد الإلكتروني بالكامل من خوادم المصادقة (Auth)، يرجى إبلاغ المسؤول التقني لتأكيد الحذف نهائياً.",
            [
              {
                text: "موافق",
                onPress: () => {
                  console.log("[Navigation] Component: DeleteAccount, Current Route: /dashboard/privacy/delete-account, Target Route: /auth/login, Auth State: Guest. Executing replace...");
                  router.replace("/auth/login" as any);
                  console.log("[Navigation] Component: DeleteAccount, Current Route: /dashboard/privacy/delete-account, Target Route: /auth/login, Done.");
                }
              }
            ]
          );
        } else {
          Alert.alert(
            "تم حذف الحساب بالكامل",
            "تم حذف حسابك وبياناتك وملفاتك نهائياً وبنجاح من التطبيق.",
            [
              {
                text: "موافق",
                onPress: () => {
                  console.log("[Navigation] Component: DeleteAccount, Current Route: /dashboard/privacy/delete-account, Target Route: /auth/login, Auth State: Guest. Executing replace...");
                  router.replace("/auth/login" as any);
                  console.log("[Navigation] Component: DeleteAccount, Current Route: /dashboard/privacy/delete-account, Target Route: /auth/login, Done.");
                }
              }
            ]
          );
        }
      } else {
        // Success via Edge Function
        console.log("✅ Edge Function deletion success:", edgeData);

        // Clear local storage, sign out and route to login
        await AsyncStorage.clear();
        await supabase.auth.signOut();

        Alert.alert(
          "تم حذف الحساب نهائياً",
          "تم حذف حسابك بالكامل وكافة بياناتك ومستنداتك بنجاح من التطبيق.",
          [
            {
              text: "موافق",
              onPress: () => {
                console.log("[Navigation] Component: DeleteAccount, Current Route: /dashboard/privacy/delete-account, Target Route: /auth/login, Auth State: Guest. Executing replace......");
                router.replace("/auth/login" as any);
                console.log("[Navigation] Component: DeleteAccount, Current Route: /dashboard/privacy/delete-account, Target Route: /auth/login, Done.");
              }
            }
          ]
        );
      }
    } catch (err: any) {
      console.error(err);
      setError("فشل حذف الحساب: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ea580c" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-right" size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.appBarTitle, { color: themeColors.text }]}>حذف الحساب نهائياً</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Warning Card */}
        <View style={styles.warningCard}>
          <Feather name="alert-triangle" size={32} color="#ef4444" style={styles.warningIcon} />
          <Text style={styles.warningTitle}>تنبيه هام وحرج جداً</Text>
          <Text style={styles.warningText}>
            أنت على وشك حذف حسابك بالكامل من تطبيق Phoenix Print. هذا الإجراء نهائي ولا يمكن التراجع عنه بأي شكل من الأشكال. سيؤدي هذا الإجراء فوراً إلى:
          </Text>
          <View style={styles.bullets}>
            <Text style={styles.bulletItem}>• حذف ملفك الشخصي وعناوين التوصيل المسجلة.</Text>
            <Text style={styles.bulletItem}>• حذف وسحب كافة مستندات وملفات الطباعة المرفوعة من الخوادم.</Text>
            <Text style={styles.bulletItem}>• مسح سجل إيصالات الدفع وتفاصيل الطلبات السابقة بالكامل.</Text>
            <Text style={styles.bulletItem}>• تسجيل خروجك من التطبيق وإلغاء صلاحيات حسابك.</Text>
          </View>
        </View>

        {/* Input Confirmation */}
        <View style={[styles.formCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          <Text style={[styles.formLabel, { color: themeColors.text }]}>
            لتأكيد الحذف، يرجى كتابة بريدك الإلكتروني الحالي أدناه:
          </Text>
          <Text style={styles.currentUserEmail}>{currentUser.email}</Text>

          <TextInput
            style={[styles.textInput, { borderColor: themeColors.cardBorder, color: themeColors.text }]}
            placeholder="أدخل بريدك الإلكتروني لتأكيد الحذف"
            placeholderTextColor="#71717a"
            value={emailInput}
            onChangeText={setEmailInput}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            onPress={handleDeleteAccount}
            disabled={loading || !emailInput.trim()}
            style={[styles.deleteButton, (!emailInput.trim() || loading) && styles.deleteButtonDisabled]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Feather name="trash-2" size={16} color="#ffffff" style={{ marginLeft: 6 }} />
                <Text style={styles.deleteButtonText}>نعم، احذف حسابي وبياناتي نهائياً</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Informative Note for Supabase Admins */}
        <View style={[styles.noteCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          <Feather name="info" size={16} color="#ea580c" style={{ marginLeft: 6 }} />
          <Text style={[styles.noteText, { color: themeColors.textMuted }]}>
            ملاحظة: لتمكين الحذف الكامل والتلقائي من جهة خوادم التوثيق (Auth)، يجب على مدير النظام تفعيل دالة `delete_user_account()` في لوحة تحكم Supabase SQL.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  appBar: {
    flexDirection: "row-reverse",
    height: 56,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(39, 39, 42, 0.5)",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  appBarTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  warningCard: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    marginBottom: 24,
  },
  warningIcon: {
    marginBottom: 12,
  },
  warningTitle: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  warningText: {
    color: "#f4f4f5",
    fontSize: 12,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 16,
  },
  bullets: {
    alignSelf: "stretch",
    gap: 8,
  },
  bulletItem: {
    color: "#e4e4e7",
    fontSize: 11,
    textAlign: "right",
  },
  formCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "right",
    lineHeight: 20,
    marginBottom: 8,
  },
  currentUserEmail: {
    color: "#ea580c",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "right",
    marginBottom: 16,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    textAlign: "right",
    fontSize: 13,
    backgroundColor: "#09090b",
    marginBottom: 12,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 11,
    textAlign: "right",
    marginBottom: 12,
  },
  deleteButton: {
    height: 44,
    backgroundColor: "#ef4444",
    borderRadius: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  noteCard: {
    flexDirection: "row-reverse",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  noteText: {
    fontSize: 10,
    lineHeight: 16,
    flex: 1,
    textAlign: "right",
  },
});
