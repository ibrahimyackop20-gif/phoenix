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
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../../../../../lib/supabaseClient";
import { useCart } from "../../../../../components/CartProvider";
import { Feather, FontAwesome, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LibraryEnabled } from "../../../../config/features";
import { ScreenTransition } from "../../../../components/anim/ScreenTransition";

interface StoreInfo {
  id: string;
  name: string;
  description: string | null;
  logo: string | null;
  is_verified: boolean;
}

interface Product {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  category_id: string | null;
  categories: { id: string; name: string } | null;
}

export default function StoreDetailScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams();
  const storeId = params.id as string;
  const router = useRouter();
  const { cartCount, addToCart } = useCart();

  const [store, setStore] = useState<StoreInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [contactingSeller, setContactingSeller] = useState(false);
  const [storeOwnerId, setStoreOwnerId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const contentWidth = Math.min(windowWidth, 1180);
  const gridColumns = windowWidth >= 1100 ? 4 : windowWidth >= 768 ? 3 : 2;
  const gridGap = 16;
  const gridPadding = 20;
  const productCardWidth =
    (contentWidth - gridPadding * 2 - gridGap * (gridColumns - 1)) / gridColumns;

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const fetchStoreData = async () => {
      try {
        const { data: storeData } = await supabase
          .from("stores")
          .select("id, name, description, logo, is_verified")
          .eq("id", storeId)
          .single();

        setStore(storeData as StoreInfo);

        const { data: prods } = await supabase
          .from("products")
          .select("id, name, price, image_url, quantity, category_id, categories(id, name)")
          .eq("store_id", storeId)
          .order("created_at", { ascending: false });

        setProducts((prods || []) as unknown as Product[]);

        const { data: storeOwner } = await supabase
          .from("stores")
          .select("owner_id")
          .eq("id", storeId)
          .single();
        setStoreOwnerId(storeOwner?.owner_id || null);

        const { data: { user: currentUser } } = await supabase.auth.getUser();
        setCurrentUserId(currentUser?.id || null);
      } catch (err) {
        console.error("Error fetching store detail:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStoreData();
  }, [storeId]);

  const handleAddToCart = async (productId: string) => {
    setAddingToCart(productId);
    const ok = await addToCart(productId);
    if (ok) {
      showToast("تمت الإضافة للسلة ✓");
    } else {
      showToast("فشل الإضافة للسلة", "error");
    }
    setAddingToCart(null);
  };

  const handleContactSeller = async () => {
    if (!storeOwnerId || contactingSeller) return;
    setContactingSeller(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setContactingSeller(false);
        return;
      }

      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .or(
          `and(participant_1.eq.${user.id},participant_2.eq.${storeOwnerId}),and(participant_1.eq.${storeOwnerId},participant_2.eq.${user.id})`
        )
        .maybeSingle();

      if (existing) {
        router.push(`/dashboard/chat?conv=${existing.id}` as any);
      } else {
        const { data: newConv, error } = await supabase
          .from("conversations")
          .insert({
            participant_1: user.id,
            participant_2: storeOwnerId,
            buyer_id: user.id,
            seller_id: storeOwnerId,
            last_message_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error) {
          console.error("Create conversation error:", error);
          showToast("فشل بدء المحادثة", "error");
        } else if (newConv) {
          router.push(`/dashboard/chat?conv=${newConv.id}` as any);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setContactingSeller(false);
    }
  };

  const storeCategories = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) {
      if (p.categories?.id && p.categories?.name) {
        map.set(p.categories.id, p.categories.name);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  const filteredProducts = selectedCategory
    ? products.filter((p) => p.category_id === selectedCategory)
    : products;

  const isOfficial = store?.is_verified ?? false;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  if (!store) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <Feather name="home" size={64} color="#71717a" style={styles.emptyIcon} />
          <Text style={styles.emptyTitle}>المتجر غير موجود</Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.push("/library" as any)}
          >
            <Feather name="arrow-right" size={16} color="#ffffff" />
            <Text style={styles.backBtnText}>العودة لجميع المتاجر</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderProductItem = ({ item }: { item: Product }) => {
    const isOutOfStock = item.quantity <= 0;
    return (
      <View
        style={[
          styles.productCard,
          { width: productCardWidth },
          isOutOfStock && styles.outOfStockCard,
        ]}
      >
        <View style={styles.imageWrapper}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.productImage} />
          ) : (
            <View style={styles.productPlaceholder}>
              <Feather name="package" size={32} color="#27272a" />
            </View>
          )}

          {item.categories?.name && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{item.categories.name}</Text>
            </View>
          )}

          {isOutOfStock && (
            <View style={styles.outOfStockOverlay}>
              <Text style={styles.outOfStockOverlayText}>نفذت الكمية</Text>
            </View>
          )}
        </View>

        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.productFooter}>
            <Text style={styles.productPrice}>{item.price} د.ع</Text>

            {!isOutOfStock ? (
              <TouchableOpacity
                onPress={() => handleAddToCart(item.id)}
                disabled={addingToCart === item.id}
                style={styles.addToCartBtn}
              >
                {addingToCart === item.id ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Feather name="shopping-bag" size={14} color="#ffffff" />
                )}
              </TouchableOpacity>
            ) : (
              <Text style={styles.noStockText}>نفذت</Text>
            )}
          </View>
          {!isOutOfStock && (
            <Text style={styles.stockLabel}>المخزون: {item.quantity}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenTransition style={styles.safeArea}>
      {/* Toast Alert */}
      {toast && (
        <View
          style={[
            styles.toastAlert,
            toast.type === "error" ? styles.toastError : styles.toastSuccess,
          ]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}

      {/* Top Header */}
      <View style={[styles.topBar, { width: contentWidth, alignSelf: "center" }]}>
        <TouchableOpacity
          onPress={() => router.push("/library" as any)}
          style={styles.backLink}
        >
          <Feather name="arrow-right" size={18} color="#71717a" />
          <Text style={styles.backLinkText}>العودة لجميع المتاجر</Text>
        </TouchableOpacity>

        {/* Cart Button — hidden until Library/Marketplace ships (LibraryEnabled) */}
        {LibraryEnabled && (
          <TouchableOpacity
            onPress={() => router.push("/dashboard/cart" as any)}
            style={styles.cartBtn}
          >
            <Feather name="shopping-cart" size={18} color="#ffffff" />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { width: contentWidth, alignSelf: "center" },
        ]}
      >
        {/* Store Detail Header */}
        <View
          style={[
            styles.storeHeader,
            isOfficial ? styles.officialHeaderBorder : styles.studentHeaderBorder,
          ]}
        >
          <View style={styles.headerInfoRow}>
            <View
              style={[
                styles.storeLogoContainer,
                isOfficial ? styles.officialLogoBorder : styles.studentLogoBorder,
              ]}
            >
              {store.logo ? (
                <Image source={{ uri: store.logo }} style={styles.storeLogoImage} />
              ) : isOfficial ? (
                <MaterialCommunityIcons name="crown" size={32} color="#fbbf24" />
              ) : (
                <Feather name="home" size={32} color="#f97316" />
              )}
            </View>

            <View style={styles.storeTextContainer}>
              <View style={styles.storeTitleRow}>
                <Text style={styles.storeTitle}>{store.name}</Text>
                {isOfficial ? (
                  <View style={styles.officialBadge}>
                    <MaterialCommunityIcons name="crown" size={10} color="#000000" />
                    <Text style={styles.officialBadgeText}>رسمي</Text>
                  </View>
                ) : (
                  <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                )}
              </View>

              <Text style={styles.storeSubtitle}>{store.description || "متجر موثق"}</Text>
              <Text style={styles.storeProductsCount}>{products.length} منتج متوفر</Text>
            </View>
          </View>

          {/* Contact Seller (chat) — hidden until Library/Marketplace ships (LibraryEnabled) */}
          {LibraryEnabled && storeOwnerId && currentUserId && storeOwnerId !== currentUserId && (
            <TouchableOpacity
              onPress={handleContactSeller}
              disabled={contactingSeller}
              style={styles.contactBtn}
            >
              {contactingSeller ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <View style={styles.contactBtnInner}>
                  <Text style={styles.contactBtnText}>تواصل مع البائع</Text>
                  <Feather name="message-circle" size={16} color="#ffffff" />
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Category Selector Bar */}
        {storeCategories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryBar}
            style={styles.categoryScrollView}
          >
            <TouchableOpacity
              onPress={() => setSelectedCategory("")}
              style={[
                styles.categoryTab,
                selectedCategory === "" ? styles.categoryTabActive : styles.categoryTabInactive,
              ]}
            >
              <Text
                style={[
                  styles.categoryTabText,
                  selectedCategory === "" ? styles.whiteText : styles.mutedText,
                ]}
              >
                الكل ({products.length})
              </Text>
            </TouchableOpacity>

            {storeCategories.map((cat) => {
              const count = products.filter((p) => p.category_id === cat.id).length;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setSelectedCategory(cat.id)}
                  style={[
                    styles.categoryTab,
                    selectedCategory === cat.id ? styles.categoryTabActive : styles.categoryTabInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryTabText,
                      selectedCategory === cat.id ? styles.whiteText : styles.mutedText,
                    ]}
                  >
                    {cat.name} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Products Grid */}
        {filteredProducts.length === 0 ? (
          <View style={styles.emptyProductsContainer}>
            <Feather name="package" size={48} color="#27272a" />
            <Text style={styles.emptyProductsTitle}>
              {selectedCategory ? "لا توجد منتجات في هذا التصنيف" : "لا توجد منتجات"}
            </Text>
            <Text style={styles.emptyProductsSubtitle}>
              {selectedCategory ? "جرّب تصنيف آخر" : "هذا المتجر لا يحتوي على منتجات حالياً"}
            </Text>
          </View>
        ) : (
          <FlatList
            key={`products-${gridColumns}`}
            data={filteredProducts}
            renderItem={renderProductItem}
            keyExtractor={(item) => item.id}
            numColumns={gridColumns}
            scrollEnabled={false}
            columnWrapperStyle={[styles.productRow, { gap: gridGap }]}
            contentContainerStyle={styles.productsGrid}
            extraData={productCardWidth}
          />
        )}
      </ScrollView>
      </ScreenTransition>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#09090b", // zinc-950
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
  },
  toastAlert: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    zIndex: 99,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  toastSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  toastError: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  toastText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  topBar: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: "#18181b", // zinc-900
  },
  backLink: {
    flexDirection: "row-reverse",
    flexShrink: 1,
    alignItems: "center",
    gap: 8,
  },
  backLinkText: {
    color: "#71717a",
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
  },
  cartBtn: {
    width: 38,
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#ef4444",
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#ea580c",
  },
  cartBadgeText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "bold",
  },
  scrollContent: {
    paddingBottom: 40,
  },
  storeHeader: {
    backgroundColor: "#18181b", // zinc-900
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    margin: 20,
  },
  officialHeaderBorder: {
    borderColor: "rgba(251, 191, 36, 0.25)",
    backgroundColor: "rgba(251, 191, 36, 0.04)",
  },
  studentHeaderBorder: {
    borderColor: "#27272a",
  },
  headerInfoRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
  },
  storeLogoContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  officialLogoBorder: {
    backgroundColor: "rgba(251, 191, 36, 0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(251, 191, 36, 0.3)",
  },
  studentLogoBorder: {
    backgroundColor: "rgba(249, 115, 22, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.2)",
  },
  storeLogoImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  storeTextContainer: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  storeTitleRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  storeTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f4f4f5",
    flexShrink: 1,
    textAlign: "right",
  },
  officialBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fbbf24",
    borderRadius: 9999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  officialBadgeText: {
    fontSize: 8,
    fontWeight: "900",
    color: "#000000",
  },
  storeSubtitle: {
    fontSize: 12,
    color: "#71717a",
  },
  storeProductsCount: {
    fontSize: 10,
    color: "#71717a",
    marginTop: 6,
  },
  contactBtn: {
    backgroundColor: "#27272a", // zinc-800
    borderWidth: 1,
    borderColor: "#3f3f46", // zinc-700
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  contactBtnInner: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  contactBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  categoryScrollView: {
    marginBottom: 16,
  },
  categoryBar: {
    flexDirection: "row-reverse",
    paddingHorizontal: 20,
    gap: 8,
  },
  categoryTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  categoryTabActive: {
    backgroundColor: "#ea580c",
    borderColor: "#ea580c",
  },
  categoryTabInactive: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
  },
  categoryTabText: {
    fontSize: 12,
    fontWeight: "600",
  },
  whiteText: {
    color: "#ffffff",
  },
  mutedText: {
    color: "#71717a",
  },
  emptyProductsContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyProductsTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginTop: 8,
  },
  emptyProductsSubtitle: {
    fontSize: 13,
    color: "#71717a",
  },
  productsGrid: {
    paddingHorizontal: 20,
  },
  productRow: {
    justifyContent: "flex-start",
    marginBottom: 16,
  },
  productCard: {
    backgroundColor: "#18181b",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#27272a",
    overflow: "hidden",
  },
  outOfStockCard: {
    opacity: 0.6,
  },
  imageWrapper: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#09090b",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  productImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  productPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  categoryBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(24, 24, 27, 0.8)",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  categoryBadgeText: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "600",
  },
  outOfStockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  outOfStockOverlayText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "bold",
    backgroundColor: "#ef4444",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 9999,
  },
  productInfo: {
    padding: 12,
  },
  productName: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 8,
    textAlign: "right",
    flexShrink: 1,
  },
  productFooter: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
  },
  productPrice: {
    color: "#f97316",
    fontSize: 14,
    fontWeight: "bold",
    flexShrink: 1,
  },
  addToCartBtn: {
    width: 32,
    minHeight: 32,
    borderRadius: 10,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
  },
  noStockText: {
    color: "#ef4444",
    fontSize: 10,
    fontWeight: "600",
  },
  stockLabel: {
    fontSize: 9,
    color: "#71717a",
    textAlign: "right",
    marginTop: 4,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 16,
  },
  backBtn: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ea580c",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  backBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
});
