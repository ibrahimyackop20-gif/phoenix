import React, { useRef, useState } from "react";
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
  Image,
} from "react-native";
import { useRouter, usePathname, Link } from "expo-router";
import { supabase } from "@/lib/supabaseClient";
import { isPrimaryAdminEmail, resolveAuthEmail } from "@/lib/adminAccess";
import {
  getPostGoogleAuthDestination,
  signInWithGoogle,
} from "@/lib/googleAuth";
import { markPostAuthNavigation } from "@/lib/postAuthNavigation";
import { AntDesign, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";
import { ScreenTransition } from "../../components/anim/ScreenTransition";

type PageState = "login" | "otp" | "success";

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const styles = getStyles(themeColors, isDark);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  const [pageState, setPageState] = useState<PageState>("login");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const otpRefs = useRef<any>([]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError(t("auth_fill_required"));
      return;
    }
    setLoading(true);
    setError("");

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(t("auth_invalid_credentials"));
        setLoading(false);
        return;
      }

      const authEmail = resolveAuthEmail(data.user, email.trim());
      let destination = "/dashboard";
      if (isPrimaryAdminEmail(authEmail)) {
        destination = "/admin";
      }

      markPostAuthNavigation(destination);
      router.replace(destination as any);
    } catch (err) {
      console.error(err);
      setError(t("auth_login_error"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading || googleLoading) return;
    setGoogleLoading(true);
    setError("");

    try {
      console.log("[Login][NAV] Google sign-in started", {
        currentRoute: pathname,
        authState: "guest",
      });
      const result = await signInWithGoogle();

      if (result.status === "cancelled") {
        // Deep-link remount may have established session via SSOCatcher.
        const {
          data: { session: existing },
        } = await supabase.auth.getSession();
        if (existing) {
          const destination = getPostGoogleAuthDestination(existing);
          console.log("[Login][NAV] cancelled but session exists — navigating", {
            currentRoute: pathname,
            navigationTarget: destination,
            authState: "authenticated",
            email: existing.user.email,
          });
          markPostAuthNavigation(destination);
          router.replace(destination as any);
          console.log("[Login][NAV] final screen rendered →", destination);
        }
        return;
      }
      if (result.status === "expo_go_unsupported") {
        setError(t("auth_google_expo_go"));
        return;
      }
      if (result.status === "offline") {
        setError(t("auth_google_offline"));
        return;
      }
      if (result.status !== "success" || !result.session) {
        setError(result.message || t("auth_google_failed"));
        return;
      }

      const destination = getPostGoogleAuthDestination(result.session);
      console.log("[Login][NAV] session established — navigating", {
        currentRoute: pathname,
        navigationTarget: destination,
        authState: "authenticated",
        email: result.session.user.email,
      });
      markPostAuthNavigation(destination);
      router.replace(destination as any);
      console.log("[Login][NAV] final screen rendered →", destination);
    } catch (err) {
      console.error(err);
      setError(t("auth_google_failed"));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError(t("auth_fill_required"));
      return;
    }
    setSendingReset(true);
    setError("");

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());

      if (resetError) {
        setError(resetError.message);
        setSendingReset(false);
        return;
      }

      setSendingReset(false);
      setPageState("otp");
    } catch (err) {
      console.error(err);
      setError(t("auth_unexpected"));
      setSendingReset(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned) {
      const newOtp = [...otpDigits];
      newOtp[index] = "";
      setOtpDigits(newOtp);
      return;
    }

    const digits = cleaned.split("");
    const newOtp = [...otpDigits];
    digits.forEach((d, i) => {
      if (index + i < 6) newOtp[index + i] = d;
    });
    setOtpDigits(newOtp);

    const nextIdx = Math.min(index + digits.length, 5);
    otpRefs.current[nextIdx]?.focus();
  };

  const handleOtpKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyAndReset = async () => {
    const otpCode = otpDigits.join("");
    if (otpCode.length !== 6) {
      setError(t("auth_verify_subtitle"));
      return;
    }
    if (newPassword.length < 6) {
      setError(t("auth_password_min"));
      return;
    }

    setVerifying(true);
    setError("");

    try {
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode,
        type: "recovery",
      });

      if (otpError) {
        setError(t("auth_invalid_credentials"));
        setVerifying(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message);
        setVerifying(false);
        return;
      }

      setPageState("success");
    } catch (err) {
      console.error(err);
      setError(t("auth_unexpected"));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.keyboardView}
    >
      <ScreenTransition style={styles.keyboardView}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          {pageState === "login" && (
            <View style={styles.loginScreen}>
              <View style={styles.brandSection}>
                <View style={styles.logoSurface}>
                  <Image
                    source={require("../../../assets/images/logo.png")}
                    style={styles.logo}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.brandTitle}>{t("brand_name")}</Text>
                <Text style={styles.brandSubtitle}>{t("auth_login_subtitle")}</Text>
              </View>

              <View style={styles.loginForm}>
                {error ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t("auth_email")}</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="mail" size={16} color={themeColors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholder={t("auth_email_placeholder")}
                      placeholderTextColor={themeColors.textMuted}
                      style={styles.textInput}
                      textAlign="left"
                      selectionColor="#FF5A1F"
                      cursorColor="#FF5A1F"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t("auth_password")}</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="lock" size={16} color={themeColors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      placeholder={t("auth_password_placeholder")}
                      placeholderTextColor={themeColors.textMuted}
                      style={[styles.textInput, styles.passwordInput]}
                      textAlign="left"
                      selectionColor="#FF5A1F"
                      cursorColor="#FF5A1F"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeIcon}
                    >
                      <Feather
                        name={showPassword ? "eye-off" : "eye"}
                        size={16}
                        color={themeColors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleForgotPassword}
                  disabled={sendingReset || loading || googleLoading}
                  style={styles.forgotButton}
                >
                  <Text style={styles.forgotText}>
                    {sendingReset ? t("auth_reset_send") : t("auth_forgot_password")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleLogin}
                  disabled={loading || googleLoading}
                  style={styles.primaryButton}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <View style={styles.buttonInner}>
                      <Feather name="log-in" size={16} color="#ffffff" style={styles.buttonIcon} />
                      <Text style={styles.buttonText}>{t("auth_login_btn")}</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <View style={styles.orRow}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>{t("auth_or")}</Text>
                  <View style={styles.orLine} />
                </View>

                <TouchableOpacity
                  onPress={handleGoogleSignIn}
                  disabled={loading || googleLoading}
                  style={[
                    styles.googleButton,
                    (loading || googleLoading) && styles.disabledButton,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t("auth_google_continue")}
                >
                  {googleLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <View style={styles.googleButtonInner}>
                      <AntDesign name="google" size={20} color="#4285F4" />
                      <Text style={styles.googleButtonText}>
                        {t("auth_google_continue")}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>{t("auth_no_account")} </Text>
                <Link href={"/auth/signup" as any} asChild>
                  <TouchableOpacity>
                    <Text style={styles.linkText}>{t("auth_signup_link")}</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          )}

          {pageState === "otp" && (
            <View style={styles.cardWrapper}>
              <View style={styles.header}>
                <View style={styles.keyIconBadge}>
                  <Feather name="key" size={24} color="#ffffff" />
                </View>
                <Text style={styles.title}>{t("auth_reset_title")}</Text>
                <Text style={styles.subtitle}>
                  {t("auth_verify_subtitle")}{" "}
                  <Text style={styles.emailHighlight}>{email}</Text>
                </Text>
              </View>

              <View style={styles.glassCard}>
                {error ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <Text style={styles.otpLabel}>{t("auth_verify_subtitle")}</Text>
                  <View style={styles.otpRow}>
                    {otpDigits.map((digit, i) => (
                      <TextInput
                        key={i}
                        ref={(el) => {
                          otpRefs.current[i] = el;
                        }}
                        keyboardType="number-pad"
                        maxLength={1}
                        value={digit}
                        onChangeText={(val) => handleOtpChange(i, val)}
                        onKeyPress={({ nativeEvent }) =>
                          handleOtpKeyPress(i, nativeEvent.key)
                        }
                        style={styles.otpInputBox}
                        textAlign="center"
                        placeholder="·"
                        placeholderTextColor={themeColors.textMuted}
                      />
                    ))}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t("auth_reset_new_password")}</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="lock" size={16} color={themeColors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPassword}
                      autoCapitalize="none"
                      placeholder={t("auth_password_placeholder")}
                      placeholderTextColor={themeColors.textMuted}
                      style={[styles.textInput, styles.passwordInput]}
                      textAlign="left"
                    />
                    <TouchableOpacity
                      onPress={() => setShowNewPassword(!showNewPassword)}
                      style={styles.eyeIcon}
                    >
                      <Feather
                        name={showNewPassword ? "eye-off" : "eye"}
                        size={16}
                        color={themeColors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleVerifyAndReset}
                  disabled={verifying}
                  style={styles.primaryButton}
                >
                  {verifying ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <View style={styles.buttonInner}>
                      <MaterialCommunityIcons name="key-variant" size={16} color="#ffffff" style={styles.buttonIcon} />
                      <Text style={styles.buttonText}>{t("auth_verify_btn")}</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setPageState("login");
                    setError("");
                  }}
                  style={styles.backButton}
                >
                  <Feather name="arrow-right" size={14} color={themeColors.textMuted} style={styles.backButtonIcon} />
                  <Text style={styles.backButtonText}>{t("auth_login_link")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {pageState === "success" && (
            <View style={[styles.glassCard, styles.successCard]}>
              <View style={styles.successBadge}>
                <Feather name="check-circle" size={48} color="#22c55e" />
              </View>
              <Text style={styles.successTitle}>{t("auth_reset_success")}</Text>
              <Text style={styles.successSubtitle}>{t("auth_login_subtitle")}</Text>
              <TouchableOpacity
                onPress={() => {
                  setPageState("login");
                  setPassword("");
                  setNewPassword("");
                  setOtpDigits(["", "", "", "", "", ""]);
                  setError("");
                }}
                style={styles.primaryButton}
              >
                <View style={styles.buttonInner}>
                  <Feather name="log-in" size={16} color="#ffffff" style={styles.buttonIcon} />
                  <Text style={styles.buttonText}>{t("auth_login_btn")}</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
      </ScreenTransition>
    </KeyboardAvoidingView>
  );
}

const getStyles = (themeColors: ReturnType<typeof useAppTheme>["themeColors"], isDark: boolean) =>
  StyleSheet.create({
    keyboardView: {
      flex: 1,
      backgroundColor: "#0F172A",
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingVertical: 32,
    },
    container: {
      flex: 1,
      paddingHorizontal: 24,
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
    },
    loginScreen: {
      flex: 1,
      width: "100%",
      maxWidth: 440,
      alignSelf: "center",
      justifyContent: "center",
      paddingVertical: 24,
    },
    brandSection: {
      alignItems: "center",
      marginBottom: 40,
    },
    logoSurface: {
      width: 80,
      height: 80,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#1E293B",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.08)",
      marginBottom: 20,
    },
    logo: {
      width: 64,
      height: 64,
    },
    brandTitle: {
      color: "#FFFFFF",
      fontSize: 32,
      lineHeight: 40,
      fontWeight: "800",
      letterSpacing: -0.5,
      textAlign: "center",
      flexShrink: 1,
    },
    brandSubtitle: {
      color: "#94A3B8",
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
      marginTop: 8,
      flexShrink: 1,
    },
    loginForm: {
      width: "100%",
    },
    cardWrapper: {
      width: "100%",
      maxWidth: 380,
    },
    header: {
      alignItems: "center",
      marginBottom: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: "bold",
      color: themeColors.text,
      marginBottom: 8,
      textAlign: "center",
      flexShrink: 1,
    },
    subtitle: {
      fontSize: 14,
      color: themeColors.textMuted,
      textAlign: "center",
      flexShrink: 1,
    },
    glassCard: {
      backgroundColor: themeColors.cardBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      borderRadius: 24,
      padding: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 10,
      elevation: 8,
      width: "100%",
    },
    errorContainer: {
      backgroundColor: "rgba(239, 68, 68, 0.1)",
      borderColor: "rgba(239, 68, 68, 0.2)",
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginBottom: 24,
    },
    errorText: {
      color: "#ef4444",
      fontSize: 12,
      textAlign: "center",
      fontWeight: "600",
    },
    inputGroup: {
      marginBottom: 20,
    },
    inputLabel: {
      fontSize: 13,
      lineHeight: 20,
      fontWeight: "600",
      color: "#CBD5E1",
      marginBottom: 8,
      textAlign: "right",
    },
    inputWrapper: {
      flexDirection: "row-reverse",
      alignItems: "center",
      backgroundColor: "#1E293B",
      borderColor: "rgba(255,255,255,0.08)",
      borderWidth: 1,
      borderRadius: 16,
      minHeight: 56,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    inputIcon: {
      marginLeft: 12,
    },
    textInput: {
      flex: 1,
      color: "#FFFFFF",
      fontSize: 16,
      lineHeight: 22,
      minHeight: 40,
      paddingVertical: 8,
    },
    passwordInput: {
      paddingHorizontal: 4,
    },
    eyeIcon: {
      minWidth: 40,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    primaryButton: {
      minHeight: 56,
      paddingVertical: 15,
      paddingHorizontal: 20,
      backgroundColor: "#FF5A1F",
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#FF5A1F",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.28,
      shadowRadius: 14,
      elevation: 8,
    },
    orRow: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 24,
      gap: 16,
    },
    orLine: {
      flex: 1,
      height: 1,
      backgroundColor: themeColors.cardBorder,
    },
    orText: {
      fontSize: 13,
      lineHeight: 20,
      color: "#94A3B8",
      fontWeight: "600",
    },
    buttonInner: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      justifyContent: "center",
    },
    buttonIcon: {
      marginLeft: 4,
    },
    buttonText: {
      color: "#ffffff",
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "700",
      textAlign: "center",
      flexShrink: 1,
    },
    forgotButton: {
      alignItems: "flex-end",
      alignSelf: "stretch",
      paddingVertical: 4,
      paddingHorizontal: 2,
      marginTop: -8,
      marginBottom: 24,
    },
    forgotText: {
      color: "#FF7A45",
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
      textAlign: "right",
      flexShrink: 1,
    },
    googleButton: {
      width: "100%",
      minHeight: 56,
      paddingVertical: 15,
      paddingHorizontal: 20,
      borderRadius: 18,
      backgroundColor: "#1E293B",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.08)",
      alignItems: "center",
      justifyContent: "center",
    },
    disabledButton: {
      opacity: 0.6,
    },
    googleButtonInner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      flexWrap: "wrap",
    },
    googleButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "600",
      textAlign: "center",
      flexShrink: 1,
    },
    footerRow: {
      flexDirection: "row-reverse",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 40,
      flexWrap: "wrap",
      gap: 4,
    },
    footerText: {
      color: "#94A3B8",
      fontSize: 14,
      lineHeight: 22,
      textAlign: "center",
      flexShrink: 1,
    },
    linkText: {
      color: "#FF7A45",
      fontSize: 14,
      lineHeight: 22,
      fontWeight: "700",
    },
    keyIconBadge: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: "#ea580c",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emailHighlight: {
      color: themeColors.text,
      fontWeight: "600",
    },
    otpLabel: {
      fontSize: 13,
      fontWeight: "500",
      color: themeColors.textMuted,
      marginBottom: 12,
      textAlign: "center",
    },
    otpRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
      marginBottom: 8,
      width: "100%",
    },
    otpInputBox: {
      flex: 1,
      minWidth: 34,
      maxWidth: 42,
      minHeight: 48,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: themeColors.cardBorder,
      backgroundColor: themeColors.inputBg,
      color: themeColors.text,
      fontSize: 18,
      fontWeight: "bold",
    },
    backButton: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      marginTop: 12,
      gap: 4,
    },
    backButtonIcon: {
      marginLeft: 4,
    },
    backButtonText: {
      color: themeColors.textMuted,
      fontSize: 12,
      fontWeight: "500",
      textAlign: "center",
      flexShrink: 1,
    },
    successCard: {
      maxWidth: 380,
      alignItems: "center",
      padding: 32,
    },
    successBadge: {
      marginBottom: 16,
    },
    successTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: themeColors.text,
      marginBottom: 8,
      textAlign: "center",
    },
    successSubtitle: {
      fontSize: 13,
      color: themeColors.textMuted,
      textAlign: "center",
      marginBottom: 24,
      lineHeight: 18,
    },
  });
