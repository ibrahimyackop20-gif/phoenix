import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather, Ionicons } from "@expo/vector-icons";

export default function OfflineScreen() {
  const router = useRouter();

  const handleRetry = () => {
    Alert.alert("جاري الاتصال", "يتم محاولة إعادة الاتصال بالخادم الآن...");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* WifiOff Icon */}
        <View style={styles.iconOuter}>
          <View style={styles.iconGlow} />
          <View style={styles.iconBadge}>
            <Feather name="wifi-off" size={48} color="#ef4444" />
          </View>
        </View>

        {/* Status Sparkles */}
        <View style={styles.sparklesRow}>
          <Ionicons name="sparkles" size={16} color="#fbbf24" />
          <Text style={styles.badgeText}>غير متصل</Text>
          <Ionicons name="sparkles" size={16} color="#fbbf24" />
        </View>

        {/* Title */}
        <Text style={styles.titleText}>أنت غير متصل بالإنترنت</Text>

        {/* Description */}
        <Text style={styles.descriptionText}>
          عذراً، أنت غير متصل بالإنترنت. يمكنك تصفح طلباتك السابقة من هنا عند عودة الاتصال.
        </Text>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleRetry}
          >
            <Text style={styles.primaryButtonText}>إعادة المحاولة</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push("/dashboard/orders" as any)}
          >
            <Text style={styles.secondaryButtonText}>طلباتي السابقة</Text>
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
    backgroundColor: "rgba(239, 68, 68, 0.1)", // Red glow
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
    color: "#fbbf24", // amber-400
  },
  titleText: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 16,
    textAlign: "center",
  },
  descriptionText: {
    fontSize: 15,
    color: "#a1a1aa", // zinc-400
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
    maxWidth: 290,
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
