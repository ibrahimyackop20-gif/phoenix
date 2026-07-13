import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  Switch,
  Alert,
} from "react-native";
import { supabase } from "../../../../lib/supabaseClient";
import { Feather, FontAwesome, Ionicons } from "@expo/vector-icons";

interface DeliveryFeeRow {
  id: string;
  area_name: string;
  fee_amount: number;
}

interface Coupon {
  id: string;
  code: string;
  discount_value: number;
  discount_type: "fixed" | "percentage";
  target_type: "printing" | "library";
  store_id: string | null;
  min_order_amount: number;
  expiry_date: string | null;
  is_active: boolean;
}

export default function AdminSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [isLibraryEnabled, setIsLibraryEnabled] = useState(true);
  const [zaincashNumber, setZaincashNumber] = useState("");
  const [asiaNumber, setAsiaNumber] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  // Delivery CRUD states
  const [deliveryFees, setDeliveryFees] = useState<DeliveryFeeRow[]>([]);
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaFee, setNewAreaFee] = useState("");
  const [savingFee, setSavingFee] = useState(false);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [editFeeAmount, setEditFeeAmount] = useState("");

  // Coupons CRUD states
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [cpCode, setCpCode] = useState("");
  const [cpValue, setCpValue] = useState("");
  const [cpType, setCpType] = useState<"fixed" | "percentage">("fixed");
  const [cpTarget, setCpTarget] = useState<"printing" | "library">("printing");
  const [cpMinOrder, setCpMinOrder] = useState("");
  const [cpExpiry, setCpExpiry] = useState("");
  const [savingCoupon, setSavingCoupon] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSettings = async () => {
    try {
      const { data: settings } = await supabase.from("site_settings").select("key, value");
      if (settings) {
        for (const s of settings) {
          if (s.key === "is_library_enabled") setIsLibraryEnabled(s.value === "true");
        }
      }

      const { data: payData } = await supabase.from("payment_settings").select("key, value");
      if (payData) {
        for (const p of payData) {
          if (p.key === "zaincash_number") setZaincashNumber(p.value || "");
          if (p.key === "asiahawala_number") setAsiaNumber(p.value || "");
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDeliveryFees = async () => {
    try {
      const { data } = await supabase
        .from("delivery_fees")
        .select("id, area_name, fee_amount")
        .order("area_name");
      if (data) setDeliveryFees(data as DeliveryFeeRow[]);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCoupons = async () => {
    try {
      const { data } = await supabase
        .from("coupons")
        .select("*")
        .is("store_id", null)
        .order("created_at", { ascending: false });
      if (data) setCoupons(data as Coupon[]);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([fetchSettings(), fetchDeliveryFees(), fetchCoupons()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleToggleLibrary = async (val: boolean) => {
    setIsLibraryEnabled(val);
    try {
      const { error } = await supabase
        .from("site_settings")
        .update({ value: val ? "true" : "false" })
        .eq("key", "is_library_enabled");

      if (error) throw error;
      showToast("تم تحديث حالة المكتبة");
    } catch (err) {
      showToast("فشل التحديث", "error");
      setIsLibraryEnabled(!val);
    }
  };

  const handleSavePayment = async () => {
    setSavingPayment(true);
    try {
      await supabase
        .from("payment_settings")
        .update({ value: zaincashNumber.trim() })
        .eq("key", "zaincash_number");

      await supabase
        .from("payment_settings")
        .update({ value: asiaNumber.trim() })
        .eq("key", "asiahawala_number");

      showToast("تم حفظ إعدادات الدفع ✓");
    } catch (err) {
      showToast("فشل الحفظ", "error");
    } finally {
      setSavingPayment(false);
    }
  };

  const addDeliveryFee = async () => {
    if (!newAreaName.trim() || !newAreaFee) return;
    setSavingFee(true);

    try {
      const { error } = await supabase.from("delivery_fees").insert({
        area_name: newAreaName.trim(),
        fee_amount: parseInt(newAreaFee) || 0,
      });

      if (error) throw error;
      showToast("تمت إضافة المنطقة ✓");
      setNewAreaName("");
      setNewAreaFee("");
      fetchDeliveryFees();
    } catch (err) {
      showToast("فشل الإضافة", "error");
    } finally {
      setSavingFee(false);
    }
  };

  const updateDeliveryFee = async (id: string) => {
    const fee = parseInt(editFeeAmount);
    if (isNaN(fee) || fee < 0) return;

    try {
      const { error } = await supabase
        .from("delivery_fees")
        .update({ fee_amount: fee })
        .eq("id", id);

      if (error) throw error;
      showToast("تم التحديث ✓");
      setEditingFeeId(null);
      fetchDeliveryFees();
    } catch (err) {
      showToast("فشل التحديث", "error");
    }
  };

  const deleteDeliveryFee = (id: string) => {
    Alert.alert("تأكيد الحذف", "هل تريد حذف هذه المنطقة؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("delivery_fees").delete().eq("id", id);
          if (error) {
            showToast("فشل الحذف", "error");
          } else {
            showToast("تم حذف المنطقة");
            fetchDeliveryFees();
          }
        },
      },
    ]);
  };

  const validateAndFormatExpiry = (dateStr: string): { isValid: boolean; error?: string; formattedDate: string | null } => {
    const trimmed = dateStr.trim();
    if (!trimmed) {
      return { isValid: true, formattedDate: null };
    }

    const d = new Date(trimmed);
    if (isNaN(d.getTime())) {
      return { 
        isValid: false, 
        error: "الرجاء إدخال تاريخ صالح بصيغة YYYY-MM-DD (مثال: 2026-07-15)", 
        formattedDate: null 
      };
    }

    const year = d.getFullYear();
    if (year < 2020 || year > 2100) {
      return { 
        isValid: false, 
        error: "السنة يجب أن تكون بين 2020 و 2100", 
        formattedDate: null 
      };
    }

    return { isValid: true, formattedDate: d.toISOString() };
  };

  const selectPreset = (type: "none" | "tomorrow" | "next_week" | "next_month" | "end_of_year") => {
    const now = new Date();
    let selectedDate: Date | null = null;
    
    if (type === "tomorrow") {
      selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (type === "next_week") {
      selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
    } else if (type === "next_month") {
      selectedDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    } else if (type === "end_of_year") {
      selectedDate = new Date(now.getFullYear(), 11, 31);
    }

    if (selectedDate) {
      const yyyy = selectedDate.getFullYear();
      const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const dd = String(selectedDate.getDate()).padStart(2, "0");
      setCpExpiry(`${yyyy}-${mm}-${dd}`);
      showToast(`تم اختيار التاريخ: ${yyyy}-${mm}-${dd}`);
    } else {
      setCpExpiry("");
      showToast("كوبون دائم بدون تاريخ انتهاء");
    }
  };

  const addCoupon = async () => {
    if (!cpCode.trim() || !cpValue) return;
    setSavingCoupon(true);

    // Expiry date verification
    console.log("[Add Coupon Debug Log]");
    console.log("- cpExpiry value:", cpExpiry);
    console.log("- typeof cpExpiry:", typeof cpExpiry);

    let formattedExpiry: string | null = null;
    if (cpExpiry.trim()) {
      const d = new Date(cpExpiry.trim());
      console.log("- Date object:", d.toString());
      console.log("- getTime():", d.getTime());

      const validation = validateAndFormatExpiry(cpExpiry);
      if (!validation.isValid) {
        console.log("- Validation: INVALID -", validation.error);
        showToast(validation.error || "تاريخ غير صالح", "error");
        setSavingCoupon(false);
        return;
      }
      formattedExpiry = validation.formattedDate;
      console.log("- ISO string:", formattedExpiry);
    } else {
      console.log("- Expiry is empty/permanent coupon");
    }

    const payload = {
      code: cpCode.trim().toUpperCase(),
      discount_value: Number(cpValue) || 0,
      discount_type: cpType,
      target_type: cpTarget,
      min_order_amount: Number(cpMinOrder) || 0,
      expiry_date: formattedExpiry,
    };

    try {
      const { error } = await supabase.from("coupons").insert(payload);
      if (error) throw error;

      showToast("تمت إضافة الكوبون ✓");
      setCpCode("");
      setCpValue("");
      setCpMinOrder("");
      setCpExpiry("");
      fetchCoupons();
    } catch (err) {
      showToast("فشل إضافة الكوبون", "error");
    } finally {
      setSavingCoupon(false);
    }
  };

  const deleteCoupon = (id: string) => {
    Alert.alert("تأكيد الحذف", "هل تريد حذف هذا الكوبون؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("coupons").delete().eq("id", id);
          if (error) {
            showToast("فشل الحذف", "error");
          } else {
            showToast("تم حذف الكوبون");
            fetchCoupons();
          }
        },
      },
    ]);
  };

  const toggleCouponActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("coupons")
        .update({ is_active: !isActive })
        .eq("id", id);

      if (error) throw error;
      fetchCoupons();
    } catch (err) {
      showToast("فشل التحديث", "error");
    }
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
          <Text style={styles.headerTitle}>الإعدادات العامة</Text>
          <Text style={styles.headerSubtitle}>تكوين بوابات الدفع، مناطق التوصيل والكوبونات</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Bookstore Settings Toggle */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <Switch
              value={isLibraryEnabled}
              onValueChange={handleToggleLibrary}
              trackColor={{ false: "#27272a", true: "#f97316" }}
              thumbColor={isLibraryEnabled ? "#ffffff" : "#a1a1aa"}
            />
            <View style={styles.toggleTextWrapper}>
              <Text style={styles.toggleTitle}>تفعيل سوق المكتبة الطلابي</Text>
              <Text style={styles.toggleSubtitle}>تمكين الطلاب من استكشاف وشراء المنتجات</Text>
            </View>
          </View>
        </View>

        {/* Payment Numbers */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>أرقام محافظ الدفع الإلكتروني</Text>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>رقم محفظة زين كاش (ZainCash)</Text>
              <TextInput
                value={zaincashNumber}
                onChangeText={setZaincashNumber}
                placeholder="078XXXXXXXX"
                placeholderTextColor="#71717a"
                keyboardType="numeric"
                style={styles.textInput}
                textAlign="right"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>رقم محفظة آسيا حوالة (AsiaHawala)</Text>
              <TextInput
                value={asiaNumber}
                onChangeText={setAsiaNumber}
                placeholder="077XXXXXXXX"
                placeholderTextColor="#71717a"
                keyboardType="numeric"
                style={styles.textInput}
                textAlign="right"
              />
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleSavePayment} disabled={savingPayment}>
              {savingPayment ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.submitBtnText}>حفظ الأرقام</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Delivery Zones */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>إدارة مناطق التوصيل والأسعار</Text>

          <View style={styles.addZoneForm}>
            <TextInput
              value={newAreaName}
              onChangeText={setNewAreaName}
              placeholder="اسم المنطقة"
              placeholderTextColor="#71717a"
              style={[styles.textInput, { flex: 2 }]}
              textAlign="right"
            />
            <TextInput
              value={newAreaFee}
              onChangeText={setNewAreaFee}
              placeholder="السعر د.ع"
              placeholderTextColor="#71717a"
              keyboardType="numeric"
              style={[styles.textInput, { flex: 1 }]}
              textAlign="right"
            />
            <TouchableOpacity style={styles.addZoneBtn} onPress={addDeliveryFee} disabled={savingFee}>
              <Feather name="plus" size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Zones list */}
          <View style={styles.list}>
            {deliveryFees.map((fee) => (
              <View key={fee.id} style={styles.listItem}>
                <View style={styles.itemActions}>
                  <TouchableOpacity onPress={() => deleteDeliveryFee(fee.id)}>
                    <Feather name="trash-2" size={14} color="#ef4444" style={styles.actionIcon} />
                  </TouchableOpacity>

                  {editingFeeId === fee.id ? (
                    <TouchableOpacity onPress={() => updateDeliveryFee(fee.id)}>
                      <Feather name="check" size={14} color="#10b981" style={styles.actionIcon} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        setEditingFeeId(fee.id);
                        setEditFeeAmount(String(fee.fee_amount));
                      }}
                    >
                      <Feather name="edit-2" size={14} color="#60a5fa" style={styles.actionIcon} />
                    </TouchableOpacity>
                  )}
                </View>

                {editingFeeId === fee.id ? (
                  <TextInput
                    value={editFeeAmount}
                    onChangeText={setEditFeeAmount}
                    keyboardType="numeric"
                    style={styles.editFeeInput}
                  />
                ) : (
                  <Text style={styles.feeAmountText}>{fee.fee_amount.toLocaleString()} د.ع</Text>
                )}

                <Text style={styles.areaNameText}>{fee.area_name}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Coupons Code CRUD */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>إدارة كوبونات الخصم</Text>

          <View style={styles.couponForm}>
            <TextInput
              value={cpCode}
              onChangeText={setCpCode}
              placeholder="رمز الكوبون"
              placeholderTextColor="#71717a"
              style={styles.textInput}
              autoCapitalize="characters"
              textAlign="right"
            />

            <View style={styles.couponRow}>
              <TextInput
                value={cpValue}
                onChangeText={setCpValue}
                placeholder="قيمة الخصم"
                placeholderTextColor="#71717a"
                keyboardType="numeric"
                style={[styles.textInput, { flex: 1 }]}
                textAlign="right"
              />

              {/* Selector for Type */}
              <View style={styles.selectorRow}>
                <TouchableOpacity
                  style={[styles.selectorBtn, cpType === "fixed" && styles.selectorActive]}
                  onPress={() => setCpType("fixed")}
                >
                  <Text style={styles.selectorText}>د.ع</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.selectorBtn, cpType === "percentage" && styles.selectorActive]}
                  onPress={() => setCpType("percentage")}
                >
                  <Text style={styles.selectorText}>%</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.couponRow}>
              <TextInput
                value={cpMinOrder}
                onChangeText={setCpMinOrder}
                placeholder="الحد الأدنى للطلب"
                placeholderTextColor="#71717a"
                keyboardType="numeric"
                style={[styles.textInput, { flex: 1 }]}
                textAlign="right"
              />
              <TextInput
                value={cpExpiry}
                onChangeText={setCpExpiry}
                placeholder="الانتهاء (YYYY-MM-DD)"
                placeholderTextColor="#71717a"
                style={[styles.textInput, { flex: 1 }]}
                textAlign="right"
              />
            </View>

            {/* Quick Expiration Presets */}
            <Text style={styles.presetLabel}>خيارات تاريخ الانتهاء السريعة:</Text>
            <View style={styles.presetContainer}>
              <TouchableOpacity style={styles.presetBtn} onPress={() => selectPreset("none")}>
                <Text style={styles.presetBtnText}>بدون تاريخ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => selectPreset("tomorrow")}>
                <Text style={styles.presetBtnText}>غداً</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => selectPreset("next_week")}>
                <Text style={styles.presetBtnText}>أسبوع</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => selectPreset("next_month")}>
                <Text style={styles.presetBtnText}>شهر</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.presetBtn} onPress={() => selectPreset("end_of_year")}>
                <Text style={styles.presetBtnText}>نهاية العام</Text>
              </TouchableOpacity>
            </View>

            {/* Expiry Verification Visual Check */}
            {cpExpiry.trim() !== "" && (
              <Text 
                style={[
                  styles.validationText, 
                  validateAndFormatExpiry(cpExpiry).isValid ? styles.validationValid : styles.validationInvalid
                ]}
              >
                {validateAndFormatExpiry(cpExpiry).isValid 
                  ? `✓ تاريخ صالح: ينتهي في ${new Date(cpExpiry.trim()).toLocaleDateString("ar-IQ")}` 
                  : `⚠ ${validateAndFormatExpiry(cpExpiry).error}`
                }
              </Text>
            )}

            {/* Target Selectors */}
            <View style={styles.targetRow}>
              <TouchableOpacity
                style={[styles.targetBtn, cpTarget === "printing" && styles.targetActive]}
                onPress={() => setCpTarget("printing")}
              >
                <Text style={styles.targetText}>خدمة الطباعة</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.targetBtn, cpTarget === "library" && styles.targetActive]}
                onPress={() => setCpTarget("library")}
              >
                <Text style={styles.targetText}>المكتبة</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={addCoupon} disabled={savingCoupon}>
              {savingCoupon ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.submitBtnText}>إضافة الكوبون</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Coupons List */}
          <View style={styles.list}>
            {coupons.map((cp) => (
              <View key={cp.id} style={styles.couponItem}>
                <View style={styles.couponHeaderRow}>
                  <TouchableOpacity onPress={() => deleteCoupon(cp.id)}>
                    <Feather name="trash-2" size={14} color="#ef4444" />
                  </TouchableOpacity>

                  <Switch
                    value={cp.is_active}
                    onValueChange={() => toggleCouponActive(cp.id, cp.is_active)}
                    trackColor={{ false: "#27272a", true: "#f97316" }}
                    thumbColor={cp.is_active ? "#ffffff" : "#a1a1aa"}
                  />

                  <Text style={styles.couponCode}>
                    {cp.code}
                  </Text>
                </View>

                <View style={styles.couponDetails}>
                  <Text style={styles.couponDetailText}>
                    الخصم: {cp.discount_value} {cp.discount_type === "percentage" ? "%" : "د.ع"}
                  </Text>
                  <Text style={styles.couponDetailText}>
                    الهدف: {cp.target_type === "printing" ? "الطباعة" : "المكتبة"}
                  </Text>
                  <Text style={styles.couponDetailText}>الحد الأدنى: {cp.min_order_amount} د.ع</Text>
                </View>
              </View>
            ))}
          </View>
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleTextWrapper: {
    alignItems: "flex-end",
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  toggleSubtitle: {
    fontSize: 11,
    color: "#71717a",
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 16,
    textAlign: "right",
  },
  form: {
    gap: 14,
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
  submitBtn: {
    backgroundColor: "#ea580c",
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  addZoneForm: {
    flexDirection: "row-reverse",
    gap: 8,
    marginBottom: 16,
  },
  addZoneBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    gap: 10,
  },
  listItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 10,
    padding: 12,
  },
  itemActions: {
    flexDirection: "row",
    gap: 12,
  },
  actionIcon: {
    padding: 2,
  },
  editFeeInput: {
    width: 80,
    height: 28,
    backgroundColor: "#18181b",
    borderRadius: 6,
    color: "#ffffff",
    fontSize: 12,
    textAlign: "center",
  },
  feeAmountText: {
    fontSize: 13,
    color: "#f97316",
    fontWeight: "bold",
  },
  areaNameText: {
    fontSize: 13,
    color: "#f4f4f5",
  },
  couponForm: {
    gap: 12,
  },
  couponRow: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  selectorRow: {
    flexDirection: "row-reverse",
    backgroundColor: "#09090b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#27272a",
    overflow: "hidden",
    height: 44,
  },
  selectorBtn: {
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  selectorActive: {
    backgroundColor: "#27272a",
  },
  selectorText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "bold",
  },
  targetRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginVertical: 4,
  },
  targetBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    alignItems: "center",
    justifyContent: "center",
  },
  targetActive: {
    backgroundColor: "rgba(234, 88, 12, 0.15)",
    borderColor: "rgba(234, 88, 12, 0.3)",
  },
  targetText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "bold",
  },
  couponItem: {
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  couponHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  couponCode: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#f97316",
  },
  couponDetails: {
    alignItems: "flex-end",
    gap: 2,
  },
  couponDetailText: {
    fontSize: 11,
    color: "#71717a",
  },
  presetLabel: {
    fontSize: 11,
    color: "#71717a",
    textAlign: "right",
    marginTop: 4,
    marginBottom: 4,
  },
  presetContainer: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  presetBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "#27272a",
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
  presetBtnText: {
    color: "#e4e4e7",
    fontSize: 11,
  },
  validationText: {
    fontSize: 11,
    textAlign: "right",
    marginTop: 2,
    marginBottom: 8,
    fontWeight: "500",
  },
  validationValid: {
    color: "#10b981", // emerald green
  },
  validationInvalid: {
    color: "#ef4444", // red
  },
});
