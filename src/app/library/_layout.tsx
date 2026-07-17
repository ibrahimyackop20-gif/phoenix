import React, { useEffect, useState } from "react";
import { StyleSheet, View, ActivityIndicator } from "react-native";
import { Slot, useRouter } from "expo-router";
import { supabase } from "../../../lib/supabaseClient";
import Navbar from "../../../components/Navbar";
import ScreenContent from "../../../components/ScreenContent";
import { useProfile } from "../../../components/ProfileProvider";
import { useAppTheme } from "../../../components/ThemeProvider";

export default function LibraryLayout() {
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const { role, profileReady } = useProfile();
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

        if (active) setSessionChecked(true);
      } catch (err) {
        console.error("Library layout auth check error:", err);
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

  if (!sessionChecked || !profileReady) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Navbar role={role || undefined} />
      <ScreenContent style={styles.main}>
        <Slot />
      </ScreenContent>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#09090b",
  },
  main: {
    flex: 1,
  },
});
