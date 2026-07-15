import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "@/../components/ThemeProvider";

export default function PrivacyPolicy() {
  const router = useRouter();
  const { themeColors } = useAppTheme();

  const sections = [
    {
      title: "1. البيانات التي نجمعها عنك",
      content: "نقوم بجمع بعض المعلومات الضرورية لتقديم خدمة طباعة وتوصيل المستندات مثل: اسمك الكامل، عنوان البريد الإلكتروني للتوثيق، رقم الهاتف للتواصل عند التوصيل، الصورة الشخصية للملف، والعناوين الجغرافية الدقيقة (الموقع الدقيق) لتسليم الطلبات بالموقع الصحيح.",
    },
    {
      title: "2. كيف ولماذا نجمع هذه البيانات؟",
      content: "تُجمع البيانات بشكل مباشر عندما تقوم بإنشاء حساب أو رفع ملف للطباعة. تهدف هذه البيانات حصراً لتحديد هويتك وتفادي إساءة الاستخدام، وتوصيل الطلبات بنجاح، وإرسال تحديثات حالة الطلب عبر الإشعارات الفورية.",
    },
    {
      title: "3. كيفية تخزين وأمان ملفات الطباعة",
      content: "عند رفع مستنداتك للطباعة (مثل ملفات PDF أو Word)، يتم تشفيرها وتخزينها بشكل آمن داخل خوادم تخزين Supabase Storage المحمية بسياسات الوصول الصارمة (RLS). لا يمكن لأي مستخدم آخر أو جهة خارجية قراءة مستنداتك باستثناء المسؤولين المخولين بطباعة طلبك. يتم مسح مستنداتك نهائياً من الخوادم تلقائياً بعد اكتمال تسليم الطلب أو عند قيامك بحذف الحساب.",
    },
    {
      title: "4. التوثيق واستخدام Supabase",
      content: "نستخدم منصة Supabase السحابية لإدارة قواعد البيانات والتحقق من الهوية الآمن (Authentication) عبر ميزة الروابط السحرية ورموز التوثيق OTP المشفرة. لا نقوم بتخزين كلمات المرور بطرق مكشوفة أو تقليدية، مما يزيد من مستوى الأمان وحماية حسابك من الاختراق.",
    },
    {
      title: "5. إشعارات النظام وتحديثات الطلبات",
      content: "نرسل لك إشعارات فورية على هاتفك لإبلاغك عند تغير حالة طلبك (مثال: جاري الطباعة، تم الشحن، أو تم التوصيل). يمكنك تعديل أو إيقاف هذه الإشعارات من خلال إعدادات جهازك في أي وقت.",
    },
    {
      title: "6. حقوقك القانونية (GDPR)",
      content: "بموجب قوانين حماية البيانات وحقوق المستخدم، يحق لك في أي وقت: تصدير وتنزيل نسخة شاملة من بياناتك بصيغة PDF، تعديل بياناتك أو عناوينك المسجلة، أو حذف حسابك وكافة سجلاتك وملفاتك المرفوعة بشكل نهائي من قواعد البيانات.",
    },
    {
      title: "7. التواصل والاستفسارات",
      content: "إذا كان لديك أي سؤال أو استفسار بخصوص سياسة الخصوصية الخاصة بنا، يمكنك التواصل معنا مباشرة عبر البريد الإلكتروني الرسمي للمساعدة: support@phoenixprint.com",
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-right" size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.appBarTitle, { color: themeColors.text }]}>سياسة الخصوصية وحماية البيانات</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.introHeader}>
          <View style={styles.iconWrapper}>
            <Feather name="shield" size={32} color="#ea580c" />
          </View>
          <Text style={[styles.introTitle, { color: themeColors.text }]}>خصوصيتك هي أولويتنا القصوى</Text>
          <Text style={[styles.introDate, { color: themeColors.textMuted }]}>آخر تحديث: يوليو 2026</Text>
        </View>

        <View style={styles.contentBody}>
          {sections.map((sec, idx) => (
            <View key={idx} style={[styles.sectionCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{sec.title}</Text>
              <Text style={[styles.sectionText, { color: themeColors.textMuted }]}>{sec.content}</Text>
            </View>
          ))}
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
    paddingBottom: 40,
  },
  introHeader: {
    alignItems: "center",
    marginBottom: 28,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(234, 88, 12, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  introTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  introDate: {
    fontSize: 11,
    marginTop: 6,
  },
  contentBody: {
    gap: 16,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "right",
  },
  sectionText: {
    fontSize: 12,
    lineHeight: 20,
    textAlign: "right",
  },
});
