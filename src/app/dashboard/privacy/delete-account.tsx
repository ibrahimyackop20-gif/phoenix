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

  const handleDeleteAccount = async () => {
    if (!currentUser) return;

    if (emailInput.trim().toLowerCase() !== currentUser.email?.toLowerCase()) {
      setError("البريد الإلكتروني المدخل لا يطابق بريدك الحالي.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // 1. Invoke the secure backend Edge Function 'delete-account'
      console.log("⚡ Invoking delete-account Edge Function...");
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke("delete-account");

      if (edgeErr) {
        throw new Error(edgeErr.message || "حدث خطأ غير متوقع في خادم المصادقة.");
      }

      if (edgeData?.error) {
        throw new Error(edgeData.error);
      }

      // 2. Success! Account and DB data deleted completely
      console.log("✅ Account deletion completed successfully via Edge Function!");

      // 3. Clear local preferences and sign out client-side
      await AsyncStorage.clear();
      await supabase.auth.signOut();

      // 4. Show success message and reset navigation
      Alert.alert(
        "تم حذف الحساب نهائياً",
        "تم حذف حسابك بالكامل وكافة بياناتك ومستنداتك بنجاح من التطبيق.",
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
    } catch (err: any) {
      console.error("Delete Account flow failed:", err);
      // Show exact error returned from the Edge Function
      setError(err.message || String(err));
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
            editable={!loading}
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
            ملاحظة: يتطلب هذا الإجراء تفعيل دالة `delete_user_account()` ورفع دالة Deno Edge Function `delete-account` في مشروع Supabase الخاص بك.
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
