import React, { useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
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
import { useResponsiveTheme } from "../hooks/useResponsiveTheme";
import { HeroIllustration } from "../components/landing/HeroIllustration";
import { ScreenTransition } from "../components/anim/ScreenTransition";
import { PressableScale } from "../components/anim/PressableScale";

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { themeColors, isDark } = useAppTheme();
  const { horizontalPadding, isTablet, fontScale } = useResponsiveTheme();
  const styles = getStyles(themeColors, isDark, horizontalPadding, isTablet, fontScale);

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
      <ScreenTransition>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          {/* Hero visual: transparent PNG floating over subtle depth (Views only) */}
          <View style={styles.heroVisual}>
            {/* Decorative depth behind ONLY the printer — no gradients, no cards */}
            <View style={styles.bgGlow} pointerEvents="none" />
            <View style={styles.bgCircleLarge} pointerEvents="none" />
            <View style={styles.bgCircleSmall} pointerEvents="none" />

            {/* Official hero illustration */}
            <HeroIllustration />
          </View>

          <View style={styles.badgeContainer}>
            <Ionicons name="sparkles" size={14} color={themeColors.primary} />
            <Text style={styles.badgeText} maxFontSizeMultiplier={1.35}>{t("land_badge")}</Text>
          </View>

          <Text style={styles.titleText} maxFontSizeMultiplier={1.3}>
            <Text style={styles.orangeText}>{t("land_title_print")}</Text>{"\n"}
            <Text style={styles.whiteText}>{t("land_title_easy")}</Text>
          </Text>

          <Text style={styles.subtitleText} maxFontSizeMultiplier={1.35}>{t("land_subtitle")}</Text>

          <View style={styles.ctaContainer}>
            <PressableScale
              style={styles.primaryButton}
              onPress={() => router.push("/auth/signup" as any)}
            >
              <Text style={styles.primaryButtonText}>{t("land_cta_start")}</Text>
              <Feather name="arrow-left" size={18} color={themeColors.onAccent} style={styles.buttonIcon} />
            </PressableScale>

            <PressableScale
              style={styles.secondaryButton}
              onPress={() => router.push("/auth/login" as any)}
            >
              <Text style={styles.secondaryButtonText}>{t("auth_login_btn")}</Text>
            </PressableScale>
          </View>
        </View>

        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>{t("land_how_title")}</Text>
          <Text style={styles.sectionSubtitle}>{t("land_how_subtitle")}</Text>

          <View style={styles.featuresGrid}>
            <View style={styles.featureCard}>
              <View style={[styles.iconWrapper, { backgroundColor: themeColors.primarySoftBg }]}>
                <Feather name="upload" size={24} color={themeColors.primary} />
              </View>
              <Text style={styles.featureTitle}>{t("land_feature1_title")}</Text>
              <Text style={styles.featureDesc}>{t("land_feature1_desc")}</Text>
            </View>

            <View style={styles.featureCard}>
              <View style={[styles.iconWrapper, { backgroundColor: themeColors.accentSoftBg }]}>
                <Feather name="clipboard" size={24} color={themeColors.brandTint} />
              </View>
              <Text style={styles.featureTitle}>{t("land_feature2_title")}</Text>
              <Text style={styles.featureDesc}>{t("land_feature2_desc")}</Text>
            </View>

            <View style={styles.featureCard}>
              <View style={[styles.iconWrapper, { backgroundColor: themeColors.statBlueBg }]}>
                <Feather name="credit-card" size={24} color={themeColors.blueStrong} />
              </View>
              <Text style={styles.featureTitle}>{t("land_feature3_title")}</Text>
              <Text style={styles.featureDesc}>{t("land_feature3_desc")}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLogoRow}>
            <View style={styles.logoBadge}>
              <Feather name="printer" size={16} color={themeColors.onAccent} />
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
      </ScreenTransition>
    </SafeAreaView>
  );
}

const getStyles = (
  themeColors: ReturnType<typeof useAppTheme>["themeColors"],
  isDark: boolean,
  horizontalPadding: number,
  isTablet: boolean,
  fontScale: number
) => {
  const titleSize = Math.min(36 * fontScale, 46);
  const titleLineHeight = Math.min(46 * fontScale, 56);

  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: themeColors.screenBg,
    },
    scrollContent: {
      paddingBottom: 40,
      width: "100%",
      maxWidth: isTablet ? 1024 : 720,
      alignSelf: "center",
    },
    heroSection: {
      alignItems: "center",
      paddingTop: 20,
      paddingBottom: 52,
      paddingHorizontal: horizontalPadding,
      position: "relative",
    },
    heroVisual: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    bgGlow: {
      position: "absolute",
      top: "50%",
      left: "50%",
      marginTop: -150,
      marginLeft: -150,
      width: 300,
      height: 300,
      borderRadius: 150,
      backgroundColor: themeColors.accentSoftBg,
    },
    bgCircleLarge: {
      position: "absolute",
      top: "50%",
      left: "50%",
      marginTop: -190,
      marginLeft: -190,
      width: 380,
      height: 380,
      borderRadius: 190,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255, 90, 31, 0.06)" : themeColors.accentSoftBorder,
    },
    bgCircleSmall: {
      position: "absolute",
      top: "50%",
      left: "50%",
      marginTop: -115,
      marginLeft: -115,
      width: 230,
      height: 230,
      borderRadius: 115,
      borderWidth: 1,
      borderColor: themeColors.accentSoftBorder,
    },
    badgeContainer: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 6,
      backgroundColor: themeColors.primarySoftBg,
      borderWidth: 1,
      borderColor: themeColors.primarySoftBorder,
      borderRadius: 9999,
      paddingVertical: 6,
      paddingHorizontal: 16,
      marginTop: 24,
      maxWidth: "100%",
    },
    badgeText: {
      color: themeColors.brandTint,
      fontSize: 12,
      fontWeight: "600",
      textAlign: "center",
      flexShrink: 1,
    },
    titleText: {
      fontSize: titleSize,
      fontWeight: "900",
      textAlign: "center",
      lineHeight: titleLineHeight,
      marginTop: 16,
      flexShrink: 1,
    },
    orangeText: {
      color: themeColors.brandTint,
    },
    whiteText: {
      color: themeColors.textStrong,
    },
    subtitleText: {
      fontSize: 15,
      color: themeColors.textSoft,
      textAlign: "center",
      lineHeight: 22,
      maxWidth: 360,
      marginTop: 12,
      paddingHorizontal: 8,
    },
    ctaContainer: {
      flexDirection: "column",
      width: "100%",
      gap: 16,
      paddingHorizontal: horizontalPadding,
      maxWidth: 440,
      marginTop: 32,
    },
    primaryButton: {
      backgroundColor: themeColors.primary,
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 18,
      minHeight: 56,
      paddingVertical: 14,
      shadowColor: themeColors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.2,
      shadowRadius: 10,
      elevation: 6,
    },
    primaryButtonText: {
      color: themeColors.onAccent,
      fontSize: 16,
      fontWeight: "bold",
      textAlign: "center",
      flexShrink: 1,
    },
    buttonIcon: {
      marginRight: 8,
    },
    secondaryButton: {
      backgroundColor: themeColors.surface,
      borderWidth: 1,
      borderColor: themeColors.borderSoft,
      borderRadius: 18,
      minHeight: 56,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryButtonText: {
      color: themeColors.textStrong,
      fontSize: 16,
      fontWeight: "bold",
      textAlign: "center",
      flexShrink: 1,
    },
    featuresSection: {
      paddingVertical: 40,
      paddingHorizontal: horizontalPadding,
    },
    sectionTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: themeColors.brandTint,
      textAlign: "center",
      marginBottom: 8,
    },
    sectionSubtitle: {
      fontSize: 14,
      color: themeColors.textSoft,
      textAlign: "center",
      marginBottom: 32,
    },
    featuresGrid: {
      gap: 20,
      flexDirection: isTablet ? "row" : "column",
      flexWrap: isTablet ? "wrap" : "nowrap",
    },
    featureCard: {
      backgroundColor: themeColors.surface,
      borderWidth: 1,
      borderColor: themeColors.borderSoft,
      borderRadius: 20,
      padding: 24,
      alignItems: "center",
      shadowColor: themeColors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 4,
      elevation: 3,
      flex: isTablet ? 1 : undefined,
      minWidth: isTablet ? "30%" : undefined,
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
      color: themeColors.textStrong,
      marginBottom: 8,
      textAlign: "center",
    },
    featureDesc: {
      fontSize: 13,
      color: themeColors.textSoft,
      textAlign: "center",
      lineHeight: 18,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: themeColors.borderSoft,
      paddingVertical: 32,
      alignItems: "center",
      gap: 12,
    },
    footerLogoRow: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 20,
    },
    logoBadge: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: themeColors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    footerLogoText: {
      fontSize: 15,
      fontWeight: "bold",
      color: themeColors.brandTint,
      textAlign: "center",
      flexShrink: 1,
    },
    footerCopyText: {
      fontSize: 11,
      color: themeColors.textSoft,
      textAlign: "center",
      paddingHorizontal: 20,
      flexShrink: 1,
    },
  });
};
