import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/../lib/supabaseClient";
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [checkingAuth] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          router.replace("/dashboard" as any);
        }
      } catch (err) {
        console.error("Auth check failed:", err);
      }
    };
    checkUser();
  }, [router]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          {/* Badge */}
          <View style={styles.badgeContainer}>
            <Ionicons name="sparkles" size={14} color="#ea580c" />
            <Text style={styles.badgeText}>خدمة طباعة احترافية للطلاب</Text>
          </View>

          {/* Title */}
          <Text style={styles.titleText}>
            <Text style={styles.orangeText}>اطبع ملفاتك</Text>{"\n"}
            <Text style={styles.whiteText}>بسهولة وسرعة</Text>
          </Text>

          {/* Subtitle */}
          <Text style={styles.subtitleText}>
            ارفع ملفاتك، حدد التفاصيل، وتابع حالة طلبك في الوقت الحقيقي. خدمة طباعة موثوقة بأسعار مناسبة للطلاب.
          </Text>

          {/* CTAs */}
          <View style={styles.ctaContainer}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push("/auth/signup" as any)}
            >
              <Text style={styles.primaryButtonText}>ابدأ الآن</Text>
              <Feather name="arrow-left" size={18} color="#ffffff" style={styles.buttonIcon} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push("/auth/login" as any)}
            >
              <Text style={styles.secondaryButtonText}>تسجيل الدخول</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Features Section */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>كيف تعمل الخدمة؟</Text>
          <Text style={styles.sectionSubtitle}>ثلاث خطوات بسيطة للحصول على نسخك المطبوعة</Text>

          <View style={styles.featuresGrid}>
            {/* Feature 1 */}
            <View style={styles.featureCard}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(234, 88, 12, 0.12)" }]}>
                <Feather name="upload" size={24} color="#ea580c" />
              </View>
              <Text style={styles.featureTitle}>ارفع ملفاتك</Text>
              <Text style={styles.featureDesc}>
                ارفع ملفات PDF أو صور بسهولة عبر السحب والإفلات أو اختيار الملف
              </Text>
            </View>

            {/* Feature 2 */}
            <View style={styles.featureCard}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(249, 115, 22, 0.12)" }]}>
                <Feather name="clipboard" size={24} color="#f97316" />
              </View>
              <Text style={styles.featureTitle}>تابع طلبك</Text>
              <Text style={styles.featureDesc}>
                تتبع حالة طلبك في الوقت الحقيقي من قيد الانتظار حتى الجاهزية
              </Text>
            </View>

            {/* Feature 3 */}
            <View style={styles.featureCard}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(59, 130, 246, 0.12)" }]}>
                <Feather name="credit-card" size={24} color="#3b82f6" />
              </View>
              <Text style={styles.featureTitle}>ادفع واستلم</Text>
              <Text style={styles.featureDesc}>
                ادفع بسهولة عبر بوابة الدفع واستلم نسخك المطبوعة بجودة عالية
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLogoRow}>
            <View style={styles.logoBadge}>
              <Feather name="printer" size={16} color="#ffffff" />
            </View>
            <Text style={styles.footerLogoText}>{t("brand_name")} للطباعة</Text>
          </View>
          <Text style={styles.footerCopyText}>
            © {new Date().getFullYear()} {t("brand_name")} للطباعة. جميع الحقوق محفوظة.
          </Text>
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
  scrollContent: {
    paddingBottom: 40,
  },
  heroSection: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  badgeContainer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(234, 88, 12, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(234, 88, 12, 0.2)",
    borderRadius: 9999,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  badgeText: {
    color: "#fb923c", // orange-400
    fontSize: 12,
    fontWeight: "600",
  },
  titleText: {
    fontSize: 36,
    fontWeight: "900",
    textAlign: "center",
    lineHeight: 46,
    marginBottom: 16,
  },
  orangeText: {
    color: "#f97316", // primary orange
  },
  whiteText: {
    color: "#f4f4f5", // zinc-100
  },
  subtitleText: {
    fontSize: 15,
    color: "#a1a1aa", // zinc-400
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
    marginBottom: 36,
  },
  ctaContainer: {
    flexDirection: "column",
    width: "100%",
    gap: 12,
    paddingHorizontal: 16,
  },
  primaryButton: {
    backgroundColor: "#ea580c", // primary orange-600
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
  buttonIcon: {
    marginRight: 8,
  },
  secondaryButton: {
    backgroundColor: "#18181b", // zinc-900
    borderWidth: 1,
    borderColor: "#27272a", // zinc-800
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#f4f4f5",
    fontSize: 16,
    fontWeight: "bold",
  },
  featuresSection: {
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#f97316",
    textAlign: "center",
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#71717a",
    textAlign: "center",
    marginBottom: 32,
  },
  featuresGrid: {
    gap: 20,
  },
  featureCard: {
    backgroundColor: "#18181b", // zinc-900
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 8,
    textAlign: "center",
  },
  featureDesc: {
    fontSize: 13,
    color: "#71717a",
    textAlign: "center",
    lineHeight: 18,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#27272a",
    paddingVertical: 32,
    alignItems: "center",
    gap: 12,
  },
  footerLogoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  logoBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
  },
  footerLogoText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#f97316",
  },
  footerCopyText: {
    fontSize: 11,
    color: "#71717a",
  },
});
