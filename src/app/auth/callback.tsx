import React, { useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabaseClient";
import { Feather, Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";

/**
 * Auth Callback Route (React Native)
 * - Intercepts incoming code verification parameters
 * - Exchanges verification code for active session
 * - Redirects to /dashboard on success, or /auth/login on failure
 */
export default function AuthCallback() {
  const router = useRouter();
  const { code, next = "/dashboard" } = useLocalSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      if (code) {
        try {
          console.log("🔑 AuthCallback: Exchanging code for session...");
          const { error } = await supabase.auth.exchangeCodeForSession(code as string);
          
          if (!error) {
            console.log("✅ Session exchange successful. Redirecting to:", next);
            console.log(`[Navigation] Component: AuthCallback, Current Route: /auth/callback, Target Route: ${next}, Auth State: Authenticated. Executing replace...`);
            router.replace(next as any);
            console.log(`[Navigation] Component: AuthCallback, Current Route: /auth/callback, Target Route: ${next}, Done.`);
          } else {
            console.error("❌ Session exchange error:", error.message);
            console.log(`[Navigation] Component: AuthCallback, Current Route: /auth/callback, Target Route: /auth/login, Auth State: Error. Executing replace...`);
            router.replace("/auth/login" as any);
            console.log(`[Navigation] Component: AuthCallback, Current Route: /auth/callback, Target Route: /auth/login, Done.`);
          }
        } catch (err) {
          console.error("❌ AuthCallback exception:", err);
          console.log(`[Navigation] Component: AuthCallback, Current Route: /auth/callback, Target Route: /auth/login, Auth State: Exception. Executing replace...`);
          router.replace("/auth/login" as any);
          console.log(`[Navigation] Component: AuthCallback, Current Route: /auth/callback, Target Route: /auth/login, Done.`);
        }
      } else {
        console.warn("⚠️ AuthCallback: No code found in parameters. Redirecting to login...");
        console.log(`[Navigation] Component: AuthCallback, Current Route: /auth/callback, Target Route: /auth/login, Auth State: No Code. Executing replace...`);
        router.replace("/auth/login" as any);
        console.log(`[Navigation] Component: AuthCallback, Current Route: /auth/callback, Target Route: /auth/login, Done.`);
      }
    };

    handleCallback();
  }, [code, next, router]);

  return (
    <View style={styles.overlay}>
      <GlassView style={styles.glassCard} glassEffectStyle="regular" colorScheme="dark">
        <View style={styles.loadingContainer}>
          <View style={styles.spinnerWrapper}>
            <ActivityIndicator size="large" color="#f97316" />
            <Ionicons
              name="sparkles"
              size={20}
              color="#f97316"
              style={styles.sparklesIcon}
            />
          </View>
          <Text style={styles.loadingTitle}>جاري التحقق من الرمز</Text>
          <Text style={styles.loadingText}>
            يرجى الانتظار، جاري تهيئة حسابك الآمن للطباعة...
          </Text>
        </View>
      </GlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(9, 9, 11, 0.95)", // Zinc 950 base
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  glassCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
    maxWidth: 320,
    width: "100%",
  },
  loadingContainer: {
    padding: 32,
    alignItems: "center",
  },
  spinnerWrapper: {
    position: "relative",
    marginBottom: 24,
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    height: 64,
  },
  sparklesIcon: {
    position: "absolute",
    alignSelf: "center",
  },
  loadingTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f4f4f5", // Foreground
    marginBottom: 8,
    textAlign: "center",
  },
  loadingText: {
    fontSize: 14,
    color: "#a1a1aa", // Muted
    textAlign: "center",
    lineHeight: 20,
  },
});
