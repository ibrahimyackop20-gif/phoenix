import React, { useEffect, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { useRouter, Link } from "expo-router";
import { supabase } from "../../../../lib/supabaseClient";
import { Feather } from "@expo/vector-icons";

interface DeliveryZone {
  id: string;
  name: string;
  cost: number;
  governorate_id: string;
}

interface StoreShippingCost {
  zone_id: string;
  cost: number;
}

interface Governorate {
  id: string;
  name: string;
}

export default function SellerShippingSettingsScreen() {
  const router = useRouter();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [customCosts, setCustomCosts] = useState<Record<string, string>>({});
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Status feedback states
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const triggerToast = (msg: string, type: "success" | "error" = "success") => {
    if (type === "success") {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Get store id
        const { data: store } = await supabase
          .from("stores")
          .select("id")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (!store) {
          setLoading(false);
          return;
        }
        setStoreId(store.id);

        // Get governorates
        const { data: govData } = await supabase
          .from("governorates")
          .select("id, name")
          .order("name");
        setGovernorates((govData || []) as Governorate[]);

        // Get all delivery zones
        const { data: zoneData } = await supabase
          .from("delivery_zones")
          .select("id, name, cost, governorate_id")
          .order("name");
        setZones((zoneData || []) as DeliveryZone[]);

        // Get existing custom costs
        const { data: customData } = await supabase
          .from("store_shipping_costs")
          .select("zone_id, cost")
          .eq("store_id", store.id);

        if (customData) {
          const map: Record<string, string> = {};
          for (const c of customData as StoreShippingCost[]) {
            map[c.zone_id] = String(c.cost);
          }
          setCustomCosts(map);
        }
      } catch (err) {
        console.error("Error loading delivery settings:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleSave = async () => {
    if (!storeId) return;
    setSaving(true);

    try {
      let hasError = false;
      for (const [zoneId, costStr] of Object.entries(customCosts)) {
        const cost = parseInt(costStr);
        if (isNaN(cost) || cost < 0) continue;

        const { error } = await supabase.from("store_shipping_costs").upsert(
          { store_id: storeId, zone_id: zoneId, cost },
          { onConflict: "store_id,zone_id" }
        );

        if (error) {
          console.error("Save shipping cost error:", error);
          hasError = true;
        }
      }

      if (hasError) {
        triggerToast("حدث خطأ أثناء حفظ بعض الأسعار", "error");
      } else {
        triggerToast("تم حفظ أسعار التوصيل ✓");
      }
    } catch (err) {
      console.error(err);
      triggerToast("خطأ غير متوقع أثناء الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const updateCost = (zoneId: string, val: string) => {
    setCustomCosts((prev) => ({ ...prev, [zoneId]: val }));
  };

  const groupedZones = useMemo(() => {
    const map: Record<string, { govName: string; zonesList: DeliveryZone[] }> = {};
    for (const zone of zones) {
      if (!map[zone.governorate_id]) {
        const gov = governorates.find((g) => g.id === zone.governorate_id);
        map[zone.governorate_id] = { govName: gov?.name || "غير محدد", zonesList: [] };
      }
      map[zone.governorate_id].zonesList.push(zone);
    }
    return Object.values(map);
  }, [zones, governorates]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  if (!storeId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyCard}>
          <Feather name="truck" size={64} color="#71717a" />
          <Text style={styles.emptyTitle}>لا يوجد متجر نشط</Text>
          <Text style={styles.emptySubtitle}>أنشئ متجرك أولاً لتتمكن من تعديل إعدادات الشحن والتوصيل</Text>
          <Link href={"/dashboard/my-store" as any} asChild>
            <TouchableOpacity style={styles.backButton}>
              <Text style={styles.backButtonText}>إنشاء متجر</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

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

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveButton}>
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View style={styles.buttonInner}>
                <Feather name="save" size={14} color="#ffffff" style={styles.buttonIcon} />
                <Text style={styles.saveButtonText}>حفظ</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.headerText}>
            <View style={styles.titleRow}>
              <Link href={"/dashboard/my-store" as any} asChild>
                <TouchableOpacity>
                  <Feather name="arrow-right" size={20} color="#f4f4f5" />
                </TouchableOpacity>
              </Link>
              <Text style={styles.title}>أسعار التوصيل</Text>
            </View>
            <Text style={styles.subtitle}>حدد سعر توصيل خاص لمتجرك لكل منطقة</Text>
          </View>
        </View>

        {/* Tips Info Card */}
        <View style={styles.infoCard}>
          <Feather name="info" size={16} color="#60a5fa" style={styles.infoIcon} />
          <Text style={styles.infoText}>
            اترك الحقل فارغاً لاستخدام سعر التوصيل الافتراضي للمنطقة. السعر الخاص بمتجرك يأخذ الأولوية دائماً.
          </Text>
        </View>

        {/* Grouped Zones */}
        <View style={styles.zonesContainer}>
          {groupedZones.map((group) => (
            <View key={group.govName} style={styles.govCard}>
              <View style={styles.govHeader}>
                <Feather name="map-pin" size={14} color="#ea580c" />
                <Text style={styles.govTitle}>{group.govName}</Text>
              </View>

              <View style={styles.zonesList}>
                {group.zonesList.map((zone) => {
                  const hasCustom = customCosts[zone.id] !== undefined && customCosts[zone.id] !== "";
                  return (
                    <View key={zone.id} style={styles.zoneRow}>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          value={customCosts[zone.id] ?? ""}
                          onChangeText={(val) => updateCost(zone.id, val)}
                          placeholder={String(zone.cost)}
                          placeholderTextColor="#71717a"
                          keyboardType="number-pad"
                          style={[styles.costInput, hasCustom && styles.costInputActive]}
                          textAlign="center"
                        />
                        <Text style={styles.currencyLabel}>د.ع</Text>
                      </View>
                      <View style={styles.zoneInfo}>
                        <Text style={styles.zoneName}>{zone.name}</Text>
                        <Text style={styles.defaultCostText}>الافتراضي: {zone.cost} د.ع</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {zones.length === 0 && (
          <View style={styles.emptyCardMini}>
            <Text style={styles.emptyMiniText}>لا توجد مناطق توصيل مسجلة بالنظام حالياً</Text>
          </View>
        )}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerText: {
    alignItems: "flex-end",
  },
  titleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  subtitle: {
    fontSize: 12,
    color: "#a1a1aa",
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: "#ea580c",
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  buttonIcon: {
    marginLeft: 2,
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "bold",
  },
  infoCard: {
    flexDirection: "row-reverse",
    backgroundColor: "rgba(96, 165, 250, 0.08)",
    borderColor: "rgba(96, 165, 250, 0.15)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 20,
    alignItems: "center",
    gap: 10,
  },
  infoIcon: {
    marginLeft: 2,
  },
  infoText: {
    color: "#a1a1aa",
    fontSize: 11,
    textAlign: "right",
    flex: 1,
    lineHeight: 16,
  },
  emptyCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#71717a",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 18,
  },
  backButton: {
    backgroundColor: "#ea580c",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  backButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
  },
  zonesContainer: {
    gap: 16,
  },
  govCard: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  govHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#27272a",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  govTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  zonesList: {
    paddingVertical: 4,
  },
  zoneRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(39, 39, 42, 0.5)",
  },
  zoneInfo: {
    alignItems: "flex-end",
  },
  zoneName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#f4f4f5",
  },
  defaultCostText: {
    fontSize: 10,
    color: "#71717a",
    marginTop: 2,
  },
  inputWrapper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  costInput: {
    backgroundColor: "#09090b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 8,
    width: 80,
    height: 32,
    color: "#f4f4f5",
    fontSize: 12,
  },
  costInputActive: {
    borderColor: "rgba(234, 88, 12, 0.4)",
    backgroundColor: "rgba(234, 88, 12, 0.05)",
  },
  currencyLabel: {
    fontSize: 11,
    color: "#71717a",
  },
  emptyCardMini: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyMiniText: {
    color: "#71717a",
    fontSize: 12,
  },
});
