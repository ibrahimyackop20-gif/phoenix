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
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabaseClient";
import { AuthChangeEvent } from "@supabase/supabase-js";
import { Feather, Ionicons } from "@expo/vector-icons";

export default function ResetPasswordScreen() {
  const router = useRouter();
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
      setError("يجب أن تكون كلمة المرور 6 أحرف على الأقل");
      return;
    }

    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
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
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Feather name="key" size={32} color="#ffffff" />
            </View>
            <Text style={styles.titleText}>إعادة تعيين كلمة المرور</Text>
            <Text style={styles.subtitleText}>أدخل كلمة المرور الجديدة</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {success ? (
              <View style={styles.successContainer}>
                <Ionicons name="checkmark-circle" size={48} color="#10b981" />
                <Text style={styles.successTitle}>تم التغيير بنجاح ✓</Text>
                <Text style={styles.successText}>جاري التوجيه للوحة التحكم...</Text>
              </View>
            ) : (
              <View style={styles.form}>
                {error ? (
                  <View style={styles.errorBadge}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {/* Password field */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>كلمة المرور الجديدة</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="lock" size={18} color="#71717a" style={styles.fieldIcon} />
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      placeholder="••••••••"
                      placeholderTextColor="#71717a"
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
                        color="#71717a"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Confirm Password field */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>تأكيد كلمة المرور</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="lock" size={18} color="#71717a" style={styles.fieldIcon} />
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      placeholder="••••••••"
                      placeholderTextColor="#71717a"
                      style={styles.textInput}
                      textAlign="right"
                    />
                  </View>
                </View>

                {/* Submit button */}
                <TouchableOpacity
                  onPress={handleReset}
                  disabled={loading}
                  style={styles.submitButton}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <View style={styles.buttonInner}>
                      <Text style={styles.submitButtonText}>تعيين كلمة المرور الجديدة</Text>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#09090b", // zinc-950
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
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
    color: "#f97316", // Orange accent color
    marginBottom: 8,
  },
  subtitleText: {
    fontSize: 14,
    color: "#71717a",
  },
  card: {
    backgroundColor: "#18181b", // zinc-900
    borderWidth: 1,
    borderColor: "#27272a", // zinc-800
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
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
    color: "#f4f4f5",
    marginTop: 12,
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: "#71717a",
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
    color: "#71717a",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#09090b", // zinc-950
    borderWidth: 1.5,
    borderColor: "#27272a",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  fieldIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: "#f4f4f5",
    fontSize: 14,
    height: "100%",
  },
  eyeButton: {
    padding: 8,
  },
  submitButton: {
    backgroundColor: "#ea580c",
    borderRadius: 12,
    height: 48,
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
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
  },
  buttonIcon: {
    marginLeft: 8,
  },
});
