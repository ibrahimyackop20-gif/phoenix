import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabaseClient";
import { AuthChangeEvent } from "@supabase/supabase-js";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const styles = getStyles(themeColors, isDark);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === "PASSWORD_RECOVERY") {
        // User arrived from password reset email — ready to set new password
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async () => {
    setError("");

    if (password.length < 6) {
      setError(t("auth_password_min"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("auth_password_mismatch"));
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard" as any);
      }, 2000);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Feather name="key" size={32} color="#ffffff" />
            </View>
            <Text style={styles.titleText}>{t("auth_reset_title")}</Text>
            <Text style={styles.subtitleText}>{t("auth_reset_subtitle")}</Text>
          </View>

          <View style={styles.card}>
            {success ? (
              <View style={styles.successContainer}>
                <Ionicons name="checkmark-circle" size={48} color="#10b981" />
                <Text style={styles.successTitle}>{t("auth_reset_success")}</Text>
                <Text style={styles.successText}>{t("auth_reset_redirecting")}</Text>
              </View>
            ) : (
              <View style={styles.form}>
                {error ? (
                  <View style={styles.errorBadge}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t("auth_reset_new_password")}</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="lock" size={18} color={themeColors.textMuted} style={styles.fieldIcon} />
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      placeholder={t("auth_password_placeholder")}
                      placeholderTextColor={themeColors.textMuted}
                      style={styles.textInput}
                      textAlign="right"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeButton}
                    >
                      <Feather
                        name={showPassword ? "eye-off" : "eye"}
                        size={18}
                        color={themeColors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t("auth_reset_confirm_password")}</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="lock" size={18} color={themeColors.textMuted} style={styles.fieldIcon} />
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      placeholder={t("auth_password_placeholder")}
                      placeholderTextColor={themeColors.textMuted}
                      style={styles.textInput}
                      textAlign="right"
                    />
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleReset}
                  disabled={loading}
                  style={styles.submitButton}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <View style={styles.buttonInner}>
                      <Text style={styles.submitButtonText}>{t("auth_reset_submit")}</Text>
                      <Feather name="key" size={16} color="#ffffff" style={styles.buttonIcon} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (themeColors: ReturnType<typeof useAppTheme>["themeColors"], isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingVertical: 40,
      width: "100%",
      maxWidth: 560,
      alignSelf: "center",
    },
    header: {
      alignItems: "center",
      marginBottom: 32,
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: "#ea580c",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
      shadowColor: "#ea580c",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 4,
    },
    titleText: {
      fontSize: 24,
      fontWeight: "bold",
      color: "#f97316",
      marginBottom: 8,
      textAlign: "center",
      flexShrink: 1,
    },
    subtitleText: {
      fontSize: 14,
      color: themeColors.textMuted,
      textAlign: "center",
      flexShrink: 1,
    },
    card: {
      backgroundColor: themeColors.cardBg,
      borderWidth: 1,
      borderColor: themeColors.cardBorder,
      borderRadius: 24,
      padding: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.1 : 0.06,
      shadowRadius: 8,
      elevation: 5,
    },
    successContainer: {
      alignItems: "center",
      paddingVertical: 16,
    },
    successTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: themeColors.text,
      marginTop: 12,
      marginBottom: 8,
    },
    successText: {
      fontSize: 14,
      color: themeColors.textMuted,
    },
    form: {
      gap: 20,
    },
    errorBadge: {
      backgroundColor: "rgba(239, 68, 68, 0.1)",
      borderWidth: 1,
      borderColor: "rgba(239, 68, 68, 0.2)",
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: "center",
    },
    errorText: {
      color: "#ef4444",
      fontSize: 13,
      fontWeight: "600",
      textAlign: "center",
    },
    inputGroup: {
      gap: 8,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: "500",
      color: themeColors.textMuted,
    },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: themeColors.inputBg,
      borderWidth: 1.5,
      borderColor: themeColors.cardBorder,
      borderRadius: 12,
      paddingHorizontal: 12,
      minHeight: 48,
      paddingVertical: 6,
    },
    fieldIcon: {
      marginRight: 8,
    },
    textInput: {
      flex: 1,
      color: themeColors.text,
      fontSize: 14,
      minHeight: 40,
      paddingVertical: 8,
    },
    eyeButton: {
      padding: 8,
    },
    submitButton: {
      backgroundColor: "#ea580c",
      borderRadius: 12,
      minHeight: 48,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
      shadowColor: "#ea580c",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 4,
    },
    buttonInner: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    submitButtonText: {
      color: "#ffffff",
      fontSize: 14,
      fontWeight: "bold",
      textAlign: "center",
      flexShrink: 1,
    },
    buttonIcon: {
      marginLeft: 8,
    },
  });
