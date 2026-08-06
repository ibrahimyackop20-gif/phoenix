import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOutUp,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import { useRouter, usePathname, useGlobalSearchParams } from "expo-router";
import { supabase } from "../lib/supabaseClient";
import { useProfile } from "./ProfileProvider";
import { useNotifications, extractOrderPrefix, type Notification } from "./NotificationProvider";
import { useChat } from "./ChatProvider";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "./ThemeProvider";
import { isAdminUser } from "../lib/adminAccess";
import { useLayoutMetrics } from "../src/hooks/useLayoutMetrics";
import { LibraryEnabled } from "../src/config/features";

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export type NotificationCategory = "order" | "payment" | "general";

/**
 * Display-only classification for the notification filter tabs / badge color.
 * There is no populated `type` column on the notifications table yet, so this
 * derives a category from the same signals NotificationProvider already uses
 * informally (order_id / #ORDERID in the message) plus a payment keyword
 * check. Purely a rendering concern — never touches fetch, read, or delete
 * logic, and doesn't affect what NotificationProvider stores or returns.
 */
export function classifyNotification(n: Pick<Notification, "title" | "message" | "order_id">): NotificationCategory {
  const text = `${n.title} ${n.message}`;
  if (/دفع|محفظة|payment|wallet/i.test(text)) return "payment";
  if (n.order_id || extractOrderPrefix(n.message)) return "order";
  return "general";
}

interface DrawerNavItemProps {
  label: string;
  icon: string;
  isActive: boolean;
  isEnglish: boolean;
  inactiveTextColor: string;
  inactiveIconColor: string;
  activeColor: string;
  chipInactiveBg: string;
  chipActiveIconColor: string;
  onPress: () => void;
}

/**
 * Drawer navigation row with a smoothly animated active state
 * (highlight fade, edge indicator, subtle icon scale, chip color swap).
 * Presentational only.
 */
function DrawerNavItem({
  label,
  icon,
  isActive,
  isEnglish,
  inactiveTextColor,
  inactiveIconColor,
  activeColor,
  chipInactiveBg,
  chipActiveIconColor,
  onPress,
}: DrawerNavItemProps) {
  const active = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    active.value = withTiming(isActive ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [isActive, active]);

  const highlightStyle = useAnimatedStyle(() => ({ opacity: active.value }));
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scaleY: 0.5 + active.value * 0.5 }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + active.value * 0.12 }],
  }));

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.drawerItem, { flexDirection: isEnglish ? "row" : "row-reverse" }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.drawerItemHighlight, highlightStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.drawerActiveIndicator,
          isEnglish ? { left: 0 } : { right: 0 },
          indicatorStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.drawerItemChip,
          { backgroundColor: isActive ? activeColor : chipInactiveBg },
          iconStyle,
        ]}
      >
        <Feather
          name={icon as any}
          size={16}
          color={isActive ? chipActiveIconColor : inactiveIconColor}
        />
      </Animated.View>
      <Text
        style={[
          styles.drawerItemLabel,
          { textAlign: isEnglish ? "left" : "right" },
          isActive ? { color: activeColor, fontWeight: "700" } : { color: inactiveTextColor },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface NavbarProps {
  role?: string;
}

export default function Navbar({ role: roleProp }: NavbarProps) {
  const { t, i18n } = useTranslation();
  const isEnglish = i18n.language === "en";
  const { themeColors, isDark } = useAppTheme();
  const navTheme = useMemo(
    () => ({
      badge: { backgroundColor: themeColors.primary },
      badgeDanger: { backgroundColor: themeColors.danger },
      badgeText: { color: themeColors.onAccent },
      walletValue: { color: themeColors.primary },
      logoutText: { color: themeColors.danger },
      readAllText: { color: themeColors.primary },
      iconPrimary: themeColors.primary,
      iconDanger: themeColors.danger,
      iconSuccess: themeColors.success,
      chipInactiveBg: themeColors.surfaceMuted,
      chipActiveIconColor: themeColors.onAccent,
      categoryColors: {
        order: themeColors.accent,
        payment: themeColors.success,
        general: themeColors.textFaint,
      } as Record<NotificationCategory, string>,
      categoryInitials: {
        order: "ط",
        payment: "د",
        general: "ع",
      } as Record<NotificationCategory, string>,
    }),
    [themeColors]
  );
  const { drawerWidth, horizontalPadding, isCompactWidth } = useLayoutMetrics();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useGlobalSearchParams<{ feature?: string | string[] }>();
  const comingSoonFeature = Array.isArray(searchParams.feature)
    ? searchParams.feature[0]
    : searchParams.feature;

  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifFilter, setNotifFilter] = useState<"all" | NotificationCategory>("all");

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

  // Display-only filtering over the already-loaded notifications list — see
  // classifyNotification() above. Does not change what NotificationProvider
  // fetches/paginates/marks-read; it only decides what this render shows.
  const notifTabs = useMemo(
    () => [
      { key: "all" as const, label: t("all") },
      { key: "order" as const, label: t("notif_filter_orders") },
      { key: "payment" as const, label: t("payment") },
      { key: "general" as const, label: t("notif_filter_general") },
    ],
    [t]
  );
  const filteredNotifications = useMemo(
    () =>
      notifFilter === "all"
        ? notifications
        : notifications.filter((n) => classifyNotification(n) === notifFilter),
    [notifications, notifFilter]
  );
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
        style={[styles.swipeDeleteAction, { backgroundColor: themeColors.danger }]}
      >
        <Feather name="trash-2" size={16} color="#ffffff" />
        <Text style={styles.swipeDeleteText}>{t("notif_delete")}</Text>
      </TouchableOpacity>
    ),
    [deleteNotification, themeColors.danger, t]
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
      // Library/Marketplace entry — hidden until the module ships (LibraryEnabled).
      {
        href: "/coming-soon?feature=library",
        label: "library",
        icon: "book-open",
        visible: LibraryEnabled,
      },
      {
        href: "/dashboard/orders",
        label: "my_orders",
        icon: "package",
        visible: true,
      },
      // Marketplace purchases (shopping-bag) — hidden until Library ships (LibraryEnabled).
      {
        href: "/dashboard/purchases",
        label: "my_purchases",
        icon: "shopping-bag",
        visible: LibraryEnabled,
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

  // Presentational-only split for the drawer's visual grouping (main items vs.
  // support/legal). Same array, same order, same hrefs/handlers — no change
  // to what navLinks contains or how routes/visibility are computed above.
  const secondaryDrawerLabels = useMemo(() => new Set(["privacy_security", "contact_us"]), []);
  const primaryDrawerLinks = useMemo(
    () => navLinks.filter((l) => !secondaryDrawerLabels.has(l.label)),
    [navLinks, secondaryDrawerLabels]
  );
  const secondaryDrawerLinks = useMemo(
    () => navLinks.filter((l) => secondaryDrawerLabels.has(l.label)),
    [navLinks, secondaryDrawerLabels]
  );

  const isDrawerLinkActive = useCallback(
    (link: { href: string; label: string }) => {
      if (link.label === "library") {
        return (
          pathname === "/library" ||
          pathname.startsWith("/library/") ||
          (pathname === "/coming-soon" && comingSoonFeature === "library")
        );
      }
      if (link.label === "contact_us") {
        return (
          pathname === "/dashboard/contact" ||
          pathname.startsWith("/dashboard/contact/") ||
          (pathname === "/coming-soon" && comingSoonFeature === "contact_us")
        );
      }
      if (link.label === "administration") {
        return pathname === "/admin" || pathname.startsWith("/admin/");
      }
      if (link.href.includes("?")) {
        return pathname === link.href.split("?")[0];
      }
      return (
        pathname === link.href ||
        (link.href !== "/dashboard" && pathname.startsWith(link.href + "/"))
      );
    },
    [pathname, comingSoonFeature]
  );

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
              <View style={[styles.badge, navTheme.badge]}>
                <Text style={[styles.badgeText, navTheme.badgeText]}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Chat Link — hidden until Library/Marketplace ships (LibraryEnabled) */}
          {LibraryEnabled && (
            <TouchableOpacity
              onPress={() => router.push("/dashboard/chat" as any)}
              style={styles.actionIcon}
            >
              <Feather name="message-square" size={20} color={themeColors.text} />
              {unreadChatCount > 0 && (
                <View style={[styles.badge, styles.badgeDanger, navTheme.badgeDanger]}>
                  <Text style={[styles.badgeText, navTheme.badgeText]}>{unreadChatCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Balance Tracker */}
          <TouchableOpacity
            onPress={() => router.push("/dashboard/payment" as any)}
            style={[styles.walletContainer, { backgroundColor: themeColors.background }]}
          >
            <Feather name="credit-card" size={12} color={navTheme.iconPrimary} />
            <Text style={[styles.balanceText, { color: themeColors.text }]}>
              {balance.toLocaleString()}
            </Text>
            <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>{t("currency")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Real-time Toast Messages */}
      <View style={styles.toastOverlay} pointerEvents="box-none">
        {latestToast && (
          <Animated.View
            key={latestToast}
            entering={FadeInDown.duration(240).easing(Easing.out(Easing.cubic))}
            exiting={FadeOutUp.duration(200).easing(Easing.in(Easing.cubic))}
            style={[styles.toastCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}
          >
            <Feather name="info" size={16} color={navTheme.iconPrimary} />
            <Text style={[styles.toastText, { color: themeColors.text }]}>{latestToast}</Text>
            <TouchableOpacity onPress={clearToast} style={styles.toastClose}>
              <Text style={[styles.toastCloseText, { color: themeColors.textMuted }]}>×</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {/* Notification Sheet Overlay Modal */}
      <Modal
        visible={showNotifs}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotifs(false)}
      >
        <TouchableOpacity
          style={[styles.modalBackdrop, { backgroundColor: themeColors.overlay }]}
          activeOpacity={1}
          onPress={() => setShowNotifs(false)}
        >
          <GestureHandlerRootView style={StyleSheet.absoluteFill}>
            <View
              style={[
                styles.notifDropdown,
                { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder },
              ]}
              onStartShouldSetResponder={() => true}
            >
              <View style={[styles.dropdownHeader, { borderBottomColor: themeColors.cardBorder }]}>
                <Text style={[styles.dropdownTitle, { color: themeColors.text }]}>{t("notifications")}</Text>
                <TouchableOpacity
                  onPress={() => {
                    markAllAsRead();
                  }}
                  style={styles.readAllButton}
                >
                  <MaterialCommunityIcons name="check-all" size={14} color={navTheme.iconPrimary} />
                  <Text style={[styles.readAllText, navTheme.readAllText]}>{t("read_all")}</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.notifTabsRow}
                contentContainerStyle={styles.notifTabsContent}
              >
                {notifTabs.map((tab) => {
                  const active = notifFilter === tab.key;
                  const activeColor =
                    tab.key === "all" ? themeColors.textStrong : navTheme.categoryColors[tab.key];
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      onPress={() => setNotifFilter(tab.key)}
                      style={[
                        styles.notifTab,
                        {
                          backgroundColor: active ? activeColor : themeColors.background,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.notifTabText,
                          { color: active ? themeColors.onAccent : themeColors.textMuted },
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {filteredNotifications.length === 0 ? (
                <View style={styles.emptyNotifContainer}>
                  <View style={[styles.emptyNotifIconWrap, { backgroundColor: themeColors.background }]}>
                    <Feather name="bell-off" size={24} color={themeColors.textMuted} />
                  </View>
                  <Text style={[styles.emptyNotifText, { color: themeColors.text }]}>
                    {t("no_notifications")}
                  </Text>
                  <Text style={[styles.emptyNotifHint, { color: themeColors.textMuted }]}>
                    {t("no_notifications_hint")}
                  </Text>
                </View>
              ) : (
                <FlatList
                  style={styles.notifScroll}
                  contentContainerStyle={styles.notifScrollContent}
                  data={filteredNotifications}
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
                        color={navTheme.iconPrimary}
                        style={{ marginVertical: 10 }}
                      />
                    ) : null
                  }
                  renderItem={({ item: n }) => {
                    const category = classifyNotification(n);
                    return (
                      <View style={styles.notifCardWrap}>
                        <Swipeable
                          overshootRight={false}
                          renderRightActions={() => renderRightActions(n.id)}
                        >
                          <TouchableOpacity
                            onPress={() => handleNotificationPress(n)}
                            style={[
                              styles.notifItem,
                              {
                                backgroundColor: !n.is_read
                                  ? isDark
                                    ? "rgba(255, 90, 31, 0.08)"
                                    : "rgba(255, 90, 31, 0.05)"
                                  : themeColors.cardBg,
                                borderColor: themeColors.cardBorder,
                              },
                            ]}
                          >
                            <View
                              style={[
                                styles.notifBadge,
                                { backgroundColor: navTheme.categoryColors[category] },
                              ]}
                            >
                              <Text style={styles.notifBadgeText}>{navTheme.categoryInitials[category]}</Text>
                            </View>
                            <View style={styles.notifTextWrap}>
                              <View style={styles.notifTitleRow}>
                                <Text style={[styles.notifTitle, { color: themeColors.text }]} numberOfLines={1}>
                                  {n.title}
                                </Text>
                                {!n.is_read && (
                                  <View style={[styles.unreadDot, { backgroundColor: navTheme.iconPrimary }]} />
                                )}
                              </View>
                              <Text style={[styles.notifBody, { color: themeColors.textMuted }]} numberOfLines={2}>
                                {n.message}
                              </Text>
                              <Text style={[styles.notifTime, { color: themeColors.textMuted }]}>
                                {new Date(n.created_at).toLocaleDateString("ar-SA")}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </Swipeable>
                      </View>
                    );
                  }}
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
          <AnimatedTouchableOpacity
            entering={FadeIn.duration(200)}
            style={styles.drawerBackdrop}
            activeOpacity={1}
            onPress={() => setMenuOpen(false)}
          />

          {/* Drawer Content (Slides from Right in RTL context) */}
          <Animated.View
            entering={SlideInRight.duration(260).easing(Easing.out(Easing.cubic))}
            style={[
              styles.drawerPanel,
              {
                backgroundColor: themeColors.cardBg,
                borderLeftColor: themeColors.cardBorder,
                width: drawerWidth,
              },
              isEnglish
                ? { borderTopRightRadius: 20, borderBottomRightRadius: 20 }
                : { borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
            ]}
          >
            <SafeAreaView style={styles.drawerSafeArea}>
              {/* Drawer Header */}
              <View style={[styles.drawerHeader, { borderBottomColor: themeColors.cardBorder }]}>
                <TouchableOpacity
                  onPress={() => setMenuOpen(false)}
                  style={[styles.drawerCloseButton, { backgroundColor: themeColors.surfaceMuted }]}
                >
                  <Feather name="x" size={16} color={themeColors.textMuted} />
                </TouchableOpacity>
                <View style={[styles.drawerBrand, { flexDirection: isEnglish ? "row" : "row-reverse" }]}>
                  <Image
                    source={require("../assets/images/logo.png")}
                    style={styles.drawerLogo}
                    resizeMode="contain"
                  />
                  <Text style={[styles.drawerBrandText, { color: themeColors.text }]}>{t("brand_name")}</Text>
                </View>
              </View>

              {/* Profile block inside drawer */}
              <TouchableOpacity
                onPress={() => {
                  setMenuOpen(false);
                  router.push("/dashboard/profile" as any);
                }}
                style={[
                  styles.drawerProfileCard,
                  { borderBottomColor: themeColors.cardBorder, flexDirection: isEnglish ? "row" : "row-reverse" },
                ]}
              >
                <View style={[styles.drawerAvatar, { backgroundColor: themeColors.accentSoftBg }]}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.drawerAvatarImage} />
                  ) : (
                    <Feather name="user" size={20} color={themeColors.accent} />
                  )}
                </View>
                <View style={[styles.drawerProfileTexts, { alignItems: isEnglish ? "flex-start" : "flex-end" }]}>
                  <Text
                    style={[styles.drawerProfileName, { color: themeColors.text, textAlign: isEnglish ? "left" : "right" }]}
                    numberOfLines={1}
                  >
                    {fullName || t("new_user")}
                  </Text>
                  <Text
                    style={[styles.drawerProfileEmail, { color: themeColors.textMuted, textAlign: isEnglish ? "left" : "right" }]}
                    numberOfLines={1}
                  >
                    {email}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Balance card inside drawer */}
              <TouchableOpacity
                onPress={() => {
                  setMenuOpen(false);
                  router.push("/dashboard/payment" as any);
                }}
                style={[
                  styles.drawerWalletCard,
                  { backgroundColor: themeColors.accent, flexDirection: isEnglish ? "row" : "row-reverse" },
                ]}
              >
                <View style={[styles.walletCardLabel, { flexDirection: isEnglish ? "row" : "row-reverse" }]}>
                  <View style={styles.drawerWalletIconWrap}>
                    <Feather name="credit-card" size={15} color={themeColors.onAccent} />
                  </View>
                  <Text style={[styles.drawerWalletLabelText, { color: themeColors.onAccentMuted }]}>{t("balance")}</Text>
                </View>
                <View style={[styles.drawerWalletValueRow, { flexDirection: isEnglish ? "row" : "row-reverse" }]}>
                  <Text style={[styles.walletCardValue, { color: themeColors.onAccent }]}>{balance.toLocaleString()}</Text>
                  <Text style={[styles.walletCardCurrency, { color: themeColors.onAccentMuted }]}>{t("currency")}</Text>
                </View>
              </TouchableOpacity>

              {/* Drawer Links List */}
              <ScrollView style={styles.drawerNav} showsVerticalScrollIndicator={false}>
                <Text
                  style={[styles.navHeader, { color: themeColors.textMuted, textAlign: isEnglish ? "left" : "right" }]}
                >
                  {t("printing_services")}
                </Text>
                {primaryDrawerLinks.map((link) => (
                  <DrawerNavItem
                    key={`${link.label}-${link.href}`}
                    label={t(link.label)}
                    icon={link.icon}
                    isActive={isDrawerLinkActive(link)}
                    isEnglish={isEnglish}
                    inactiveTextColor={themeColors.text}
                    inactiveIconColor={themeColors.textMuted}
                    activeColor={themeColors.primary}
                    chipInactiveBg={navTheme.chipInactiveBg}
                    chipActiveIconColor={navTheme.chipActiveIconColor}
                    onPress={() => {
                      setMenuOpen(false);
                      router.push(link.href as any);
                    }}
                  />
                ))}

                {secondaryDrawerLinks.length > 0 && (
                  <>
                    <View style={[styles.drawerDivider, { backgroundColor: themeColors.cardBorder }]} />
                    {secondaryDrawerLinks.map((link) => (
                      <DrawerNavItem
                        key={`${link.label}-${link.href}`}
                        label={t(link.label)}
                        icon={link.icon}
                        isActive={isDrawerLinkActive(link)}
                        isEnglish={isEnglish}
                        inactiveTextColor={themeColors.text}
                        inactiveIconColor={themeColors.textMuted}
                        activeColor={themeColors.primary}
                        chipInactiveBg={navTheme.chipInactiveBg}
                        chipActiveIconColor={navTheme.chipActiveIconColor}
                        onPress={() => {
                          setMenuOpen(false);
                          router.push(link.href as any);
                        }}
                      />
                    ))}
                  </>
                )}
              </ScrollView>

              {/* Footer logout */}
              <View style={styles.drawerFooter}>
                <TouchableOpacity
                  onPress={handleLogout}
                  style={[
                    styles.drawerLogoutButton,
                    { backgroundColor: themeColors.dangerSoftBg, flexDirection: isEnglish ? "row" : "row-reverse" },
                  ]}
                >
                  <Feather name="log-out" size={16} color={navTheme.iconDanger} />
                  <Text style={[styles.logoutText, navTheme.logoutText]}>{t("logout")}</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </Animated.View>
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
    justifyContent: "flex-end",
  },
  notifDropdown: {
    width: "100%",
    maxHeight: "82%",
    minHeight: "45%",
    borderWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
    overflow: "hidden",
  },
  dropdownHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  dropdownTitle: {
    fontSize: 17,
    fontWeight: "800",
    flexShrink: 1,
  },
  readAllButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  readAllText: {
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  notifTabsRow: {
    flexGrow: 0,
  },
  notifTabsContent: {
    flexDirection: "row-reverse",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  notifTab: {
    flexShrink: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  notifTabText: {
    fontSize: 13,
    fontWeight: "600",
  },
  emptyNotifContainer: {
    padding: 40,
    alignItems: "center",
    gap: 10,
  },
  emptyNotifIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  emptyNotifText: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyNotifHint: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  notifScroll: {
    flexGrow: 1,
  },
  notifScrollContent: {
    paddingBottom: 16,
  },
  notifCardWrap: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    overflow: "hidden",
  },
  notifItem: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderWidth: 1,
  },
  notifBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  notifBadgeText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  notifTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  notifTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  swipeDeleteAction: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    width: 76,
    height: "100%",
  },
  swipeDeleteText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
    flexShrink: 1,
  },
  notifBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "right",
    marginBottom: 6,
  },
  notifTime: {
    fontSize: 11,
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
    overflow: "hidden",
  },
  drawerSafeArea: {
    flex: 1,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  drawerCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerBrand: {
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  drawerLogo: {
    width: 26,
    height: 26,
  },
  drawerBrandText: {
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  drawerProfileCard: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  drawerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  drawerAvatarImage: {
    width: "100%",
    height: "100%",
  },
  drawerProfileTexts: {
    flex: 1,
    minWidth: 0,
  },
  drawerProfileName: {
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  drawerProfileEmail: {
    fontSize: 12,
    marginTop: 2,
    flexShrink: 1,
  },
  drawerWalletCard: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    justifyContent: "space-between",
    alignItems: "center",
  },
  drawerWalletIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerWalletValueRow: {
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  walletCardValue: {
    fontSize: 17,
    fontWeight: "800",
    flexShrink: 1,
  },
  walletCardCurrency: {
    fontSize: 11,
    fontWeight: "600",
  },
  walletCardLabel: {
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  drawerWalletLabelText: {
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  drawerNav: {
    flex: 1,
    paddingHorizontal: 12,
  },
  navHeader: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingTop: 20,
    paddingBottom: 10,
  },
  drawerItem: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 12,
    minHeight: 46,
    position: "relative",
    overflow: "hidden",
  },
  drawerItemHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: "rgba(255, 122, 31, 0.10)",
  },
  drawerActiveIndicator: {
    position: "absolute",
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
    backgroundColor: "#FF7A1F",
  },
  drawerItemChip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  drawerItemLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "500",
    flexShrink: 1,
  },
  drawerDivider: {
    height: 1,
    marginVertical: 12,
  },
  drawerFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  drawerLogoutButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    gap: 10,
    minHeight: 48,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ef4444",
  },
});
