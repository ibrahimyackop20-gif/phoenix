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
} from "react-native";
import { useRouter, usePathname, Link } from "expo-router";
import { supabase } from "@/lib/supabaseClient";
import { isPrimaryAdminEmail, resolveAuthEmail } from "@/lib/adminAccess";
import {
  getPostGoogleAuthDestination,
  signInWithGoogle,
} from "@/lib/googleAuth";
import { markPostAuthNavigation } from "@/lib/postAuthNavigation";
import GoogleSignInButton from "@/../components/GoogleSignInButton";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

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
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          {pageState === "login" && (
            <View style={styles.cardWrapper}>
              <View style={styles.header}>
                <Text style={styles.title}>{t("auth_login_title")}</Text>
                <Text style={styles.subtitle}>{t("auth_login_subtitle")}</Text>
              </View>

              <View style={styles.glassCard}>
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

                <GoogleSignInButton
                  onPress={handleGoogleSignIn}
                  loading={googleLoading}
                  disabled={loading}
                />

                <TouchableOpacity
                  onPress={handleForgotPassword}
                  disabled={sendingReset || loading || googleLoading}
                  style={styles.forgotButton}
                >
                  <Text style={styles.forgotText}>
                    {sendingReset ? t("auth_reset_send") : t("auth_forgot_password")}
                  </Text>
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
    </KeyboardAvoidingView>
  );
}

const getStyles = (themeColors: ReturnType<typeof useAppTheme>["themeColors"], isDark: boolean) =>
  StyleSheet.create({
    keyboardView: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
    },
    container: {
      padding: 16,
      alignItems: "center",
      justifyContent: "center",
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
    },
    subtitle: {
      fontSize: 14,
      color: themeColors.textMuted,
      textAlign: "center",
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
      borderRadius: 8,
      padding: 10,
      marginBottom: 16,
    },
    errorText: {
      color: "#ef4444",
      fontSize: 12,
      textAlign: "center",
      fontWeight: "600",
    },
    inputGroup: {
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: "500",
      color: themeColors.textMuted,
      marginBottom: 8,
      textAlign: "right",
    },
    inputWrapper: {
      position: "relative",
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: themeColors.inputBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      borderRadius: 12,
      height: 48,
      paddingHorizontal: 12,
    },
    inputIcon: {
      marginRight: 8,
    },
    textInput: {
      flex: 1,
      color: themeColors.text,
      fontSize: 14,
    },
    passwordInput: {
      paddingRight: 32,
    },
    eyeIcon: {
      position: "absolute",
      right: 12,
      top: 14,
    },
    primaryButton: {
      height: 48,
      backgroundColor: "#ea580c",
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
      shadowColor: "#ea580c",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
    },
    orRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 16,
      marginBottom: 4,
      gap: 10,
    },
    orLine: {
      flex: 1,
      height: 1,
      backgroundColor: themeColors.cardBorder,
    },
    orText: {
      fontSize: 12,
      color: themeColors.textMuted,
      fontWeight: "500",
    },
    buttonInner: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 8,
    },
    buttonIcon: {
      marginLeft: 4,
    },
    buttonText: {
      color: "#ffffff",
      fontSize: 14,
      fontWeight: "bold",
    },
    forgotButton: {
      alignItems: "center",
      paddingVertical: 12,
      marginTop: 8,
    },
    forgotText: {
      color: "#fb923c",
      fontSize: 12,
      fontWeight: "600",
    },
    footerRow: {
      flexDirection: "row-reverse",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 24,
    },
    footerText: {
      color: themeColors.textMuted,
      fontSize: 13,
    },
    linkText: {
      color: "#fb923c",
      fontSize: 13,
      fontWeight: "bold",
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
    },
    otpInputBox: {
      width: 42,
      height: 48,
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
