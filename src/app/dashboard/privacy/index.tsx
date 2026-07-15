import React, { useState } from "react";
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
import { useRouter } from "expo-router";
import { supabase } from "@/../lib/supabaseClient";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/../components/ThemeProvider";
import * as ExpoPrint from "expo-print";
import * as ExpoSharing from "expo-sharing";

export default function PrivacyCenter() {
  const router = useRouter();
  const { themeColors } = useAppTheme();
  const [downloading, setDownloading] = useState(false);

  const handleDownloadData = async () => {
    setDownloading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("لم يتم العثور على جلسة مستخدم نشطة");

      // Fetch Profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      // Fetch Addresses
      const { data: addresses } = await supabase
        .from("delivery_addresses")
        .select("*")
        .eq("user_id", user.id);

      // Fetch Orders
      const { data: orders } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id);

      // Generate HTML Template
      const htmlContent = `
        <html dir="rtl" lang="ar">
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'system-ui', sans-serif; padding: 30px; background-color: #ffffff; color: #18181b; line-height: 1.6; }
              h1 { color: #ea580c; border-bottom: 2px solid #ea580c; padding-bottom: 12px; font-size: 24px; text-align: center; }
              h2 { color: #27272a; margin-top: 30px; border-right: 4px solid #ea580c; padding-right: 10px; font-size: 18px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { border: 1px solid #e4e4e7; padding: 12px; text-align: right; font-size: 13px; }
              th { background-color: #f4f4f5; font-weight: bold; color: #3f3f46; }
              .meta { font-size: 11px; color: #71717a; margin-bottom: 30px; text-align: left; }
              .section { margin-bottom: 40px; }
              .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #a1a1aa; border-top: 1px solid #e4e4e7; padding-top: 15px; }
            </style>
          </head>
          <body>
            <h1>تقرير البيانات الشخصية - تطبيق Phoenix Print</h1>
            <div class="meta">تم تصدير هذا التقرير بتاريخ: ${new Date().toLocaleDateString('ar-EG')}</div>
            
            <div class="section">
              <h2>1. بيانات الملف الشخصي الأساسية</h2>
              <table>
                <tr><th>معرف المستخدم الفريد (UUID)</th><td>${user.id}</td></tr>
                <tr><th>البريد الإلكتروني</th><td>${user.email || "غير متوفر"}</td></tr>
                <tr><th>الاسم الكامل</th><td>${profile?.full_name || "غير متوفر"}</td></tr>
                <tr><th>رقم الهاتف</th><td>${profile?.phone_number || "غير متوفر"}</td></tr>
                <tr><th>فئة الحساب</th><td>${profile?.role === "student" ? "طالب" : profile?.role === "admin" ? "مسؤول" : "عضو المكتبة"}</td></tr>
                <tr><th>الرصيد الحالي</th><td>${profile?.balance || 0} د.ع</td></tr>
                <tr><th>تاريخ الانضمام</th><td>${profile?.created_at ? new Date(profile.created_at).toLocaleDateString('ar-EG') : "غير معروف"}</td></tr>
              </table>
            </div>

            <div class="section">
              <h2>2. العناوين الجغرافية المسجلة للتوصيل</h2>
              ${addresses && addresses.length > 0 ? `
                <table>
                  <thead>
                    <tr>
                      <th>اسم العنوان</th>
                      <th>المنطقة</th>
                      <th>أقرب نقطة دالة</th>
                      <th>رقم الهاتف للتوصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${addresses.map((a: any) => `
                      <tr>
                        <td><strong>${a.title}</strong></td>
                        <td>${a.area}</td>
                        <td>${a.nearby_landmark || "لا يوجد"}</td>
                        <td>${a.phone_number}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : '<p style="color: #71717a; font-style: italic;">لم تقم بإضافة أي عناوين جغرافية مسجلة بعد.</p>'}
            </div>

            <div class="section">
              <h2>3. سجل طلبات الطباعة والخدمات</h2>
              ${orders && orders.length > 0 ? `
                <table>
                  <thead>
                    <tr>
                      <th>رقم الطلب</th>
                      <th>حالة الطلب</th>
                      <th>تاريخ تقديم الطلب</th>
                      <th>التكلفة الكلية</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${orders.map((o: any) => `
                      <tr>
                        <td><code>${o.id.substring(0, 8)}...</code></td>
                        <td>${o.status === "Pending" ? "قيد الانتظار" : o.status === "Printing" ? "جاري الطباعة" : o.status === "Completed" ? "مكتمل" : "ملغي"}</td>
                        <td>${new Date(o.created_at).toLocaleDateString('ar-EG')}</td>
                        <td>${o.total_price || 0} د.ع</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : '<p style="color: #71717a; font-style: italic;">لا توجد أي طلبات طباعة مسجلة في حسابك.</p>'}
            </div>

            <div class="footer">
              تطبيق Phoenix Print للطباعة الذكية للطلاب • كافة البيانات مشفرة وتخضع لسياسات اللائحة العامة لحماية البيانات (GDPR)
            </div>
          </body>
        </html>
      `;

      // Print PDF
      const { uri } = await ExpoPrint.printToFileAsync({ html: htmlContent });
      
      // Share PDF
      await ExpoSharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "تنزيل تقرير بياناتي",
        UTI: "com.adobe.pdf"
      });

    } catch (err: any) {
      console.error(err);
      Alert.alert("خطأ", "حدث خطأ أثناء إعداد وتصدير بياناتك الشخصية: " + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const menuItems = [
    {
      title: "سياسة الخصوصية",
      description: "اقرأ بالتفصيل البيانات التي نجمعها وكيف نؤمنها.",
      icon: "shield",
      route: "/dashboard/privacy/policy",
      color: "#ea580c",
    },
    {
      title: "شروط الاستخدام والخدمة",
      description: "الضوابط القانونية والمسؤوليات الخاصة باستخدام التطبيق.",
      icon: "file-text",
      route: "/dashboard/privacy/terms",
      color: "#ea580c",
    },
    {
      title: "إدارة تراخيص صلاحيات الجهاز",
      description: "فحص وتعديل صلاحيات الوصول مثل الملفات والإشعارات.",
      icon: "key",
      route: "/dashboard/privacy/permissions",
      color: "#ea580c",
    },
    {
      title: "الدعم والمساعدة التقنية",
      description: "تواصل معنا مباشرة عبر البريد الإلكتروني أو تليجرام أو واتساب.",
      icon: "help-circle",
      route: "/dashboard/privacy/support",
      color: "#ea580c",
    },
    {
      title: "معلومات وتراخيص التطبيق",
      description: "رقم الإصدار، تفاصيل المطور وتراخيص المصادر المفتوحة.",
      icon: "info",
      route: "/dashboard/privacy/about",
      color: "#ea580c",
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-right" size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.appBarTitle, { color: themeColors.text }]}>مركز الخصوصية والأمان</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionDesc, { color: themeColors.textMuted }]}>
          ندير بياناتك الشخصية بكل شفافية وموثوقية عالية. يمكنك من هنا قراءة السياسات، تعديل تراخيص الوصول، أو تصدير وحذف حسابك بالكامل.
        </Text>

        <View style={styles.listContainer}>
          {menuItems.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => router.push(item.route as any)}
              style={[styles.menuCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}
            >
              <Feather name="chevron-left" size={16} color={themeColors.textMuted} />
              <View style={styles.cardContent}>
                <Text style={[styles.cardTitle, { color: themeColors.text }]}>{item.title}</Text>
                <Text style={[styles.cardDesc, { color: themeColors.textMuted }]}>{item.description}</Text>
              </View>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(234, 88, 12, 0.08)" }]}>
                <Feather name={item.icon as any} size={18} color={item.color} />
              </View>
            </TouchableOpacity>
          ))}

          {/* Download My Data Button */}
          <TouchableOpacity
            onPress={handleDownloadData}
            disabled={downloading}
            style={[styles.menuCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}
          >
            {downloading ? (
              <ActivityIndicator size="small" color="#ea580c" />
            ) : (
              <Feather name="chevron-left" size={16} color={themeColors.textMuted} />
            )}
            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>تصدير وتنزيل كافة بياناتي</Text>
              <Text style={[styles.cardDesc, { color: themeColors.textMuted }]}>
                تحميل نسخة شاملة من ملفك الشخصي وعناوينك وطلباتك بصيغة PDF.
              </Text>
            </View>
            <View style={[styles.iconWrapper, { backgroundColor: "rgba(34, 197, 94, 0.08)" }]}>
              <Feather name="download" size={18} color="#22c55e" />
            </View>
          </TouchableOpacity>

          {/* Delete Account (Danger Zone) */}
          <TouchableOpacity
            onPress={() => router.push("/dashboard/privacy/delete-account" as any)}
            style={[styles.menuCard, styles.dangerCard, { backgroundColor: themeColors.cardBg, borderColor: "rgba(239, 68, 68, 0.2)" }]}
          >
            <Feather name="chevron-left" size={16} color="#ef4444" />
            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: "#ef4444" }]}>حذف الحساب نهائياً</Text>
              <Text style={[styles.cardDesc, { color: themeColors.textMuted }]}>
                مسح ملفك الشخصي وعناوينك وطلباتك وملفاتك نهائياً وبلا رجعة.
              </Text>
            </View>
            <View style={[styles.iconWrapper, { backgroundColor: "rgba(239, 68, 68, 0.08)" }]}>
              <Feather name="trash-2" size={18} color="#ef4444" />
            </View>
          </TouchableOpacity>
        </View>
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
  },
  sectionDesc: {
    fontSize: 13,
    lineHeight: 22,
    textAlign: "right",
    marginBottom: 24,
  },
  listContainer: {
    gap: 12,
  },
  menuCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  dangerCard: {
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  cardContent: {
    flex: 1,
    marginRight: 16,
    alignItems: "flex-end",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "bold",
  },
  cardDesc: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
    textAlign: "right",
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
