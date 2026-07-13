import '../i18n';
import '../global.css';
// app/_layout.tsx
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as ExpoSplashScreen from 'expo-splash-screen';
import SplashScreenComponent from '../../components/SplashScreen';
import SSOCatcher from '../../components/SSOCatcher';
import AuthProfileGuard from '../../components/AuthProfileGuard';
import { ThemeProvider, useAppTheme } from '../../components/ThemeProvider';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../../lib/supabaseClient';

// Prevent native splash screen from auto-hiding
ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutContent() {
  const { themeColors, isDark } = useAppTheme();
  const router = useRouter();
  const [appIsReady, setAppIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [splashFinished, setSplashFinished] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        console.log("[Splash Startup Flow] Restoring user session...");
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          console.log("[Splash Startup Flow] User authenticated:", user.email);
          setIsAuthenticated(true);
        } else {
          console.log("[Splash Startup Flow] User is guest");
          setIsAuthenticated(false);
        }
      } catch (e) {
        console.warn("[Splash Startup Flow] Session restore error:", e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  const handleSplashFinish = () => {
    console.log("[Splash Startup Flow] Custom animation finished. Navigating...");
    setSplashFinished(true);
    // Use setImmediate/setTimeout to ensure Stack router has mounted before replacing route
    setTimeout(() => {
      if (isAuthenticated) {
        router.replace('/dashboard');
      } else {
        router.replace('/');
      }
    }, 0);
  };

  if (!appIsReady || !splashFinished) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090b' }}>
        <StatusBar style="light" />
        {appIsReady && (
          <SplashScreenComponent
            onFinish={handleSplashFinish}
            onReadyToHideNative={async () => {
              console.log("[Splash Startup Flow] Custom splash ready. Hiding native splash...");
              await ExpoSplashScreen.hideAsync().catch(() => {});
            }}
          />
        )}
      </View>
    );
  }

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
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}