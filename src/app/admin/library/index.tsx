import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { supabase } from "../../../../lib/supabaseClient";
import { Feather, FontAwesome, Ionicons } from "@expo/vector-icons";

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

export default function AdminLibraryScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminStoreId, setAdminStoreId] = useState<string | null>(null);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productQty, setProductQty] = useState("1");
  const [productCat, setProductCat] = useState("");
  const [productImage, setProductImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: storeData } = await supabase
        .from("stores")
        .select("id")
        .eq("is_verified", true)
        .limit(1)
        .single();

      if (storeData) {
        setAdminStoreId(storeData.id);

        const { data: prods } = await supabase
          .from("products")
          .select("*, categories(name)")
          .eq("store_id", storeData.id)
          .order("created_at", { ascending: false });

        setProducts(prods || []);
      }

      const { data: cats } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      setCategories(cats || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectImage = async () => {
    if (!adminStoreId) return;
    setUploadingImage(true);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];

        const response = await fetch(asset.uri);
        const blob = await response.blob();

        const ext = asset.name?.split(".").pop() || "jpg";
        const filePath = `official/${Date.now()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("products")
          .upload(filePath, blob, {
            contentType: asset.mimeType || "image/jpeg",
            upsert: true,
          });

        if (upErr) {
          console.error(upErr);
          showToast(`فشل رفع الصورة: ${upErr.message}`, "error");
        } else {
          const { data: urlData } = supabase.storage
            .from("products")
            .getPublicUrl(filePath);
          setProductImage(urlData.publicUrl);
          showToast("تم رفع الصورة بنجاح ✓");
        }
      }
    } catch (err) {
      console.error(err);
      showToast("حدث خطأ أثناء تحميل الصورة", "error");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!productName.trim() || !productPrice) {
      showToast("يرجى ملء الاسم والسعر", "error");
      return;
    }
    if (!adminStoreId) {
      showToast("لم يتم العثور على المتجر الرسمي", "error");
      return;
    }

    setSaving(true);

    const payload = {
      store_id: adminStoreId,
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
          .update(payload)
          .eq("id", editingProduct.id);

        if (error) throw error;
        showToast("تم تحديث المنتج ✓");
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        showToast("تم إضافة المنتج الرسمي ✓");
      }

      resetForm();
      fetchData();
    } catch (err: any) {
      console.error(err);
      showToast(`فشل الحفظ: ${err.message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert("تأكيد الحذف", "هل أنت متأكد من حذف هذا المنتج؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف المنتج",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("products").delete().eq("id", id);
          if (error) {
            showToast("فشل حذف المنتج", "error");
          } else {
            showToast("تم حذف المنتج بنجاح");
            fetchData();
          }
        },
      },
    ]);
  };

  const startEdit = (prod: Product) => {
    setEditingProduct(prod);
    setProductName(prod.name);
    setProductPrice(String(prod.price));
    setProductQty(String(prod.quantity));
    setProductCat(prod.category_id || "");
    setProductImage(prod.image_url);
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingProduct(null);
    setProductName("");
    setProductPrice("");
    setProductQty("1");
    setProductCat("");
    setProductImage(null);
    setShowForm(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {toast && (
        <View style={[styles.toastAlert, toast.type === "error" ? styles.toastError : styles.toastSuccess]}>
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>المنتجات الرسمية</Text>
          <Text style={styles.headerSubtitle}>إدارة منتجات مكتبة العنقاء الرسمية</Text>
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={() => (showForm ? resetForm() : setShowForm(true))}>
          <Feather name={showForm ? "x" : "plus"} size={16} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Form Card */}
        {showForm && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {editingProduct ? "تعديل المنتج" : "إضافة منتج جديد"}
            </Text>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>اسم المنتج</Text>
                <TextInput
                  value={productName}
                  onChangeText={setProductName}
                  placeholder="مثال: دفتر فني A4"
                  placeholderTextColor="#71717a"
                  style={styles.textInput}
                  textAlign="right"
                />
              </View>

              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>السعر (د.ع)</Text>
                  <TextInput
                    value={productPrice}
                    onChangeText={setProductPrice}
                    placeholder="2500"
                    placeholderTextColor="#71717a"
                    keyboardType="numeric"
                    style={styles.textInput}
                    textAlign="right"
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>الكمية</Text>
                  <TextInput
                    value={productQty}
                    onChangeText={setProductQty}
                    placeholder="10"
                    placeholderTextColor="#71717a"
                    keyboardType="numeric"
                    style={styles.textInput}
                    textAlign="right"
                  />
                </View>
              </View>

              {/* Category selector options list */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>التصنيف</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catsList}>
                  {categories.map((c) => {
                    const isSelected = productCat === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setProductCat(isSelected ? "" : c.id)}
                        style={[styles.catBadge, isSelected ? styles.catBadgeActive : styles.catBadgeInactive]}
                      >
                        <Text style={[styles.catBadgeText, isSelected ? styles.whiteText : styles.mutedText]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Product Image */}
              <View style={styles.imageSelectorGroup}>
                <Text style={styles.inputLabel}>صورة المنتج</Text>

                <View style={styles.imageSelectorBox}>
                  {productImage ? (
                    <Image source={{ uri: productImage }} style={styles.uploadedImagePreview} />
                  ) : (
                    <Feather name="image" size={32} color="#71717a" />
                  )}

                  <TouchableOpacity
                    style={styles.uploadBtn}
                    onPress={handleSelectImage}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.uploadBtnText}>اختر صورة</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Action buttons */}
              <View style={styles.formActions}>
                <TouchableOpacity style={styles.submitBtn} onPress={handleSave} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.submitBtnText}>حفظ المنتج</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}>
                  <Text style={styles.cancelBtnText}>إلغاء</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Products Grid */}
        <View style={styles.productsSection}>
          <Text style={styles.sectionTitle}>قائمة المنتجات</Text>

          {products.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Feather name="package" size={48} color="#27272a" />
              <Text style={styles.emptyText}>لا توجد منتجات رسمية مضافة</Text>
            </View>
          ) : (
            <View style={styles.productsGrid}>
              {products.map((prod) => (
                <View key={prod.id} style={styles.productCard}>
                  <View style={styles.cardImageWrapper}>
                    {prod.image_url ? (
                      <Image source={{ uri: prod.image_url }} style={styles.cardImage} />
                    ) : (
                      <Feather name="package" size={24} color="#71717a" />
                    )}
                  </View>

                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {prod.name}
                    </Text>
                    <Text style={styles.cardPrice}>{prod.price} د.ع</Text>
                    <Text style={styles.cardQty}>الكمية: {prod.quantity}</Text>
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.editBtn} onPress={() => startEdit(prod)}>
                      <Feather name="edit-2" size={14} color="#60a5fa" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(prod.id)}>
                      <Feather name="trash-2" size={14} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
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
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderColor: "#18181b",
  },
  headerTextContainer: {
    alignItems: "flex-end",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#f97316",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#71717a",
    marginTop: 4,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 20,
    gap: 20,
  },
  card: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 20,
    padding: 20,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 16,
    textAlign: "right",
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 12,
    color: "#71717a",
    fontWeight: "500",
    textAlign: "right",
  },
  textInput: {
    height: 44,
    backgroundColor: "#09090b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#27272a",
    paddingHorizontal: 12,
    color: "#f4f4f5",
    fontSize: 13,
  },
  rowInputs: {
    flexDirection: "row-reverse",
    gap: 12,
  },
  catsList: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  catBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  catBadgeActive: {
    backgroundColor: "#ea580c",
    borderColor: "#ea580c",
  },
  catBadgeInactive: {
    backgroundColor: "#09090b",
    borderColor: "#27272a",
  },
  catBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  whiteText: {
    color: "#ffffff",
  },
  mutedText: {
    color: "#71717a",
  },
  imageSelectorGroup: {
    gap: 8,
  },
  imageSelectorBox: {
    height: 80,
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  uploadedImagePreview: {
    width: 56,
    height: 56,
    borderRadius: 8,
    resizeMode: "cover",
  },
  uploadBtn: {
    backgroundColor: "#27272a",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  uploadBtnText: {
    color: "#f4f4f5",
    fontSize: 11,
    fontWeight: "bold",
  },
  formActions: {
    flexDirection: "row-reverse",
    gap: 8,
    marginTop: 12,
  },
  submitBtn: {
    flex: 1,
    backgroundColor: "#ea580c",
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  cancelBtn: {
    backgroundColor: "#27272a",
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: "#a1a1aa",
    fontSize: 13,
  },
  productsSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f4f4f5",
    textAlign: "right",
  },
  emptyContainer: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 20,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#71717a",
    fontSize: 13,
    marginTop: 8,
  },
  productsGrid: {
    gap: 12,
  },
  productCard: {
    flexDirection: "row-reverse",
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    gap: 12,
  },
  cardImageWrapper: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  cardInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  cardName: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  cardPrice: {
    fontSize: 12,
    color: "#f97316",
    fontWeight: "600",
    marginTop: 2,
  },
  cardQty: {
    fontSize: 10,
    color: "#71717a",
    marginTop: 2,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
  },
  editBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(96, 165, 250, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
});
