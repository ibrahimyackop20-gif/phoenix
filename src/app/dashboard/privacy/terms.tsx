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

export default function TermsOfService() {
  const router = useRouter();
  const { themeColors } = useAppTheme();

  const sections = [
    {
      title: "1. قبول الشروط والأحكام",
      content: "باستخدامك لتطبيق Phoenix Print، فإنك توافق بشكل كامل وصريح على الشروط والأحكام المذكورة هنا. إذا كنت لا توافق على أي بند من هذه الشروط، يرجى التوقف عن استخدام الخدمة فوراً.",
    },
    {
      title: "2. مسؤولية المستخدم وحسابه",
      content: "أنت مسؤول مسؤولية تامة عن الحفاظ على سرية رمز الدخول وحسابك الشخصي. تلتزم بتقديم معلومات صحيحة ودقيقة مثل الاسم الكامل، رقم الهاتف النشط، والعنوان الجغرافي لتفادي أي مشاكل في تسليم الطلبات أو الاتصال.",
    },
    {
      title: "3. قواعد وضوابط رفع المستندات للطباعة",
      content: "يُحظر رفع أي مستندات تخالف القوانين السائدة في بلدك أو تحتوي على إساءة، بذاءة، تحريض على العنف أو الكراهية، أو أي محتوى سياسي حساس. يقع على عاتقك بالكامل ضمان ألا تنتهك هذه الملفات خصوصية أو أمان أي فرد آخر.",
    },
    {
      title: "4. حقوق النشر والملكية الفكرية",
      content: "يجب أن تكون المالك الشرعي للمستندات والملفات التي تطلب طباعتها، أو تملك ترخيصاً كتابياً يعطيك الحق في نسخها وتداولها. تطبيق Phoenix Print لا يتحمل أي مسؤولية قانونية عن انتهاك المستخدم لحقوق الملكية الفكرية أو الطبع والنشر للمطبوعات.",
    },
    {
      title: "5. شروط خدمات الطباعة والتسعير",
      content: "يتم تحديد أسعار خدمات الطباعة (سعر الصفحة، الألوان، التغليف، الخ) وتكاليف التوصيل بوضوح في شاشات الحساب وسلة المشتريات. يحق للتطبيق تعديل الأسعار مستقبلاً حسب تكلفة المواد الأولية، ولكن لا تسري التغييرات على الطلبات النشطة التي تم دفعها بالفعل.",
    },
    {
      title: "6. طرق الدفع وسياسات الإلغاء",
      content: "تتم تسوية مدفوعات الطلبات عن طريق الدفع النقدي عند الاستلام (COD)، أو الدفع المسبق عبر المحافظ الإلكترونية المعتمدة وإرفاق إيصال التحويل. نظراً لطبيعة الخدمة المخصصة، لا يمكن إلغاء طلبات الطباعة أو استرداد قيمتها بعد دخولها مرحلة جاري الطباعة (Printing).",
    },
    {
      title: "7. تعليق وإنهاء الحسابات",
      content: "يحتفظ تطبيق Phoenix Print بالحق الكامل في تعليق حسابك أو حظره نهائياً في حال مخالفة أي بند من شروط الخدمة، أو تكرار تقديم طلبات وهمية، أو عند الاشتباه في وجود نشاط احتيالي دون الحاجة لإنذار مسبق.",
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-right" size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.appBarTitle, { color: themeColors.text }]}>شروط الخدمة والاستخدام</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.introHeader}>
          <View style={styles.iconWrapper}>
            <Feather name="file-text" size={32} color="#ea580c" />
          </View>
          <Text style={[styles.introTitle, { color: themeColors.text }]}>شروط وضوابط استخدام الخدمة</Text>
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
