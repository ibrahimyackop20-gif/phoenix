import React, { useState, useEffect, useCallback, useRef } from "react";
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
import OtpInput from "@/../components/OtpInput";
import GoogleSignInButton from "@/../components/GoogleSignInButton";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

type Step = "register" | "verify";

/** Supabase default per-user email OTP / signup confirmation window (seconds). */
const SUPABASE_EMAIL_COOLDOWN_SEC = 60;

function parseRateLimitSeconds(message: string): number | null {
  const match = message.match(/after\s+(\d+)\s+seconds?/i);
  if (!match) return null;
  const sec = parseInt(match[1], 10);
  return Number.isFinite(sec) && sec > 0 ? sec : null;
}

export default function SignupPage() {
  const router = useRouter();
  const pathname = usePathname();
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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [otpError, setOtpError] = useState(false);
  const [success, setSuccess] = useState(false);

  const [countdown, setCountdown] = useState(0);

  // Synchronous lock — React setState is async; without this, a fast double-tap
  // can fire two signUp() network requests before `loading` re-renders.
  const registerInFlightRef = useRef(false);
  const resendInFlightRef = useRef(false);
  const verifyInFlightRef = useRef(false);
  const otpRequestCountRef = useRef(0);

  // TEMP DEBUG — keep until device verification is confirmed by the user.
  useEffect(() => {
    console.log("[SignupOTP] auth listener attached");
    const { data } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        console.log("[SignupOTP] auth state change", {
          event,
          hasSession: !!session,
          email: session?.user?.email ?? null,
          ts: Date.now(),
        });
      }
    );
    return () => {
      console.log("[SignupOTP] auth listener removed");
      data.subscription.unsubscribe();
    };
  }, []);

  // Countdown: one timeout per remaining second (no OTP side effects).
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const goToVerifyStep = useCallback((reason: string) => {
    console.log("[SignupOTP] navigate to verification screen", {
      reason,
      email: email.trim(),
      ts: Date.now(),
    });
    setStep("verify");
    setCountdown(SUPABASE_EMAIL_COOLDOWN_SEC);
  }, [email]);

  const handleGoogleSignIn = async () => {
    if (loading || googleLoading || registerInFlightRef.current) return;
    setGoogleLoading(true);
    setError("");

    try {
      console.log("[Signup][NAV] Google sign-in started", {
        currentRoute: pathname,
        authState: "guest",
      });
      const result = await signInWithGoogle();

      if (result.status === "cancelled") {
        const {
          data: { session: existing },
        } = await supabase.auth.getSession();
        if (existing) {
          const destination = getPostGoogleAuthDestination(existing);
          console.log("[Signup][NAV] cancelled but session exists — navigating", {
            currentRoute: pathname,
            navigationTarget: destination,
            authState: "authenticated",
            email: existing.user.email,
          });
          markPostAuthNavigation(destination);
          router.replace(destination as any);
          console.log("[Signup][NAV] final screen rendered →", destination);
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
      console.log("[Signup][NAV] session established — navigating", {
        currentRoute: pathname,
        navigationTarget: destination,
        authState: "authenticated",
        email: result.session.user.email,
      });
      markPostAuthNavigation(destination);
      router.replace(destination as any);
      console.log("[Signup][NAV] final screen rendered →", destination);
    } catch (err) {
      console.error(err);
      setError(t("auth_google_failed"));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleRegister = async () => {
    // Guard: ignore duplicate taps before loading UI updates.
    if (registerInFlightRef.current || loading) {
      console.log("[SignupOTP] signUp() BLOCKED duplicate tap", {
        inFlight: registerInFlightRef.current,
        loading,
        ts: Date.now(),
      });
      return;
    }

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError(t("auth_fill_required"));
      return;
    }
    if (password.length < 6) {
      setError(t("auth_password_min"));
      return;
    }

    registerInFlightRef.current = true;
    setLoading(true);
    setError("");

    const trimmedEmail = email.trim();

    try {
      otpRequestCountRef.current += 1;
      console.log("[SignupOTP] signUp() CALL #" + otpRequestCountRef.current, {
        email: trimmedEmail,
        ts: Date.now(),
      });

      // ONE email path: signUp() alone triggers Supabase "Confirm signup" email.
      // Do NOT call signInWithOtp() here — that hits /auth/v1/otp immediately after
      // /auth/v1/signup and causes "For security purposes, you can only request
      // this after XX seconds" plus intermittent missing OTP emails.
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone_number: phoneNumber.trim(),
          },
        },
      });

      console.log("[SignupOTP] signUp() RESPONSE", {
        error: signUpError?.message ?? null,
        status: signUpError?.status ?? null,
        code: (signUpError as { code?: string } | null)?.code ?? null,
        hasUser: !!signUpData?.user,
        hasSession: !!signUpData?.session,
        identities: signUpData?.user?.identities?.length ?? null,
        ts: Date.now(),
      });

      if (signUpError) {
        console.error("[Signup] signUp failed:", signUpError.message, {
          status: signUpError.status,
          code: (signUpError as { code?: string }).code,
        });
        if (signUpError.message === "User already registered") {
          setError(t("auth_email_exists"));
        } else if (
          /Error sending confirmation email/i.test(signUpError.message)
        ) {
          setError(t("auth_smtp_error"));
        } else {
          const wait = parseRateLimitSeconds(signUpError.message);
          if (wait != null) {
            setCountdown(wait);
            setError(t("auth_signup_failed", { message: signUpError.message }));
          } else {
            setError(t("auth_signup_failed", { message: signUpError.message }));
          }
        }
        return;
      }

      // Anti-enumeration: already-registered users can return a user with empty identities.
      const identities = signUpData?.user?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        setError(t("auth_email_exists"));
        return;
      }

      // Email confirmation disabled in dashboard → session already issued.
      if (signUpData?.session) {
        console.log("[SignupOTP] session returned from signUp — skipping OTP screen");
        let destination = "/dashboard";
        if (isPrimaryAdminEmail(resolveAuthEmail(signUpData.session.user, trimmedEmail))) {
          destination = "/admin";
        }
        router.replace(destination as any);
        return;
      }

      // Confirmation email was sent by signUp() — show OTP screen. No second send.
      console.log(
        "[SignupOTP] signInWithOtp() SKIPPED after signup (single confirmation email from signUp)"
      );
      goToVerifyStep("after_successful_signUp");
    } catch (err) {
      console.error("[SignupOTP] unexpected register error", err);
      setError(t("auth_unexpected"));
    } finally {
      registerInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleVerifyOtp = useCallback(
    async (code: string) => {
      if (verifyInFlightRef.current || verifying) {
        console.log("[SignupOTP] verifyOtp() BLOCKED duplicate", { ts: Date.now() });
        return;
      }

      verifyInFlightRef.current = true;
      setVerifying(true);
      setError("");
      setOtpError(false);

      try {
        console.log("[SignupOTP] verifyOtp() CALL type=signup", {
          email: email.trim(),
          codeLength: code.length,
          ts: Date.now(),
        });

        // Signup confirmation OTP uses type "signup" (from signUp / resend signup).
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code,
          type: "signup",
        });

        console.log("[SignupOTP] verifyOtp() RESPONSE", {
          error: verifyError?.message ?? null,
          hasSession: !!data?.session,
          ts: Date.now(),
        });

        if (verifyError) {
          console.error("[Signup] verifyOtp failed:", verifyError.message);
          setError(t("auth_signup_failed", { message: verifyError.message }));
          setOtpError(true);
          setVerifying(false);
          verifyInFlightRef.current = false;
          return;
        }

        setSuccess(true);
        setError("");
        console.log("[SignupOTP] signup verify success UI shown (auth_signup_success)", {
          hasSession: !!data?.session,
          userId: data?.session?.user?.id ?? null,
          ts: Date.now(),
        });

        let destination = "/dashboard";
        if (isPrimaryAdminEmail(resolveAuthEmail(data?.session?.user ?? null, email.trim()))) {
          destination = "/admin";
        }

        setTimeout(() => {
          console.log("[SignupOTP] navigate after verify success", { destination });
          router.replace(destination as any);
        }, 1800);
      } catch (err) {
        console.error("[SignupOTP] unexpected verify error", err);
        setError(t("auth_unexpected"));
        setVerifying(false);
        verifyInFlightRef.current = false;
      }
    },
    [email, router, t, verifying]
  );

  const handleResendCode = async () => {
    // Resend is MANUAL only — never called from useEffect or after signUp.
    if (resendInFlightRef.current || resending || countdown > 0) {
      console.log("[SignupOTP] resend() BLOCKED", {
        inFlight: resendInFlightRef.current,
        resending,
        countdown,
        ts: Date.now(),
      });
      return;
    }

    resendInFlightRef.current = true;
    setResending(true);
    setError("");
    setOtpError(false);

    try {
      console.log("[SignupOTP] resend() CALL type=signup (manual)", {
        email: email.trim(),
        ts: Date.now(),
      });

      // Same email family as initial signUp confirmation — NOT signInWithOtp / magic link.
      const { data, error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
      });

      console.log("[SignupOTP] resend() RESPONSE", {
        error: resendError?.message ?? null,
        data: data ?? null,
        ts: Date.now(),
      });

      if (resendError) {
        const wait =
          parseRateLimitSeconds(resendError.message) ?? SUPABASE_EMAIL_COOLDOWN_SEC;
        setCountdown(wait);
        setError(t("auth_signup_failed", { message: resendError.message }));
        return;
      }

      setCountdown(SUPABASE_EMAIL_COOLDOWN_SEC);
    } catch (err) {
      console.error("[SignupOTP] unexpected resend error", err);
      setError(t("auth_unexpected"));
    } finally {
      resendInFlightRef.current = false;
      setResending(false);
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
                      editable={!loading && !googleLoading}
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
                      editable={!loading && !googleLoading}
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
                      editable={!loading && !googleLoading}
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
                      editable={!loading && !googleLoading}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeIcon}
                      disabled={loading}
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
                  disabled={loading || googleLoading || registerInFlightRef.current}
                  style={[
                    styles.primaryButton,
                    (loading || googleLoading || registerInFlightRef.current) &&
                      styles.primaryButtonDisabled,
                  ]}
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
                  <Text style={styles.successTitle}>{t("auth_signup_success")}</Text>
                  <Text style={styles.successSubtitle}>{t("auth_signup_success_subtitle")}</Text>
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
                      {countdown > 0 || resending ? (
                        <View style={styles.resendTimer}>
                          <Feather name="refresh-cw" size={12} color={themeColors.textMuted} />
                          <Text style={styles.resendTimerText}>
                            {resending
                              ? t("auth_callback_verifying")
                              : t("auth_resend_in", { sec: countdown })}
                          </Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={handleResendCode}
                          style={styles.resendButton}
                          disabled={resending}
                        >
                          <Feather name="refresh-cw" size={12} color="#ea580c" style={styles.resendButtonIcon} />
                          <Text style={styles.resendButtonText}>{t("auth_resend_otp")}</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <TouchableOpacity
                      onPress={() => {
                        console.log("[SignupOTP] back to register form");
                        setStep("register");
                        setError("");
                        setOtpError(false);
                        setCountdown(0);
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
    primaryButtonDisabled: {
      opacity: 0.7,
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
