import React, { useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabaseClient";
import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

/**
 * Auth Callback Route (React Native)
 * - Intercepts incoming code verification parameters
 * - Exchanges verification code for active session
 * - Redirects to /dashboard on success, or /auth/login on failure
 */
export default function AuthCallback() {
  const router = useRouter();
  const { code, next = "/dashboard" } = useLocalSearchParams();
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const styles = getStyles(themeColors);

  useEffect(() => {
    const handleCallback = async () => {
      if (code) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code as string);

          if (!error) {
            router.replace(next as any);
          } else {
            console.error("Session exchange error:", error.message);
            router.replace("/auth/login" as any);
          }
        } catch (err) {
          console.error("AuthCallback exception:", err);
          router.replace("/auth/login" as any);
        }
      } else {
        router.replace("/auth/login" as any);
      }
    };

    handleCallback();
  }, [code, next, router]);

  return (
    <View style={styles.overlay}>
      <GlassView style={styles.glassCard} glassEffectStyle="regular" colorScheme={isDark ? "dark" : "light"}>
        <View style={styles.loadingContainer}>
          <View style={styles.spinnerWrapper}>
            <ActivityIndicator size="large" color="#f97316" />
            <Ionicons
              name="sparkles"
              size={20}
              color="#f97316"
              style={styles.sparklesIcon}
            />
          </View>
          <Text style={styles.loadingTitle}>{t("auth_callback_verifying")}</Text>
          <Text style={styles.loadingText}>{t("auth_login_subtitle")}</Text>
        </View>
      </GlassView>
    </View>
  );
}

const getStyles = (themeColors: ReturnType<typeof useAppTheme>["themeColors"]) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: themeColors.background,
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    },
    glassCard: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: themeColors.cardBorder,
      overflow: "hidden",
      maxWidth: 320,
      width: "100%",
    },
    loadingContainer: {
      padding: 32,
      alignItems: "center",
    },
    spinnerWrapper: {
      position: "relative",
      marginBottom: 24,
      alignItems: "center",
      justifyContent: "center",
      width: 64,
      height: 64,
    },
    sparklesIcon: {
      position: "absolute",
      alignSelf: "center",
    },
    loadingTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: themeColors.text,
      marginBottom: 8,
      textAlign: "center",
      flexShrink: 1,
    },
    loadingText: {
      fontSize: 14,
      color: themeColors.textMuted,
      textAlign: "center",
      lineHeight: 20,
      flexShrink: 1,
    },
  });
