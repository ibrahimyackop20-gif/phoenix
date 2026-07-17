import React, { useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

const FEATURE_TITLE_KEYS = new Set(["library", "my_store"]);

export default function ComingSoonScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ feature?: string | string[] }>();
  const shimmerAnim = useRef(new Animated.Value(0.3)).current;

  const featureKey = useMemo(() => {
    const raw = Array.isArray(params.feature)
      ? params.feature[0]
      : params.feature;
    // Contact Us is live — send legacy Coming Soon Contact links there.
    if (!raw || raw === "contact_us") {
      return null;
    }
    if (FEATURE_TITLE_KEYS.has(raw)) return raw;
    return "library";
  }, [params.feature]);

  useEffect(() => {
    if (featureKey === null) {
      router.replace("/dashboard/contact" as any);
    }
  }, [featureKey, router]);

  useEffect(() => {
    if (featureKey === null) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 0.7,
          duration: 1500,
          useNativeDriver: false,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0.3,
          duration: 1500,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, [featureKey, shimmerAnim]);

  const shimmerWidth = shimmerAnim.interpolate({
    inputRange: [0.3, 0.7],
    outputRange: ["30%", "70%"],
  });

  if (featureKey === null) {
    return null;
  }

  const pageTitle = t(featureKey);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Screen header title — feature-specific (Library vs Contact) */}
        <Text style={styles.screenHeader} accessibilityRole="header">
          {pageTitle}
        </Text>

        <View style={styles.logoOuter}>
          <View style={styles.logoGlow} />
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>ف</Text>
          </View>
        </View>

        <View style={styles.sparklesRow}>
          <Ionicons name="sparkles" size={16} color="#fbbf24" />
          <Text style={styles.badgeText}>{t("soon")}</Text>
          <Ionicons name="sparkles" size={16} color="#fbbf24" />
        </View>

        <Text style={styles.titleText}>{t("coming_soon_heading")}</Text>

        <Text style={styles.descriptionText}>
          {t("coming_soon_body", { section: pageTitle, brand: t("brand_name") })}
        </Text>

        <View style={styles.progressBarBg}>
          <Animated.View
            style={[styles.progressBarFill, { width: shimmerWidth }]}
          />
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push("/dashboard" as any)}
          >
            <Text style={styles.primaryButtonText}>{t("back_to_dashboard")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push("/dashboard/new-order" as any)}
          >
            <Text style={styles.secondaryButtonText}>{t("new_order")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  container: {
      flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
      paddingVertical: 32,
      width: "100%",
      maxWidth: 640,
      alignSelf: "center",
  },
  screenHeader: {
    alignSelf: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#f4f4f5",
      textAlign: "center",
      flexShrink: 1,
      marginBottom: 32,
  },
  logoOuter: {
    position: "relative",
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  logoGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(234, 88, 12, 0.15)",
  },
  logoBadge: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 4,
    borderColor: "rgba(234, 88, 12, 0.2)",
  },
  logoText: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#ffffff",
  },
  sparklesRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#fbbf24",
      textAlign: "center",
      flexShrink: 1,
  },
  titleText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#f97316",
    marginBottom: 16,
      textAlign: "center",
      flexShrink: 1,
  },
  descriptionText: {
    fontSize: 15,
    color: "#a1a1aa",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
    maxWidth: 280,
  },
  progressBarBg: {
    width: 256,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    overflow: "hidden",
    marginBottom: 32,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#ea580c",
  },
  actionsRow: {
    flexDirection: "row-reverse",
    gap: 12,
      flexWrap: "wrap",
      justifyContent: "center",
      width: "100%",
  },
  primaryButton: {
    backgroundColor: "#ea580c",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
      minHeight: 48,
      maxWidth: "100%",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
      textAlign: "center",
      flexShrink: 1,
  },
  secondaryButton: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
      minHeight: 48,
      maxWidth: "100%",
  },
  secondaryButtonText: {
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "bold",
      textAlign: "center",
      flexShrink: 1,
  },
});
