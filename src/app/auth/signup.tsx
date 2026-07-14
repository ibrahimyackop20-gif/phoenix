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
import OtpInput from "@/../components/OtpInput";
import { Feather, Ionicons } from "@expo/vector-icons";

type Step = "register" | "verify";

export default function SignupPage() {
  const router = useRouter();

  // Registration form fields
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Flow control states
  const [step, setStep] = useState<Step>("register");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [otpError, setOtpError] = useState(false);
  const [success, setSuccess] = useState(false);

  // Resend Countdown
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Submit registration form
  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setError("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    if (password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { error: signUpError } = await supabase.auth.signUp({
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
        setError(
          signUpError.message === "User already registered"
            ? "هذا البريد الإلكتروني مسجل مسبقاً"
            : "حدث خطأ أثناء التسجيل، يرجى المحاولة مرة أخرى"
        );
        setLoading(false);
        return;
      }

      // Move to verification step and start timer
      setStep("verify");
      setCountdown(60);
    } catch (err) {
      console.error(err);
      setError("حدث خطأ غير متوقع أثناء إنشاء الحساب");
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP
  const handleVerifyOtp = useCallback(
    async (code: string) => {
      setVerifying(true);
      setError("");
      setOtpError(false);

      try {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code,
          type: "signup",
        });

        if (verifyError) {
          setError("الكود الذي أدخلته غير صحيح");
          setOtpError(true);
          setVerifying(false);
          return;
        }

        // Verification successful
        setSuccess(true);
        setError("");

        const destination = email.trim() === "ibrahimyackop20@gmail.com"
          ? "/admin"
          : "/dashboard";

        setTimeout(() => {
          console.log(`[Navigation] Component: Signup, Current Route: /auth/signup, Target Route: ${destination}, Auth State: Authenticated (${email}). Executing replace...`);
          router.replace(destination as any);
          console.log(`[Navigation] Component: Signup, Current Route: /auth/signup, Target Route: ${destination}, Done.`);
        }, 1800);
      } catch (err) {
        console.error(err);
        setError("حدث خطأ أثناء التحقق من الكود");
        setVerifying(false);
      }
    },
    [email, router]
  );

  // Resend OTP
  const handleResendCode = async () => {
    setError("");
    setOtpError(false);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
      });

      if (resendError) {
        setError("فشل إعادة إرسال الكود. يرجى المحاولة لاحقاً");
        return;
      }

      setCountdown(60);
    } catch (err) {
      console.error(err);
      setError("فشل إعادة إرسال الكود.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.keyboardView}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          {/* ── REGISTRATION FORM ──────────────────────────── */}
          {step === "register" && (
            <View style={styles.cardWrapper}>
              <View style={styles.header}>
                <Text style={styles.title}>إنشاء حساب جديد</Text>
                <Text style={styles.subtitle}>سجّل الآن للبدء بطلبات الطباعة</Text>
              </View>

              <View style={styles.glassCard}>
                {error ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {/* Full Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>الاسم الكامل</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="user" size={16} color="#71717a" style={styles.inputIcon} />
                    <TextInput
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder="محمد أحمد"
                      placeholderTextColor="#71717a"
                      style={styles.textInput}
                      textAlign="right"
                    />
                  </View>
                </View>

                {/* Phone */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>رقم الهاتف</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="phone" size={16} color="#71717a" style={styles.inputIcon} />
                    <TextInput
                      value={phoneNumber}
                      onChangeText={setPhoneNumber}
                      keyboardType="phone-pad"
                      placeholder="+249912345678"
                      placeholderTextColor="#71717a"
                      style={styles.textInput}
                      textAlign="left"
                    />
                  </View>
                </View>

                {/* Email */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>البريد الإلكتروني</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="mail" size={16} color="#71717a" style={styles.inputIcon} />
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholder="example@email.com"
                      placeholderTextColor="#71717a"
                      style={styles.textInput}
                      textAlign="left"
                    />
                  </View>
                </View>

                {/* Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>كلمة المرور</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="lock" size={16} color="#71717a" style={styles.inputIcon} />
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      placeholder="6 أحرف على الأقل"
                      placeholderTextColor="#71717a"
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
                        color="#71717a"
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
                      <Text style={styles.buttonText}>إنشاء حساب</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>لديك حساب بالفعل؟ </Text>
                <Link href={"/auth/login" as any} asChild>
                  <TouchableOpacity>
                    <Text style={styles.linkText}>تسجيل الدخول</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          )}

          {/* ── OTP VERIFICATION OVERLAY ───────────────────── */}
          {step === "verify" && (
            <View style={styles.cardWrapper}>
              {success ? (
                <View style={[styles.glassCard, styles.successCard]}>
                  <View style={styles.successBadge}>
                    <Feather name="check-circle" size={48} color="#22c55e" />
                  </View>
                  <Text style={styles.successTitle}>تم التحقق بنجاح!</Text>
                  <Text style={styles.successSubtitle}>
                    جاري تحويلك إلى لوحة التحكم...
                  </Text>
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
                    <Text style={styles.title}>أدخل رمز التحقق</Text>
                    <Text style={styles.subtitle}>
                      تم إرسال كود مكون من 6 أرقام إلى
                    </Text>
                    <Text style={styles.emailHighlight}>{email}</Text>
                  </View>

                  <View style={styles.glassCard}>
                    {error ? (
                      <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    ) : null}

                    {/* OtpInput Component */}
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
                        <Text style={styles.verifyingText}>جاري التحقق...</Text>
                      </View>
                    )}

                    {/* Divider */}
                    <View style={styles.divider} />

                    {/* Resend options */}
                    <View style={styles.resendSection}>
                      <Text style={styles.resendLabel}>لم تستلم الكود؟</Text>
                      {countdown > 0 ? (
                        <View style={styles.resendTimer}>
                          <Feather name="refresh-cw" size={12} color="#71717a" />
                          <Text style={styles.resendTimerText}>
                            إعادة إرسال الكود بعد{" "}
                            <Text style={styles.timerHighlight}>{countdown}</Text> ثانية
                          </Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={handleResendCode}
                          style={styles.resendButton}
                        >
                          <Feather name="refresh-cw" size={12} color="#ea580c" style={styles.resendButtonIcon} />
                          <Text style={styles.resendButtonText}>إعادة إرسال الكود</Text>
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
                      <Feather name="arrow-right" size={14} color="#71717a" style={styles.backButtonIcon} />
                      <Text style={styles.backButtonText}>العودة للنموذج</Text>
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

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: "#09090b", // zinc 950 base
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
    color: "#f4f4f5", // foreground
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#71717a", // muted
    textAlign: "center",
  },
  glassCard: {
    backgroundColor: "#18181b", // zinc 900 base representation
    borderColor: "#27272a", // border representation
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
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
    color: "#71717a",
    marginBottom: 8,
    textAlign: "right",
  },
  inputWrapper: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#09090b",
    borderColor: "#27272a",
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
    color: "#f4f4f5",
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
    backgroundColor: "#ea580c", // primary base
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
    color: "#71717a",
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
    color: "#f4f4f5",
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
    color: "#71717a",
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: "#27272a",
    marginVertical: 16,
  },
  resendSection: {
    alignItems: "center",
    marginBottom: 8,
  },
  resendLabel: {
    fontSize: 12,
    color: "#71717a",
    marginBottom: 6,
  },
  resendTimer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
  resendTimerText: {
    fontSize: 12,
    color: "#71717a",
  },
  timerHighlight: {
    color: "#ea580c",
    fontWeight: "bold",
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
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "#27272a",
    borderWidth: 1,
    height: 48,
    width: "100%",
  },
  backButtonIcon: {
    marginLeft: 4,
  },
  backButtonText: {
    color: "#71717a",
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
    color: "#71717a",
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
