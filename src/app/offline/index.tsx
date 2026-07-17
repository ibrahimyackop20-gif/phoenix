import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

export default function OfflineScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { themeColors } = useAppTheme();
  const styles = getStyles(themeColors);

  const handleRetry = () => {
    Alert.alert(t("offline_retry_alert_title"), t("offline_retry_alert_message"));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.iconOuter}>
          <View style={styles.iconGlow} />
          <View style={styles.iconBadge}>
            <Feather name="wifi-off" size={48} color="#ef4444" />
          </View>
        </View>

        <View style={styles.sparklesRow}>
          <Ionicons name="sparkles" size={16} color="#fbbf24" />
          <Text style={styles.badgeText}>{t("offline_badge")}</Text>
          <Ionicons name="sparkles" size={16} color="#fbbf24" />
        </View>

        <Text style={styles.titleText}>{t("offline_title")}</Text>
        <Text style={styles.descriptionText}>{t("offline_description")}</Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleRetry}>
            <Text style={styles.primaryButtonText}>{t("offline_retry")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push("/dashboard/orders" as any)}
          >
            <Text style={styles.secondaryButtonText}>{t("offline_past_orders")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (themeColors: ReturnType<typeof useAppTheme>["themeColors"]) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: themeColors.background,
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
    iconOuter: {
      position: "relative",
      width: 112,
      height: 112,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 32,
    },
    iconGlow: {
      position: "absolute",
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: "rgba(239, 68, 68, 0.1)",
    },
    iconBadge: {
      width: 112,
      height: 112,
      borderRadius: 56,
      backgroundColor: "rgba(239, 68, 68, 0.15)",
      borderWidth: 2,
      borderColor: "rgba(239, 68, 68, 0.3)",
      alignItems: "center",
      justifyContent: "center",
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
      fontSize: 26,
      fontWeight: "bold",
      color: themeColors.text,
      marginBottom: 16,
      textAlign: "center",
    },
    descriptionText: {
      fontSize: 15,
      color: themeColors.textMuted,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 32,
      maxWidth: 290,
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
      backgroundColor: themeColors.cardBg,
      borderWidth: 1,
      borderColor: themeColors.cardBorder,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
      maxWidth: "100%",
    },
    secondaryButtonText: {
      color: themeColors.text,
      fontSize: 13,
      fontWeight: "bold",
      textAlign: "center",
      flexShrink: 1,
    },
  });
