console.log("ThemeProvider.tsx file loading...");

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance } from 'react-native';
import { useColorScheme } from 'nativewind';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

/**
 * Centralized color tokens for light and dark modes.
 *
 * The original keys (background, text, primary, secondary, textMuted, cardBg,
 * cardBorder, inputBg, inputBorder, disabledBg) are kept EXACTLY as they were so
 * screens that already consume them are unaffected.
 *
 * The additional semantic tokens below power the theme migration. Their DARK
 * values intentionally mirror the app's premium dark palette (#0F172A / #1E293B
 * / #FF5A1F / #94A3B8 …) so migrated screens look pixel-identical in dark mode,
 * while their LIGHT values provide a correct light counterpart.
 */
const lightColors = {
  // ── Original tokens (unchanged) ──────────────────────────────
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

  // ── Semantic tokens (light) ──────────────────────────────────
  screenBg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F5F9',
  borderSoft: '#E2E8F0',
  divider: '#EEF2F7',
  textStrong: '#0F172A',
  textSoft: '#64748B',
  textFaint: '#94A3B8',
  accent: '#FF5A1F',
  accentPressed: '#E14E15',
  accentSoftBg: 'rgba(255,90,31,0.10)',
  accentSoftBorder: 'rgba(255,90,31,0.28)',
  onAccent: '#FFFFFF',
  success: '#059669',
  successSoftBg: 'rgba(16,185,129,0.10)',
  successSoftBorder: 'rgba(16,185,129,0.26)',
  warning: '#D97706',
  warningSoftBg: 'rgba(245,158,11,0.12)',
  danger: '#DC2626',
  dangerSoftBg: 'rgba(239,68,68,0.10)',
  skeleton: 'rgba(15,23,42,0.06)',
  overlay: 'rgba(15,23,42,0.45)',
  shadow: '#0F172A',

  // ── Brand / status accents (theme-agnostic: identical in light & dark
  //    because they render on their own translucent chips/buttons) ──────
  brandTint: '#FF7A45',
  onAccentMuted: 'rgba(255,255,255,0.82)',
  onAccentSoftBg: 'rgba(255,255,255,0.16)',
  primarySoftBg: 'rgba(234,88,12,0.10)',
  statAmber: '#FBBF24',
  statAmberBg: 'rgba(251,191,36,0.10)',
  statBlue: '#60A5FA',
  statBlueBg: 'rgba(96,165,250,0.10)',
  statGreen: '#34D399',
  statGreenBg: 'rgba(52,211,153,0.10)',
  statGreenBorder: 'rgba(52,211,153,0.22)',
  statBlueBorder: 'rgba(96,165,250,0.22)',
  blueStrong: '#3B82F6',
  borderStrong: '#d1d5db',
  trackColor: '#e5e7eb',
  telegramTintBg: 'rgba(2,132,199,0.10)',
  google: '#4285F4',
  dangerSoftBorder: 'rgba(239,68,68,0.22)',
  primarySoftBorder: 'rgba(234,88,12,0.25)',
  textBody: '#475569',
  telegram: '#0088CC',
  telegramTint: '#0284C7',
  telegramSoftBg: 'rgba(0,136,204,0.08)',
  telegramBorder: 'rgba(0,136,204,0.25)',
};

const darkColors: typeof lightColors = {
  // ── Original tokens (unchanged) ──────────────────────────────
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

  // ── Semantic tokens (dark = premium palette) ─────────────────
  screenBg: '#0F172A',
  surface: '#1E293B',
  surfaceMuted: '#0F172A',
  borderSoft: 'rgba(255,255,255,0.08)',
  divider: 'rgba(255,255,255,0.06)',
  textStrong: '#FFFFFF',
  textSoft: '#94A3B8',
  textFaint: '#64748B',
  accent: '#FF5A1F',
  accentPressed: '#E14E15',
  accentSoftBg: 'rgba(255,90,31,0.12)',
  accentSoftBorder: 'rgba(255,90,31,0.32)',
  onAccent: '#FFFFFF',
  success: '#10B981',
  successSoftBg: 'rgba(16,185,129,0.12)',
  successSoftBorder: 'rgba(16,185,129,0.28)',
  warning: '#F59E0B',
  warningSoftBg: 'rgba(245,158,11,0.15)',
  danger: '#EF4444',
  dangerSoftBg: 'rgba(239,68,68,0.12)',
  skeleton: 'rgba(255,255,255,0.08)',
  overlay: 'rgba(0,0,0,0.6)',
  shadow: '#000000',

  // ── Brand / status accents (theme-agnostic) ──────────────────
  brandTint: '#FF7A45',
  onAccentMuted: 'rgba(255,255,255,0.82)',
  onAccentSoftBg: 'rgba(255,255,255,0.16)',
  primarySoftBg: 'rgba(234,88,12,0.10)',
  statAmber: '#FBBF24',
  statAmberBg: 'rgba(251,191,36,0.10)',
  statBlue: '#60A5FA',
  statBlueBg: 'rgba(96,165,250,0.10)',
  statGreen: '#34D399',
  statGreenBg: 'rgba(52,211,153,0.10)',
  statGreenBorder: 'rgba(52,211,153,0.20)',
  statBlueBorder: 'rgba(96,165,250,0.20)',
  blueStrong: '#3B82F6',
  borderStrong: '#3f3f46',
  trackColor: '#27272a',
  telegramTintBg: 'rgba(41,182,246,0.12)',
  google: '#4285F4',
  dangerSoftBorder: 'rgba(239,68,68,0.20)',
  primarySoftBorder: 'rgba(234,88,12,0.35)',
  textBody: '#CBD5E1',
  telegram: '#0088CC',
  telegramTint: '#29B6F6',
  telegramSoftBg: 'rgba(0,136,204,0.15)',
  telegramBorder: 'rgba(0,136,204,0.30)',
};

export type ThemeColors = typeof lightColors;

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedScheme: ResolvedScheme;
  isDark: boolean;
  setPreference: (p: ThemePreference) => void;
  themeColors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * ThemeProvider loads the persisted theme preference and language on startup.
 * It renders nothing until loading finishes to avoid a flash of the wrong theme.
 *
 * Supports three preferences: 'light', 'dark', and 'system'. In 'system' mode the
 * resolved scheme follows the device appearance live (via RN Appearance), so
 * changing the OS theme updates the app immediately — no restart, no refresh.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { setColorScheme } = useColorScheme();
  const [isLoaded, setIsLoaded] = useState(false);
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [systemScheme, setSystemScheme] = useState<ResolvedScheme>(
    (Appearance.getColorScheme() as ResolvedScheme) || 'dark'
  );

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('theme');
        if (
          savedTheme === 'dark' ||
          savedTheme === 'light' ||
          savedTheme === 'system'
        ) {
          setPreferenceState(savedTheme);
        } else {
          setPreferenceState('dark');
        }

        const savedLang = await AsyncStorage.getItem('language');
        if (savedLang === 'ar' || savedLang === 'en') {
          await i18n.changeLanguage(savedLang);
        }
      } catch (error) {
        console.error('Startup Error:', error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  // Follow device appearance changes (used when preference === 'system').
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme((colorScheme as ResolvedScheme) || 'dark');
    });
    return () => sub.remove();
  }, []);

  const resolvedScheme: ResolvedScheme =
    preference === 'system' ? systemScheme : preference;

  // Keep NativeWind's scheme in sync so any className-based `dark:` variants match.
  useEffect(() => {
    setColorScheme(resolvedScheme);
  }, [resolvedScheme, setColorScheme]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem('theme', p).catch((error) => {
      console.error('Startup Error (setTheme):', error);
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const isDark = resolvedScheme === 'dark';
    return {
      preference,
      resolvedScheme,
      isDark,
      setPreference,
      themeColors: isDark ? darkColors : lightColors,
    };
  }, [preference, resolvedScheme, setPreference]);

  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export default ThemeProvider;

/**
 * Hook for consuming theme state from any screen or component.
 *
 * Returns:
 * - theme: the resolved scheme ('light' | 'dark')
 * - themePreference: the user's stored choice ('light' | 'dark' | 'system')
 * - isDark: convenience boolean
 * - setTheme: update the preference (accepts 'light' | 'dark' | 'system')
 * - themeColors: the active color token set
 */
export function useAppTheme() {
  const ctx = useContext(ThemeContext);

  if (!ctx) {
    // Fallback if the provider is not mounted (keeps callers crash-safe).
    return {
      theme: 'dark' as ResolvedScheme,
      themePreference: 'dark' as ThemePreference,
      isDark: true,
      setTheme: (_p: ThemePreference) => {},
      themeColors: darkColors,
    };
  }

  return {
    theme: ctx.resolvedScheme,
    themePreference: ctx.preference,
    isDark: ctx.isDark,
    setTheme: ctx.setPreference,
    themeColors: ctx.themeColors,
  };
}
