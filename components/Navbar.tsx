import React, { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  SafeAreaView,
  Dimensions,
} from "react-native";
import { useRouter, usePathname } from "expo-router";
import { supabase } from "../lib/supabaseClient";
import { useProfile } from "./ProfileProvider";
import { useNotifications } from "./NotificationProvider";
import { useChat } from "./ChatProvider";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "./ThemeProvider";

const { width } = Dimensions.get("window");
const ADMIN_EMAIL = "ibrahimyackop20@gmail.com";

interface NavbarProps {
  role?: string;
}

export default function Navbar({ role }: NavbarProps) {
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();

  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [isLibraryEnabled, setIsLibraryEnabled] = useState(true);
  const [balance, setBalance] = useState(0);
  const [userEmail, setUserEmail] = useState("");

  const { fullName, avatarUrl } = useProfile();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    latestToast,
    clearToast,
  } = useNotifications();
  const { unreadChatCount } = useChat();

  useEffect(() => {
    const loadData = async () => {
      // Library status
      const { data: libData } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "is_library_enabled")
        .single();
      if (libData) setIsLibraryEnabled(libData.value === "true");

      // Balance + email
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || "");
        const { data: profile } = await supabase
          .from("profiles")
          .select("balance")
          .eq("id", user.id)
          .maybeSingle();
        if (profile) setBalance(profile.balance || 0);
      }
    };
    loadData();
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    await supabase.auth.signOut();
    router.replace("/auth/login" as any);
  };

  const navLinks = useMemo(() => {
    const list = [
      {
        href: "/dashboard",
        label: "dashboard",
        icon: "layout",
        visible: true,
      },
      {
        href: "/dashboard/new-order",
        label: "new_order",
        icon: "printer",
        visible: true,
      },
      {
        href: "/library",
        label: "library",
        icon: "book-open",
        visible: isLibraryEnabled,
      },
      {
        href: "/dashboard/orders",
        label: "my_orders",
        icon: "package",
        visible: true,
      },
      {
        href: "/dashboard/purchases",
        label: "my_purchases",
        icon: "shopping-bag",
        visible: true,
      },
    ];

    if (role === "admin" || userEmail === ADMIN_EMAIL) {
      list.push({
        href: "/admin",
        label: "administration",
        icon: "shield",
        visible: true,
      });
    }

    list.push(
      {
        href: "/dashboard/profile",
        label: "settings",
        icon: "settings",
        visible: true,
      },
      {
        href: "/dashboard/privacy",
        label: "privacy_security",
        icon: "shield",
        visible: true,
      },
      {
        href: "/coming-soon",
        label: "contact_us",
        icon: "mail",
        visible: true,
      }
    );

    return list.filter((l) => l.visible);
  }, [role, userEmail, isLibraryEnabled]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.cardBg }]}>
      <View style={[styles.navbar, { backgroundColor: themeColors.cardBg, borderBottomColor: themeColors.cardBorder }]}>
        {/* Hamburger Menu Toggle (Right aligned in Arabic design) */}
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          style={styles.hamburgerButton}
        >
          <Feather name="menu" size={24} color={themeColors.text} />
        </TouchableOpacity>

        {/* Brand/Logo (Center/Right depending on preference) */}
        <TouchableOpacity
          onPress={() => router.push("/dashboard" as any)}
          style={styles.brandContainer}
        >
          <Image
            source={require("../assets/images/logo.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={[styles.brandName, { color: themeColors.text }]}>{t("brand_name")}</Text>
        </TouchableOpacity>

        {/* Action Row: Notifs, Chat, Wallet */}
        <View style={styles.actionRow}>
          {/* Notifications Trigger */}
          <TouchableOpacity
            onPress={() => setShowNotifs(!showNotifs)}
            style={styles.actionIcon}
          >
            <Feather name="bell" size={20} color={themeColors.text} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Chat Link */}
          <TouchableOpacity
            onPress={() => router.push("/dashboard/chat" as any)}
            style={styles.actionIcon}
          >
            <Feather name="message-square" size={20} color={themeColors.text} />
            {unreadChatCount > 0 && (
              <View style={[styles.badge, styles.badgeDanger]}>
                <Text style={styles.badgeText}>{unreadChatCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Balance Tracker */}
          <TouchableOpacity
            onPress={() => router.push("/dashboard/payment" as any)}
            style={[styles.walletContainer, { backgroundColor: themeColors.background }]}
          >
            <Feather name="credit-card" size={12} color="#ea580c" />
            <Text style={[styles.balanceText, { color: themeColors.text }]}>
              {balance.toLocaleString()}
            </Text>
            <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>{t("currency")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Real-time Toast Messages */}
      {latestToast && (
        <View style={styles.toastOverlay}>
          <View style={[styles.toastCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
            <Feather name="info" size={16} color="#ea580c" />
            <Text style={[styles.toastText, { color: themeColors.text }]}>{latestToast}</Text>
            <TouchableOpacity onPress={clearToast} style={styles.toastClose}>
              <Text style={[styles.toastCloseText, { color: themeColors.textMuted }]}>×</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Notification Dropdown Overlay Modal */}
      <Modal
        visible={showNotifs}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotifs(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowNotifs(false)}
        >
          <View style={[styles.notifDropdown, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
            <View style={[styles.dropdownHeader, { borderBottomColor: themeColors.cardBorder }]}>
              <TouchableOpacity
                onPress={() => {
                  markAllAsRead();
                  setShowNotifs(false);
                }}
                style={styles.readAllButton}
              >
                <MaterialCommunityIcons name="check-all" size={12} color="#ea580c" />
                <Text style={styles.readAllText}>{t("read_all")}</Text>
              </TouchableOpacity>
              <Text style={[styles.dropdownTitle, { color: themeColors.text }]}>{t("notifications")}</Text>
            </View>

            {notifications.length === 0 ? (
              <View style={styles.emptyNotifContainer}>
                <Text style={[styles.emptyNotifText, { color: themeColors.textMuted }]}>
                  {t("no_notifications")}
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.notifScroll}>
                {notifications.map((n) => (
                  <TouchableOpacity
                    key={n.id}
                    onPress={() => {
                      markAsRead(n.id);
                      setShowNotifs(false);
                    }}
                    style={[
                      styles.notifItem,
                      { borderBottomColor: themeColors.cardBorder },
                      !n.is_read && { backgroundColor: isDark ? "rgba(234, 88, 12, 0.05)" : "rgba(234, 88, 12, 0.03)" },
                    ]}
                  >
                    <Text style={[styles.notifTitle, { color: themeColors.text }]}>{n.title}</Text>
                    <Text style={[styles.notifBody, { color: themeColors.textMuted }]}>{n.message}</Text>
                    <Text style={[styles.notifTime, { color: themeColors.textMuted }]}>
                      {new Date(n.created_at).toLocaleDateString("ar-SA")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Hamburger Drawer Slide-in Modal */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="none"
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.drawerContainer}>
          {/* Backdrop */}
          <TouchableOpacity
            style={styles.drawerBackdrop}
            activeOpacity={1}
            onPress={() => setMenuOpen(false)}
          />

          {/* Drawer Content (Slides from Right in RTL context) */}
          <View style={[styles.drawerPanel, { backgroundColor: themeColors.cardBg, borderLeftColor: themeColors.cardBorder }]}>
            <SafeAreaView style={styles.drawerSafeArea}>
              {/* Drawer Header */}
              <View style={[styles.drawerHeader, { borderBottomColor: themeColors.cardBorder }]}>
                <TouchableOpacity
                  onPress={() => setMenuOpen(false)}
                  style={styles.drawerCloseButton}
                >
                  <Feather name="x" size={20} color={themeColors.textMuted} />
                </TouchableOpacity>
                <View style={styles.drawerBrand}>
                  <Image
                    source={require("../assets/images/logo.png")}
                    style={styles.drawerLogo}
                    resizeMode="contain"
                  />
                  <Text style={[styles.drawerBrandText, { color: themeColors.text }]}>{t("brand_name")}</Text>
                </View>
              </View>

              {/* Profile card inside drawer */}
              <TouchableOpacity
                onPress={() => {
                  setMenuOpen(false);
                  router.push("/dashboard/profile" as any);
                }}
                style={[styles.drawerProfileCard, { borderBottomColor: themeColors.cardBorder }]}
              >
                <Text style={[styles.drawerProfileName, { color: themeColors.text }]} numberOfLines={1}>
                  {fullName || t("new_user")}
                </Text>
                <Text style={[styles.drawerProfileEmail, { color: themeColors.textMuted }]} numberOfLines={1}>
                  {userEmail}
                </Text>
              </TouchableOpacity>

              {/* Balance card inside drawer */}
              <TouchableOpacity
                onPress={() => {
                  setMenuOpen(false);
                  router.push("/dashboard/payment" as any);
                }}
                style={[styles.drawerWalletCard, { backgroundColor: isDark ? "rgba(234, 88, 12, 0.08)" : "rgba(234, 88, 12, 0.05)", borderColor: isDark ? "rgba(234, 88, 12, 0.15)" : "rgba(234, 88, 12, 0.1)" }]}
              >
                <View style={styles.drawerWalletValueRow}>
                  <Text style={styles.walletCardValue}>{balance.toLocaleString()}</Text>
                  <Text style={[styles.walletCardCurrency, { color: themeColors.textMuted }]}>{t("currency")}</Text>
                </View>
                <View style={styles.walletCardLabel}>
                  <Feather name="credit-card" size={12} color="#ea580c" />
                  <Text style={[styles.drawerWalletLabelText, { color: themeColors.textMuted }]}>{t("balance")}</Text>
                </View>
              </TouchableOpacity>

              {/* Drawer Links List */}
              <ScrollView style={styles.drawerNav}>
                <Text style={[styles.navHeader, { color: themeColors.textMuted }]}>{t("printing_services")}</Text>
                {navLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <TouchableOpacity
                      key={link.href}
                      onPress={() => {
                        setMenuOpen(false);
                        router.push(link.href as any);
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
                        {t(link.label)}
                      </Text>
                      <Feather
                        name={link.icon as any}
                        size={18}
                        color={isActive ? "#ea580c" : themeColors.textMuted}
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Footer logout */}
              <View style={[styles.drawerFooter, { borderTopColor: themeColors.cardBorder }]}>
                <TouchableOpacity
                  onPress={handleLogout}
                  style={styles.drawerLogoutButton}
                >
                  <Text style={styles.logoutText}>{t("logout")}</Text>
                  <Feather name="log-out" size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    zIndex: 50,
  },
  navbar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  hamburgerButton: {
    padding: 6,
  },
  brandContainer: {
    flexDirection: "row",
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
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  actionIcon: {
    padding: 6,
    position: "relative",
  },
  walletContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
  },
  balanceText: {
    fontSize: 11,
    fontWeight: "bold",
  },
  currencySymbol: {
    fontSize: 9,
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeDanger: {
    backgroundColor: "#ef4444",
  },
  badgeText: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#ffffff",
  },
  toastOverlay: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 999,
  },
  toastCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
    maxWidth: "90%",
  },
  toastText: {
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  toastClose: {
    padding: 2,
  },
  toastCloseText: {
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "transparent",
    alignItems: "center",
  },
  notifDropdown: {
    position: "absolute",
    top: 110,
    left: 16,
    right: 16,
    borderWidth: 1,
    borderRadius: 16,
    maxHeight: 380,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    overflow: "hidden",
  },
  dropdownHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
  },
  dropdownTitle: {
    fontSize: 13,
    fontWeight: "bold",
  },
  readAllButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  readAllText: {
    fontSize: 10,
    color: "#ea580c",
  },
  emptyNotifContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyNotifText: {
    fontSize: 12,
  },
  notifScroll: {
    maxHeight: 320,
  },
  notifItem: {
    padding: 12,
    borderBottomWidth: 1,
  },
  notifTitle: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "right",
    marginBottom: 2,
  },
  notifBody: {
    fontSize: 11,
    textAlign: "right",
    marginBottom: 4,
  },
  notifTime: {
    fontSize: 9,
    textAlign: "right",
  },
  drawerContainer: {
    flex: 1,
    flexDirection: "row",
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  drawerPanel: {
    width: 280,
    borderLeftWidth: 1,
    height: "100%",
  },
  drawerSafeArea: {
    flex: 1,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  drawerCloseButton: {
    padding: 4,
  },
  drawerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  drawerLogo: {
    width: 28,
    height: 28,
  },
  drawerBrandText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  drawerProfileCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  drawerProfileName: {
    fontSize: 13,
    fontWeight: "bold",
    flex: 1,
    textAlign: "right",
  },
  drawerProfileEmail: {
    fontSize: 9,
  },
  drawerWalletCard: {
    margin: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  drawerWalletValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  walletCardValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#ea580c",
  },
  walletCardCurrency: {
    fontSize: 9,
  },
  walletCardLabel: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  drawerWalletLabelText: {
    fontSize: 10,
    fontWeight: "600",
  },
  drawerNav: {
    flex: 1,
    paddingHorizontal: 8,
  },
  navHeader: {
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 6,
    textAlign: "right",
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 12,
  },
  drawerItemActive: {
    backgroundColor: "rgba(234, 88, 12, 0.12)",
    borderColor: "rgba(234, 88, 12, 0.2)",
    borderWidth: 1,
  },
  drawerItemLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  activeText: {
    color: "#ea580c",
  },
  drawerFooter: {
    padding: 12,
    borderTopWidth: 1,
  },
  drawerLogoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(239, 68, 68, 0.06)",
    gap: 12,
  },
  logoutText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ef4444",
  },
});
