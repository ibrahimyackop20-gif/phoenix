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
} from "react-native";
import { supabase } from "../../../../lib/supabaseClient";
import { Feather, FontAwesome } from "@expo/vector-icons";

interface PricingRow {
  id: string;
  paper_type: string;
  category: string;
  display_name_ar: string;
  price_per_meter: number;
  label: string;
}

export default function AdminPricingScreen() {
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchPrices = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("print_pricing")
        .select("*")
        .order("category", { ascending: true });

      if (error) throw error;
      if (data) setRows(data);
    } catch (err) {
      console.error(err);
      showToast("فشل تحميل الأسعار", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
  }, []);

  const updatePrice = (id: string, newPrice: number) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, price_per_meter: newPrice } : r))
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      for (const row of rows) {
        const { error } = await supabase
          .from("print_pricing")
          .update({ price_per_meter: row.price_per_meter })
          .eq("id", row.id);

        if (error) throw error;
      }
      showToast("تم حفظ جميع الأسعار بنجاح ✓");
    } catch (err) {
      showToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const rollRows = rows.filter((r) => r.category === "Roll");
  const a4Rows = rows.filter((r) => r.category === "A4");

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
          <Text style={styles.headerTitle}>أسعار الطباعة</Text>
          <Text style={styles.headerSubtitle}>تعديل أسعار جميع أنواع الورق (رول + A4)</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Roll Pricing */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="layers" size={18} color="#f97316" />
            <Text style={styles.cardTitle}>أسعار الطباعة الهندسية (رول) — لكل متر</Text>
          </View>

          <View style={styles.inputsList}>
            {rollRows.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد أصناف رول مضافة</Text>
            ) : (
              rollRows.map((row) => (
                <View key={row.id} style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.paperTypeLabel}>({row.paper_type})</Text>
                    <Text style={styles.inputLabel}>{row.display_name_ar}</Text>
                  </View>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.unitText}>د.ع/م</Text>
                    <TextInput
                      value={String(row.price_per_meter)}
                      onChangeText={(val) => updatePrice(row.id, parseInt(val) || 0)}
                      keyboardType="numeric"
                      style={styles.textInput}
                      textAlign="left"
                    />
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* A4 Pricing */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="file-text" size={18} color="#ea580c" />
            <Text style={styles.cardTitle}>أسعار الطباعة A4 — لكل صفحة</Text>
          </View>

          <View style={styles.inputsList}>
            {a4Rows.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد أصناف A4 مضافة</Text>
            ) : (
              a4Rows.map((row) => (
                <View key={row.id} style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Text style={styles.paperTypeLabel}>({row.paper_type})</Text>
                    <Text style={styles.inputLabel}>{row.display_name_ar}</Text>
                  </View>
                  <View style={styles.inputWrapper}>
                    <Text style={styles.unitText}>د.ع/صفحة</Text>
                    <TextInput
                      value={String(row.price_per_meter)}
                      onChangeText={(val) => updatePrice(row.id, parseInt(val) || 0)}
                      keyboardType="numeric"
                      style={styles.textInput}
                      textAlign="left"
                    />
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSaveAll} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <View style={styles.submitBtnInner}>
              <Feather name="save" size={18} color="#ffffff" />
              <Text style={styles.submitBtnText}>حفظ جميع الأسعار</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Note Card */}
        <View style={styles.noteCard}>
          <View style={styles.noteHeader}>
            <Feather name="info" size={14} color="#10b981" />
            <Text style={styles.noteTitle}>تنبيه</Text>
          </View>
          <Text style={styles.noteText}>
            يتم استخدام هذه الأسعار مباشرة في صفحة الطلب الجديد. أسعار الرول تُحسب بالمتر، وأسعار A4 تُحسب بالصفحة. التغييرات تظهر فوراً للمستخدمين.
          </Text>
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
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderColor: "#27272a",
    paddingBottom: 12,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  inputsList: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  labelRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#f4f4f5",
  },
  paperTypeLabel: {
    fontSize: 10,
    color: "#71717a",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  unitText: {
    color: "#71717a",
    fontSize: 11,
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: "#f4f4f5",
    fontSize: 13,
    height: "100%",
  },
  emptyText: {
    color: "#71717a",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 12,
  },
  submitBtn: {
    backgroundColor: "#ea580c",
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ea580c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  submitBtnInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  noteCard: {
    backgroundColor: "rgba(16, 185, 129, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.15)",
    borderRadius: 16,
    padding: 16,
  },
  noteHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  noteTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#10b981",
  },
  noteText: {
    color: "#71717a",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "right",
  },
});
