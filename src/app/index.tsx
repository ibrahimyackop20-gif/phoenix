import React, { useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/../lib/supabaseClient";
import { getPostGoogleAuthDestination } from "@/../lib/googleAuth";
import { markPostAuthNavigation } from "@/../lib/postAuthNavigation";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../components/ThemeProvider";

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { themeColors, isDark } = useAppTheme();
  const styles = getStyles(themeColors, isDark);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          const target = getPostGoogleAuthDestination(session);
          console.log("[Index][NAV] session found →", target, {
            email: session.user.email,
            authState: "authenticated",
          });
          markPostAuthNavigation(target);
          router.replace(target as any);
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
        <View style={styles.heroSection}>
          <View style={styles.badgeContainer}>
            <Ionicons name="sparkles" size={14} color="#ea580c" />
            <Text style={styles.badgeText}>{t("land_badge")}</Text>
          </View>

          <Text style={styles.titleText}>
            <Text style={styles.orangeText}>{t("land_title_print")}</Text>{"\n"}
            <Text style={styles.whiteText}>{t("land_title_easy")}</Text>
          </Text>

          <Text style={styles.subtitleText}>{t("land_subtitle")}</Text>

          <View style={styles.ctaContainer}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push("/auth/signup" as any)}
            >
              <Text style={styles.primaryButtonText}>{t("land_cta_start")}</Text>
              <Feather name="arrow-left" size={18} color="#ffffff" style={styles.buttonIcon} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push("/auth/login" as any)}
            >
              <Text style={styles.secondaryButtonText}>{t("auth_login_btn")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>{t("land_how_title")}</Text>
          <Text style={styles.sectionSubtitle}>{t("land_how_subtitle")}</Text>

          <View style={styles.featuresGrid}>
            <View style={styles.featureCard}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(234, 88, 12, 0.12)" }]}>
                <Feather name="upload" size={24} color="#ea580c" />
              </View>
              <Text style={styles.featureTitle}>{t("land_feature1_title")}</Text>
              <Text style={styles.featureDesc}>{t("land_feature1_desc")}</Text>
            </View>

            <View style={styles.featureCard}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(249, 115, 22, 0.12)" }]}>
                <Feather name="clipboard" size={24} color="#f97316" />
              </View>
              <Text style={styles.featureTitle}>{t("land_feature2_title")}</Text>
              <Text style={styles.featureDesc}>{t("land_feature2_desc")}</Text>
            </View>

            <View style={styles.featureCard}>
              <View style={[styles.iconWrapper, { backgroundColor: "rgba(59, 130, 246, 0.12)" }]}>
                <Feather name="credit-card" size={24} color="#3b82f6" />
              </View>
              <Text style={styles.featureTitle}>{t("land_feature3_title")}</Text>
              <Text style={styles.featureDesc}>{t("land_feature3_desc")}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLogoRow}>
            <View style={styles.logoBadge}>
              <Feather name="printer" size={16} color="#ffffff" />
            </View>
            <Text style={styles.footerLogoText}>
              {t("land_footer_brand", { brand: t("brand_name") })}
            </Text>
          </View>
          <Text style={styles.footerCopyText}>
            {t("land_footer_copyright", {
              year: new Date().getFullYear(),
              brand: t("brand_name"),
            })}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (themeColors: ReturnType<typeof useAppTheme>["themeColors"], isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: themeColors.background,
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
      color: "#fb923c",
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
      color: "#f97316",
    },
    whiteText: {
      color: themeColors.text,
    },
    subtitleText: {
      fontSize: 15,
      color: themeColors.textMuted,
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
      backgroundColor: "#ea580c",
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
      backgroundColor: themeColors.cardBg,
      borderWidth: 1,
      borderColor: themeColors.cardBorder,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryButtonText: {
      color: themeColors.text,
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
      color: themeColors.textMuted,
      textAlign: "center",
      marginBottom: 32,
    },
    featuresGrid: {
      gap: 20,
    },
    featureCard: {
      backgroundColor: themeColors.cardBg,
      borderWidth: 1,
      borderColor: themeColors.cardBorder,
      borderRadius: 20,
      padding: 24,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.06,
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
      color: themeColors.text,
      marginBottom: 8,
      textAlign: "center",
    },
    featureDesc: {
      fontSize: 13,
      color: themeColors.textMuted,
      textAlign: "center",
      lineHeight: 18,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: themeColors.cardBorder,
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
      color: themeColors.textMuted,
    },
  });
