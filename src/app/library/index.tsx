import React, { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabaseClient";
import { useCart } from "../../../components/CartProvider";
import { Feather, FontAwesome, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

interface StoreCard {
  id: string;
  name: string;
  description: string | null;
  logo: string | null;
  is_verified: boolean;
  product_count: number;
}

export default function LibraryScreen() {
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const styles = getStyles(themeColors, isDark);
  const router = useRouter();
  const { cartCount } = useCart();
  const [stores, setStores] = useState<StoreCard[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStores = async () => {
    try {
      const { data: allStores } = await supabase
        .from("stores")
        .select("id, name, description, logo, is_verified")
        .eq("is_verified", true)
        .order("created_at", { ascending: true });

      const cards: StoreCard[] = [];
      const officialCards: StoreCard[] = [];
      const studentCards: StoreCard[] = [];

      for (const s of allStores || []) {
        const { count } = await supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("store_id", s.id)
          .gt("quantity", 0);

        const card: StoreCard = { ...s, product_count: count || 0 };

        const isOfficial =
          s.name.includes("مكتبة") ||
          s.name.includes("العنقاء") ||
          s.name.includes("فونيكس") ||
          s.name.includes("الرسمية");

        if (isOfficial) {
          officialCards.push(card);
        } else {
          studentCards.push(card);
        }
      }

      cards.push(...officialCards, ...studentCards);
      setStores(cards);
    } catch (err) {
      console.error("Error fetching stores:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check maintenance mode
    const checkAccess = async () => {
      try {
        const { data: setting } = await supabase
          .from("site_settings")
          .select("value")
          .eq("key", "is_library_enabled")
          .single();

        if (setting && setting.value !== "true") {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("role")
              .eq("id", user.id)
              .single();
            if (profile?.role !== "admin") {
              router.replace("/coming-soon" as any);
              return;
            }
          } else {
            router.replace("/coming-soon" as any);
            return;
          }
        }
      } catch (err) {
        console.error("Check access error:", err);
      }
    };

    checkAccess();
    fetchStores();

    const channel = supabase
      .channel("library-stores-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "stores" }, () => fetchStores())
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => fetchStores())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const isOfficialStore = (s: StoreCard) =>
    s.name.includes("مكتبة") ||
    s.name.includes("العنقاء") ||
    s.name.includes("فونيكس") ||
    s.name.includes("الرسمية");

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  const renderStoreItem = ({ item }: { item: StoreCard }) => {
    const official = isOfficialStore(item);
    return (
      <TouchableOpacity
        onPress={() => router.push(`/library/store/${item.id}` as any)}
        style={[
          styles.storeCard as any,
          (official ? styles.officialCard : styles.studentCard) as any,
        ]}
      >
        {/* Ribbon for official */}
        {official && <View style={styles.officialRibbon} />}

        <View style={styles.cardHeader as any}>
          {/* Logo */}
          <View
            style={[
              styles.logoContainer as any,
              (official ? styles.officialLogoBg : styles.studentLogoBg) as any,
            ]}
          >
            {item.logo ? (
              <Image source={{ uri: item.logo }} style={styles.logoImage as any} />
            ) : official ? (
              <MaterialCommunityIcons name="crown" size={24} color="#fbbf24" />
            ) : (
              <Feather name="home" size={24} color="#f97316" />
            )}
          </View>

          {/* Info */}
          <View style={styles.infoContainer as any}>
            <View style={styles.titleRow as any}>
              {official ? (
                <MaterialCommunityIcons name="crown" size={14} color="#fbbf24" style={styles.crownIcon as any} />
              ) : (
                <Ionicons name="checkmark-circle" size={14} color="#10b981" style={styles.checkmarkIcon as any} />
              )}
              <Text style={[styles.storeName as any, (official ? styles.officialText : styles.whiteText) as any]}>
                {item.name}
              </Text>
            </View>
            <Text style={styles.storeDesc as any} numberOfLines={1}>
              {item.description || (official ? "المتجر الرسمي لمكتبة العنقاء" : "متجر طالب موثق")}
            </Text>
          </View>
        </View>

        {/* Stats + CTA */}
        <View
          style={[
            styles.statsBar as any,
            (official ? styles.officialStatsBg : styles.studentStatsBg) as any,
          ]}
        >
          <View style={styles.productCountRow as any}>
            <Feather name="package" size={14} color="#71717a" />
            <Text style={styles.statsText as any}>{item.product_count} منتج</Text>
          </View>

          <View style={styles.ctaRow as any}>
            <Text style={[styles.ctaText as any, (official ? styles.officialCtaText : styles.orangeText) as any]}>
              تصفح المتجر
            </Text>
            <Feather
              name="arrow-left"
              size={12}
              color={official ? "#fbbf24" : "#f97316"}
            />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea as any}>
      <View style={styles.header as any}>
        <View style={styles.headerTitleContainer as any}>
          <View style={styles.headerTitleRow as any}>
            <Ionicons name="sparkles" size={20} color="#fbbf24" style={styles.sparklesIcon as any} />
            <Text style={styles.headerTitle as any}>استكشف متاجر العنقاء</Text>
          </View>
          <Text style={styles.headerSubtitle as any}>تصفح المتاجر المعتمدة واستعرض منتجاتها</Text>
        </View>

        {/* Cart Button */}
        <TouchableOpacity
          onPress={() => router.push("/dashboard/cart" as any)}
          style={styles.cartButton as any}
        >
          <Feather name="shopping-cart" size={20} color="#ffffff" />
          {cartCount > 0 && (
            <View style={styles.cartBadge as any}>
              <Text style={styles.cartBadgeText as any}>{cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={stores}
        renderItem={renderStoreItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent as any}
        ListEmptyComponent={
          <View style={styles.emptyContainer as any}>
            <Feather name="home" size={64} color="#27272a" style={styles.emptyIcon as any} />
            <Text style={styles.emptyTitle as any}>لا توجد متاجر حالياً</Text>
            <Text style={styles.emptyText as any}>سيتم إضافة المتاجر قريباً</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const getStyles = (themeColors: any, isDark: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: themeColors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderColor: themeColors.cardBorder,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: "flex-end",
  },
  headerTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  sparklesIcon: {
    marginLeft: 6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#f97316",
  },
  headerSubtitle: {
    fontSize: 12,
    color: themeColors.textMuted,
    marginTop: 4,
  },
  cartButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#ef4444",
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#ea580c",
  },
  cartBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "bold",
  },
  listContent: {
    padding: 20,
    gap: 16,
  },
  storeCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  officialCard: {
    backgroundColor: isDark ? "rgba(251, 191, 36, 0.04)" : "rgba(251, 191, 36, 0.02)",
    borderColor: "rgba(251, 191, 36, 0.25)",
  },
  studentCard: {
    backgroundColor: themeColors.cardBg,
    borderColor: themeColors.cardBorder,
  },
  officialRibbon: {
    height: 3,
    backgroundColor: "#fbbf24",
  },
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  officialLogoBg: {
    backgroundColor: "rgba(251, 191, 36, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.3)",
  },
  studentLogoBg: {
    backgroundColor: "rgba(249, 115, 22, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.2)",
  },
  logoImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  infoContainer: {
    flex: 1,
    alignItems: "flex-end",
  },
  titleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginBottom: 4,
  },
  crownIcon: {
    marginLeft: 6,
  },
  checkmarkIcon: {
    marginLeft: 6,
  },
  storeName: {
    fontSize: 16,
    fontWeight: "bold",
    color: themeColors.text,
  },
  officialText: {
    color: isDark ? "#fef3c7" : "#78350f",
  },
  whiteText: {
    color: themeColors.text,
  },
  storeDesc: {
    fontSize: 12,
    color: themeColors.textMuted,
  },
  statsBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  officialStatsBg: {
    backgroundColor: isDark ? "rgba(251, 191, 36, 0.08)" : "rgba(251, 191, 36, 0.03)",
    borderTopColor: "rgba(251, 191, 36, 0.15)",
  },
  studentStatsBg: {
    backgroundColor: themeColors.background,
    borderTopColor: themeColors.cardBorder,
  },
  productCountRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  statsText: {
    fontSize: 11,
    color: themeColors.textMuted,
  },
  ctaRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  ctaText: {
    fontSize: 11,
    fontWeight: "600",
  },
  officialCtaText: {
    color: "#fbbf24",
  },
  orangeText: {
    color: "#f97316",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: themeColors.text,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: themeColors.textMuted,
  },
});
