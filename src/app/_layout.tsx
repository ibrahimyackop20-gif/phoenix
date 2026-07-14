console.log("STEP 1: File loaded");

import '../i18n';
import '../global.css';
// app/_layout.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ExpoSplashScreen from 'expo-splash-screen';
import SplashScreenComponent from '../../components/SplashScreen';
import SSOCatcher from '../../components/SSOCatcher';
import AuthProfileGuard from '../../components/AuthProfileGuard';
import { ThemeProvider, useAppTheme } from '../../components/ThemeProvider';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabaseClient';

// Prevent native splash screen from auto-hiding
console.log("ExpoSplashScreen.preventAutoHideAsync() - Accessing...");
try {
  ExpoSplashScreen.preventAutoHideAsync()
    .then(() => {
      console.log("ExpoSplashScreen.preventAutoHideAsync() - Success");
    })
    .catch((error) => {
      console.error("Startup Error:", error);
    });
} catch (error) {
  console.error("Startup Error:", error);
}

function RootLayoutContent() {
  console.log("RootLayoutContent rendering...");
  const { themeColors, isDark } = useAppTheme();
  const [appIsReady, setAppIsReady] = useState(false);
  const [splashFinished, setSplashFinished] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        console.log("[Splash Startup Flow] Restoring user session...");
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          console.log("[Splash Startup Flow] User authenticated:", user.email);
        } else {
          console.log("[Splash Startup Flow] User is guest");
        }
      } catch (e) {
        console.error("Startup Error:", e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  useEffect(() => {
    console.log("STEP 6: Layout rendered");
  });

  const handleSplashFinish = () => {
    console.log("[Splash Startup Flow] Custom animation finished. Splash status updated.");
    setSplashFinished(true);
  };

  console.log("STEP 5: Before returning JSX (Unconditional Stack layout with optional Splash overlay)");
  return (
    <View style={{ flex: 1, backgroundColor: themeColors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SSOCatcher />
      <AuthProfileGuard />
      
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="index"
          options={{ headerShown: false }}
        />
      </Stack>

      {/* Splash overlay covers the Stack absolutely until ready & finished */}
      {(!appIsReady || !splashFinished) && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#09090b', zIndex: 99999 }]}>
          <StatusBar style="light" />
          {appIsReady && (
            <SplashScreenComponent
              onFinish={handleSplashFinish}
              onReadyToHideNative={async () => {
                console.log("[Splash Startup Flow] Custom splash ready. Hiding native splash...");
                console.log("ExpoSplashScreen.hideAsync() - Accessing...");
                try {
                  await ExpoSplashScreen.hideAsync();
                  console.log("ExpoSplashScreen.hideAsync() - Success");
                } catch (error) {
                  console.error("Startup Error:", error);
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
  console.log("STEP 3: Before providers");
  const result = (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
  console.log("STEP 4: After providers");
  return result;
}