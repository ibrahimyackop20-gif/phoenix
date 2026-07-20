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
  Alert,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { pickDocumentWithPermission } from "../../../lib/filePermissions";
import { launchCameraWithPermission } from "../../../lib/cameraPermissions";
import { supabase } from "../../../lib/supabaseClient";
import { useProfile } from "../../../components/ProfileProvider";
import { useAppTheme, type ThemeColors } from "../../../components/ThemeProvider";
import LocationPickerModal from "../../../components/LocationPickerModal";
import { Feather, Ionicons } from "@expo/vector-icons";
import { ScreenTransition } from "../../components/anim/ScreenTransition";

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
  const { width, fontScale } = useWindowDimensions();
  const isCompact = width < 390 || fontScale >= 1.3;
  const isTablet = width >= 700;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const { themePreference: currentTheme, setTheme: handleThemeToggle, themeColors } = useAppTheme();
  const styles = getStyles(themeColors, isCompact, isTablet, i18n.language === "en");
  const currentLanguage = i18n.language || "ar";

  const handleLanguageChange = async (lang: "ar" | "en") => {
    await i18n.changeLanguage(lang);
    try {
      await AsyncStorage.setItem("language", lang);
    } catch (err) {
      console.error("Error saving language preference:", err);
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

  const handleAvatarPicker = () => {
    Alert.alert(t("profile_toast_avatar_title"), t("profile_toast_avatar_pick"), [
      {
        text: t("profile_toast_take_photo"),
        onPress: () => {
          void pickAvatarAsset("camera");
        },
      },
      {
        text: t("profile_toast_pick_gallery"),
        onPress: () => {
          void pickAvatarAsset("gallery");
        },
      },
      { text: t("cancel"), style: "cancel" },
    ]);
  };

  const pickAvatarAsset = async (source: "camera" | "gallery") => {
    try {
      let uri: string | null = null;
      let mimeType: string | undefined = "image/jpeg";

      if (source === "camera") {
        const result = await launchCameraWithPermission({
          mediaTypes: ["images"],
          quality: 0.85,
          allowsEditing: true,
          aspect: [1, 1],
        });
        if (result.canceled || !result.assets || result.assets.length === 0) return;
        uri = result.assets[0].uri;
        mimeType = result.assets[0].mimeType || "image/jpeg";
      } else {
        const result = await pickDocumentWithPermission({
          type: "image/*",
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets || result.assets.length === 0) return;
        uri = result.assets[0].uri;
        mimeType = result.assets[0].mimeType || "image/jpeg";
      }

      if (!uri) return;
      setUploading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        triggerToast(t("profile_toast_login_required"), "error");
        setUploading(false);
        return;
      }

      const filePath = `${user.id}/avatar.png`;

      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, arrayBuffer, { upsert: true, contentType: mimeType });

      if (uploadError) {
        triggerToast(t("profile_toast_avatar_upload_fail", { message: uploadError.message }), "error");
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
        triggerToast(t("profile_toast_avatar_update_fail", { message: updateError.message }), "error");
        setUploading(false);
        return;
      }

      const savedUrl = avatarResult?.avatar_url || publicUrl;
      setAvatarUrl(savedUrl);
      await refreshProfile();
      triggerToast(t("profile_toast_avatar_ok"));
    } catch (err) {
      console.error(err);
      triggerToast(t("profile_toast_avatar_fail"), "error");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      triggerToast(t("profile_toast_name_required"), "error");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        triggerToast(t("profile_toast_login_required"), "error");
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
        triggerToast(t("profile_toast_save_fail", { message: error.message }), "error");
        setSaving(false);
        return;
      }

      const savedName = data?.full_name || trimmedName;
      setFullName(savedName);
      await refreshProfile();
      triggerToast(t("profile_toast_save_ok"));
    } catch (err) {
      console.error(err);
      triggerToast(t("profile_toast_profile_fail"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAddress = async () => {
    if (!newArea.trim() || !newPhone.trim()) {
      triggerToast(t("profile_toast_address_fields"), "error");
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF5A1F" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenTransition style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
                <Feather name="user" size={48} color="#FF5A1F" />
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
            <Feather name="user" size={20} color="#FF5A1F" />
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
                textAlign={currentLanguage === "en" ? "left" : "right"}
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
              <Feather name="plus" size={16} color="#FF5A1F" style={styles.buttonIcon} />
              <Text style={styles.addAddressText}>{t("add_address")}</Text>
            </TouchableOpacity>
            <View style={styles.titleRow}>
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t("saved_addresses")}</Text>
              <Feather name="map-pin" size={20} color="#FF5A1F" />
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

              {/* Full-screen location picker */}
              <TouchableOpacity onPress={() => setShowMap(true)} style={styles.mapToggleButton}>
                <Feather name="map" size={18} color="#FF5A1F" style={styles.buttonIcon} />
                <Text style={styles.mapToggleButtonText}>
                  {newLat ? t("profile_toast_change_location") : t("profile_toast_pick_location")}
                </Text>
              </TouchableOpacity>
              {newLat && (newLandmark || newArea) ? (
                <Text style={[styles.selectedLocationHint, { color: themeColors.textMuted }]}>
                  {newLandmark || newArea}
                </Text>
              ) : null}

              <LocationPickerModal
                visible={showMap}
                onClose={() => setShowMap(false)}
                initialLat={newLat ? parseFloat(newLat) : undefined}
                initialLng={newLng ? parseFloat(newLng) : undefined}
                onConfirm={(data) => {
                  setNewLat(String(data.lat));
                  setNewLng(String(data.lng));
                  setNewArea(data.area || newArea);
                  setNewLandmark(data.formattedAddress || newLandmark);
                }}
              />

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>{t("area_neighborhood")}</Text>
                <View style={[styles.inputWrapper, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]}>
                  <TextInput
                    value={newArea}
                    onChangeText={setNewArea}
                    placeholder={t("area_placeholder")}
                    placeholderTextColor={themeColors.textMuted}
                    style={[styles.textInput, { color: themeColors.text }]}
                    textAlign={currentLanguage === "en" ? "left" : "right"}
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
                    textAlign={currentLanguage === "en" ? "left" : "right"}
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
                    textAlign={currentLanguage === "en" ? "left" : "right"}
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
                    <Feather name="trash-2" size={18} color="#EF4444" />
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
                    <Feather name="home" size={20} color="#FF5A1F" />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            !showAddressForm && (
              <View style={styles.emptyAddresses}>
                <Feather name="map-pin" size={32} color={themeColors.textFaint} style={styles.emptyPinIcon} />
                <Text style={[styles.emptyTitleText, { color: themeColors.text }]}>{t("no_saved_addresses")}</Text>
                <Text style={[styles.emptyDescText, { color: themeColors.textMuted }]}>{t("add_address_hint")}</Text>
              </View>
            )
          )}
        </View>

        {/* System Preferences Form */}
        <View style={[styles.glassCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          <View style={styles.cardHeader}>
            <Feather name="globe" size={20} color={themeColors.accent} />
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
                <Feather name="sun" size={14} color={currentTheme === "light" ? themeColors.accent : themeColors.textFaint} style={styles.themeIcon} />
                <Text style={[styles.themeBtnText, currentTheme === "light" && styles.themeBtnTextActive]}>{t("light")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleThemeToggle("dark")}
                style={[styles.themeBtn, currentTheme === "dark" && styles.themeBtnActive]}
              >
                <Feather name="moon" size={14} color={currentTheme === "dark" ? themeColors.accent : themeColors.textFaint} style={styles.themeIcon} />
                <Text style={[styles.themeBtnText, currentTheme === "dark" && styles.themeBtnTextActive]}>{t("dark")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleThemeToggle("system")}
                style={[styles.themeBtn, currentTheme === "system" && styles.themeBtnActive]}
              >
                <Feather name="smartphone" size={14} color={currentTheme === "system" ? themeColors.accent : themeColors.textFaint} style={styles.themeIcon} />
                <Text style={[styles.themeBtnText, currentTheme === "system" && styles.themeBtnTextActive]}>{t("system")}</Text>
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
                flexDirection: currentLanguage === "en" ? "row" : "row-reverse",
                alignItems: "center",
                gap: 6,
                backgroundColor: "rgba(234, 88, 12, 0.08)",
                borderColor: "rgba(234, 88, 12, 0.15)",
                borderWidth: 1,
                borderRadius: 14,
                minHeight: 44,
                paddingHorizontal: 16,
                paddingVertical: 10,
                justifyContent: "center",
              }}
            >
              <Feather name="shield" size={18} color="#FF5A1F" />
              <Text
                style={{
                  fontSize: currentLanguage === "en" ? 12 : 13,
                  lineHeight: 19,
                  color: "#FF5A1F",
                  fontWeight: "800",
                  flexShrink: 1,
                  textAlign: currentLanguage === "en" ? "left" : "right",
                }}
              >
                {t("privacy_profile_link_cta")}
              </Text>
            </TouchableOpacity>
            <View style={styles.prefLabels}>
              <Text style={[styles.prefTitle, { color: themeColors.text }]}>{t("privacy_profile_link_title")}</Text>
              <Text style={[styles.prefDesc, { color: themeColors.textMuted }]}>{t("privacy_profile_link_desc")}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
      </ScreenTransition>
    </SafeAreaView>
  );
}

const getStyles = (themeColors: ThemeColors, isCompact: boolean, isTablet: boolean, isEnglish: boolean) =>
  StyleSheet.create({
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
    backgroundColor: "rgba(16,185,129,0.12)",
    borderColor: "rgba(16,185,129,0.28)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  toastError: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderColor: "rgba(239,68,68,0.28)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  toastText: {
    color: themeColors.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
    flexShrink: 1,
  },
  scrollContent: {
    padding: isCompact ? 16 : 24,
    paddingBottom: 48,
    width: "100%",
    maxWidth: isTablet ? 960 : undefined,
    alignSelf: "center",
  },
  header: {
    alignItems: isEnglish ? "flex-start" : "flex-end",
    marginTop: 4,
    marginBottom: 28,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: -0.4,
    color: themeColors.text,
    textAlign: isEnglish ? "left" : "right",
    flexShrink: 1,
  },
  subtitle: {
    fontSize: isEnglish ? 13 : 14,
    lineHeight: 22,
    fontWeight: "500",
    color: themeColors.textMuted,
    marginTop: 6,
    textAlign: isEnglish ? "left" : "right",
    flexShrink: 1,
  },
  glassCard: {
    backgroundColor: themeColors.cardBg,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: isCompact ? 18 : 22,
    marginBottom: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 3,
  },
  avatarContainer: {
    alignItems: "center",
    paddingVertical: 16,
  },
  avatarWrapper: {
    position: "relative",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,90,31,0.12)",
    borderColor: "rgba(255,90,31,0.36)",
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#FF5A1F",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  cameraOverlay: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FF5A1F",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  userName: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "800",
    color: themeColors.text,
    marginTop: 16,
    textAlign: "center",
    flexShrink: 1,
  },
  userEmail: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "500",
    color: themeColors.textMuted,
    marginTop: 4,
    textAlign: "center",
    flexShrink: 1,
  },
  avatarTip: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
    color: themeColors.textMuted,
    marginTop: 10,
    textAlign: "center",
    flexShrink: 1,
  },
  cardHeader: {
    flexDirection: isEnglish ? "row" : "row-reverse",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    flexWrap: isEnglish ? "wrap" : "nowrap",
  },
  cardTitle: {
    fontSize: isEnglish ? 16 : 17,
    lineHeight: 24,
    fontWeight: "800",
    color: themeColors.text,
    textAlign: isEnglish ? "left" : "right",
    flexShrink: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
    color: themeColors.text,
    marginBottom: 8,
    textAlign: isEnglish ? "left" : "right",
    flexShrink: 1,
  },
  inputWrapper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: themeColors.inputBg,
    borderColor: themeColors.inputBorder,
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputWrapperDisabled: {
    opacity: 0.7,
  },
  inputWrapperError: {
    borderColor: "#ef4444",
  },
  textInput: {
    flex: 1,
    color: themeColors.text,
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 0,
  },
  textInputDisabled: {
    color: themeColors.textMuted,
  },
  readOnlyText: {
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "500",
    color: themeColors.textMuted,
    marginTop: 4,
    textAlign: isEnglish ? "left" : "right",
    flexShrink: 1,
  },
  primaryButton: {
    minHeight: 56,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: "#FF5A1F",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    shadowColor: "#FF5A1F",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.26,
    shadowRadius: 14,
    elevation: 6,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "800",
    textAlign: "center",
    flexShrink: 1,
  },
  addressesHeader: {
    flexDirection: isCompact ? "column-reverse" : "row",
    justifyContent: "space-between",
    alignItems: isCompact ? "flex-end" : "center",
    gap: 12,
    marginBottom: 16,
    flexWrap: isEnglish ? "wrap" : "nowrap",
  },
  addAddressBtn: {
    flexDirection: isEnglish ? "row" : "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,90,31,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,90,31,0.2)",
  },
  addAddressText: {
    color: "#FF5A1F",
    fontSize: isEnglish ? 12 : 13,
    lineHeight: 19,
    fontWeight: "800",
    textAlign: "center",
    flexShrink: 1,
  },
  buttonIcon: {
    marginLeft: 4,
  },
  titleRow: {
    flexDirection: isEnglish ? "row" : "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  addressForm: {
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  titlesTabsRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  titleTab: {
    flexGrow: 1,
    flexBasis: isCompact ? "46%" : 0,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: themeColors.cardBg,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleTabActive: {
    borderColor: "#FF5A1F",
    backgroundColor: "rgba(255,90,31,0.12)",
  },
  titleTabText: {
    color: themeColors.textMuted,
    fontSize: isEnglish ? 12 : 13,
    lineHeight: 19,
    fontWeight: "600",
    textAlign: "center",
    flexShrink: 1,
  },
  titleTabTextActive: {
    color: "#FF5A1F",
  },
  mapToggleButton: {
    flexDirection: isEnglish ? "row" : "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,90,31,0.1)",
    borderColor: "rgba(255,90,31,0.22)",
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 16,
    gap: 8,
  },
  mapToggleButtonText: {
    color: "#FF5A1F",
    fontSize: isEnglish ? 13 : 14,
    lineHeight: 21,
    fontWeight: "800",
    textAlign: "center",
    flexShrink: 1,
  },
  selectedLocationHint: {
    fontSize: 12,
    fontWeight: "500",
    textAlign: isEnglish ? "left" : "right",
    marginTop: -10,
    marginBottom: 12,
    lineHeight: 18,
  },
  mapSection: {
    height: 180,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    textAlign: isEnglish ? "left" : "right",
    flexShrink: 1,
  },
  formActions: {
    flexDirection: isCompact ? "column" : "row",
    gap: 12,
    marginTop: 12,
  },
  primaryButtonCompact: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: isCompact ? "100%" : undefined,
    backgroundColor: "#FF5A1F",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonTextCompact: {
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 1,
  },
  secondaryButtonCompact: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: isCompact ? "100%" : undefined,
    backgroundColor: themeColors.cardBg,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonTextCompact: {
    color: themeColors.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 1,
  },
  addressesList: {
    gap: 14,
  },
  addressCard: {
    flexDirection: isCompact ? "column-reverse" : "row-reverse",
    alignItems: isCompact ? "flex-end" : "center",
    gap: isCompact ? 12 : 0,
    minHeight: 96,
    padding: 16,
    backgroundColor: themeColors.background,
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 18,
  },
  homeIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,90,31,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  addressInfo: {
    flex: 1,
    marginRight: isCompact || isEnglish ? 0 : 16,
    marginLeft: isCompact || !isEnglish ? 0 : 16,
    alignItems: isEnglish ? "flex-start" : "flex-end",
  },
  addressTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
    color: themeColors.text,
    textAlign: isEnglish ? "left" : "right",
    flexShrink: 1,
  },
  addressDetailText: {
    fontSize: 13,
    lineHeight: 20,
    color: themeColors.textMuted,
    fontWeight: "500",
    marginTop: 4,
    textAlign: isEnglish ? "left" : "right",
    flexShrink: 1,
  },
  addressPhoneText: {
    fontSize: 12,
    lineHeight: 18,
    color: themeColors.textMuted,
    fontWeight: "500",
    marginTop: 6,
    textAlign: isEnglish ? "left" : "right",
    flexShrink: 1,
  },
  trashBtn: {
    width: 44,
    minHeight: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  emptyAddresses: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyPinIcon: {
    marginBottom: 8,
  },
  emptyTitleText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
    color: themeColors.text,
    textAlign: "center",
    flexShrink: 1,
  },
  emptyDescText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
    color: themeColors.textMuted,
    marginTop: 6,
    textAlign: "center",
    flexShrink: 1,
  },
  preferenceRow: {
    flexDirection: isCompact ? "column-reverse" : "row",
    justifyContent: "space-between",
    alignItems: isCompact ? "stretch" : "center",
    gap: isCompact ? 14 : 20,
    paddingVertical: 14,
  },
  prefRowBorder: {
    borderTopWidth: 1,
    borderTopColor: themeColors.cardBorder,
    paddingTop: 16,
    marginTop: 4,
  },
  prefLabels: {
    alignItems: isEnglish ? "flex-start" : "flex-end",
    flex: 1,
  },
  prefTitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
    color: themeColors.text,
    textAlign: isEnglish ? "left" : "right",
    flexShrink: 1,
  },
  prefDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: themeColors.textMuted,
    fontWeight: "500",
    marginTop: 4,
    textAlign: isEnglish ? "left" : "right",
    flexShrink: 1,
  },
  langToggles: {
    flexDirection: isEnglish ? "row" : "row-reverse",
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    alignSelf: isCompact ? "stretch" : "auto",
    backgroundColor: themeColors.background,
    padding: 4,
    gap: 4,
  },
  langBtn: {
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flex: isCompact ? 1 : 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  langBtnActive: {
    backgroundColor: themeColors.accentSoftBg,
  },
  langBtnText: {
    fontSize: 13,
    lineHeight: 19,
    color: themeColors.textMuted,
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 1,
  },
  langBtnTextActive: {
    color: themeColors.accent,
  },
  themeToggles: {
    flexDirection: isEnglish ? "row" : "row-reverse",
    borderColor: themeColors.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    alignSelf: isCompact ? "stretch" : "auto",
    backgroundColor: themeColors.background,
    padding: 4,
    gap: 4,
  },
  themeBtn: {
    flexDirection: isEnglish ? "row" : "row-reverse",
    alignItems: "center",
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    flex: isCompact ? 1 : 0,
    justifyContent: "center",
    borderRadius: 12,
  },
  themeBtnActive: {
    backgroundColor: themeColors.accentSoftBg,
  },
  themeIcon: {
    marginLeft: 2,
  },
  themeBtnText: {
    fontSize: 13,
    lineHeight: 19,
    color: themeColors.textMuted,
    fontWeight: "700",
    textAlign: "center",
    flexShrink: 1,
  },
  themeBtnTextActive: {
    color: themeColors.accent,
  },
});
