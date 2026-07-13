import React, { useEffect, useState } from "react";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import { Slot, useRouter } from "expo-router";
import { supabase } from "../../../lib/supabaseClient";
import Navbar from "../../../components/Navbar";
import ProfileProvider from "../../../components/ProfileProvider";
import CartProvider from "../../../components/CartProvider";
import NotificationProvider from "../../../components/NotificationProvider";
import ChatProvider from "../../../components/ChatProvider";

import { useAppTheme } from "../../../components/ThemeProvider";

export default function DashboardLayout() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const { themeColors } = useAppTheme();

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          if (active) {
            router.replace("/auth/login" as any);
          }
          return;
        }

        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name, role, avatar_url, balance")
          .eq("id", session.user.id)
          .maybeSingle();

        if (active) {
          setProfile(profileData);
          setLoading(false);
        }
      } catch (err) {
        console.error("Layout session check error:", err);
        if (active) {
          router.replace("/auth/login" as any);
        }
      }
    };

    checkSession();

    return () => {
      active = false;
    };
  }, [router]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <ProfileProvider
      initialName={profile?.full_name || ""}
      initialAvatar={profile?.avatar_url || null}
      initialRole={profile?.role || "student"}
      initialBalance={profile?.balance || 0}
    >
      <CartProvider>
        <NotificationProvider>
          <ChatProvider>
            <View style={[styles.container, { backgroundColor: themeColors.background }]}>
              <Navbar role={profile?.role} />
              <View style={styles.main}>
                <Slot />
              </View>
            </View>
          </ChatProvider>
        </NotificationProvider>
      </CartProvider>
    </ProfileProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#09090b", // zinc-950
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#09090b", // zinc-950
  },
  main: {
    flex: 1,
  },
});
