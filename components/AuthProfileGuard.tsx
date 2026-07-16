import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  Modal,
} from "react-native";
import { usePathname, useRouter } from "expo-router";
import { supabase, centralSupabase } from "../lib/supabaseClient";
import { Feather, Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";

const checkPath = (p: string, prefix: string) => p === prefix || p.startsWith(prefix + "/");

/**
 * Global auth guard (React Native)
 * - Monitors auth state changes (local and central)
 * - Syncs sessions and verifies local profiles
 * - Enforces page authentication/authorization redirections
 * - Renders a gorgeous glassmorphic loading screen
 */
export default function AuthProfileGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isSyncing = useRef(false);

  const isMountedRef = useRef(true);
  const pathnameRef = useRef(pathname);

  // Sync refs and manage mount/unmount tracking
  useEffect(() => {
    pathnameRef.current = pathname;
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, [pathname]);

  const checkAuth = useCallback(async (path: string) => {
    try {
      // 1. Get Central session
      const {
        data: { session: centralSession },
        error: centralError,
      } = await centralSupabase.auth.getSession();

      // 2. Get Local session
      const {
        data: { session: localSession },
        error: localError,
      } = await supabase.auth.getSession();

      if (!isMountedRef.current) return;

      if (centralError || localError) {
        console.error("🔑 AuthProfileGuard session check error:", centralError || localError);
      }

      const centralUser = centralSession?.user;
      const localUser = localSession?.user;
      const hasSession = !!(centralUser || localUser);

      setIsAuthenticated(hasSession);

      const isProtected =
        checkPath(path, "/dashboard") ||
        checkPath(path, "/admin") ||
        checkPath(path, "/library");

      const isAuthPage = checkPath(path, "/auth");

      if (centralSession) {
        if (!localSession) {
          // Sync session
          if (isProtected || isAuthPage) {
            setLoading(true);
          }

          if (isSyncing.current) {
            console.log("🔑 AuthProfileGuard: Sync already in progress, skipping...");
            return;
          }
          isSyncing.current = true;

          console.log("🔑 AuthProfileGuard: Central session exists but no local session. Syncing...");
          
          const email = centralSession.user.email;
          const fullName =
            centralSession.user.user_metadata?.full_name ||
            centralSession.user.user_metadata?.name ||
            email ||
            "";

          const webUrl = process.env.EXPO_PUBLIC_WEB_URL || "";
          if (!webUrl) {
            console.warn("⚠️ EXPO_PUBLIC_WEB_URL is not configured in .env. Skipping profile sync fetch.");
            isSyncing.current = false;
            setLoading(false);
            return;
          }

          const response = await fetch(`${webUrl}/api/auth/register-profile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              fullName,
              centralId: centralSession.user.id,
            }),
          });

          if (response.ok && isMountedRef.current) {
            const result = await response.json();
            const { token_hash } = result;

            if (token_hash) {
              const { error: verifyError } = await supabase.auth.verifyOtp({
                token_hash,
                type: "magiclink",
              });

              if (!isMountedRef.current) return;

              if (!verifyError) {
                console.log("✅ AuthProfileGuard: Local session sync completed successfully.");
                if (isAuthPage) {
                  console.log(`[Navigation] Component: AuthProfileGuard, Current Route: ${path}, Target Route: /dashboard, Auth State: Authenticated (Local Sync). Executing replace...`);
                  router.replace("/dashboard" as any);
                  console.log(`[Navigation] Component: AuthProfileGuard, Current Route: ${path}, Target Route: /dashboard, Done.`);
                }
              } else {
                console.error("❌ AuthProfileGuard local verifyOtp failed:", verifyError.message);
                
                // Check if local session actually exists now
                const { data: { session: currentSession } } = await supabase.auth.getSession();
                if (!isMountedRef.current) return;

                if (currentSession) {
                  console.log("🔑 AuthProfileGuard: Local session already exists. Proceeding...");
                  if (isAuthPage) {
                    console.log(`[Navigation] Component: AuthProfileGuard, Current Route: ${path}, Target Route: /dashboard, Auth State: Authenticated (Local Session Exists). Executing replace...`);
                    router.replace("/dashboard" as any);
                    console.log(`[Navigation] Component: AuthProfileGuard, Current Route: ${path}, Target Route: /dashboard, Done.`);
                  }
                } else {
                  isSyncing.current = false;
                }
              }
            } else {
              isSyncing.current = false;
            }
          } else {
            if (isMountedRef.current) {
              console.error("❌ AuthProfileGuard register-profile sync failed:", response.statusText);
              isSyncing.current = false;
            }
          }
        } else {
          // Both Central and Local sessions exist
          const user = localSession.user;
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();

          if (!isMountedRef.current) return;

          if (!profile) {
            const meta = user.user_metadata || {};
            await supabase.from("profiles").upsert(
              {
                id: user.id,
                full_name: meta.full_name || meta.name || user.email || "",
                phone_number: meta.phone_number || meta.phone || "",
              },
              { onConflict: "id" }
            );
          }

          if (isAuthPage) {
            console.log(`[Navigation] Component: AuthProfileGuard, Current Route: ${path}, Target Route: /dashboard, Auth State: Authenticated (Session exists). Executing replace...`);
            router.replace("/dashboard" as any);
            console.log(`[Navigation] Component: AuthProfileGuard, Current Route: ${path}, Target Route: /dashboard, Done.`);
          }
        }
      } else {
        // No Central session exists
        if (isProtected) {
          if (!localSession) {
            console.log("🔒 AuthProfileGuard: No active session. Redirecting to login...");
            console.log(`[Navigation] Component: AuthProfileGuard, Current Route: ${path}, Target Route: /auth/login, Auth State: Guest. Executing replace...`);
            router.replace("/auth/login" as any);
            console.log(`[Navigation] Component: AuthProfileGuard, Current Route: ${path}, Target Route: /auth/login, Done.`);
          } else {
            // Ensure profile exists for local session
            const user = localSession.user;
            const { data: profile } = await supabase
              .from("profiles")
              .select("id")
              .eq("id", user.id)
              .maybeSingle();

            if (!isMountedRef.current) return;

            if (!profile) {
              const meta = user.user_metadata || {};
              await supabase.from("profiles").upsert(
                {
                  id: user.id,
                  full_name: meta.full_name || meta.name || user.email || "",
                  phone_number: meta.phone_number || meta.phone || "",
                },
                { onConflict: "id" }
              );
            }
          }
        }
      }
    } catch (err) {
      console.error("❌ AuthProfileGuard error:", err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [router]);

  // Run route check on pathname change
  useEffect(() => {
    checkAuth(pathname);
  }, [pathname, checkAuth]);

  // Setup event listeners exactly once on mount
  useEffect(() => {
    let centralSub: { unsubscribe: () => void } | null = null;
    let localSub: { unsubscribe: () => void } | null = null;

    try {
      const central = centralSupabase.auth.onAuthStateChange((event: any) => {
        if (event === "INITIAL_SESSION") return;
        checkAuth(pathnameRef.current).catch((err) => {
          console.error("❌ AuthProfileGuard central auth check error:", err);
        });
      });
      centralSub = central.data.subscription;

      const local = supabase.auth.onAuthStateChange((event: any) => {
        if (event === "INITIAL_SESSION") return;
        checkAuth(pathnameRef.current).catch((err) => {
          console.error("❌ AuthProfileGuard local auth check error:", err);
        });
      });
      localSub = local.data.subscription;
    } catch (err) {
      console.error("❌ AuthProfileGuard listener setup failed:", err);
      if (isMountedRef.current) setLoading(false);
    }

    return () => {
      try {
        centralSub?.unsubscribe();
        localSub?.unsubscribe();
      } catch {
        // ignore
      }
    };
  }, [checkAuth]);

  const isProtected =
    checkPath(pathname, "/dashboard") ||
    checkPath(pathname, "/admin") ||
    checkPath(pathname, "/library");

  const isAuthPage = checkPath(pathname, "/auth");

  // Show premium loader on protected routes or auth routes when loading
  if (loading && (isProtected || isAuthPage) && !isAuthenticated) {
    return (
      <Modal transparent animationType="fade" visible={true}>
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
              <Text style={styles.loadingTitle}>جاري التحقق من الهوية</Text>
              <Text style={styles.loadingText}>
                يرجى الانتظار، جاري تهيئة حسابك الآمن للطباعة...
              </Text>
            </View>
          </GlassView>
        </View>
      </Modal>
    );
  }

  return null;
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
