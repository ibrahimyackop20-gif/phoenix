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
import { useRouter, Link } from "expo-router";
import { supabase } from "@/lib/supabaseClient";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

type PageState = "login" | "otp" | "success";

export default function LoginPage() {
  const router = useRouter();
  
  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // OTP / Forgot password state
  const [pageState, setPageState] = useState<PageState>("login");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [verifying, setVerifying] = useState(false);
  
  const otpRefs = useRef<any>([]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("يرجى ملء جميع الحقول المطلوبة");
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
        setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
        setLoading(false);
        return;
      }

      const userId = data.user?.id;
      let destination = "/dashboard";
      if (userId) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();
        if (profileData?.role === "admin") {
          destination = "/admin";
        }
      }

      console.log(`[Navigation] Component: Login, Current Route: /auth/login, Target Route: ${destination}, Auth State: Authenticated (${data.user?.email}). Executing replace...`);
      router.replace(destination as any);
      console.log(`[Navigation] Component: Login, Current Route: /auth/login, Target Route: ${destination}, Done.`);
    } catch (err) {
      console.error(err);
      setError("حدث خطأ ما أثناء تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("أدخل بريدك الإلكتروني أولاً");
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
      setError("فشل إرسال كود التحقق. الرجاء المحاولة مرة أخرى.");
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
      setError("أدخل رمز التحقق المكون من 6 أرقام");
      return;
    }
    if (newPassword.length < 6) {
      setError("يجب أن تكون كلمة المرور 6 أحرف على الأقل");
      return;
    }

    setVerifying(true);
    setError("");

    try {
      // 1. Verify OTP token
      const { error: otpError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode,
        type: "recovery",
      });

      if (otpError) {
        setError("رمز التحقق غير صحيح أو منتهي الصلاحية");
        setVerifying(false);
        return;
      }

      // 2. Update user credentials with new password
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
      setError("فشل تحديث كلمة المرور. الرجاء المحاولة مجدداً.");
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
          {/* ── LOGIN STATE ─────────────────────── */}
          {pageState === "login" && (
            <View style={styles.cardWrapper}>
              <View style={styles.header}>
                <Text style={styles.title}>تسجيل الدخول</Text>
                <Text style={styles.subtitle}>أدخل بياناتك للوصول إلى حسابك</Text>
              </View>

              <View style={styles.glassCard}>
                {error ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

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

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>كلمة المرور</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="lock" size={16} color="#71717a" style={styles.inputIcon} />
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      placeholder="••••••••"
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
                  onPress={handleLogin}
                  disabled={loading}
                  style={styles.primaryButton}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <View style={styles.buttonInner}>
                      <Feather name="log-in" size={16} color="#ffffff" style={styles.buttonIcon} />
                      <Text style={styles.buttonText}>تسجيل الدخول</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleForgotPassword}
                  disabled={sendingReset}
                  style={styles.forgotButton}
                >
                  <Text style={styles.forgotText}>
                    {sendingReset ? "جاري الإرسال..." : "نسيت كلمة المرور؟"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>ليس لديك حساب؟ </Text>
                <Link href={"/auth/signup" as any} asChild>
                  <TouchableOpacity>
                    <Text style={styles.linkText}>إنشاء حساب جديد</Text>
                  </TouchableOpacity>
                </Link>
              </View>
            </View>
          )}

          {/* ── OTP VERIFICATION STATE ──────────── */}
          {pageState === "otp" && (
            <View style={styles.cardWrapper}>
              <View style={styles.header}>
                <View style={styles.keyIconBadge}>
                  <Feather name="key" size={24} color="#ffffff" />
                </View>
                <Text style={styles.title}>إعادة تعيين كلمة المرور</Text>
                <Text style={styles.subtitle}>
                  تم إرسال رمز التحقق إلى{" "}
                  <Text style={styles.emailHighlight}>{email}</Text>
                </Text>
              </View>

              <View style={styles.glassCard}>
                {error ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {/* OTP Input Boxes */}
                <View style={styles.inputGroup}>
                  <Text style={styles.otpLabel}>رمز التحقق (6 أرقام)</Text>
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
                        placeholderTextColor="#71717a"
                      />
                    ))}
                  </View>
                </View>

                {/* New Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>كلمة المرور الجديدة</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="lock" size={16} color="#71717a" style={styles.inputIcon} />
                    <TextInput
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPassword}
                      autoCapitalize="none"
                      placeholder="••••••••"
                      placeholderTextColor="#71717a"
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
                        color="#71717a"
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
                      <Text style={styles.buttonText}>تحديث كلمة المرور</Text>
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
                  <Feather name="arrow-right" size={14} color="#71717a" style={styles.backButtonIcon} />
                  <Text style={styles.backButtonText}>العودة لتسجيل الدخول</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── SUCCESS STATE ──────────────────── */}
          {pageState === "success" && (
            <View style={[styles.glassCard, styles.successCard]}>
              <View style={styles.successBadge}>
                <Feather name="check-circle" size={48} color="#22c55e" />
              </View>
              <Text style={styles.successTitle}>تم تحديث كلمة المرور بنجاح!</Text>
              <Text style={styles.successSubtitle}>
                يمكنك الدخول الآن بكلمة المرور الجديدة
              </Text>
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
                  <Text style={styles.buttonText}>تسجيل الدخول</Text>
                </View>
              </TouchableOpacity>
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
    color: "#71717a",
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
    color: "#f4f4f5",
    fontWeight: "600",
  },
  otpLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#71717a",
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
    borderColor: "#27272a",
    backgroundColor: "#09090b",
    color: "#f4f4f5",
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
    color: "#71717a",
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
    color: "#f4f4f5",
    marginBottom: 8,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 13,
    color: "#71717a",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 18,
  },
});
