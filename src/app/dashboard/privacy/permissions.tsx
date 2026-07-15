import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "@/../components/ThemeProvider";
import * as Location from "expo-location";

export default function PermissionsCenter() {
  const router = useRouter();
  const { themeColors } = useAppTheme();
  
  const [locationPerm, setLocationPerm] = useState<string>("checking");

  const checkPermissions = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setLocationPerm(status === "granted" ? "مسموح" : "مرفوض");
    } catch (e) {
      setLocationPerm("غير متوفر");
    }
  };

  useEffect(() => {
    checkPermissions();
  }, []);

  const handleOpenSettings = () => {
    Linking.openSettings();
  };

  const permissionItems = [
    {
      title: "صلاحية موقع الجهاز (Location)",
      description: "تستخدم لتحديد موقعك الجغرافي بدقة على الخارطة عند إضافة عنوان جديد للطلبات، لضمان توصيل المطبوعات للمكان الصحيح دون أي تأخير.",
      icon: "map-pin",
      status: locationPerm,
      color: locationPerm === "مسموح" ? "#22c55e" : "#ea580c",
    },
    {
      title: "صلاحية الوصول للملفات ومساحة التخزين (Storage)",
      description: "تسمح للتطبيق بالوصول إلى مستنداتك وملفاتك (مثل PDF و Word) لتمكينك من اختيارها ورفعها للطباعة عبر خيار رفع الملفات.",
      icon: "folder",
      status: "مدار من النظام",
      color: "#3b82f6",
    },
    {
      title: "صلاحية معرض الصور والكاميرا (Photos/Camera)",
      description: "تستخدم لاختيار صورتك الشخصية للملف الشخصي، أو لالتقاط ورفع لقطة الشاشة الخاصة بإيصال تحويل الدفع الإلكتروني لإثبات الدفع المالي.",
      icon: "camera",
      status: "مدار من النظام",
      color: "#a855f7",
    },
    {
      title: "صلاحية إشعارات الهاتف الفورية (Notifications)",
      description: "تُستخدم لإرسال تنبيهات هامة ومباشرة لتبسيط تتبع حالة طلبات الطباعة (مثال: اكتمال الطباعة، بدء توصيل الطلب، أو استلام الدعم الفني).",
      icon: "bell",
      status: "مدار من النظام",
      color: "#ec4899",
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-right" size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.appBarTitle, { color: themeColors.text }]}>إدارة صلاحيات الجهاز</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionDesc, { color: themeColors.textMuted }]}>
          يطلب التطبيق بعض صلاحيات الوصول الخاصة بالجهاز لتمكين الميزات الأساسية مثل رفع الملفات وتتبع الموقع الجغرافي للمندوب. يمكنك التحكم الكامل بهذه الصلاحيات من خلال إعدادات جهازك.
        </Text>

        <View style={styles.listContainer}>
          {permissionItems.map((item, idx) => (
            <View key={idx} style={[styles.permCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.badge, { backgroundColor: item.color + "10" }]}>
                  <Text style={[styles.badgeText, { color: item.color }]}>{item.status}</Text>
                </View>
                <View style={styles.headerTitleRow}>
                  <Text style={[styles.permTitle, { color: themeColors.text }]}>{item.title}</Text>
                  <View style={[styles.iconWrapper, { backgroundColor: "rgba(234, 88, 12, 0.08)" }]}>
                    <Feather name={item.icon as any} size={18} color="#ea580c" />
                  </View>
                </View>
              </View>
              <Text style={[styles.permDesc, { color: themeColors.textMuted }]}>{item.description}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity onPress={handleOpenSettings} style={styles.settingsButton}>
          <Feather name="settings" size={16} color="#ffffff" style={styles.btnIcon} />
          <Text style={styles.settingsButtonText}>فتح إعدادات النظام للتحكم بالصلاحيات</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  sectionDesc: {
    fontSize: 13,
    lineHeight: 22,
    textAlign: "right",
    marginBottom: 24,
  },
  listContainer: {
    gap: 16,
    marginBottom: 28,
  },
  permCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginLeft: 16,
  },
  permTitle: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "right",
    flexShrink: 1,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  permDesc: {
    fontSize: 11,
    lineHeight: 18,
    textAlign: "right",
  },
  settingsButton: {
    height: 46,
    backgroundColor: "#ea580c",
    borderRadius: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  settingsButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  btnIcon: {
    marginLeft: 4,
  },
});
