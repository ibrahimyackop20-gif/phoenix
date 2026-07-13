import React, { useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

export default function ComingSoonScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const shimmerAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
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
  }, [shimmerAnim]);

  const shimmerWidth = shimmerAnim.interpolate({
    inputRange: [0.3, 0.7],
    outputRange: ["30%", "70%"],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Phoenix Logo Glow */}
        <View style={styles.logoOuter}>
          <View style={styles.logoGlow} />
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>ف</Text>
          </View>
        </View>

        {/* Floating Sparkles */}
        <View style={styles.sparklesRow}>
          <Ionicons name="sparkles" size={16} color="#fbbf24" />
          <Text style={styles.badgeText}>قريباً</Text>
          <Ionicons name="sparkles" size={16} color="#fbbf24" />
        </View>

        {/* Title */}
        <Text style={styles.titleText}>قسم قيد التطوير</Text>

        {/* Description */}
        <Text style={styles.descriptionText}>
          هذا القسم قيد التطوير حالياً.. انتظرونا قريباً في مكتبة {t("brand_name")}
        </Text>

        {/* Progress Bar */}
        <View style={styles.progressBarBg}>
          <Animated.View
            style={[
              styles.progressBarFill,
              { width: shimmerWidth },
            ]}
          />
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push("/dashboard" as any)}
          >
            <Text style={styles.primaryButtonText}>العودة للوحة التحكم</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push("/dashboard/new-order" as any)}
          >
            <Text style={styles.secondaryButtonText}>طلب طباعة</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#09090b", // zinc-950
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
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
    backgroundColor: "rgba(234, 88, 12, 0.15)", // Primary glow
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
    color: "#fbbf24", // amber-400
  },
  titleText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#f97316", // primary gradient representation
    marginBottom: 16,
  },
  descriptionText: {
    fontSize: 15,
    color: "#a1a1aa", // zinc-400
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
    maxWidth: 280,
  },
  progressBarBg: {
    width: 256,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#18181b", // zinc-900
    borderWidth: 1,
    borderColor: "#27272a", // zinc-800
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
  },
  primaryButton: {
    backgroundColor: "#ea580c",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
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
  },
  secondaryButtonText: {
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "bold",
  },
});
