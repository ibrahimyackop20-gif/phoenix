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
  const { setColorScheme } = useColorScheme();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Restore theme
        const savedTheme = await AsyncStorage.getItem('theme');
        if (savedTheme === 'dark' || savedTheme === 'light') {
          setColorScheme(savedTheme);
        } else {
          setColorScheme('dark');
        }

        // Restore language
        const savedLang = await AsyncStorage.getItem('language');
        if (savedLang === 'ar' || savedLang === 'en') {
          await i18n.changeLanguage(savedLang);
        }
        // If no saved language, i18n defaults to 'ar' from init config
      } catch (error) {
        console.log('Error loading settings:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  if (!isLoaded) return null;

  return <>{children}</>;
}

export default ThemeProvider;

/**
 * Hook for consuming theme state from any screen.
 * Uses NativeWind's useColorScheme under the hood.
 */
export function useAppTheme() {
  const { colorScheme, setColorScheme } = useColorScheme();

  const setTheme = async (newTheme: 'light' | 'dark') => {
    setColorScheme(newTheme);
    try {
      await AsyncStorage.setItem('theme', newTheme);
    } catch (error) {
      console.log('Error saving theme:', error);
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
}