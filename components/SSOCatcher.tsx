import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { supabase, centralSupabase } from "../lib/supabaseClient";
import {
  completeGoogleAuthFromUrl,
  getPostGoogleAuthDestination,
  isGoogleAuthCallbackUrl,
} from "../lib/googleAuth";
import { markPostAuthNavigation } from "../lib/postAuthNavigation";
import { Feather, Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";

let initialUrlProcessed = false;

/**
 * SSOCatcher (React Native)
 * - Listens for incoming deep links containing Supabase auth tokens (access_token & refresh_token)
 * - Authenticates the central client, registers the user locally, and syncs profiles
 * - Redirects to `/dashboard` upon completion
 */
export default function SSOCatcher() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isProcessing = useRef(false);

  useEffect(() => {
    const handleUrl = async (url: string) => {
      try {
        console.log("🔗 SSOCatcher: Incoming URL received:", url);

        // Google OAuth: AuthSession may establish the session, but deep-link
        // reopen remounts the tree and drops login.tsx router.replace — navigate here.
        if (isGoogleAuthCallbackUrl(url)) {
          if (isProcessing.current) {
            console.log("[SSOCatcher][NAV] Google callback already processing — skip duplicate");
            return;
          }
          isProcessing.current = true;
          setLoading(true);
          setError(null);
          try {
            console.log("[SSOCatcher][NAV] Google callback received", { url });
            const result = await completeGoogleAuthFromUrl(url);
            if (result.status !== "success" || !result.session) {
              // AuthSession may already have exchanged the code — use current session.
              const {
                data: { session: existing },
              } = await supabase.auth.getSession();
              if (existing) {
                const target = getPostGoogleAuthDestination(existing);
                console.log("[SSOCatcher][NAV] session already present after Google URL", {
                  email: existing.user.email,
                  navigationTarget: target,
                  authState: "authenticated",
                });
                markPostAuthNavigation(target);
                router.replace(target as any);
                console.log("[SSOCatcher][NAV] final screen rendered →", target);
                return;
              }
              console.warn("[SSOCatcher][NAV] Google callback failed", result.message);
              setError(result.message || "فشل تسجيل الدخول عبر Google");
              return;
            }
            const target = getPostGoogleAuthDestination(result.session);
            console.log("[SSOCatcher][NAV] session established", {
              email: result.session.user.email,
              navigationTarget: target,
              authState: "authenticated",
            });
            markPostAuthNavigation(target);
            router.replace(target as any);
            console.log("[SSOCatcher][NAV] final screen rendered →", target);
          } catch (err) {
            console.error("[SSOCatcher] Google callback error:", err);
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setLoading(false);
            isProcessing.current = false;
          }
          return;
        }

        const parsed = Linking.parse(url);
        let accessToken = parsed.queryParams?.access_token as string | undefined;
        let refreshToken = parsed.queryParams?.refresh_token as string | undefined;

        if (!accessToken || !refreshToken) {
          const hashIndex = url.indexOf("#");
          if (hashIndex !== -1) {
            const hash = url.substring(hashIndex + 1);
            const params = new URLSearchParams(hash);
            accessToken = params.get("access_token") || undefined;
            refreshToken = params.get("refresh_token") || undefined;
          }
        }

        if (accessToken && refreshToken) {
          if (isProcessing.current) {
            console.log("🔑 SSOCatcher: SSO catch already in progress, ignoring duplicate call...");
            return;
          }

          const {
            data: { session: localSession },
          } = await supabase.auth.getSession();

          if (localSession) {
            router.replace("/dashboard" as any);
            return;
          }

          isProcessing.current = true;
          setLoading(true);
          setError(null);

          try {
            const { data: centralData, error: centralError } =
              await centralSupabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

            if (centralError) {
              throw new Error(`Central Auth Error: ${centralError.message}`);
            }

            const user = centralData?.user;
            if (!user) {
              throw new Error("No user details found in Central Auth session.");
            }

            const email = user.email;
            const fullName =
              user.user_metadata?.full_name ||
              user.user_metadata?.name ||
              email ||
              "";

            if (!email) {
              throw new Error("User email is missing from Central Auth metadata.");
            }

            const webUrl = process.env.EXPO_PUBLIC_WEB_URL || "";
            if (!webUrl) {
              throw new Error(
                "EXPO_PUBLIC_WEB_URL is not configured in .env. Cannot verify local session."
              );
            }

            const response = await fetch(`${webUrl}/api/auth/register-profile`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email,
                fullName,
                centralId: user.id,
              }),
            });

            if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              throw new Error(errData.error || "Failed to register profile locally.");
            }

            const result = await response.json();
            const { token_hash } = result;

            if (!token_hash) {
              throw new Error("Local sync succeeded but no login token was returned.");
            }

            const { error: localVerifyError } = await supabase.auth.verifyOtp({
              token_hash,
              type: "magiclink",
            });

            if (localVerifyError) {
              throw new Error(
                `Local Auth Verification Error: ${localVerifyError.message}`
              );
            }

            router.replace("/dashboard" as any);
          } catch (err) {
            console.error("❌ SSO catching failed:", err);
            const message = err instanceof Error ? err.message : String(err);

            const isInvalidLink =
              message.includes("invalid or has expired") || message.includes("403");
            try {
              const {
                data: { session },
              } = await supabase.auth.getSession();

              if (isInvalidLink && session) {
                router.replace("/dashboard" as any);
              } else {
                setError(message || "حدث خطأ أثناء تسجيل الدخول الموحد");
              }
            } catch {
              setError(message || "حدث خطأ أثناء تسجيل الدخول الموحد");
            }
          } finally {
            setLoading(false);
            isProcessing.current = false;
          }
        }
      } catch (outerErr) {
        console.error("❌ SSOCatcher handleUrl fatal:", outerErr);
        setLoading(false);
        isProcessing.current = false;
      }
    };

    Linking.getInitialURL()
      .then((url) => {
        if (url && !initialUrlProcessed) {
          initialUrlProcessed = true;
          handleUrl(url);
        }
      })
      .catch((err) => {
        console.warn("SSOCatcher getInitialURL failed:", err);
      });

    const subscription = Linking.addEventListener("url", (event) => {
      if (event.url) {
        handleUrl(event.url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  if (!loading && !error) return null;

  return (
    <Modal transparent animationType="fade" visible={true}>
      <View style={styles.overlay}>
        <GlassView style={styles.glassCard} glassEffectStyle="regular" colorScheme="dark">
          <View style={styles.contentContainer}>
            {error ? (
              <>
                <View style={styles.errorIconWrapper}>
                  <Feather name="alert-triangle" size={32} color="#ef4444" />
                </View>
                <Text style={styles.titleText}>فشل تسجيل الدخول</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setError(null);
                    console.log("[Navigation] Component: SSOCatcher (Retry), Current Route: Error Modal, Target Route: /auth/login, Auth State: Guest. Executing replace...");
                    router.replace("/auth/login" as any);
                    console.log("[Navigation] Component: SSOCatcher (Retry), Current Route: Error Modal, Target Route: /auth/login, Done.");
                  }}
                  style={styles.retryButton}
                >
                  <Text style={styles.retryButtonText}>
                    العودة لتسجيل الدخول
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.spinnerWrapper}>
                  <ActivityIndicator size="large" color="#f97316" />
                  <Ionicons
                    name="sparkles"
                    size={20}
                    color="#f97316"
                    style={styles.sparklesIcon}
                  />
                </View>
                <Text style={styles.titleText}>جاري التحقق من الهوية</Text>
                <Text style={styles.infoText}>
                  يرجى الانتظار، جاري تهيئة حسابك الآمن للطباعة...
                </Text>
              </>
            )}
          </View>
        </GlassView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(9, 9, 11, 0.85)", // Zinc 950 base
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
  contentContainer: {
    padding: 32,
    alignItems: "center",
  },
  errorIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
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
  titleText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f4f4f5", // Foreground
    marginBottom: 8,
    textAlign: "center",
  },
  infoText: {
    fontSize: 14,
    color: "#a1a1aa", // Muted
    textAlign: "center",
    lineHeight: 20,
  },
  errorText: {
    fontSize: 14,
    color: "#a1a1aa",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#f4f4f5",
  },
});
