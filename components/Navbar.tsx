import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  useWindowDimensions,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import { useRouter, usePathname, useGlobalSearchParams } from "expo-router";
import { supabase } from "../lib/supabaseClient";
import { useProfile } from "./ProfileProvider";
import { useNotifications, extractOrderPrefix } from "./NotificationProvider";
import { useChat } from "./ChatProvider";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "./ThemeProvider";
import { isAdminUser } from "../lib/adminAccess";
import { useLayoutMetrics } from "../src/hooks/useLayoutMetrics";

interface NavbarProps {
  role?: string;
}

export default function Navbar({ role: roleProp }: NavbarProps) {
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const { drawerWidth, horizontalPadding, isCompactWidth } = useLayoutMetrics();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useGlobalSearchParams<{ feature?: string | string[] }>();
  const comingSoonFeature = Array.isArray(searchParams.feature)
    ? searchParams.feature[0]
    : searchParams.feature;

  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);

  const { fullName, avatarUrl, role: profileRole, email, balance } = useProfile();
  const role = profileRole || roleProp;
  const isAdmin = isAdminUser({ role, email });
  const {
    notifications,
    unreadCount,
    hasMore,
    loadingMore,
    markAsRead,
    markVisibleAsRead,
    markAllAsRead,
    deleteNotification,
    loadMore,
    latestToast,
    clearToast,
  } = useNotifications();
  const { unreadChatCount } = useChat();
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const showNotifsRef = useRef(showNotifs);
  showNotifsRef.current = showNotifs;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: { id: string; is_read: boolean } }> }) => {
      if (!showNotifsRef.current) return;
      const unreadVisible = viewableItems
        .map((v) => v.item)
        .filter((n) => n && !n.is_read)
        .map((n) => n.id);
      if (unreadVisible.length > 0) {
        markVisibleAsRead(unreadVisible);
      }
    }
  ).current;

  const handleNotificationPress = useCallback(
    async (n: {
      id: string;
      message: string;
      order_id?: string | null;
    }) => {
      await markAsRead(n.id);
      setShowNotifs(false);
      const orderId = n.order_id || extractOrderPrefix(n.message);
      if (orderId) {
        router.push(`/dashboard/orders/${orderId}` as any);
      }
    },
    [markAsRead, router]
  );

  const renderRightActions = useCallback(
    (id: string) => (
      <TouchableOpacity
        onPress={() => deleteNotification(id)}
        style={styles.swipeDeleteAction}
      >
        <Feather name="trash-2" size={18} color="#ffffff" />
      </TouchableOpacity>
    ),
    [deleteNotification]
  );

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
      // Always visible (matches website drawer). Opens Coming Soon until Library ships.
      {
        href: "/coming-soon?feature=library",
        label: "library",
        icon: "book-open",
        visible: true,
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

    if (isAdmin) {
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
        href: "/dashboard/contact",
        label: "contact_us",
        icon: "mail",
        visible: true,
      }
    );

    return list.filter((l) => l.visible);
  }, [isAdmin]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await supabase.auth.signOut();
    router.replace("/auth/login" as any);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.cardBg }]}>
      <View style={[styles.navbar, { backgroundColor: themeColors.cardBg, borderBottomColor: themeColors.cardBorder, paddingHorizontal: horizontalPadding }]}>
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
          {!isCompactWidth && (
            <Text style={[styles.brandName, { color: themeColors.text }]}>{t("brand_name")}</Text>
          )}
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
          <GestureHandlerRootView style={StyleSheet.absoluteFill}>
            <View
              style={[
                styles.notifDropdown,
                {
                  backgroundColor: themeColors.cardBg,
                  borderColor: themeColors.cardBorder,
                  width: Math.min(width - horizontalPadding * 2, 480),
                },
              ]}
              onStartShouldSetResponder={() => true}
            >
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
                <FlatList
                  style={styles.notifScroll}
                  data={notifications}
                  keyExtractor={(item) => item.id}
                  onViewableItemsChanged={onViewableItemsChanged}
                  viewabilityConfig={viewabilityConfig}
                  onEndReached={() => {
                    if (hasMore && !loadingMore) loadMore();
                  }}
                  onEndReachedThreshold={0.4}
                  ListFooterComponent={
                    loadingMore ? (
                      <ActivityIndicator
                        size="small"
                        color="#ea580c"
                        style={{ marginVertical: 10 }}
                      />
                    ) : null
                  }
                  renderItem={({ item: n }) => (
                    <Swipeable
                      overshootRight={false}
                      renderRightActions={() => renderRightActions(n.id)}
                    >
                      <TouchableOpacity
                        onPress={() => handleNotificationPress(n)}
                        style={[
                          styles.notifItem,
                          { borderBottomColor: themeColors.cardBorder },
                          !n.is_read && {
                            backgroundColor: isDark
                              ? "rgba(234, 88, 12, 0.05)"
                              : "rgba(234, 88, 12, 0.03)",
                          },
                        ]}
                      >
                        <Text style={[styles.notifTitle, { color: themeColors.text }]}>
                          {n.title}
                        </Text>
                        <Text style={[styles.notifBody, { color: themeColors.textMuted }]}>
                          {n.message}
                        </Text>
                        <Text style={[styles.notifTime, { color: themeColors.textMuted }]}>
                          {new Date(n.created_at).toLocaleDateString("ar-SA")}
                        </Text>
                      </TouchableOpacity>
                    </Swipeable>
                  )}
                />
              )}
            </View>
          </GestureHandlerRootView>
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
          <View style={[styles.drawerPanel, { backgroundColor: themeColors.cardBg, borderLeftColor: themeColors.cardBorder, width: drawerWidth }]}>
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
                  {email}
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
                  const isActive = (() => {
                    if (link.label === "library") {
                      return (
                        pathname === "/library" ||
                        pathname.startsWith("/library/") ||
                        (pathname === "/coming-soon" &&
                          comingSoonFeature === "library")
                      );
                    }
                    if (link.label === "contact_us") {
                      return (
                        pathname === "/dashboard/contact" ||
                        pathname.startsWith("/dashboard/contact/") ||
                        (pathname === "/coming-soon" &&
                          comingSoonFeature === "contact_us")
                      );
                    }
                    if (link.label === "administration") {
                      return (
                        pathname === "/admin" || pathname.startsWith("/admin/")
                      );
                    }
                    if (link.href.includes("?")) {
                      return pathname === link.href.split("?")[0];
                    }
                    return (
                      pathname === link.href ||
                      (link.href !== "/dashboard" &&
                        pathname.startsWith(link.href + "/"))
                    );
                  })();
                  return (
                    <TouchableOpacity
                      key={`${link.label}-${link.href}`}
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
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  hamburgerButton: {
    padding: 6,
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  logoImage: {
    width: 32,
    height: 32,
  },
  brandName: {
    fontSize: 16,
    fontWeight: "bold",
    flexShrink: 1,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
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
    flexShrink: 1,
  },
  balanceText: {
    fontSize: 11,
    fontWeight: "bold",
    flexShrink: 1,
  },
  currencySymbol: {
    fontSize: 9,
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 14,
    minHeight: 14,
    borderRadius: 7,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    paddingVertical: 1,
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
    gap: 12,
  },
  dropdownTitle: {
    fontSize: 13,
    fontWeight: "bold",
    flexShrink: 1,
  },
  readAllButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  readAllText: {
    fontSize: 10,
    color: "#ea580c",
    flexShrink: 1,
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
  swipeDeleteAction: {
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    width: 64,
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
    flexShrink: 1,
  },
  drawerLogo: {
    width: 28,
    height: 28,
  },
  drawerBrandText: {
    fontSize: 14,
    fontWeight: "bold",
    flexShrink: 1,
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
    flexShrink: 1,
  },
  walletCardValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#ea580c",
    flexShrink: 1,
  },
  walletCardCurrency: {
    fontSize: 9,
  },
  walletCardLabel: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
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
    minHeight: 44,
  },
  drawerItemActive: {
    backgroundColor: "rgba(234, 88, 12, 0.12)",
    borderColor: "rgba(234, 88, 12, 0.2)",
    borderWidth: 1,
  },
  drawerItemLabel: {
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
    textAlign: "right",
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
