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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { supabase } from "../../../lib/supabaseClient";
import { useProfile } from "../../../components/ProfileProvider";
import { useAppTheme } from "../../../components/ThemeProvider";
import AddressPickerMap from "../../../components/AddressPickerMap";
import { Feather, Ionicons } from "@expo/vector-icons";

interface DeliveryAddress {
  id: string;
  user_id: string;
  title: string;
  area: string;
  nearby_landmark: string;
  phone_number: string;
  latitude: string | null;
  longitude: string | null;
  formatted_address: string | null;
  created_at: string;
}

const IRAQI_PHONE_REGEX = /^07[3-9]\d{8}$/;
const ADDRESS_TITLES = ["المنزل", "العمل", "الجامعة", "أخرى"];

import { useTranslation } from "react-i18next";

export default function ProfileScreen() {
  const router = useRouter();
  const { fullName: ctxName, avatarUrl: ctxAvatar, refreshProfile } = useProfile();
  const { t, i18n } = useTranslation();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const { theme: currentTheme, setTheme: handleThemeToggle, themeColors } = useAppTheme();
  const currentLanguage = i18n.language || "ar";

  const handleLanguageChange = async (lang: "ar" | "en") => {
    await i18n.changeLanguage(lang);
    try {
      await AsyncStorage.setItem("language", lang);
    } catch (err) {
      console.log("Error saving language preference:", err);
    }
  };

  // Address states
  const [addresses, setAddresses] = useState<DeliveryAddress[]>([]);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [newTitle, setNewTitle] = useState("المنزل");
  const [newArea, setNewArea] = useState("");
  const [newLandmark, setNewLandmark] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLat, setNewLat] = useState<string | null>(null);
  const [newLng, setNewLng] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState("");
  const [showMap, setShowMap] = useState(false);

  // Feedbacks
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

  const loadProfile = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setEmail(user.email || "");

      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (data) {
        setFullName(data.full_name || "");
        setAvatarUrl(data.avatar_url || null);
      }

      // Fetch delivery addresses
      const { data: addrData } = await supabase
        .from("delivery_addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (addrData) setAddresses(addrData as DeliveryAddress[]);
    } catch (err) {
      console.error("Profile load exception:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  // Sync from context when it changes
  useEffect(() => {
    if (ctxName && !fullName) setFullName(ctxName);
    if (ctxAvatar && !avatarUrl) setAvatarUrl(ctxAvatar);
  }, [ctxName, ctxAvatar]);

  const handleAvatarPicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      setUploading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        triggerToast("يرجى تسجيل الدخول أولاً", "error");
        setUploading(false);
        return;
      }

      const filePath = `${user.id}/avatar.png`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, blob, { upsert: true, contentType: asset.mimeType });

      if (uploadError) {
        triggerToast(`فشل رفع الصورة: ${uploadError.message}`, "error");
        setUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { data: avatarResult, error: updateError } = await supabase
        .from("profiles")
        .upsert({ id: user.id, avatar_url: publicUrl }, { onConflict: "id" })
        .select("avatar_url")
        .maybeSingle();

      if (updateError) {
        triggerToast(`فشل تحديث الصورة: ${updateError.message}`, "error");
        setUploading(false);
        return;
      }

      const savedUrl = avatarResult?.avatar_url || publicUrl;
      setAvatarUrl(savedUrl);
      await refreshProfile();
      triggerToast("تم تحديث الصورة الشخصية بنجاح ✓");
    } catch (err) {
      console.error(err);
      triggerToast("فشل رفع الصورة الشخصية", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      triggerToast("يرجى إدخال الاسم الكامل", "error");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        triggerToast("يرجى تسجيل الدخول أولاً", "error");
        setSaving(false);
        return;
      }

      const trimmedName = fullName.trim();

      const { data, error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, full_name: trimmedName }, { onConflict: "id" })
        .select("full_name")
        .maybeSingle();

      if (error) {
        triggerToast(`فشل حفظ البيانات: ${error.message}`, "error");
        setSaving(false);
        return;
      }

      const savedName = data?.full_name || trimmedName;
      setFullName(savedName);
      await refreshProfile();
      triggerToast("تم تحديث البيانات بنجاح ✓");
    } catch (err) {
      console.error(err);
      triggerToast("فشل تحديث ملف الحساب", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAddress = async () => {
    if (!newArea.trim() || !newPhone.trim()) {
      triggerToast("يرجى ملء المنطقة ورقم الهاتف", "error");
      return;
    }

    if (!IRAQI_PHONE_REGEX.test(newPhone.trim())) {
      setPhoneError(t("invalid_phone_error"));
      return;
    } else {
      setPhoneError("");
    }

    setSavingAddress(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        user_id: user.id,
        title: newTitle,
        area: newArea.trim(),
        nearby_landmark: newLandmark.trim(),
        phone_number: newPhone.trim(),
        latitude: newLat || null,
        longitude: newLng || null,
        formatted_address: `${newArea.trim()}, ${newLandmark.trim()}`,
      };

      const { data, error } = await supabase
        .from("delivery_addresses")
        .insert(payload)
        .select()
        .single();

      if (data && !error) {
        setAddresses((prev) => [data, ...prev]);
        setShowAddressForm(false);
        setNewArea("");
        setNewLandmark("");
        setNewPhone("");
        setNewLat(null);
        setNewLng(null);
        triggerToast(t("address_saved_success"));
      } else {
        triggerToast(t("address_saved_failed"), "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      await supabase.from("delivery_addresses").delete().eq("id", id);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
      triggerToast(t("address_deleted_success"));
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" style={{ backgroundColor: themeColors.background }}>
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
          <Text style={[styles.title, { color: themeColors.text }]}>{t("profile")}</Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>{t("profile_desc")}</Text>
        </View>

        {/* Avatar Section */}
        <View style={[styles.glassCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          <View style={styles.avatarContainer}>
            <TouchableOpacity onPress={handleAvatarPicker} disabled={uploading} style={styles.avatarWrapper}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Feather name="user" size={44} color="#ea580c" />
              )}
              <View style={styles.cameraOverlay}>
                {uploading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Feather name="camera" size={16} color="#ffffff" />
                )}
              </View>
            </TouchableOpacity>

            <Text style={[styles.userName, { color: themeColors.text }]}>{fullName || t("new_user")}</Text>
            <Text style={[styles.userEmail, { color: themeColors.textMuted }]}>{email}</Text>
            <Text style={[styles.avatarTip, { color: themeColors.textMuted }]}>{t("click_to_change")}</Text>
          </View>
        </View>

        {/* Personal Details Form */}
        <View style={[styles.glassCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          <View style={styles.cardHeader}>
            <Feather name="user" size={16} color="#ea580c" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t("personal_information")}</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: themeColors.text }]}>{t("full_name")}</Text>
            <View style={[styles.inputWrapper, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]}>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder={t("enter_full_name")}
                placeholderTextColor={themeColors.textMuted}
                style={[styles.textInput, { color: themeColors.text }]}
                textAlign="right"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: themeColors.text }]}>{t("email")}</Text>
            <View style={[styles.inputWrapper, styles.inputWrapperDisabled, { backgroundColor: themeColors.disabledBg, borderColor: themeColors.cardBorder }]}>
              <TextInput
                value={email}
                editable={false}
                style={[styles.textInput, styles.textInputDisabled, { color: themeColors.textMuted }]}
                textAlign="right"
              />
            </View>
            <Text style={[styles.readOnlyText, { color: themeColors.textMuted }]}>{t("email_readonly_note")}</Text>
          </View>

          <TouchableOpacity onPress={handleSaveProfile} disabled={saving} style={styles.primaryButton}>
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>{t("save_changes")}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Delivery Addresses Section */}
        <View style={[styles.glassCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          <View style={styles.addressesHeader}>
            <TouchableOpacity onPress={() => setShowAddressForm(!showAddressForm)} style={styles.addAddressBtn}>
              <Feather name="plus" size={12} color="#ea580c" style={styles.buttonIcon} />
              <Text style={styles.addAddressText}>{t("add_address")}</Text>
            </TouchableOpacity>
            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t("saved_addresses")}</Text>
              <Feather name="map-pin" size={16} color="#ea580c" />
            </View>
          </View>

          {showAddressForm && (
            <View style={styles.addressForm}>
              <Text style={[styles.inputLabel, { color: themeColors.text }]}>{t("label_address")}</Text>
              <View style={styles.titlesTabsRow}>
                {ADDRESS_TITLES.map((tVal) => (
                  <TouchableOpacity
                    key={tVal}
                    onPress={() => setNewTitle(tVal)}
                    style={[styles.titleTab, newTitle === tVal && styles.titleTabActive]}
                  >
                    <Text style={[styles.titleTabText, newTitle === tVal && styles.titleTabTextActive]}>
                      {tVal === "المنزل"
                        ? t("home")
                        : tVal === "العمل"
                          ? t("work")
                          : tVal === "الجامعة"
                            ? t("university")
                            : t("other")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Map coordinates picker */}
              <TouchableOpacity onPress={() => setShowMap(!showMap)} style={styles.mapToggleButton}>
                <Feather name="map" size={14} color="#ea580c" style={styles.buttonIcon} />
                <Text style={styles.mapToggleButtonText}>
                  {newLat ? "تغيير إحداثيات الخريطة (تم التحديد)" : "تحديد الموقع الجغرافي من الخريطة"}
                </Text>
              </TouchableOpacity>

              {showMap && (
                <View style={styles.mapSection}>
                  <AddressPickerMap
                    onLocationSelect={(data) => {
                      setNewLat(String(data.lat));
                      setNewLng(String(data.lng));
                      setNewArea(data.area || newArea);
                      setNewLandmark(data.formattedAddress || newLandmark);
                      setShowMap(false);
                    }}
                  />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>{t("area_neighborhood")}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]}>
                  <TextInput
                    value={newArea}
                    onChangeText={setNewArea}
                    placeholder={t("area_placeholder")}
                    placeholderTextColor={themeColors.textMuted}
                    style={[styles.textInput, { color: themeColors.text }]}
                    textAlign="right"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>{t("nearest_landmark")}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]}>
                  <TextInput
                    value={newLandmark}
                    onChangeText={setNewLandmark}
                    placeholder={t("landmark_placeholder")}
                    placeholderTextColor={themeColors.textMuted}
                    style={[styles.textInput, { color: themeColors.text }]}
                    textAlign="right"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>{t("phone_number")}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }, phoneError && styles.inputWrapperError]}>
                  <TextInput
                    value={newPhone}
                    onChangeText={(val) => {
                      setNewPhone(val);
                      if (val.length >= 11 && !IRAQI_PHONE_REGEX.test(val)) {
                        setPhoneError(t("invalid_phone_error"));
                      } else {
                        setPhoneError("");
                      }
                    }}
                    placeholder="07XXXXXXXXX"
                    placeholderTextColor={themeColors.textMuted}
                    keyboardType="phone-pad"
                    style={[styles.textInput, { color: themeColors.text }]}
                    textAlign="right"
                    maxLength={11}
                  />
                </View>
                {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
                <Text style={[styles.readOnlyText, { color: themeColors.textMuted }]}>{t("phone_format_hint")}</Text>
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity
                  onPress={handleCreateAddress}
                  disabled={savingAddress}
                  style={styles.primaryButtonCompact}
                >
                  {savingAddress ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.buttonTextCompact}>{t("save_address")}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setShowAddressForm(false);
                    setPhoneError("");
                  }}
                  style={styles.secondaryButtonCompact}
                >
                  <Text style={styles.secondaryButtonTextCompact}>{t("cancel")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Saved Addresses list cards */}
          {addresses.length > 0 ? (
            <View style={styles.addressesList}>
              {addresses.map((addr) => (
                <View key={addr.id} style={[styles.addressCard, { backgroundColor: themeColors.inputBg, borderColor: themeColors.cardBorder }]}>
                  <TouchableOpacity onPress={() => handleDeleteAddress(addr.id)} style={styles.trashBtn}>
                    <Feather name="trash-2" size={14} color="#ef4444" />
                  </TouchableOpacity>

                  <View style={styles.addressInfo}>
                    <Text style={[styles.addressTitle, { color: themeColors.text }]}>
                      {addr.title === "المنزل"
                        ? t("home")
                        : addr.title === "العمل"
                          ? t("work")
                          : addr.title === "الجامعة"
                            ? t("university")
                            : t("other")}
                    </Text>
                    <Text style={[styles.addressDetailText, { color: themeColors.textMuted }]}>
                      {addr.area} — {addr.nearby_landmark}
                    </Text>
                    <Text style={[styles.addressPhoneText, { color: themeColors.textMuted }]}>
                      <Feather name="phone" size={10} color={themeColors.textMuted} /> {addr.phone_number}
                    </Text>
                  </View>

                  <View style={styles.homeIconWrapper}>
                    <Feather name="home" size={16} color="#ea580c" />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            !showAddressForm && (
              <View style={styles.emptyAddresses}>
                <Feather name="map-pin" size={32} color="#71717a" style={styles.emptyPinIcon} />
                <Text style={[styles.emptyTitleText, { color: themeColors.text }]}>{t("no_saved_addresses")}</Text>
                <Text style={[styles.emptyDescText, { color: themeColors.textMuted }]}>{t("add_address_hint")}</Text>
              </View>
            )
          )}
        </View>

        {/* System Preferences Form */}
        <View style={[styles.glassCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          <View style={styles.cardHeader}>
            <Feather name="globe" size={16} color="#ea580c" />
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t("system_preferences")}</Text>
          </View>

          <View style={styles.preferenceRow}>
            <View style={styles.langToggles}>
              <TouchableOpacity
                onPress={() => handleLanguageChange("ar")}
                style={[styles.langBtn, currentLanguage === "ar" && styles.langBtnActive]}
              >
                <Text style={[styles.langBtnText, currentLanguage === "ar" && styles.langBtnTextActive]}>العربية</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleLanguageChange("en")}
                style={[styles.langBtn, currentLanguage === "en" && styles.langBtnActive]}
              >
                <Text style={[styles.langBtnText, currentLanguage === "en" && styles.langBtnTextActive]}>English</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.prefLabels}>
              <Text style={[styles.prefTitle, { color: themeColors.text }]}>{t("language")}</Text>
              <Text style={[styles.prefDesc, { color: themeColors.textMuted }]}>{t("language_desc")}</Text>
            </View>
          </View>

          <View style={[styles.preferenceRow, styles.prefRowBorder, { borderTopColor: themeColors.cardBorder }]}>
            <View style={styles.themeToggles}>
              <TouchableOpacity
                onPress={() => handleThemeToggle("light")}
                style={[styles.themeBtn, currentTheme === "light" && styles.themeBtnActive]}
              >
                <Feather name="sun" size={14} color={currentTheme === "light" ? "#ea580c" : "#71717a"} style={styles.themeIcon} />
                <Text style={[styles.themeBtnText, currentTheme === "light" && styles.themeBtnTextActive]}>{t("light")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleThemeToggle("dark")}
                style={[styles.themeBtn, currentTheme === "dark" && styles.themeBtnActive]}
              >
                <Feather name="moon" size={14} color={currentTheme === "dark" ? "#ea580c" : "#71717a"} style={styles.themeIcon} />
                <Text style={[styles.themeBtnText, currentTheme === "dark" && styles.themeBtnTextActive]}>{t("dark")}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.prefLabels}>
              <Text style={[styles.prefTitle, { color: themeColors.text }]}>{t("theme")}</Text>
              <Text style={[styles.prefDesc, { color: themeColors.textMuted }]}>{t("theme_desc")}</Text>
            </View>
          </View>

          {/* Privacy & Security Link */}
          <View style={[styles.preferenceRow, styles.prefRowBorder, { borderTopColor: themeColors.cardBorder }]}>
            <TouchableOpacity
              onPress={() => router.push("/dashboard/privacy" as any)}
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: 6,
                backgroundColor: "rgba(234, 88, 12, 0.08)",
                borderColor: "rgba(234, 88, 12, 0.15)",
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Feather name="shield" size={14} color="#ea580c" />
              <Text style={{ fontSize: 10, color: "#ea580c", fontWeight: "bold" }}>عرض المركز</Text>
            </TouchableOpacity>
            <View style={styles.prefLabels}>
              <Text style={[styles.prefTitle, { color: themeColors.text }]}>الخصوصية والأمان</Text>
              <Text style={[styles.prefDesc, { color: themeColors.textMuted }]}>إدارة سياسة الخصوصية وتراخيص الجهاز وتصدير وحذف الحساب</Text>
            </View>
          </View>
        </View>
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
    color: "#f4f4f5",
    fontSize: 13,
    textAlign: "center",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: "flex-end",
    marginBottom: 24,
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
  glassCard: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  avatarContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },
  avatarWrapper: {
    position: "relative",
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(234, 88, 12, 0.1)",
    borderColor: "rgba(234, 88, 12, 0.2)",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  cameraOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  userName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginTop: 12,
  },
  userEmail: {
    fontSize: 12,
    color: "#71717a",
    marginTop: 2,
  },
  avatarTip: {
    fontSize: 11,
    color: "#71717a",
    marginTop: 12,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#f4f4f5",
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
  inputWrapperDisabled: {
    opacity: 0.5,
  },
  inputWrapperError: {
    borderColor: "#ef4444",
  },
  textInput: {
    flex: 1,
    color: "#f4f4f5",
    fontSize: 14,
  },
  textInputDisabled: {
    color: "#71717a",
  },
  readOnlyText: {
    fontSize: 10,
    color: "#71717a",
    marginTop: 4,
    textAlign: "right",
  },
  primaryButton: {
    height: 44,
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
  addressesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  addAddressBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  addAddressText: {
    color: "#ea580c",
    fontSize: 12,
    fontWeight: "bold",
  },
  buttonIcon: {
    marginLeft: 4,
  },
  titleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  addressForm: {
    backgroundColor: "#09090b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  titlesTabsRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginBottom: 16,
  },
  titleTab: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleTabActive: {
    borderColor: "rgba(234, 88, 12, 0.4)",
    backgroundColor: "rgba(234, 88, 12, 0.1)",
  },
  titleTabText: {
    color: "#71717a",
    fontSize: 11,
    fontWeight: "bold",
  },
  titleTabTextActive: {
    color: "#ea580c",
  },
  mapToggleButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    height: 38,
    backgroundColor: "rgba(234, 88, 12, 0.08)",
    borderColor: "rgba(234, 88, 12, 0.15)",
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 16,
    gap: 6,
  },
  mapToggleButtonText: {
    color: "#ea580c",
    fontSize: 11,
    fontWeight: "bold",
  },
  mapSection: {
    height: 180,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 10,
    marginTop: 4,
    textAlign: "right",
  },
  formActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  primaryButtonCompact: {
    flex: 1,
    height: 38,
    backgroundColor: "#ea580c",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonTextCompact: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "bold",
  },
  secondaryButtonCompact: {
    flex: 1,
    height: 38,
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonTextCompact: {
    color: "#f4f4f5",
    fontSize: 12,
    fontWeight: "bold",
  },
  addressesList: {
    gap: 12,
  },
  addressCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#09090b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 14,
  },
  homeIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(234, 88, 12, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  addressInfo: {
    flex: 1,
    marginRight: 12,
    alignItems: "flex-end",
  },
  addressTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  addressDetailText: {
    fontSize: 11,
    color: "#a1a1aa",
    marginTop: 2,
  },
  addressPhoneText: {
    fontSize: 10,
    color: "#71717a",
    marginTop: 4,
  },
  trashBtn: {
    padding: 8,
  },
  emptyAddresses: {
    alignItems: "center",
    paddingVertical: 20,
  },
  emptyPinIcon: {
    marginBottom: 8,
  },
  emptyTitleText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  emptyDescText: {
    fontSize: 11,
    color: "#71717a",
    marginTop: 4,
    textAlign: "center",
  },
  preferenceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  prefRowBorder: {
    borderTopWidth: 1,
    borderTopColor: "rgba(39, 39, 42, 0.5)",
    paddingTop: 16,
    marginTop: 8,
  },
  prefLabels: {
    alignItems: "flex-end",
    flex: 1,
  },
  prefTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  prefDesc: {
    fontSize: 10,
    color: "#71717a",
    marginTop: 2,
  },
  langToggles: {
    flexDirection: "row-reverse",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  langBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#09090b",
  },
  langBtnActive: {
    backgroundColor: "rgba(234, 88, 12, 0.1)",
  },
  langBtnText: {
    fontSize: 11,
    color: "#71717a",
    fontWeight: "bold",
  },
  langBtnTextActive: {
    color: "#ea580c",
  },
  themeToggles: {
    flexDirection: "row-reverse",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  themeBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#09090b",
    gap: 4,
  },
  themeBtnActive: {
    backgroundColor: "rgba(234, 88, 12, 0.1)",
  },
  themeIcon: {
    marginLeft: 2,
  },
  themeBtnText: {
    fontSize: 10,
    color: "#71717a",
    fontWeight: "bold",
  },
  themeBtnTextActive: {
    color: "#ea580c",
  },
});
