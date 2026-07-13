import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { supabase } from "../lib/supabaseClient";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "./ThemeProvider";

const navItems = [
  { href: "/admin", label: "dashboard", icon: "layout" as const, lib: "Feather" as const },
  { href: "/admin/users", label: "users", icon: "users" as const, lib: "Feather" as const },
  { href: "/admin/library", label: "library", icon: "book-open" as const, lib: "Feather" as const },
  { href: "/admin/marketplace", label: "my_store", icon: "shopping-bag" as const, lib: "Feather" as const },
  { href: "/admin/pricing", label: "pricing", icon: "tag" as const, lib: "Feather" as const },
  { href: "/admin/reports", label: "reports", icon: "bar-chart-2" as const, lib: "Feather" as const },
  { href: "/admin/payouts", label: "payouts", icon: "dollar-sign" as const, lib: "Feather" as const },
  { href: "/admin/finance", label: "wallet_requests", icon: "credit-card" as const, lib: "Feather" as const },
  { href: "/admin/settings", label: "settings", icon: "settings" as const, lib: "Feather" as const },
];

export default function AdminSidebar() {
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();
          if (data?.full_name) {
            setUserName(data.full_name);
          }
        }
      } catch (err) {
        console.error("AdminSidebar error:", err);
      }
    };
    fetchUserName();
  }, []);

  const handleLogout = async () => {
    Alert.alert(t("logout"), t("logout_confirm") || "هل تريد تسجيل الخروج فعلاً؟", [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("logout"),
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace("/auth/login" as any);
        },
      },
    ]);
  };

  const renderIcon = (item: typeof navItems[0], isActive: boolean) => {
    const color = isActive ? "#f97316" : themeColors.textMuted;
    return (
      <Feather
        name={item.icon as any}
        size={20}
        color={color}
        style={styles.navIcon}
      />
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
      <View style={[styles.container, { backgroundColor: themeColors.background, borderLeftColor: themeColors.cardBorder }]}>
        {/* Logo Section */}
        <View style={[styles.logoSection, { borderBottomColor: themeColors.cardBorder }]}>
          <View style={[styles.logoBadge, { backgroundColor: isDark ? "#ea580c" : "#f97316" }]}>
            <Feather name="printer" size={20} color="#ffffff" />
          </View>
          <View style={styles.brandTextContainer}>
            <Text style={[styles.brandName, { color: themeColors.text }]}>{t("brand_name")}</Text>
            <View style={styles.adminPanelRow}>
              <Feather name="shield" size={10} color={themeColors.textMuted} style={styles.shieldIcon} />
              <Text style={[styles.adminPanelText, { color: themeColors.textMuted }]}>{t("admin_panel")}</Text>
            </View>
          </View>
        </View>

        {/* User Info Section */}
        <View style={[styles.userInfoSection, { borderBottomColor: themeColors.cardBorder }]}>
          <Text style={[styles.welcomeText, { color: themeColors.textMuted }]}>{t("welcome_back")}</Text>
          <Text style={[styles.userName, { color: themeColors.text }]}>{userName}</Text>
        </View>

        {/* Navigation List */}
        <ScrollView style={styles.navScroll} contentContainerStyle={styles.navContent}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <TouchableOpacity
                key={item.href}
                onPress={() => router.push(item.href as any)}
                style={[
                  styles.navItem,
                  isActive && styles.navItemActive,
                ]}
              >
                {isActive && (
                  <Feather
                    name="chevron-left"
                    size={16}
                    color="rgba(249, 115, 22, 0.6)"
                    style={styles.activeIndicator}
                  />
                )}
                <Text
                  style={[
                    styles.navLabel,
                    isActive ? styles.navLabelActive : { color: themeColors.text },
                  ]}
                >
                  {t(item.label)}
                </Text>
                {renderIcon(item, isActive)}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Footer Area */}
        <View style={[styles.footerSection, { borderTopColor: themeColors.cardBorder }]}>
          <TouchableOpacity
            onPress={() => router.push("/dashboard" as any)}
            style={styles.footerButton}
          >
            <Text style={[styles.footerButtonText, { color: themeColors.textMuted }]}>{t("student_panel")}</Text>
            <Feather name="package" size={18} color={themeColors.textMuted} style={styles.footerIcon} />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutButtonText}>{t("logout")}</Text>
            <Feather name="log-out" size={18} color="#ef4444" style={styles.footerIcon} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    borderLeftWidth: 1,
  },
  logoSection: {
    padding: 20,
    borderBottomWidth: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#f97316",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  brandTextContainer: {
    alignItems: "flex-end",
  },
  brandName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  adminPanelRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginTop: 2,
  },
  shieldIcon: {
    marginLeft: 4,
  },
  adminPanelText: {
    fontSize: 10,
  },
  userInfoSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    alignItems: "flex-end",
  },
  welcomeText: {
    fontSize: 11,
  },
  userName: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 2,
  },
  navScroll: {
    flex: 1,
  },
  navContent: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 6,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  navItemActive: {
    backgroundColor: "rgba(249, 115, 22, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.2)",
  },
  navIcon: {
    marginLeft: 12,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  navLabelActive: {
    color: "#f97316",
  },
  activeIndicator: {
    marginRight: "auto",
  },
  footerSection: {
    padding: 12,
    borderTopWidth: 1,
    gap: 6,
  },
  footerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  footerIcon: {
    marginLeft: 12,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ef4444",
  },
});
