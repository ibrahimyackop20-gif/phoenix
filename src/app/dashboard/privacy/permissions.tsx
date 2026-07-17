import React, { useEffect, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "@/../components/ThemeProvider";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";

type PermStatus = "checking" | "granted" | "denied" | "unavailable" | "system";

export default function PermissionsCenter() {
  const router = useRouter();
  const { themeColors } = useAppTheme();
  const { t, i18n } = useTranslation();
  
  const [locationPerm, setLocationPerm] = useState<PermStatus>("checking");

  const checkPermissions = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setLocationPerm(status === "granted" ? "granted" : "denied");
    } catch (e) {
      setLocationPerm("unavailable");
    }
  };

  useEffect(() => {
    checkPermissions();
  }, []);

  const handleOpenSettings = () => {
    Linking.openSettings();
  };

  const getStatusLabel = (status: PermStatus) => {
    switch (status) {
      case "granted":
        return t("privacy_perm_status_granted");
      case "denied":
        return t("privacy_perm_status_denied");
      case "unavailable":
        return t("privacy_perm_status_unavailable");
      case "checking":
        return t("privacy_perm_status_checking");
      case "system":
        return t("privacy_perm_status_system");
    }
  };

  const permissionItems = useMemo(
    () => [
      {
        title: t("privacy_perm_location_title"),
        description: t("privacy_perm_location_desc"),
        icon: "map-pin",
        status: locationPerm,
        color: locationPerm === "granted" ? "#22c55e" : "#ea580c",
      },
      {
        title: t("privacy_perm_storage_title"),
        description: t("privacy_perm_storage_desc"),
        icon: "folder",
        status: "system" as PermStatus,
        color: "#3b82f6",
      },
      {
        title: t("privacy_perm_camera_title"),
        description: t("privacy_perm_camera_desc"),
        icon: "camera",
        status: "system" as PermStatus,
        color: "#a855f7",
      },
      {
        title: t("privacy_perm_notif_title"),
        description: t("privacy_perm_notif_desc"),
        icon: "bell",
        status: "system" as PermStatus,
        color: "#ec4899",
      },
    ],
    [t, i18n.language, locationPerm]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-right" size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.appBarTitle, { color: themeColors.text }]}>{t("privacy_perm_appbar")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionDesc, { color: themeColors.textMuted }]}>
          {t("privacy_perm_desc")}
        </Text>

        <View style={styles.listContainer}>
          {permissionItems.map((item, idx) => (
            <View key={idx} style={[styles.permCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.badge, { backgroundColor: item.color + "10" }]}>
                  <Text style={[styles.badgeText, { color: item.color }]}>{getStatusLabel(item.status)}</Text>
                </View>
                <View style={styles.headerTitleRow}>
                  <Text style={[styles.permTitle, { color: themeColors.text }]}>{item.title}</Text>
                  <View style={[styles.iconWrapper, { backgroundColor: "rgba(234, 88, 12, 0.08)" }]}>
                    <Feather name={item.icon as any} size={18} color="#ea580c" />
                  </View>
                </View>
              </View>
              <Text style={[styles.permDesc, { color: themeColors.textMuted }]}>{item.description}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity onPress={handleOpenSettings} style={styles.settingsButton}>
          <Feather name="settings" size={16} color="#ffffff" style={styles.btnIcon} />
          <Text style={styles.settingsButtonText}>{t("privacy_perm_open_settings")}</Text>
        </TouchableOpacity>
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
    minHeight: 56,
    paddingVertical: 8,
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
    textAlign: "center",
    flexShrink: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  sectionDesc: {
    fontSize: 13,
    lineHeight: 22,
    textAlign: "right",
    marginBottom: 24,
  },
  listContainer: {
    gap: 16,
    marginBottom: 28,
  },
  permCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 8,
  },
  headerTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    flex: 1,
    marginLeft: 16,
  },
  permTitle: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "right",
    flexShrink: 1,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
    flexShrink: 1,
  },
  permDesc: {
    fontSize: 11,
    lineHeight: 18,
    textAlign: "right",
  },
  settingsButton: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#ea580c",
    borderRadius: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  settingsButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
    flexShrink: 1,
  },
  btnIcon: {
    marginLeft: 4,
  },
});
