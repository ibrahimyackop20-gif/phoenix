console.log("STEP 1: File loaded");

import '../i18n';
import '../global.css';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, LogBox } from 'react-native';
import { Stack } from 'expo-router';
import * as ExpoSplashScreen from 'expo-splash-screen';
import SplashScreenComponent from '../../components/SplashScreen';
import SSOCatcher from '../../components/SSOCatcher';
import AuthProfileGuard from '../../components/AuthProfileGuard';
import NotificationRegistrar from '../../components/NotificationRegistrar';
import AppErrorBoundary from '../../components/AppErrorBoundary';
import { ThemeProvider, useAppTheme } from '../../components/ThemeProvider';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getMissingSupabaseEnv, isSupabaseConfigured, supabase } from '../../lib/supabaseClient';

try {
  LogBox.ignoreLogs([
    "SafeAreaView has been deprecated",
    "Non-serializable values were found in the navigation state",
  ]);
} catch {
  // ignore
}

try {
  ExpoSplashScreen.preventAutoHideAsync()
    .then(() => {
      console.log("ExpoSplashScreen.preventAutoHideAsync() - Success");
    })
    .catch((error) => {
      console.error("Startup Error (preventAutoHideAsync):", error);
    });
} catch (error) {
  console.error("Startup Error (preventAutoHideAsync sync):", error);
}

function RootLayoutContent() {
  console.log("RootLayoutContent rendering...");
  const { themeColors, isDark } = useAppTheme();
  const [appIsReady, setAppIsReady] = useState(false);
  const [splashFinished, setSplashFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      try {
        console.log("[Splash Startup Flow] Restoring user session...");
        const missing = getMissingSupabaseEnv();
        if (missing.length > 0) {
          console.error(
            "[Splash Startup Flow] Supabase env missing:",
            missing.join(", ")
          );
        } else if (isSupabaseConfigured()) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          console.log(
            user
              ? `[Splash Startup Flow] User authenticated: ${user.email}`
              : "[Splash Startup Flow] User is guest"
          );
        }
      } catch (e) {
        console.error("Startup Error (prepare):", e);
      } finally {
        if (!cancelled) setAppIsReady(true);
      }
    }

    prepare();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSplashFinish = () => {
    console.log("[Splash Startup Flow] Custom animation finished.");
    setSplashFinished(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SSOCatcher />
      <NotificationRegistrar ready={appIsReady && splashFinished} />
      <AuthProfileGuard />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>

      {(!appIsReady || !splashFinished) && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#09090b', zIndex: 99999 }]}>
          <StatusBar style="light" />
          {appIsReady && (
            <SplashScreenComponent
              onFinish={handleSplashFinish}
              onReadyToHideNative={async () => {
                try {
                  await ExpoSplashScreen.hideAsync();
                } catch (error) {
                  console.error("Startup Error (hideAsync):", error);
                }
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  console.log("STEP 2: RootLayout started");
  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <ThemeProvider>
          <AppErrorBoundary>
            <RootLayoutContent />
          </AppErrorBoundary>
        </ThemeProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
