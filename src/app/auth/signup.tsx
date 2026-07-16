import React, { useState, useEffect, useCallback } from "react";
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
import { useRouter, Link } from "expo-router";
import { supabase } from "@/lib/supabaseClient";
import { isPrimaryAdminEmail, resolveAuthEmail } from "@/lib/adminAccess";
import OtpInput from "@/../components/OtpInput";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

type Step = "register" | "verify";

export default function SignupPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const styles = getStyles(themeColors, isDark);

  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("+964");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [step, setStep] = useState<Step>("register");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [otpError, setOtpError] = useState(false);
  const [success, setSuccess] = useState(false);

  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError(t("auth_fill_required"));
      return;
    }
    if (password.length < 6) {
      setError(t("auth_password_min"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone_number: phoneNumber.trim(),
          },
        },
      });

      if (signUpError) {
        console.error("[Signup] signUp failed:", signUpError.message, {
          status: signUpError.status,
          code: (signUpError as any).code,
        });
        if (signUpError.message === "User already registered") {
          setError(t("auth_email_exists"));
        } else if (
          /Error sending confirmation email/i.test(signUpError.message)
        ) {
          setError(t("auth_smtp_error"));
        } else {
          setError(t("auth_signup_failed", { message: signUpError.message }));
        }
        setLoading(false);
        return;
      }

      // Supabase "Confirm signup" often sends a magic link, not a 6-digit code.
      // Password-reset works because recovery templates include {{ .Token }}.
      // Send an OTP email explicitly (same path as Magic Link / email OTP) so
      // the in-app verify screen receives a code the user can enter.
      const identities = signUpData?.user?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        setError(t("auth_email_exists"));
        setLoading(false);
        return;
      }

      setStep("verify");
      setCountdown(60);

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });

      if (otpError) {
        console.error("[Signup] signInWithOtp failed:", otpError.message);
        setError(t("auth_signup_failed", { message: otpError.message }));
      }
    } catch (err) {
      console.error(err);
      setError(t("auth_unexpected"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = useCallback(
    async (code: string) => {
      setVerifying(true);
      setError("");
      setOtpError(false);

      try {
        // OTP is sent via signInWithOtp → verify type "email" first.
        // Fallback to "signup" if Confirm-signup template also sent a code.
        let verifyError = (
          await supabase.auth.verifyOtp({
            email: email.trim(),
            token: code,
            type: "email",
          })
        ).error;

        if (verifyError) {
          verifyError = (
            await supabase.auth.verifyOtp({
              email: email.trim(),
              token: code,
              type: "signup",
            })
          ).error;
        }

        if (verifyError) {
          console.error("[Signup] verifyOtp failed:", verifyError.message);
          setError(t("auth_signup_failed", { message: verifyError.message }));
          setOtpError(true);
          setVerifying(false);
          return;
        }

        setSuccess(true);
        setError("");

        let destination = "/dashboard";
        if (isPrimaryAdminEmail(resolveAuthEmail(null, email.trim()))) {
          destination = "/admin";
        }

        setTimeout(() => {
          router.replace(destination as any);
        }, 1800);
      } catch (err) {
        console.error(err);
        setError(t("auth_unexpected"));
        setVerifying(false);
      }
    },
    [email, router, t]
  );

  const handleResendCode = async () => {
    setError("");
    setOtpError(false);

    try {
      // Resend via the same OTP path used after signUp (6-digit code email).
      const { error: resendError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });

      if (resendError) {
        setError(t("auth_signup_failed", { message: resendError.message }));
        return;
      }

      setCountdown(60);
    } catch (err) {
      console.error(err);
      setError(t("auth_unexpected"));
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.keyboardView}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          {step === "register" && (
            <View style={styles.cardWrapper}>
              <View style={styles.header}>
                <Text style={styles.title}>{t("auth_signup_title")}</Text>
                <Text style={styles.subtitle}>{t("auth_signup_subtitle")}</Text>
              </View>

              <View style={styles.glassCard}>
                {error ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t("auth_full_name")}</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="user" size={16} color={themeColors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder={t("auth_full_name_placeholder")}
                      placeholderTextColor={themeColors.textMuted}
                      style={styles.textInput}
                      textAlign="right"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>{t("auth_phone")}</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="phone" size={16} color={themeColors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      value={phoneNumber}
                      onChangeText={setPhoneNumber}
                      keyboardType="phone-pad"
                      placeholder={t("auth_phone_placeholder")}
                      placeholderTextColor={themeColors.textMuted}
                      style={styles.textInput}
                      textAlign="left"
                    />
                  </View>
                </View>

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
                  onPress={handleRegister}
                  disabled={loading}
                  style={styles.primaryButton}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <View style={styles.buttonInner}>
                      <Feather name="user-plus" size={16} color="#ffffff" style={styles.buttonIcon} />
                      <Text style={styles.buttonText}>{t("auth_create_account")}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>{t("auth_have_account")} </Text>
                <Link href={"/auth/login" as any} asChild>
                  <TouchableOpacity>
                    <Text style={styles.linkText}>{t("auth_login_link")}</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          )}

          {step === "verify" && (
            <View style={styles.cardWrapper}>
              {success ? (
                <View style={[styles.glassCard, styles.successCard]}>
                  <View style={styles.successBadge}>
                    <Feather name="check-circle" size={48} color="#22c55e" />
                  </View>
                  <Text style={styles.successTitle}>{t("auth_reset_success")}</Text>
                  <Text style={styles.successSubtitle}>{t("auth_callback_verifying")}</Text>
                  <View style={styles.sparklesRow}>
                    <Ionicons name="sparkles" size={18} color="#22c55e" style={styles.sparkleIcon} />
                    <Ionicons name="sparkles" size={12} color="rgba(34, 197, 94, 0.6)" style={styles.sparkleIcon} />
                    <Ionicons name="sparkles" size={18} color="#22c55e" style={styles.sparkleIcon} />
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.header}>
                    <View style={styles.shieldIconBadge}>
                      <Feather name="shield" size={24} color="#ffffff" />
                    </View>
                    <Text style={styles.title}>{t("auth_verify_title")}</Text>
                    <Text style={styles.subtitle}>{t("auth_verify_subtitle")}</Text>
                    <Text style={styles.emailHighlight}>{email}</Text>
                  </View>

                  <View style={styles.glassCard}>
                    {error ? (
                      <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    ) : null}

                    <View style={styles.otpWrapper}>
                      <OtpInput
                        onComplete={handleVerifyOtp}
                        disabled={verifying}
                        error={otpError}
                      />
                    </View>

                    {verifying && (
                      <View style={styles.verifyingIndicator}>
                        <ActivityIndicator size="small" color="#ea580c" />
                        <Text style={styles.verifyingText}>{t("auth_callback_verifying")}</Text>
                      </View>
                    )}

                    <View style={styles.divider} />

                    <View style={styles.resendSection}>
                      {countdown > 0 ? (
                        <View style={styles.resendTimer}>
                          <Feather name="refresh-cw" size={12} color={themeColors.textMuted} />
                          <Text style={styles.resendTimerText}>
                            {t("auth_resend_in", { sec: countdown })}
                          </Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={handleResendCode}
                          style={styles.resendButton}
                        >
                          <Feather name="refresh-cw" size={12} color="#ea580c" style={styles.resendButtonIcon} />
                          <Text style={styles.resendButtonText}>{t("auth_resend_otp")}</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <TouchableOpacity
                      onPress={() => {
                        setStep("register");
                        setError("");
                        setOtpError(false);
                      }}
                      disabled={verifying}
                      style={styles.backButton}
                    >
                      <Feather name="arrow-right" size={14} color={themeColors.textMuted} style={styles.backButtonIcon} />
                      <Text style={styles.backButtonText}>{t("auth_signup_title")}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
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
    shieldIconBadge: {
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
      marginTop: 4,
    },
    otpWrapper: {
      alignItems: "center",
      marginBottom: 16,
      width: "100%",
    },
    verifyingIndicator: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginVertical: 8,
    },
    verifyingText: {
      color: themeColors.textMuted,
      fontSize: 12,
    },
    divider: {
      height: 1,
      backgroundColor: themeColors.cardBorder,
      marginVertical: 16,
    },
    resendSection: {
      alignItems: "center",
      marginBottom: 8,
    },
    resendTimer: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 6,
    },
    resendTimerText: {
      fontSize: 12,
      color: themeColors.textMuted,
    },
    resendButton: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 6,
    },
    resendButtonIcon: {
      marginLeft: 4,
    },
    resendButtonText: {
      fontSize: 12,
      fontWeight: "600",
      color: "#ea580c",
    },
    backButton: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      marginTop: 8,
      borderRadius: 12,
      backgroundColor: isDark ? "rgba(255, 255, 255, 0.04)" : themeColors.inputBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      height: 48,
      width: "100%",
    },
    backButtonIcon: {
      marginLeft: 4,
    },
    backButtonText: {
      color: themeColors.textMuted,
      fontSize: 13,
      fontWeight: "500",
    },
    successCard: {
      alignItems: "center",
      padding: 32,
    },
    successBadge: {
      marginBottom: 16,
    },
    successTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: "#22c55e",
      marginBottom: 8,
      textAlign: "center",
    },
    successSubtitle: {
      fontSize: 13,
      color: themeColors.textMuted,
      textAlign: "center",
      marginBottom: 16,
    },
    sparklesRow: {
      flexDirection: "row",
      gap: 6,
    },
    sparkleIcon: {
      transform: [{ scale: 1 }],
    },
  });
