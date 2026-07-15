import React, { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  Modal,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Link } from "expo-router";
import { pickDocumentWithPermission } from "../../../../lib/filePermissions";
import { launchCameraWithPermission } from "../../../../lib/cameraPermissions";
import { supabase } from "../../../../lib/supabaseClient";
import { Feather, Ionicons } from "@expo/vector-icons";

interface StoreData {
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
  categories?: { name: string } | null;
}

interface Category {
  id: string;
  name: string;
}

interface Coupon {
  id: string;
  code: string;
  discount_value: number;
  discount_type: "fixed" | "percentage";
  target_type: string;
  store_id: string | null;
  min_order_amount: number;
  expiry_date: string | null;
  is_active: boolean;
}

export default function MyStoreIndexScreen() {
  const router = useRouter();
  const [store, setStore] = useState<StoreData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [salesStats, setSalesStats] = useState({ itemsSold: 0, totalRevenue: 0 });

  // Store creation state
  const [storeName, setStoreName] = useState("");
  const [storeDesc, setStoreDesc] = useState("");
  const [creatingStore, setCreatingStore] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Product form state
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productQty, setProductQty] = useState("1");
  const [productCat, setProductCat] = useState("");
  const [productImage, setProductImage] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Coupons state
  const [storeCoupons, setStoreCoupons] = useState<Coupon[]>([]);
  const [scCode, setScCode] = useState("");
  const [scValue, setScValue] = useState("");
  const [scType, setScType] = useState<"fixed" | "percentage">("fixed");
  const [scMinOrder, setScMinOrder] = useState("");
  const [scExpiry, setScExpiry] = useState("");
  const [savingStoreCoupon, setSavingStoreCoupon] = useState(false);
  const [showCouponsSection, setShowCouponsSection] = useState(false);

  // Error/toast notification state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const triggerToast = (msg: string, type: "success" | "error" = "success") => {
    if (type === "success") {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch store owned by user
      const { data: storeData } = await supabase
        .from("stores")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (storeData) {
        setStore(storeData);

        // 2. Fetch products
        const { data: prods } = await supabase
          .from("products")
          .select("*, categories(*)")
          .eq("store_id", storeData.id)
          .order("created_at", { ascending: false });

        setProducts((prods || []) as Product[]);

        // 3. Fetch sales stats
        const { data: salesData } = await supabase
          .from("sales_orders")
          .select("items, total");

        if (salesData && prods) {
          const productIds = new Set(prods.map((p: Product) => p.id));
          let itemsSold = 0;
          let totalRevenue = 0;
          for (const order of salesData) {
            if (Array.isArray(order.items)) {
              for (const item of order.items) {
                if (productIds.has(item.product_id)) {
                  itemsSold += item.quantity || 0;
                  totalRevenue += item.subtotal || 0;
                }
              }
            }
          }
          setSalesStats({ itemsSold, totalRevenue });
        }

        // 4. Fetch store coupons
        try {
          const { data: cpData } = await supabase
            .from("coupons")
            .select("*")
            .eq("store_id", storeData.id)
            .order("created_at", { ascending: false });
          if (cpData) {
            setStoreCoupons(cpData as Coupon[]);
          }
        } catch (e) {
          console.error(e);
        }
      }

      // 5. Fetch categories
      const { data: cats } = await supabase
        .from("categories")
        .select("*")
        .order("name");

      setCategories((cats || []) as Category[]);
    } catch (err) {
      console.error("Error loading merchant store metrics:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check site settings
    const checkAccess = async () => {
      try {
        const { data: setting } = await supabase
          .from("site_settings")
          .select("value")
          .eq("key", "is_library_enabled")
          .single();

        if (setting && setting.value !== "true") {
          const {
            data: { user },
          } = await supabase.auth.getUser();

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
        console.error(err);
      }
    };

    checkAccess();
    fetchData();
  }, [router, fetchData]);

  // Create store
  const handleCreateStore = async () => {
    if (!storeName.trim()) {
      triggerToast("يرجى إدخال اسم المتجر", "error");
      return;
    }

    setCreatingStore(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("stores")
        .insert({
          owner_id: user.id,
          name: storeName.trim(),
          description: storeDesc.trim() || null,
        })
        .select()
        .single();

      if (error) {
        triggerToast(`فشل إنشاء المتجر: ${error.message}`, "error");
      } else {
        setStore(data);
        triggerToast("تم إنشاء متجرك بنجاح! ✓");
      }
    } catch (err) {
      console.error(err);
      triggerToast("حدث خطأ أثناء إعداد المتجر", "error");
    } finally {
      setCreatingStore(false);
    }
  };

  // Upload logo
  const handleLogoPicker = () => {
    if (!store) return;
    Alert.alert("شعار المتجر", "كيف تريد إضافة الشعار؟", [
      {
        text: "التقاط صورة",
        onPress: () => {
          void pickLogoAsset("camera");
        },
      },
      {
        text: "اختيار من المعرض",
        onPress: () => {
          void pickLogoAsset("gallery");
        },
      },
      { text: "إلغاء", style: "cancel" },
    ]);
  };

  const pickLogoAsset = async (source: "camera" | "gallery") => {
    if (!store) return;
    try {
      let uri: string | null = null;
      let name = "logo.jpg";
      let mimeType = "image/jpeg";

      if (source === "camera") {
        const result = await launchCameraWithPermission({
          mediaTypes: ["images"],
          quality: 0.85,
          allowsEditing: true,
          aspect: [1, 1],
        });
        if (result.canceled || !result.assets || result.assets.length === 0) return;
        uri = result.assets[0].uri;
        name = result.assets[0].fileName || "logo.jpg";
        mimeType = result.assets[0].mimeType || "image/jpeg";
      } else {
        const result = await pickDocumentWithPermission({
          type: "image/*",
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets || result.assets.length === 0) return;
        uri = result.assets[0].uri;
        name = result.assets[0].name;
        mimeType = result.assets[0].mimeType || "image/jpeg";
      }

      if (!uri) return;
      setUploadingLogo(true);

      const fileExtension = name.split(".").pop() || "jpg";
      const filePath = `stores/${store.id}/logo.${fileExtension}`;

      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: upErr } = await supabase.storage
        .from("products")
        .upload(filePath, arrayBuffer, {
          upsert: true,
          contentType: mimeType,
        });

      if (upErr) {
        triggerToast(`فشل رفع الشعار: ${upErr.message}`, "error");
        setUploadingLogo(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("products")
        .getPublicUrl(filePath);

      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from("stores").update({ logo: url }).eq("id", store.id);

      setStore({ ...store, logo: url });
      triggerToast("تم تحديث شعار المتجر بنجاح");
    } catch (err) {
      console.error("Logo upload exception:", err);
      triggerToast("فشل في رفع شعار المتجر", "error");
    } finally {
      setUploadingLogo(false);
    }
  };

  // Upload product image
  const handleProductImagePicker = () => {
    if (!store) return;
    Alert.alert("صورة المنتج", "كيف تريد إضافة الصورة؟", [
      {
        text: "التقاط صورة",
        onPress: () => {
          void pickProductImageAsset("camera");
        },
      },
      {
        text: "اختيار من المعرض",
        onPress: () => {
          void pickProductImageAsset("gallery");
        },
      },
      { text: "إلغاء", style: "cancel" },
    ]);
  };

  const pickProductImageAsset = async (source: "camera" | "gallery") => {
    if (!store) return;
    try {
      let uri: string | null = null;
      let name = "product.jpg";
      let mimeType = "image/jpeg";

      if (source === "camera") {
        const result = await launchCameraWithPermission({
          mediaTypes: ["images"],
          quality: 0.85,
        });
        if (result.canceled || !result.assets || result.assets.length === 0) return;
        uri = result.assets[0].uri;
        name = result.assets[0].fileName || "product.jpg";
        mimeType = result.assets[0].mimeType || "image/jpeg";
      } else {
        const result = await pickDocumentWithPermission({
          type: "image/*",
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets || result.assets.length === 0) return;
        uri = result.assets[0].uri;
        name = result.assets[0].name;
        mimeType = result.assets[0].mimeType || "image/jpeg";
      }

      if (!uri) return;
      setUploadingImage(true);

      const fileExtension = name.split(".").pop() || "jpg";
      const filePath = `stores/${store.id}/products/${Date.now()}.${fileExtension}`;

      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: upErr } = await supabase.storage
        .from("products")
        .upload(filePath, arrayBuffer, {
          upsert: true,
          contentType: mimeType,
        });

      if (upErr) {
        triggerToast(`فشل رفع الصورة: ${upErr.message}`, "error");
        setUploadingImage(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("products")
        .getPublicUrl(filePath);

      setProductImage(urlData.publicUrl);
    } catch (err) {
      console.error("Product image upload exception:", err);
      triggerToast("فشل رفع صورة المنتج", "error");
    } finally {
      setUploadingImage(false);
    }
  };

  // Save product
  const handleSaveProduct = async () => {
    if (!productName.trim() || !productPrice) {
      triggerToast("يرجى ملء الاسم والسعر", "error");
      return;
    }
    if (!store) return;

    setSavingProduct(true);
    const productData = {
      store_id: store.id,
      name: productName.trim(),
      price: Number(productPrice),
      quantity: Number(productQty) || 0,
      category_id: productCat || null,
      image_url: productImage,
    };

    try {
      if (editingProduct) {
        const { error } = await supabase
          .from("products")
          .update(productData)
          .eq("id", editingProduct.id);

        if (error) {
          triggerToast(`فشل تحديث المنتج: ${error.message}`, "error");
        } else {
          triggerToast("تم تحديث المنتج بنجاح");
        }
      } else {
        const { error } = await supabase.from("products").insert(productData);

        if (error) {
          triggerToast(`فشل إضافة المنتج: ${error.message}`, "error");
        } else {
          triggerToast("تم إضافة المنتج بنجاح");
        }
      }

      resetProductForm();
      fetchData();
    } catch (err) {
      console.error(err);
      triggerToast("فشل حفظ المنتج", "error");
    } finally {
      setSavingProduct(false);
    }
  };

  // Delete product
  const handleDeleteProduct = async (id: string) => {
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) {
        triggerToast("فشل حذف المنتج", "error");
      } else {
        setProducts((prev) => prev.filter((p) => p.id !== id));
        triggerToast("تم حذف المنتج");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const resetProductForm = () => {
    setShowProductForm(false);
    setEditingProduct(null);
    setProductName("");
    setProductPrice("");
    setProductQty("1");
    setProductCat("");
    setProductImage(null);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setProductName(p.name);
    setProductPrice(String(p.price));
    setProductQty(String(p.quantity));
    setProductCat(p.category_id || "");
    setProductImage(p.image_url);
    setShowProductForm(true);
  };

  // Coupons CRUD
  const addStoreCoupon = async () => {
    if (!scCode.trim() || !scValue || !store) return;
    setSavingStoreCoupon(true);

    const payload = {
      code: scCode.trim().toUpperCase(),
      discount_value: Number(scValue) || 0,
      discount_type: scType,
      target_type: "store",
      store_id: store.id,
      min_order_amount: Number(scMinOrder) || 0,
      expiry_date: scExpiry ? new Date(scExpiry).toISOString() : null,
    };

    try {
      const { error } = await supabase.from("coupons").insert(payload);
      if (error) {
        triggerToast(`فشل إضافة الكوبون: ${error.message}`, "error");
      } else {
        triggerToast("تمت إضافة الكوبون ✓");
        setScCode("");
        setScValue("");
        setScMinOrder("");
        setScExpiry("");
        fetchData();
      }
    } catch (err) {
      console.error(err);
      triggerToast("فشل إضافة الكوبون", "error");
    } finally {
      setSavingStoreCoupon(false);
    }
  };

  const deleteStoreCoupon = async (id: string) => {
    try {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) {
        triggerToast(`فشل الحذف: ${error.message}`, "error");
      } else {
        triggerToast("تم حذف الكوبون");
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleStoreCoupon = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("coupons")
        .update({ is_active: !isActive })
        .eq("id", id);

      if (error) {
        triggerToast(`فشل التحديث: ${error.message}`, "error");
      } else {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  // ── No store yet → Join Library Form ───────────────
  if (!store) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {errorMsg && (
            <View style={styles.toastError}>
              <Text style={styles.toastText}>{errorMsg}</Text>
            </View>
          )}

          <View style={styles.welcomeCard}>
            <View style={styles.storeBadge}>
              <Feather name="home" size={28} color="#ffffff" />
            </View>
            <Text style={styles.welcomeTitle}>انضم للمكتبة</Text>
            <Text style={styles.welcomeSubtitle}>
              افتح متجرك الخاص في مكتبة العنقاء وابدأ ببيع منتجاتك للطلاب
            </Text>
          </View>

          {/* Benefits */}
          <View style={styles.benefitsRow}>
            {[
              { icon: "book-open", label: "عرض في المكتبة", desc: "منتجاتك تظهر لكل الطلاب" },
              { icon: "shield", label: "توثيق رسمي", desc: "بعد موافقة الإدارة" },
              { icon: "sparkles", label: "إدارة سهلة", desc: "أضف وعدّل منتجاتك" },
            ].map((b, i) => (
              <View key={i} style={styles.benefitBox}>
                <Feather name={b.icon as any} size={16} color="#ea580c" style={styles.benefitIcon} />
                <Text style={styles.benefitLabel}>{b.label}</Text>
                <Text style={styles.benefitDesc}>{b.desc}</Text>
              </View>
            ))}
          </View>

          {/* Registration form */}
          <View style={styles.glassCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>اسم المتجر *</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  value={storeName}
                  onChangeText={setStoreName}
                  placeholder="مثال: مكتبة السلام"
                  placeholderTextColor="#71717a"
                  style={styles.textInput}
                  textAlign="right"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>وصف المتجر (اختياري)</Text>
              <TextInput
                value={storeDesc}
                onChangeText={setStoreDesc}
                placeholder="وصف قصير عن متجرك..."
                placeholderTextColor="#71717a"
                multiline
                numberOfLines={3}
                style={[styles.textInput, styles.textArea]}
                textAlign="right"
              />
            </View>

            <TouchableOpacity
              onPress={handleCreateStore}
              disabled={creatingStore}
              style={styles.primaryButton}
            >
              {creatingStore ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <View style={styles.buttonInner}>
                  <Feather name="award" size={16} color="#ffffff" style={styles.buttonIcon} />
                  <Text style={styles.buttonText}>إنشاء المتجر</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Store exists but not verified ──────────────────
  if (!store.is_verified) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.glassCard}>
            <View style={styles.logoRow}>
              <TouchableOpacity onPress={handleLogoPicker} disabled={uploadingLogo} style={styles.logoBadge}>
                {store.logo ? (
                  <Image source={{ uri: store.logo }} style={styles.logoImage} />
                ) : (
                  <Feather name="home" size={24} color="#ea580c" />
                )}
                <View style={styles.cameraOverlay}>
                  {uploadingLogo ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Feather name="camera" size={14} color="#ffffff" />
                  )}
                </View>
              </TouchableOpacity>
              <View style={styles.logoTexts}>
                <Text style={styles.storeNameText}>{store.name}</Text>
                {store.description && <Text style={styles.storeDescText}>{store.description}</Text>}
              </View>
            </View>
          </View>

          <View style={[styles.glassCard, styles.pendingCard]}>
            <Feather name="clock" size={48} color="#fb923c" style={styles.pendingIcon} />
            <Text style={styles.pendingTitle}>قيد المراجعة</Text>
            <Text style={styles.pendingSubtitle}>
              متجرك قيد مراجعة الإدارة. بعد الموافقة والتوثيق، ستتمكن من إضافة منتجاتك وعرضها في المكتبة.
            </Text>
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>في انتظار توثيق الإدارة</Text>
            </View>
            <Link href={"/dashboard" as any} asChild>
              <TouchableOpacity style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>العودة للرئيسية</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Store verified management dashboard ───────────
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {successMsg && (
          <View style={styles.toastSuccess}>
            <Text style={styles.toastText}>{successMsg}</Text>
          </View>
        )}
        {errorMsg && (
          <View style={styles.toastError}>
            <Text style={styles.toastText}>{errorMsg}</Text>
          </View>
        )}

        {/* Header actions */}
        <View style={styles.header}>
          <View style={styles.headerButtons}>
            <Link href={"/dashboard/my-store/settings" as any} asChild>
              <TouchableOpacity style={styles.headerSettingsButton}>
                <Feather name="truck" size={16} color="#f4f4f5" />
              </TouchableOpacity>
            </Link>
            <Link href={"/dashboard/my-store/orders" as any} asChild>
              <TouchableOpacity style={styles.headerOrdersButton}>
                <Feather name="package" size={16} color="#f4f4f5" style={styles.buttonIcon} />
                <Text style={styles.headerButtonText}>طلبات متجري</Text>
              </TouchableOpacity>
            </Link>
            <TouchableOpacity onPress={() => setShowProductForm(true)} style={styles.headerAddButton}>
              <Feather name="plus" size={16} color="#ffffff" style={styles.buttonIcon} />
              <Text style={styles.headerButtonTextPrimary}>إضافة منتج</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>متجري</Text>
            <Text style={styles.subtitle}>إدارة متجرك ومنتجاتك المعروضة</Text>
          </View>
        </View>

        {/* Store Detail Card */}
        <View style={styles.glassCard}>
          <View style={styles.logoRow}>
            <TouchableOpacity onPress={handleLogoPicker} disabled={uploadingLogo} style={styles.logoBadge}>
              {store.logo ? (
                <Image source={{ uri: store.logo }} style={styles.logoImage} />
              ) : (
                <Feather name="home" size={24} color="#ea580c" />
              )}
              <View style={styles.cameraOverlay}>
                {uploadingLogo ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Feather name="camera" size={14} color="#ffffff" />
                )}
              </View>
            </TouchableOpacity>
            <View style={styles.logoTexts}>
              <View style={styles.nameVerifiedRow}>
                <Text style={styles.storeNameText}>{store.name}</Text>
                <View style={styles.verifiedTag}>
                  <Feather name="check" size={10} color="#34d399" />
                  <Text style={styles.verifiedTagText}>موثق</Text>
                </View>
              </View>
              {store.description && <Text style={styles.storeDescText}>{store.description}</Text>}
              <Text style={styles.productCountText}>{products.length} منتج</Text>
            </View>
          </View>
        </View>

        {/* Sales report metrics */}
        <View style={styles.statsRow}>
          <View style={styles.statsCard}>
            <View style={styles.statsIconWrapper}>
              <Feather name="bar-chart-2" size={20} color="#ea580c" />
            </View>
            <View style={styles.statsInfo}>
              <Text style={styles.statsNumber}>{salesStats.itemsSold}</Text>
              <Text style={styles.statsLabel}>عدد المبيعات</Text>
            </View>
          </View>

          <View style={styles.statsCard}>
            <View style={[styles.statsIconWrapper, styles.emeraldIconBg]}>
              <Feather name="trending-up" size={20} color="#34d399" />
            </View>
            <View style={styles.statsInfo}>
              <Text style={styles.statsNumber}>{salesStats.totalRevenue.toLocaleString()} د.ع</Text>
              <Text style={styles.statsLabel}>إجمالي الأرباح</Text>
            </View>
          </View>
        </View>

        {/* Coupon Manager Accordion */}
        <View style={styles.glassCard}>
          <TouchableOpacity
            onPress={() => setShowCouponsSection(!showCouponsSection)}
            style={styles.accordionHeader}
          >
            <Feather
              name={showCouponsSection ? "chevron-up" : "chevron-down"}
              size={16}
              color="#a1a1aa"
            />
            <View style={styles.accordionTitleRow}>
              {storeCoupons.length > 0 && (
                <View style={styles.couponCountBadge}>
                  <Text style={styles.couponCountText}>{storeCoupons.length}</Text>
                </View>
              )}
              <Text style={styles.accordionTitle}>خصومات المتجر</Text>
              <Feather name="tag" size={18} color="#a78bfa" />
            </View>
          </TouchableOpacity>

          {showCouponsSection && (
            <View style={styles.accordionContent}>
              {/* Add Coupon Form */}
              <View style={styles.couponForm}>
                <View style={styles.formRow}>
                  <View style={styles.formCol}>
                    <Text style={styles.formLabel}>قيمة الخصم</Text>
                    <TextInput
                      value={scValue}
                      onChangeText={setScValue}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor="#71717a"
                      style={styles.couponInput}
                      textAlign="right"
                    />
                  </View>
                  <View style={styles.formCol}>
                    <Text style={styles.formLabel}>كود الكوبون</Text>
                    <TextInput
                      value={scCode}
                      onChangeText={(val) => setScCode(val.toUpperCase())}
                      placeholder="مثال: SHOP20"
                      placeholderTextColor="#71717a"
                      style={styles.couponInput}
                      textAlign="right"
                      autoCapitalize="characters"
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formCol}>
                    <Text style={styles.formLabel}>الحد الأدنى للطلب (د.ع)</Text>
                    <TextInput
                      value={scMinOrder}
                      onChangeText={setScMinOrder}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor="#71717a"
                      style={styles.couponInput}
                      textAlign="right"
                    />
                  </View>
                  <View style={styles.formCol}>
                    <Text style={styles.formLabel}>نوع الخصم</Text>
                    <View style={styles.couponToggleRow}>
                      <TouchableOpacity
                        onPress={() => setScType("percentage")}
                        style={[styles.couponToggleButton, scType === "percentage" && styles.couponToggleActive]}
                      >
                        <Text style={[styles.couponToggleText, scType === "percentage" && styles.couponToggleTextActive]}>نسبة %</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setScType("fixed")}
                        style={[styles.couponToggleButton, scType === "fixed" && styles.couponToggleActive]}
                      >
                        <Text style={[styles.couponToggleText, scType === "fixed" && styles.couponToggleTextActive]}>مبلغ ثابت</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.formLabel}>تاريخ الانتهاء (YYYY-MM-DD)</Text>
                  <TextInput
                    value={scExpiry}
                    onChangeText={setScExpiry}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#71717a"
                    style={styles.couponInput}
                    textAlign="right"
                  />
                </View>

                <TouchableOpacity
                  onPress={addStoreCoupon}
                  disabled={savingStoreCoupon || !scCode.trim() || !scValue}
                  style={styles.primaryButtonCompact}
                >
                  {savingStoreCoupon ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.buttonTextCompact}>إضافة الكوبون</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Coupons List */}
              {storeCoupons.length === 0 ? (
                <Text style={styles.noCouponsText}>لا توجد كوبونات خصم حالياً</Text>
              ) : (
                <View style={styles.couponsList}>
                  {storeCoupons.map((coupon) => (
                    <View key={coupon.id} style={[styles.couponCard, !coupon.is_active && styles.couponInactive]}>
                      <TouchableOpacity
                        onPress={() => deleteStoreCoupon(coupon.id)}
                        style={styles.couponTrashButton}
                      >
                        <Feather name="trash-2" size={14} color="#ef4444" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => toggleStoreCoupon(coupon.id, coupon.is_active)}
                        style={[styles.couponStatusButton, coupon.is_active ? styles.statusActive : styles.statusInactive]}
                      >
                        <Text style={[styles.couponStatusText, coupon.is_active ? styles.statusTextActive : styles.statusTextInactive]}>
                          {coupon.is_active ? "مفعّل" : "معطّل"}
                        </Text>
                      </TouchableOpacity>

                      <View style={styles.couponCardInfo}>
                        <Text style={styles.couponCardCode}>{coupon.code}</Text>
                        <Text style={styles.couponCardDesc}>
                          {coupon.discount_type === "percentage" ? `${coupon.discount_value}%` : `${coupon.discount_value} د.ع`}
                          {coupon.min_order_amount > 0 && ` · حد أدنى ${coupon.min_order_amount.toLocaleString()}`}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Product listings */}
        <View style={styles.productsSection}>
          <Text style={styles.sectionTitle}>المنتجات المعروضة</Text>

          {products.length === 0 ? (
            <View style={styles.emptyProductsCard}>
              <Feather name="package" size={40} color="#71717a" style={styles.emptyProductsIcon} />
              <Text style={styles.emptyProductsTitle}>لا توجد منتجات بعد</Text>
              <Text style={styles.emptyProductsSubtitle}>ابدأ بإضافة أول منتج لمتجرك لعرضه للطلاب</Text>
              <TouchableOpacity onPress={() => setShowProductForm(true)} style={styles.primaryButtonCompact}>
                <Text style={styles.buttonTextCompact}>إضافة منتج</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.productsGrid}>
              {products.map((prod) => (
                <View key={prod.id} style={styles.productCard}>
                  <View style={styles.productImageContainer}>
                    {prod.image_url ? (
                      <Image source={{ uri: prod.image_url }} style={styles.productImage} />
                    ) : (
                      <Feather name="package" size={24} color="#71717a" />
                    )}
                  </View>
                  <View style={styles.productCardBody}>
                    <Text numberOfLines={1} style={styles.productName}>{prod.name}</Text>
                    {prod.categories?.name && <Text style={styles.productCategory}>{prod.categories.name}</Text>}
                    <View style={styles.priceRow}>
                      <Text style={styles.productPrice}>{prod.price} د.ع</Text>
                      <Text style={styles.productQty}>الكمية: {prod.quantity}</Text>
                    </View>
                    <View style={styles.productCardActions}>
                      <TouchableOpacity onPress={() => openEditProduct(prod)} style={styles.productActionButton}>
                        <Feather name="edit-2" size={12} color="#ea580c" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteProduct(prod.id)} style={[styles.productActionButton, styles.deleteProductButton]}>
                        <Feather name="trash-2" size={12} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Product Add/Edit Modal Form */}
        <Modal visible={showProductForm} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={resetProductForm}>
                  <Feather name="x" size={20} color="#a1a1aa" />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{editingProduct ? "تعديل المنتج" : "إضافة منتج جديد"}</Text>
              </View>

              <ScrollView style={styles.modalScroll}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>اسم المنتج *</Text>
                  <View style={styles.inputWrapper}>
                    <TextInput
                      value={productName}
                      onChangeText={setProductName}
                      placeholder="مثال: دفتر A4"
                      placeholderTextColor="#71717a"
                      style={styles.textInput}
                      textAlign="right"
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formCol}>
                    <Text style={styles.inputLabel}>الكمية</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        value={productQty}
                        onChangeText={setProductQty}
                        keyboardType="number-pad"
                        placeholder="1"
                        placeholderTextColor="#71717a"
                        style={styles.textInput}
                        textAlign="right"
                      />
                    </View>
                  </View>
                  <View style={styles.formCol}>
                    <Text style={styles.inputLabel}>السعر (د.ع) *</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        value={productPrice}
                        onChangeText={setProductPrice}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="#71717a"
                        style={styles.textInput}
                        textAlign="right"
                      />
                    </View>
                  </View>
                </View>

                {/* Category Dropdown representation */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>التصنيف</Text>
                  <TouchableOpacity
                    onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    style={styles.dropdownSelector}
                  >
                    <Feather name="chevron-down" size={14} color="#71717a" />
                    <Text style={styles.dropdownSelectorText}>
                      {categories.find((c) => c.id === productCat)?.name || "بدون تصنيف"}
                    </Text>
                  </TouchableOpacity>

                  {showCategoryDropdown && (
                    <View style={styles.dropdownMenu}>
                      <TouchableOpacity
                        onPress={() => {
                          setProductCat("");
                          setShowCategoryDropdown(false);
                        }}
                        style={styles.dropdownMenuItem}
                      >
                        <Text style={styles.dropdownMenuItemText}>بدون تصنيف</Text>
                      </TouchableOpacity>
                      {categories.map((cat) => (
                        <TouchableOpacity
                          key={cat.id}
                          onPress={() => {
                            setProductCat(cat.id);
                            setShowCategoryDropdown(false);
                          }}
                          style={styles.dropdownMenuItem}
                        >
                          <Text style={styles.dropdownMenuItemText}>{cat.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Image picker */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>صورة المنتج</Text>
                  {productImage ? (
                    <View style={styles.pickedImageWrapper}>
                      <Image source={{ uri: productImage }} style={styles.pickedImage} />
                      <TouchableOpacity
                        onPress={() => setProductImage(null)}
                        style={styles.pickedImageRemove}
                      >
                        <Feather name="x" size={14} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={handleProductImagePicker}
                      disabled={uploadingImage}
                      style={styles.imagePickerDashed}
                    >
                      {uploadingImage ? (
                        <ActivityIndicator size="small" color="#ea580c" />
                      ) : (
                        <View style={styles.imagePickerDashedInner}>
                          <Feather name="camera" size={20} color="#71717a" />
                          <Text style={styles.imagePickerDashedText}>رفع صورة المنتج</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  onPress={handleSaveProduct}
                  disabled={savingProduct}
                  style={styles.primaryButton}
                >
                  {savingProduct ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.buttonText}>{editingProduct ? "حفظ التعديلات" : "إضافة المنتج"}</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b", // zinc-950
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  toastSuccess: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderColor: "rgba(52, 211, 153, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  toastError: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  toastText: {
    color: "#f4f4f5",
    fontSize: 13,
    textAlign: "center",
  },
  welcomeCard: {
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: 20,
  },
  storeBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 13,
    color: "#a1a1aa",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  benefitsRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 24,
  },
  benefitBox: {
    flex: 1,
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
  },
  benefitIcon: {
    marginBottom: 4,
  },
  benefitLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 2,
    textAlign: "center",
  },
  benefitDesc: {
    fontSize: 9,
    color: "#71717a",
    textAlign: "center",
    lineHeight: 12,
  },
  glassCard: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  logoRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 16,
  },
  logoBadge: {
    position: "relative",
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: "rgba(234, 88, 12, 0.1)",
    borderColor: "rgba(234, 88, 12, 0.2)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  cameraOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoTexts: {
    flex: 1,
    alignItems: "flex-end",
  },
  storeNameText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  storeDescText: {
    fontSize: 12,
    color: "#a1a1aa",
    marginTop: 4,
  },
  productCountText: {
    fontSize: 11,
    color: "#71717a",
    marginTop: 4,
  },
  nameVerifiedRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  verifiedTag: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    borderColor: "rgba(52, 211, 153, 0.3)",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  verifiedTagText: {
    color: "#34d399",
    fontSize: 9,
    fontWeight: "bold",
  },
  pendingCard: {
    alignItems: "center",
    padding: 24,
    borderColor: "rgba(251, 146, 60, 0.2)",
    backgroundColor: "rgba(251, 146, 60, 0.05)",
  },
  pendingIcon: {
    marginBottom: 16,
  },
  pendingTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fb923c",
    marginBottom: 8,
  },
  pendingSubtitle: {
    fontSize: 13,
    color: "#a1a1aa",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
  },
  pendingBadge: {
    backgroundColor: "rgba(251, 146, 60, 0.15)",
    borderColor: "rgba(251, 146, 60, 0.3)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 20,
  },
  pendingBadgeText: {
    color: "#fb923c",
    fontSize: 11,
    fontWeight: "bold",
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "#27272a",
    borderColor: "#3f3f46",
    borderWidth: 1,
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "bold",
  },
  header: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  headerText: {
    alignItems: "flex-end",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  subtitle: {
    fontSize: 13,
    color: "#a1a1aa",
    marginTop: 4,
  },
  headerButtons: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  headerSettingsButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerOrdersButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 36,
  },
  headerAddButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#ea580c",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 36,
  },
  headerButtonText: {
    color: "#f4f4f5",
    fontSize: 12,
    fontWeight: "bold",
  },
  headerButtonTextPrimary: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "bold",
  },
  buttonIcon: {
    marginLeft: 4,
  },
  statsRow: {
    flexDirection: "row-reverse",
    gap: 12,
    marginBottom: 20,
  },
  statsCard: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  statsIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(234, 88, 12, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  emeraldIconBg: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
  },
  statsInfo: {
    alignItems: "flex-end",
  },
  statsNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  statsLabel: {
    fontSize: 10,
    color: "#71717a",
    marginTop: 2,
  },
  accordionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  accordionTitleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  accordionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  couponCountBadge: {
    backgroundColor: "rgba(167, 139, 250, 0.2)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  couponCountText: {
    color: "#a78bfa",
    fontSize: 9,
    fontWeight: "bold",
  },
  accordionContent: {
    marginTop: 16,
    borderTopWidth: 1,
    borderColor: "#27272a",
    paddingTop: 16,
  },
  couponForm: {
    backgroundColor: "#09090b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  formRow: {
    flexDirection: "row-reverse",
    gap: 12,
    marginBottom: 12,
  },
  formCol: {
    flex: 1,
  },
  formLabel: {
    fontSize: 11,
    color: "#71717a",
    marginBottom: 6,
    textAlign: "right",
  },
  couponInput: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 12,
    color: "#f4f4f5",
    fontSize: 13,
  },
  couponToggleRow: {
    flexDirection: "row-reverse",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 10,
    height: 40,
    overflow: "hidden",
  },
  couponToggleButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#18181b",
  },
  couponToggleActive: {
    backgroundColor: "rgba(234, 88, 12, 0.1)",
  },
  couponToggleText: {
    fontSize: 11,
    color: "#71717a",
    fontWeight: "600",
  },
  couponToggleTextActive: {
    color: "#ea580c",
  },
  primaryButtonCompact: {
    height: 38,
    backgroundColor: "#ea580c",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  buttonTextCompact: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  noCouponsText: {
    fontSize: 12,
    color: "#71717a",
    textAlign: "center",
    paddingVertical: 12,
  },
  couponsList: {
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  couponCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#18181b",
    borderBottomWidth: 1,
    borderColor: "rgba(39, 39, 42, 0.5)",
  },
  couponInactive: {
    opacity: 0.5,
  },
  couponCardInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  couponCardCode: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#f4f4f5",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  couponCardDesc: {
    fontSize: 11,
    color: "#71717a",
    marginTop: 2,
  },
  couponStatusButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 12,
  },
  statusActive: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderColor: "rgba(52, 211, 153, 0.3)",
  },
  statusInactive: {
    backgroundColor: "rgba(39, 39, 42, 0.5)",
    borderColor: "#27272a",
  },
  statusTextActive: {
    color: "#34d399",
  },
  statusTextInactive: {
    color: "#71717a",
  },
  couponStatusText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  couponTrashButton: {
    padding: 6,
  },
  productsSection: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 16,
    textAlign: "right",
  },
  emptyProductsCard: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
  },
  emptyProductsIcon: {
    marginBottom: 12,
  },
  emptyProductsTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 6,
  },
  emptyProductsSubtitle: {
    fontSize: 13,
    color: "#71717a",
    textAlign: "center",
    marginBottom: 16,
  },
  productsGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  productCard: {
    width: "48%",
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  productImageContainer: {
    height: 110,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
  },
  productImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  productCardBody: {
    padding: 12,
    alignItems: "flex-end",
  },
  productName: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  productCategory: {
    fontSize: 10,
    color: "#71717a",
    marginTop: 2,
  },
  priceRow: {
    width: "100%",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  productPrice: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#ea580c",
  },
  productQty: {
    fontSize: 10,
    color: "#71717a",
  },
  productCardActions: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  productActionButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(234, 88, 12, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteProductButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  modalScroll: {
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    color: "#71717a",
    marginBottom: 8,
    textAlign: "right",
  },
  inputWrapper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#09090b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
  },
  textInput: {
    flex: 1,
    color: "#f4f4f5",
    fontSize: 14,
  },
  textArea: {
    backgroundColor: "#09090b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
  },

  dropdownSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#09090b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
  },
  dropdownSelectorText: {
    color: "#f4f4f5",
    fontSize: 13,
  },
  dropdownMenu: {
    backgroundColor: "#09090b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden",
  },
  dropdownMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#18181b",
    alignItems: "flex-end",
  },
  dropdownMenuItemText: {
    color: "#f4f4f5",
    fontSize: 13,
  },
  pickedImageWrapper: {
    position: "relative",
    width: "100%",
    height: 120,
    borderRadius: 12,
    overflow: "hidden",
  },
  pickedImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  pickedImageRemove: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  imagePickerDashed: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#27272a",
    borderRadius: 12,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  imagePickerDashedInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  imagePickerDashedText: {
    color: "#71717a",
    fontSize: 12,
  },
  primaryButton: {
    height: 46,
    backgroundColor: "#ea580c",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  buttonInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },

});
