console.log("ThemeProvider.tsx file loading...");

import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'nativewind';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';

// Color palettes for light and dark modes
const lightColors = {
  background: '#ffffff',
  text: '#000000',
  primary: '#ea580c',
  secondary: '#f3f4f6',
  textMuted: '#6b7280',
  cardBg: '#ffffff',
  cardBorder: '#e5e7eb',
  inputBg: '#f9fafb',
  inputBorder: '#d1d5db',
  disabledBg: '#f3f4f6',
};

const darkColors = {
  background: '#111827',
  text: '#ffffff',
  primary: '#ea580c',
  secondary: '#1f2937',
  textMuted: '#9ca3af',
  cardBg: '#1f2937',
  cardBorder: '#374151',
  inputBg: '#374151',
  inputBorder: '#4b5563',
  disabledBg: '#111827',
};

/**
 * ThemeProvider loads persisted theme and language on startup.
 * It renders nothing until both are loaded to avoid flicker.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  console.log("Entering ThemeProvider");
  const { setColorScheme } = useColorScheme();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      console.log("ThemeProvider: Starting loadSettings...");
      try {
        // Restore theme
        console.log("AsyncStorage.getItem('theme') - Accessing...");
        const savedTheme = await AsyncStorage.getItem('theme');
        console.log("AsyncStorage.getItem('theme') - Result:", savedTheme);
        if (savedTheme === 'dark' || savedTheme === 'light') {
          setColorScheme(savedTheme);
        } else {
          setColorScheme('dark');
        }

        // Restore language
        console.log("AsyncStorage.getItem('language') - Accessing...");
        const savedLang = await AsyncStorage.getItem('language');
        console.log("AsyncStorage.getItem('language') - Result:", savedLang);
        if (savedLang === 'ar' || savedLang === 'en') {
          console.log("i18n.changeLanguage() - Starting conversion to:", savedLang);
          await i18n.changeLanguage(savedLang);
          console.log("i18n.changeLanguage() - Finished conversion.");
        }
      } catch (error) {
        console.error("Startup Error:", error);
      } finally {
        console.log("ThemeProvider: loadSettings completed.");
        setIsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      console.log("Provider initialized: ThemeProvider");
    }
  }, [isLoaded]);

  if (!isLoaded) {
    console.log("Leaving ThemeProvider (not loaded state)");
    return null;
  }

  console.log("Leaving ThemeProvider (loaded state)");
  return <>{children}</>;
}

export default ThemeProvider;

/**
 * Hook for consuming theme state from any screen.
 * Uses NativeWind's useColorScheme under the hood.
 */
export function useAppTheme() {
  console.log("useAppTheme() hook executed");
  try {
    const { colorScheme, setColorScheme } = useColorScheme();
    console.log("useColorScheme colorScheme:", colorScheme);

    const setTheme = async (newTheme: 'light' | 'dark') => {
      console.log("setTheme called with:", newTheme);
      setColorScheme(newTheme);
      try {
        console.log("setTheme: Saving theme to AsyncStorage...");
        await AsyncStorage.setItem('theme', newTheme);
        console.log("setTheme: Theme saved successfully.");
      } catch (error) {
        console.error("Startup Error:", error);
      }
    };

    const isDark = colorScheme === 'dark';
    const themeColors = isDark ? darkColors : lightColors;

    return {
      theme: (isDark ? 'dark' : 'light') as 'dark' | 'light',
      isDark,
      setTheme,
      themeColors,
    };
  } catch (error) {
    console.error("Startup Error:", error);
    throw error;
  }
}