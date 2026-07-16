import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Image,
  ScrollView,
  Dimensions,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Slot, useRouter, usePathname } from "expo-router";
import { supabase } from "../../../lib/supabaseClient";
import AdminPushProvider from "../../../components/AdminPushProvider";
import { useAppTheme } from "../../../components/ThemeProvider";
import { isPrimaryAdminEmail, resolveAuthEmail } from "../../../lib/adminAccess";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

const { width } = Dimensions.get("window");

const navItems = [
  { href: "/admin", label: "dashboard", icon: "layout" as const },
  { href: "/admin/users", label: "users", icon: "users" as const },
  { href: "/admin/library", label: "library", icon: "book-open" as const },
  { href: "/admin/marketplace", label: "my_store", icon: "shopping-bag" as const },
  { href: "/admin/pricing", label: "pricing", icon: "tag" as const },
  { href: "/admin/reports", label: "reports", icon: "bar-chart-2" as const },
  { href: "/admin/payouts", label: "payouts", icon: "dollar-sign" as const },
  { href: "/admin/finance", label: "wallet_requests", icon: "credit-card" as const },
  { href: "/admin/settings", label: "settings", icon: "settings" as const },
];

export default function AdminLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { themeColors, isDark } = useAppTheme();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;

    const checkAdminSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          if (active) {
            router.replace("/auth/login" as any);
          }
          return;
        }

        if (!isPrimaryAdminEmail(resolveAuthEmail(session.user))) {
          if (active) {
            router.replace("/dashboard" as any);
          }
          return;
        }

        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name, role, email")
          .eq("id", session.user.id)
          .maybeSingle();

        if (active) {
          setProfile(profileData);
          setLoading(false);
        }
      } catch (err) {
        console.error("Admin layout auth check error:", err);
        if (active) {
          router.replace("/auth/login" as any);
        }
      }
    };

    checkAdminSession();

    return () => {
      active = false;
    };
  }, [router]);

  const handleLogout = async () => {
    setMenuOpen(false);
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

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <AdminPushProvider />
      
      {/* Mobile Top Navbar */}
      <SafeAreaView style={[styles.navbarSafeArea, { backgroundColor: themeColors.cardBg }]}>
        <View style={[styles.navbar, { borderBottomColor: themeColors.cardBorder }]}>
          {/* Hamburger Menu Toggle (Right aligned in Arabic design) */}
          <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.hamburgerButton}>
            <Feather name="menu" size={24} color={themeColors.text} />
          </TouchableOpacity>

          {/* Title / Logo Container */}
          <TouchableOpacity onPress={() => router.push("/admin" as any)} style={styles.brandContainer}>
            <Image
              source={require("../../../assets/images/logo.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={[styles.brandName, { color: themeColors.text }]}>{t("brand_name")}</Text>
          </TouchableOpacity>

          {/* Quick Exit back to Student Panel */}
          <TouchableOpacity
            onPress={() => router.push("/dashboard" as any)}
            style={styles.studentPanelLink}
          >
            <Feather name="package" size={20} color={themeColors.textMuted} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Main Full-Width Content */}
      <View style={styles.main}>
        <Slot />
      </View>

      {/* Modern Overlay Menu Drawer */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.backdropClickable}
            activeOpacity={1}
            onPress={() => setMenuOpen(false)}
          />

          {/* Slide-out Menu Panel (Right aligned for RTL) */}
          <View style={[styles.drawerPanel, { backgroundColor: themeColors.cardBg, borderLeftColor: themeColors.cardBorder }]}>
            <SafeAreaView style={styles.drawerSafeArea}>
              {/* Drawer Header */}
              <View style={[styles.drawerHeader, { borderBottomColor: themeColors.cardBorder }]}>
                <TouchableOpacity onPress={() => setMenuOpen(false)} style={styles.drawerCloseButton}>
                  <Feather name="x" size={20} color={themeColors.textMuted} />
                </TouchableOpacity>
                <View style={styles.drawerBrand}>
                  <Image
                    source={require("../../../assets/images/logo.png")}
                    style={styles.drawerLogo}
                    resizeMode="contain"
                  />
                  <Text style={[styles.drawerBrandText, { color: themeColors.text }]}>{t("brand_name")}</Text>
                </View>
              </View>

              {/* Admin profile details card */}
              <View style={[styles.drawerProfileCard, { borderBottomColor: themeColors.cardBorder }]}>
                <Text style={[styles.drawerProfileName, { color: themeColors.text }]} numberOfLines={1}>
                  {profile?.full_name || t("admin_panel")}
                </Text>
                <View style={styles.adminRoleBadge}>
                  <Feather name="shield" size={10} color="#ea580c" style={styles.shieldIcon} />
                  <Text style={styles.adminRoleText}>{t("admin_panel")}</Text>
                </View>
              </View>

              {/* Navigation Menu Scroll List */}
              <ScrollView style={styles.drawerNav} showsVerticalScrollIndicator={false}>
                <Text style={[styles.navHeader, { color: themeColors.textMuted }]}>{t("admin_panel")}</Text>
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <TouchableOpacity
                      key={item.href}
                      onPress={() => {
                        setMenuOpen(false);
                        router.push(item.href as any);
                      }}
                      style={[
                        styles.drawerItem,
                        isActive && styles.drawerItemActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.drawerItemLabel,
                          isActive ? styles.activeText : { color: themeColors.text },
                        ]}
                      >
                        {t(item.label)}
                      </Text>
                      <Feather
                        name={item.icon}
                        size={18}
                        color={isActive ? "#ea580c" : themeColors.textMuted}
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Drawer Footer Buttons */}
              <View style={[styles.drawerFooter, { borderTopColor: themeColors.cardBorder }]}>
                <TouchableOpacity
                  onPress={() => {
                    setMenuOpen(false);
                    router.push("/dashboard" as any);
                  }}
                  style={styles.studentPanelBtn}
                >
                  <Text style={[styles.studentPanelBtnText, { color: themeColors.text }]}>بوابة الطلاب</Text>
                  <Feather name="package" size={16} color={themeColors.text} />
                </TouchableOpacity>

                <TouchableOpacity onPress={handleLogout} style={styles.drawerLogoutButton}>
                  <Text style={styles.logoutText}>{t("logout")}</Text>
                  <Feather name="log-out" size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
  },
  navbarSafeArea: {
    zIndex: 50,
  },
  navbar: {
    height: 56,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  hamburgerButton: {
    padding: 6,
  },
  brandContainer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  logoImage: {
    width: 32,
    height: 32,
  },
  brandName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  studentPanelLink: {
    padding: 6,
  },
  main: {
    flex: 1,
    width: "100%",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(9, 9, 11, 0.7)",
    flexDirection: "row",
  },
  backdropClickable: {
    flex: 1,
  },
  drawerPanel: {
    width: width * 0.78,
    maxWidth: 300,
    height: "100%",
    borderLeftWidth: 1,
  },
  drawerSafeArea: {
    flex: 1,
  },
  drawerHeader: {
    height: 56,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  drawerCloseButton: {
    padding: 6,
  },
  drawerBrand: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  drawerLogo: {
    width: 28,
    height: 28,
  },
  drawerBrandText: {
    fontSize: 15,
    fontWeight: "bold",
  },
  drawerProfileCard: {
    padding: 16,
    borderBottomWidth: 1,
    alignItems: "flex-end",
    gap: 4,
  },
  drawerProfileName: {
    fontSize: 14,
    fontWeight: "bold",
  },
  adminRoleBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "rgba(234, 88, 12, 0.08)",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  shieldIcon: {
    marginLeft: 4,
  },
  adminRoleText: {
    color: "#ea580c",
    fontSize: 10,
    fontWeight: "bold",
  },
  drawerNav: {
    flex: 1,
    padding: 12,
  },
  navHeader: {
    fontSize: 11,
    fontWeight: "bold",
    marginHorizontal: 12,
    marginBottom: 8,
    textAlign: "right",
  },
  drawerItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    height: 48,
    marginBottom: 4,
  },
  drawerItemActive: {
    backgroundColor: "rgba(234, 88, 12, 0.08)",
  },
  drawerItemLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  activeText: {
    color: "#ea580c",
    fontWeight: "bold",
  },
  drawerFooter: {
    padding: 16,
    borderTopWidth: 1,
    gap: 8,
  },
  studentPanelBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#27272a",
    borderRadius: 12,
    height: 48,
  },
  studentPanelBtnText: {
    fontSize: 13,
    fontWeight: "bold",
  },
  drawerLogoutButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    height: 48,
  },
  logoutText: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "bold",
  },
});
