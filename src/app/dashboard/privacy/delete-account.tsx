import React, { useState, useEffect, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { supabase } from "@/../lib/supabaseClient";
import { Feather } from "@expo/vector-icons";
import { useAppTheme, type ThemeColors } from "@/../components/ThemeProvider";
import { useTranslation } from "react-i18next";
import { useResponsiveTheme } from "@/hooks/useResponsiveTheme";

export default function DeleteAccount() {
  const router = useRouter();
  const { themeColors } = useAppTheme();
  const { t } = useTranslation();
  const { horizontalPadding, formMaxWidth } = useResponsiveTheme();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const styles = useMemo(
    () => getStyles(themeColors, horizontalPadding, formMaxWidth),
    [themeColors, horizontalPadding, formMaxWidth]
  );

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    fetchUser();
  }, []);

  const executeDelete = async () => {
    if (!currentUser) return;

    setError(null);
    setLoading(true);

    try {
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke("delete-account");

      if (edgeErr) {
        throw new Error(t("privacy_delete_server_error"));
      }

      if (edgeData?.error) {
        throw new Error(t("privacy_delete_server_error"));
      }

      await AsyncStorage.clear();
      await supabase.auth.signOut();

      Alert.alert(
        t("privacy_delete_success_title"),
        t("privacy_delete_success_body"),
        [
          {
            text: t("privacy_delete_ok"),
            onPress: () => {
              router.replace("/auth/login" as any);
            },
          },
        ]
      );
    } catch (err: any) {
      console.error("Delete Account flow failed:", err);
      // Never surface Edge Function / Supabase / RPC details to end users.
      setError(t("privacy_delete_server_error"));
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePress = () => {
    Alert.alert(
      t("privacy_delete_dialog_title"),
      t("privacy_delete_dialog_body"),
      [
        { text: t("privacy_delete_cancel"), style: "cancel" },
        {
          text: t("privacy_delete_confirm"),
          style: "destructive",
          onPress: executeDelete,
        },
      ]
    );
  };

  if (!currentUser) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.screenBg }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.screenBg }]}>
      <View style={[styles.appBar, { borderBottomColor: themeColors.borderSoft }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-right" size={22} color={themeColors.textStrong} />
        </TouchableOpacity>
        <Text style={[styles.appBarTitle, { color: themeColors.textStrong }]} maxFontSizeMultiplier={1.35}>
          {t("privacy_delete_appbar")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.warningCard, { backgroundColor: themeColors.dangerSoftBg, borderColor: themeColors.dangerSoftBorder }]}>
          <Feather name="alert-triangle" size={32} color={themeColors.danger} style={styles.warningIcon} />
          <Text style={[styles.warningTitle, { color: themeColors.danger }]} maxFontSizeMultiplier={1.35}>
            {t("privacy_delete_warning_title")}
          </Text>
          <Text style={[styles.warningText, { color: themeColors.textBody }]} maxFontSizeMultiplier={1.35}>
            {t("privacy_delete_warning_body")}
          </Text>
          <View style={styles.bullets}>
            <Text style={[styles.bulletItem, { color: themeColors.textSoft }]} maxFontSizeMultiplier={1.35}>{t("privacy_delete_bullet_1")}</Text>
            <Text style={[styles.bulletItem, { color: themeColors.textSoft }]} maxFontSizeMultiplier={1.35}>{t("privacy_delete_bullet_2")}</Text>
            <Text style={[styles.bulletItem, { color: themeColors.textSoft }]} maxFontSizeMultiplier={1.35}>{t("privacy_delete_bullet_3")}</Text>
            <Text style={[styles.bulletItem, { color: themeColors.textSoft }]} maxFontSizeMultiplier={1.35}>{t("privacy_delete_bullet_4")}</Text>
          </View>
        </View>

        <View style={[styles.actionCard, { backgroundColor: themeColors.surface, borderColor: themeColors.borderSoft }]}>
          <Text style={[styles.accountLabel, { color: themeColors.textSoft }]} maxFontSizeMultiplier={1.35}>
            {t("privacy_delete_account_label")}
          </Text>
          <Text style={[styles.accountEmail, { color: themeColors.primary }]} maxFontSizeMultiplier={1.35}>
            {currentUser.email}
          </Text>

          {error ? (
            <Text style={[styles.errorText, { color: themeColors.danger }]} maxFontSizeMultiplier={1.35}>
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={handleDeletePress}
            disabled={loading}
            style={[styles.deleteButton, { backgroundColor: themeColors.danger }, loading && styles.deleteButtonDisabled]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={themeColors.onAccent} />
            ) : (
              <>
                <Feather name="trash-2" size={16} color={themeColors.onAccent} style={{ marginLeft: 6 }} />
                <Text style={[styles.deleteButtonText, { color: themeColors.onAccent }]} maxFontSizeMultiplier={1.35}>
                  {t("privacy_delete_button")}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (c: ThemeColors, horizontalPadding: number, formMaxWidth: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    appBar: {
      flexDirection: "row-reverse",
      minHeight: 56,
      paddingVertical: 8,
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: horizontalPadding,
      borderBottomWidth: 1,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    appBarTitle: {
      fontSize: 16,
      fontWeight: "bold",
      textAlign: "center",
      flexShrink: 1,
    },
    scrollContent: {
      padding: horizontalPadding,
      paddingBottom: 40,
      width: "100%",
      maxWidth: formMaxWidth,
      alignSelf: "center",
    },
    warningCard: {
      borderWidth: 1,
      borderRadius: 20,
      padding: 20,
      alignItems: "center",
      marginBottom: 24,
    },
    warningIcon: {
      marginBottom: 12,
    },
    warningTitle: {
      fontSize: 16,
      fontWeight: "bold",
      marginBottom: 8,
      textAlign: "center",
      flexShrink: 1,
    },
    warningText: {
      fontSize: 13,
      lineHeight: 20,
      textAlign: "center",
      marginBottom: 16,
    },
    bullets: {
      alignSelf: "stretch",
      gap: 8,
    },
    bulletItem: {
      fontSize: 12,
      lineHeight: 18,
      textAlign: "right",
    },
    actionCard: {
      padding: 20,
      borderRadius: 20,
      borderWidth: 1,
      marginBottom: 20,
    },
    accountLabel: {
      fontSize: 13,
      fontWeight: "600",
      textAlign: "right",
      marginBottom: 4,
    },
    accountEmail: {
      fontSize: 15,
      fontWeight: "bold",
      textAlign: "right",
      marginBottom: 20,
    },
    errorText: {
      fontSize: 12,
      textAlign: "right",
      marginBottom: 12,
    },
    deleteButton: {
      minHeight: 56,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 18,
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
    },
    deleteButtonDisabled: {
      opacity: 0.6,
    },
    deleteButtonText: {
      fontSize: 14,
      fontWeight: "bold",
      textAlign: "center",
      flexShrink: 1,
    },
  });
