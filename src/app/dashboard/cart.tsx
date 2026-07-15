import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  ScrollView,
  Image,
  Clipboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Link } from "expo-router";
import { pickDocumentWithPermission } from "../../../lib/filePermissions";
import { supabase } from "../../../lib/supabaseClient";
import { useCart } from "../../../components/CartProvider";
import LocationPickerModal from "../../../components/LocationPickerModal";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

interface CartItem {
  id: string;
  quantity: number;
  product_id: string;
  products: {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    quantity: number;
    store_id?: string;
    stores: { name: string; id?: string };
  };
}

interface Governorate {
  id: string;
  name: string;
}

interface DeliveryZone {
  id: string;
  name: string;
  cost: number;
  governorate_id: string;
}

export default function CartScreen() {
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const styles = getStyles(themeColors, isDark);
  const router = useRouter();
  const { refreshCart } = useCart();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  // Delivery states
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [selectedGovernorate, setSelectedGovernorate] = useState("");
  const [selectedZone, setSelectedZone] = useState("");
  const [fullAddress, setFullAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [lng, setLng] = useState<number | null>(null);

  // Shipping cost states
  const [storeShippingCost, setStoreShippingCost] = useState<number | null>(null);
  const [zaincashNum, setZaincashNum] = useState("");
  const [asiaNum, setAsiaNum] = useState("");

  // Payment states
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "wallet" | "electronic">("cod");
  const [walletBalance, setWalletBalance] = useState(0);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  // Promo code states
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);

  // Dropdown UI triggers
  const [showGovDropdown, setShowGovDropdown] = useState(false);
  const [showZoneDropdown, setShowZoneDropdown] = useState(false);

  // Feedbacks
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const triggerToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const fetchCart = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("cart_items")
        .select("*, products(*, stores(*))")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Cart fetch error:", error.message);
      }
      setItems((data || []) as unknown as CartItem[]);

      // Wallet balance
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .maybeSingle();

      setWalletBalance(profile?.balance || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliveryData = async () => {
    try {
      const { data: govData } = await supabase
        .from("governorates")
        .select("id, name")
        .order("name");

      setGovernorates((govData || []) as Governorate[]);

      const { data: zoneData } = await supabase
        .from("delivery_zones")
        .select("id, name, cost, governorate_id")
        .order("name");

      setDeliveryZones((zoneData || []) as DeliveryZone[]);

      const { data: payData } = await supabase.from("payment_settings").select("key, value");
      if (payData) {
        for (const p of payData) {
          if (p.key === "zaincash_number" && p.value) setZaincashNum(p.value);
          if (p.key === "asiahawala_number" && p.value) setAsiaNum(p.value);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCart();
    fetchDeliveryData();
  }, []);

  // Sync custom merchant specific shipping override checks
  useEffect(() => {
    const fetchStoreCost = async () => {
      if (!selectedZone || items.length === 0) {
        setStoreShippingCost(null);
        return;
      }

      const storeId = items[0]?.products?.stores?.id || items[0]?.products?.store_id;
      if (!storeId) {
        setStoreShippingCost(null);
        return;
      }

      try {
        const { data } = await supabase
          .from("store_shipping_costs")
          .select("cost")
          .eq("store_id", storeId)
          .eq("zone_id", selectedZone)
          .maybeSingle();

        if (data) {
          setStoreShippingCost(data.cost);
        } else {
          setStoreShippingCost(null);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchStoreCost();
  }, [selectedZone, items]);

  const subtotal = useMemo(() => {
    return items.reduce((acc, item) => acc + item.products.price * item.quantity, 0);
  }, [items]);

  const filteredZones = useMemo(() => {
    if (!selectedGovernorate) return [];
    return deliveryZones.filter((z) => z.governorate_id === selectedGovernorate);
  }, [selectedGovernorate, deliveryZones]);

  const defaultZoneCost = useMemo(() => {
    if (!selectedZone) return 0;
    return deliveryZones.find((z) => z.id === selectedZone)?.cost || 0;
  }, [selectedZone, deliveryZones]);

  const shippingCost = storeShippingCost !== null ? storeShippingCost : defaultZoneCost;

  const couponDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.discount_type === "percentage") {
      return Math.round((subtotal * appliedCoupon.discount_value) / 100);
    }
    return Math.min(appliedCoupon.discount_value, subtotal);
  }, [appliedCoupon, subtotal]);

  const totalPrice = useMemo(() => {
    return Math.max(0, subtotal - couponDiscount) + shippingCost;
  }, [subtotal, couponDiscount, shippingCost]);

  const validateStoreCoupon = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError("");

    try {
      const storeId = items[0]?.products?.stores?.id || items[0]?.products?.store_id || null;
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", promoCode.trim().toUpperCase())
        .eq("is_active", true)
        .maybeSingle();

      if (error || !data) {
        setPromoError("كود الخصم غير صالح");
        setPromoLoading(false);
        return;
      }

      if (data.target_type === "store") {
        if (!storeId || data.store_id !== storeId) {
          setPromoError("هذا الكوبون غير صالح لهذا المتجر");
          setPromoLoading(false);
          return;
        }
      } else if (data.target_type === "library") {
        if (data.store_id !== null) {
          setPromoError("كود غير صالح");
          setPromoLoading(false);
          return;
        }
      } else {
        setPromoError("هذا الكوبون غير صالح للمشتريات");
        setPromoLoading(false);
        return;
      }

      if (data.expiry_date && new Date(data.expiry_date) < new Date()) {
        setPromoError("كود الخصم منتهي الصلاحية");
        setPromoLoading(false);
        return;
      }

      if (data.min_order_amount && subtotal < data.min_order_amount) {
        setPromoError(`الحد الأدنى للاستفادة هو ${data.min_order_amount.toLocaleString()} د.ع`);
        setPromoLoading(false);
        return;
      }

      setAppliedCoupon({
        code: data.code,
        discount_value: data.discount_value,
        discount_type: data.discount_type,
      });
      setPromoError("");
      triggerToast("تم تطبيق الكوبون بنجاح!");
    } catch (err) {
      console.error(err);
      setPromoError("فشل التحقق من الكوبون");
    } finally {
      setPromoLoading(false);
    }
  };

  const updateQuantity = async (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      removeItem(itemId);
      return;
    }
    try {
      await supabase.from("cart_items").update({ quantity: newQty }).eq("id", itemId);
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantity: newQty } : i)));
    } catch (err) {
      console.error(err);
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      await supabase.from("cart_items").delete().eq("id", itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      refreshCart();
      triggerToast("تم إزالة المنتج من السلة");
    } catch (err) {
      console.error(err);
    }
  };

  const handleLocationSelect = useCallback(
    (newLat: number, newLng: number, address: string, govName: string) => {
      setLat(newLat);
      setLng(newLng);
      setFullAddress(address);

      if (govName && governorates.length > 0) {
        const match = governorates.find(
          (g) => govName.includes(g.name) || g.name.includes(govName)
        );
        if (match) {
          setSelectedGovernorate(match.id);
          setSelectedZone("");
        }
      }
    },
    [governorates]
  );

  const handleReceiptPicker = async () => {
    try {
      const result = await pickDocumentWithPermission({
        type: "image/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      setUploadingReceipt(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const fileExtension = asset.name.split(".").pop();
      const filePath = `${user.id}/receipt-${Date.now()}.${fileExtension}`;

      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error } = await supabase.storage
        .from("products")
        .upload(filePath, arrayBuffer, {
          upsert: true,
          contentType: asset.mimeType || "image/jpeg",
        });

      if (error) {
        triggerToast("فشل رفع صورة الإيصال", "error");
        setUploadingReceipt(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("products")
        .getPublicUrl(filePath);

      setReceiptUrl(urlData.publicUrl);
      triggerToast("تم رفع الإيصال بنجاح ✓");
    } catch (err) {
      console.error(err);
      triggerToast("فشل اختيار صورة الإيصال", "error");
    } finally {
      setUploadingReceipt(false);
    }
  };

  const copyPaymentNumber = (num: string) => {
    Clipboard.setString(num);
    triggerToast("تم نسخ الرقم بنجاح");
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;

    if (!selectedGovernorate) {
      triggerToast("يرجى اختيار المحافظة", "error");
      return;
    }

    if (!fullAddress.trim()) {
      triggerToast("يرجى تحديد موقع التوصيل أو إدخال العنوان", "error");
      return;
    }

    if (paymentMethod === "wallet" && walletBalance < totalPrice) {
      triggerToast("رصيدك الحالي غير كافٍ لإتمام الدفع من المحفظة", "error");
      return;
    }

    if (paymentMethod === "electronic" && !receiptUrl) {
      triggerToast("يرجى رفع إيصال التحويل لإتمام الدفع", "error");
      return;
    }

    setCheckingOut(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const orderItems = items.map((item) => ({
        product_id: item.product_id,
        name: item.products.name,
        price: item.products.price,
        quantity: item.quantity,
        subtotal: item.products.price * item.quantity,
        store_name: item.products.stores?.name || "",
      }));

      const primaryStore = items[0]?.products.stores?.name || "";

      let primaryOwnerId: string | null = null;
      const { data: primaryProduct } = await supabase
        .from("products")
        .select("store_id, stores(owner_id)")
        .eq("id", items[0]?.product_id)
        .maybeSingle();

      if (primaryProduct) {
        primaryOwnerId = (primaryProduct.stores as any)?.owner_id || null;
      }

      const zoneName = deliveryZones.find((z) => z.id === selectedZone)?.name || "";
      const govName = governorates.find((g) => g.id === selectedGovernorate)?.name || "";

      const paymentStatus =
        paymentMethod === "wallet"
          ? "paid"
          : paymentMethod === "electronic"
          ? "pending_verification"
          : "unpaid";

      const insertPayload: any = {
        buyer_id: user.id,
        seller_id: primaryOwnerId,
        order_type: "library",
        seller_status: "pending",
        total: totalPrice,
        items: JSON.stringify(orderItems),
        status: "pending",
        store_name: primaryStore,
        governorate: govName,
        delivery_zone: zoneName,
        shipping_cost: shippingCost,
        full_address: fullAddress.trim(),
        lat: lat,
        lng: lng,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
      };

      if (receiptUrl) {
        insertPayload.receipt_url = receiptUrl;
      }

      const { data: orderData, error } = await supabase
        .from("sales_orders")
        .insert(insertPayload)
        .select("id")
        .single();

      if (error) {
        triggerToast(`فشل إتمام الشراء: ${error.message}`, "error");
        setCheckingOut(false);
        return;
      }

      // Deduct wallet balance if wallet payment chosen
      if (paymentMethod === "wallet") {
        const newBalance = walletBalance - totalPrice;
        await supabase
          .from("profiles")
          .update({ balance: newBalance })
          .eq("id", user.id);
        setWalletBalance(newBalance);
      }

      // Subtract inventory stock levels + notify seller
      for (const item of items) {
        const newStock = Math.max(0, (item.products.quantity || 0) - item.quantity);
        await supabase
          .from("products")
          .update({ quantity: newStock })
          .eq("id", item.product_id);

        if (primaryOwnerId && primaryOwnerId !== user.id) {
          await supabase.from("notifications").insert({
            user_id: primaryOwnerId,
            title: "مبروك! تم بيع منتجك",
            message: `تم بيع منتج "${item.products.name}" (×${item.quantity})، يرجى تجهيز الطلب للتسليم`,
            is_read: false,
          });
        }
      }

      // Clear Cart
      await supabase.from("cart_items").delete().eq("user_id", user.id);
      setItems([]);
      refreshCart();
      setOrderId(orderData?.id || null);
    } catch (err) {
      console.error(err);
      triggerToast("فشل إتمام الشراء", "error");
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  // ── Checkout Success Confetti Screen ──────────────
  if (orderId) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.successContent}>
          <View style={styles.successBadge}>
            <Feather name="check-circle" size={40} color="#ffffff" />
          </View>
          <Text style={styles.successTitle}>تم الشراء بنجاح! 🎉</Text>
          <Text style={styles.successSubtitle}>
            رقم الفاتورة: #{orderId.slice(0, 8).toUpperCase()}
          </Text>

          {paymentMethod === "wallet" && (
            <View style={styles.successDetails}>
              <Text style={styles.successDetailsText}>
                تم خصم القيمة من محفظتك. الرصيد المتبقي: {walletBalance.toLocaleString()} د.ع
              </Text>
            </View>
          )}

          <View style={styles.successActions}>
            <Link href={"/dashboard/purchases" as any} asChild>
              <TouchableOpacity style={styles.primaryBtnCompact}>
                <Text style={styles.btnTextCompact}>تتبع المشتريات</Text>
              </TouchableOpacity>
            </Link>
            <Link href={"/dashboard" as any} asChild>
              <TouchableOpacity style={styles.secondaryBtnCompact}>
                <Text style={styles.secondaryBtnTextCompact}>العودة للرئيسية</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {toastMsg && (
        <View style={toastType === "success" ? styles.toastSuccess : styles.toastError}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>سلة المشتريات</Text>
          <Text style={styles.subtitle}>راجع طلباتك قبل المتابعة لعملية الدفع</Text>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cart-outline" size={80} color="#71717a" />
            <Text style={styles.emptyTitle}>سلتك فارغة</Text>
            <Text style={styles.emptySubtitle}>ابدأ بالتسوق واختيار كتبك المفضلة من المكتبة</Text>
            <Link href={"/dashboard" as any} asChild>
              <TouchableOpacity style={styles.shopButton}>
                <Text style={styles.shopButtonText}>تصفح المكتبة</Text>
              </TouchableOpacity>
            </Link>
          </View>
        ) : (
          <>
            {/* Cart Items List */}
            <View style={styles.itemsList}>
              {items.map((item) => (
                <View key={item.id} style={styles.cartCard}>
                  <View style={styles.cartCardBody}>
                    <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeBtn}>
                      <Feather name="trash-2" size={14} color="#ef4444" />
                    </TouchableOpacity>

                    <View style={styles.cartDetails}>
                      <Text numberOfLines={1} style={styles.productName}>
                        {item.products.name}
                      </Text>
                      <Text style={styles.storeNameText}>
                        <Feather name="home" size={10} color="#34d399" />{" "}
                        {item.products.stores?.name || "متجر"}
                      </Text>
                      <Text style={styles.productPriceText}>
                        {(item.products.price * item.quantity).toLocaleString()} د.ع
                      </Text>

                      {/* Quantity counter */}
                      <View style={styles.counterRow}>
                        <TouchableOpacity
                          onPress={() => updateQuantity(item.id, item.quantity - 1)}
                          style={styles.counterBtn}
                        >
                          <Feather name="minus" size={12} color="#f4f4f5" />
                        </TouchableOpacity>
                        <Text style={styles.counterValue}>{item.quantity}</Text>
                        <TouchableOpacity
                          onPress={() => updateQuantity(item.id, item.quantity + 1)}
                          style={styles.counterBtn}
                        >
                          <Feather name="plus" size={12} color="#f4f4f5" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.imageContainer}>
                      {item.products.image_url ? (
                        <Image source={{ uri: item.products.image_url }} style={styles.productImage} />
                      ) : (
                        <Feather name="package" size={20} color="#71717a" />
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Delivery address details */}
            <View style={styles.glassCard}>
              <Text style={styles.cardHeaderTitle}>معلومات التوصيل</Text>

              {/* Full-screen location picker entry */}
              <TouchableOpacity
                onPress={() => setShowLocationPicker(true)}
                style={styles.pickLocationButton}
              >
                <Feather name="map-pin" size={16} color="#ea580c" />
                <Text style={styles.pickLocationButtonText}>
                  🗺️ اختيار موقع التسليم
                </Text>
              </TouchableOpacity>
              {lat != null && fullAddress ? (
                <Text style={styles.selectedLocationPreview} numberOfLines={2}>
                  {fullAddress}
                </Text>
              ) : null}

              <LocationPickerModal
                visible={showLocationPicker}
                onClose={() => setShowLocationPicker(false)}
                initialLat={lat ?? undefined}
                initialLng={lng ?? undefined}
                onConfirm={(data) => {
                  handleLocationSelect(
                    data.lat,
                    data.lng,
                    data.formattedAddress || data.area,
                    data.governorate
                  );
                }}
              />

              {/* Governorate Dropdown */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>المحافظة *</Text>
                <TouchableOpacity
                  onPress={() => setShowGovDropdown(!showGovDropdown)}
                  style={styles.dropdownSelector}
                >
                  <Feather name="chevron-down" size={14} color="#71717a" />
                  <Text style={styles.dropdownSelectorText}>
                    {governorates.find((g) => g.id === selectedGovernorate)?.name || "اختر المحافظة"}
                  </Text>
                </TouchableOpacity>

                {showGovDropdown && (
                  <View style={styles.dropdownMenu}>
                    {governorates.map((gov) => (
                      <TouchableOpacity
                        key={gov.id}
                        onPress={() => {
                          setSelectedGovernorate(gov.id);
                          setSelectedZone("");
                          setShowGovDropdown(false);
                        }}
                        style={styles.dropdownMenuItem}
                      >
                        <Text style={styles.dropdownMenuItemText}>{gov.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Zone Dropdown */}
              {selectedGovernorate && filteredZones.length > 0 && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>المنطقة *</Text>
                  <TouchableOpacity
                    onPress={() => setShowZoneDropdown(!showZoneDropdown)}
                    style={styles.dropdownSelector}
                  >
                    <Feather name="chevron-down" size={14} color="#71717a" />
                    <Text style={styles.dropdownSelectorText}>
                      {deliveryZones.find((z) => z.id === selectedZone)?.name || "اختر المنطقة"}
                    </Text>
                  </TouchableOpacity>

                  {showZoneDropdown && (
                    <View style={styles.dropdownMenu}>
                      {filteredZones.map((zone) => (
                        <TouchableOpacity
                          key={zone.id}
                          onPress={() => {
                            setSelectedZone(zone.id);
                            setShowZoneDropdown(false);
                          }}
                          style={styles.dropdownMenuItem}
                        >
                          <Text style={styles.dropdownMenuItemText}>
                            {zone.name} — {zone.cost} د.ع
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {storeShippingCost !== null && storeShippingCost !== defaultZoneCost && (
                    <Text style={styles.overrideCostText}>
                      سعر التوصيل الخاص بالبائع: {storeShippingCost.toLocaleString()} د.ع (بدلاً من{" "}
                      {defaultZoneCost.toLocaleString()} د.ع)
                    </Text>
                  )}
                </View>
              )}

              {/* Address string text inputs */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>العنوان بالتفصيل *</Text>
                <TextInput
                  value={fullAddress}
                  onChangeText={setFullAddress}
                  placeholder="اختر موقع التسليم من الزر أعلاه أو اكتب العنوان يدوياً هنا..."
                  placeholderTextColor="#71717a"
                  multiline
                  numberOfLines={3}
                  style={styles.textArea}
                  textAlign="right"
                />
              </View>
            </View>

            {/* Coupon details */}
            <View style={styles.glassCard}>
              <Text style={styles.cardHeaderTitle}>كود خصم (كوبون)</Text>
              <View style={styles.promoRow}>
                <TouchableOpacity
                  onPress={validateStoreCoupon}
                  disabled={promoLoading}
                  style={styles.promoBtn}
                >
                  {promoLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.promoBtnText}>تطبيق</Text>
                  )}
                </TouchableOpacity>
                <TextInput
                  value={promoCode}
                  onChangeText={setPromoCode}
                  placeholder="مثال: OFFER15"
                  placeholderTextColor="#71717a"
                  style={styles.promoInput}
                  textAlign="right"
                  autoCapitalize="characters"
                />
              </View>
              {promoError ? <Text style={styles.promoErrorText}>{promoError}</Text> : null}
              {appliedCoupon ? (
                <View style={styles.appliedCouponWrapper}>
                  <Feather name="check" size={12} color="#34d399" />
                  <Text style={styles.appliedCouponText}>تم تطبيق الكوبون {appliedCoupon.code}</Text>
                </View>
              ) : null}
            </View>

            {/* Payment selections */}
            <View style={styles.glassCard}>
              <Text style={styles.cardHeaderTitle}>طريقة الدفع</Text>
              <View style={styles.paymentMethodsRow}>
                <TouchableOpacity
                  onPress={() => setPaymentMethod("electronic")}
                  style={[styles.paymentMethodBox, paymentMethod === "electronic" && styles.paymentMethodActive]}
                >
                  <Feather name="credit-card" size={20} color={paymentMethod === "electronic" ? "#ea580c" : "#71717a"} />
                  <Text style={[styles.paymentMethodLabel, paymentMethod === "electronic" && styles.paymentMethodTextActive]}>دفع إلكتروني</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    if (walletBalance >= totalPrice) setPaymentMethod("wallet");
                  }}
                  style={[
                    styles.paymentMethodBox,
                    paymentMethod === "wallet" && styles.paymentMethodActive,
                    walletBalance < totalPrice && styles.paymentMethodDisabled,
                  ]}
                >
                  <Ionicons name="wallet-outline" size={20} color={paymentMethod === "wallet" ? "#ea580c" : "#71717a"} />
                  <Text style={[styles.paymentMethodLabel, paymentMethod === "wallet" && styles.paymentMethodTextActive]}>رصيد المحفظة</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setPaymentMethod("cod")}
                  style={[styles.paymentMethodBox, paymentMethod === "cod" && styles.paymentMethodActive]}
                >
                  <Feather name="dollar-sign" size={20} color={paymentMethod === "cod" ? "#ea580c" : "#71717a"} />
                  <Text style={[styles.paymentMethodLabel, paymentMethod === "cod" && styles.paymentMethodTextActive]}>الدفع عند الاستلام</Text>
                </TouchableOpacity>
              </View>

              {paymentMethod === "wallet" && (
                <View style={styles.walletDetails}>
                  <Text style={styles.walletDetailsText}>رصيد المحفظة المتاح: {walletBalance.toLocaleString()} د.ع</Text>
                  {walletBalance < totalPrice ? (
                    <Text style={styles.walletError}>رصيد المحفظة غير كافٍ لتغطية إجمالي الفاتورة</Text>
                  ) : (
                    <Text style={styles.walletSuccess}>رصيدك كافٍ لإتمام الدفع</Text>
                  )}
                </View>
              )}

              {paymentMethod === "electronic" && (
                <View style={styles.electronicDetails}>
                  <Text style={styles.detailsTitle}>التحويل الإلكتروني</Text>
                  <Text style={styles.detailsDesc}>يرجى إرسال مبلغ الفاتورة وتأكيد التحويل بإرفاق صورة الوصل:</Text>

                  {zaincashNum ? (
                    <View style={styles.paymentAccountRow}>
                      <TouchableOpacity onPress={() => copyPaymentNumber(zaincashNum)} style={styles.copyBtn}>
                        <Feather name="copy" size={14} color="#ea580c" />
                      </TouchableOpacity>
                      <Text style={styles.paymentAccountText}>زين كاش: {zaincashNum}</Text>
                    </View>
                  ) : null}

                  {asiaNum ? (
                    <View style={styles.paymentAccountRow}>
                      <TouchableOpacity onPress={() => copyPaymentNumber(asiaNum)} style={styles.copyBtn}>
                        <Feather name="copy" size={14} color="#ea580c" />
                      </TouchableOpacity>
                      <Text style={styles.paymentAccountText}>آسيا حوالة: {asiaNum}</Text>
                    </View>
                  ) : null}

                  {receiptUrl ? (
                    <View style={styles.receiptPreview}>
                      <Feather name="image" size={18} color="#34d399" />
                      <Text style={styles.receiptSuccessText}>تم رفع صورة الإيصال بنجاح ✓</Text>
                      <TouchableOpacity onPress={() => setReceiptUrl("")} style={styles.receiptRemoveBtn}>
                        <Feather name="x" size={14} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={handleReceiptPicker} disabled={uploadingReceipt} style={styles.receiptPickerDashed}>
                      {uploadingReceipt ? (
                        <ActivityIndicator size="small" color="#ea580c" />
                      ) : (
                        <View style={styles.receiptPickerDashedInner}>
                          <Feather name="upload" size={16} color="#71717a" />
                          <Text style={styles.receiptPickerDashedText}>إرفاق صورة إيصال التحويل</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {/* Calculations billing details summary */}
            <View style={styles.glassCard}>
              <Text style={styles.cardHeaderTitle}>ملخص التكلفة</Text>
              <View style={styles.billingRow}>
                <Text style={styles.billingValue}>{subtotal.toLocaleString()} د.ع</Text>
                <Text style={styles.billingLabel}>المجموع الفرعي</Text>
              </View>
              {couponDiscount > 0 ? (
                <View style={styles.billingRow}>
                  <Text style={[styles.billingValue, { color: "#34d399" }]}>-{couponDiscount.toLocaleString()} د.ع</Text>
                  <Text style={styles.billingLabel}>خصم الكوبون</Text>
                </View>
              ) : null}
              {shippingCost > 0 ? (
                <View style={styles.billingRow}>
                  <Text style={styles.billingValue}>{shippingCost.toLocaleString()} د.ع</Text>
                  <Text style={styles.billingLabel}>رسوم التوصيل</Text>
                </View>
              ) : null}
              <View style={[styles.billingRow, styles.billingTotalRow]}>
                <Text style={styles.billingTotalValue}>{totalPrice.toLocaleString()} د.ع</Text>
                <Text style={styles.billingTotalLabel}>المجموع النهائي</Text>
              </View>
            </View>

            <TouchableOpacity onPress={handleCheckout} disabled={checkingOut} style={styles.checkoutBtn}>
              {checkingOut ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <View style={styles.buttonInner}>
                  <Feather name="shopping-bag" size={18} color="#ffffff" style={styles.buttonIcon} />
                  <Text style={styles.checkoutBtnText}>تأكيد الشراء وإرسال الطلب</Text>
                </View>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (themeColors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: themeColors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  toastSuccess: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderColor: "rgba(52, 211, 153, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 10,
  },
  toastError: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    marginTop: 10,
  },
  toastText: {
    color: themeColors.text,
    fontSize: 13,
    textAlign: "center",
  },
  successContent: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  successBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: themeColors.text,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: themeColors.textMuted,
    marginBottom: 20,
  },
  successDetails: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderColor: "rgba(52, 211, 153, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    width: "100%",
    marginBottom: 28,
  },
  successDetailsText: {
    color: "#34d399",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  successActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  primaryBtnCompact: {
    flex: 1,
    height: 44,
    backgroundColor: "#ea580c",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnTextCompact: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  secondaryBtnCompact: {
    flex: 1,
    height: 44,
    backgroundColor: themeColors.cardBg,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnTextCompact: {
    color: themeColors.text,
    fontSize: 13,
    fontWeight: "bold",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: "flex-end",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: themeColors.text,
  },
  subtitle: {
    fontSize: 12,
    color: themeColors.textMuted,
    marginTop: 4,
  },
  emptyCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: themeColors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: themeColors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 24,
  },
  shopButton: {
    backgroundColor: "#ea580c",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  shopButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  itemsList: {
    gap: 12,
    marginBottom: 20,
  },
  cartCard: {
    backgroundColor: themeColors.cardBg,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  cartCardBody: {
    flexDirection: "row",
    alignItems: "center",
  },
  imageContainer: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: themeColors.background,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  productImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  cartDetails: {
    flex: 1,
    marginRight: 12,
    alignItems: "flex-end",
  },
  productName: {
    fontSize: 13,
    fontWeight: "bold",
    color: themeColors.text,
  },
  storeNameText: {
    fontSize: 10,
    color: "#34d399",
    marginTop: 2,
  },
  productPriceText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#ea580c",
    marginTop: 4,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 8,
    height: 28,
    marginTop: 6,
    overflow: "hidden",
  },
  counterBtn: {
    width: 28,
    height: 28,
    backgroundColor: themeColors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: {
    paddingHorizontal: 10,
    color: themeColors.text,
    fontSize: 12,
    fontWeight: "bold",
  },
  removeBtn: {
    padding: 8,
  },
  glassCard: {
    backgroundColor: themeColors.cardBg,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: themeColors.text,
    marginBottom: 14,
    textAlign: "right",
  },
  mapContainer: {
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
  },
  pickLocationButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(234, 88, 12, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(234, 88, 12, 0.35)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  pickLocationButtonText: {
    color: "#ea580c",
    fontSize: 14,
    fontWeight: "700",
  },
  selectedLocationPreview: {
    color: themeColors.textMuted,
    fontSize: 12,
    textAlign: "right",
    marginBottom: 14,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    color: themeColors.textMuted,
    marginBottom: 8,
    textAlign: "right",
  },
  dropdownSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
  },
  dropdownSelectorText: {
    color: themeColors.text,
    fontSize: 13,
  },
  dropdownMenu: {
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden",
  },
  dropdownMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.cardBorder,
    alignItems: "flex-end",
  },
  dropdownMenuItemText: {
    color: themeColors.text,
    fontSize: 13,
  },
  overrideCostText: {
    fontSize: 10,
    color: "#ea580c",
    marginTop: 6,
    textAlign: "right",
  },
  textArea: {
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 70,
    color: themeColors.text,
    fontSize: 13,
    textAlignVertical: "top",
  },
  promoRow: {
    flexDirection: "row",
    gap: 10,
  },
  promoBtn: {
    backgroundColor: "#ea580c",
    borderRadius: 10,
    width: 80,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  promoBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  promoInput: {
    flex: 1,
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 12,
    color: themeColors.text,
    fontSize: 14,
  },
  promoErrorText: {
    color: "#ef4444",
    fontSize: 11,
    marginTop: 6,
    textAlign: "right",
  },
  appliedCouponWrapper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  appliedCouponText: {
    color: "#34d399",
    fontSize: 11,
    fontWeight: "bold",
  },
  paymentMethodsRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginBottom: 16,
  },
  paymentMethodBox: {
    flex: 1,
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    gap: 8,
  },
  paymentMethodActive: {
    borderColor: "rgba(234, 88, 12, 0.4)",
    backgroundColor: "rgba(234, 88, 12, 0.05)",
  },
  paymentMethodDisabled: {
    opacity: 0.3,
  },
  paymentMethodLabel: {
    fontSize: 11,
    color: themeColors.textMuted,
    fontWeight: "bold",
  },
  paymentMethodTextActive: {
    color: "#ea580c",
  },
  walletDetails: {
    backgroundColor: themeColors.background,
    borderRadius: 12,
    padding: 12,
    alignItems: "flex-end",
  },
  walletDetailsText: {
    fontSize: 12,
    color: themeColors.textMuted,
  },
  walletError: {
    fontSize: 11,
    color: "#ef4444",
    marginTop: 6,
  },
  walletSuccess: {
    fontSize: 11,
    color: "#34d399",
    marginTop: 6,
  },
  electronicDetails: {
    backgroundColor: themeColors.background,
    borderRadius: 12,
    padding: 12,
    alignItems: "flex-end",
  },
  detailsTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: themeColors.text,
    marginBottom: 4,
  },
  detailsDesc: {
    fontSize: 11,
    color: themeColors.textMuted,
    marginBottom: 12,
  },
  paymentAccountRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    backgroundColor: themeColors.cardBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  copyBtn: {
    padding: 4,
  },
  paymentAccountText: {
    color: themeColors.textMuted,
    fontSize: 12,
    fontFamily: "monospace",
  },
  receiptPreview: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    width: "100%",
  },
  receiptSuccessText: {
    color: "#34d399",
    fontSize: 12,
    flex: 1,
    textAlign: "right",
  },
  receiptRemoveBtn: {
    padding: 4,
  },
  receiptPickerDashed: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: themeColors.cardBorder,
    borderRadius: 10,
    height: 44,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  receiptPickerDashedInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  receiptPickerDashedText: {
    color: themeColors.textMuted,
    fontSize: 12,
  },
  billingRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  billingLabel: {
    color: themeColors.textMuted,
    fontSize: 12,
  },
  billingValue: {
    color: themeColors.textMuted,
    fontSize: 12,
  },
  billingTotalRow: {
    borderTopWidth: 1,
    borderColor: themeColors.cardBorder,
    paddingTop: 8,
    marginTop: 8,
  },
  billingTotalLabel: {
    color: themeColors.text,
    fontSize: 14,
    fontWeight: "bold",
  },
  billingTotalValue: {
    color: "#ea580c",
    fontSize: 15,
    fontWeight: "bold",
  },
  checkoutBtn: {
    height: 48,
    backgroundColor: "#ea580c",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  checkoutBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  buttonIcon: {
    marginLeft: 4,
  },
  buttonInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
  },
});
