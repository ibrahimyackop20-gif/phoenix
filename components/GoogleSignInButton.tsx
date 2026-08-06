import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "./ThemeProvider";

type Props = {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

/**
 * Google Sign-In button — white surface, dark text, multicolor Google "G" mark.
 * Matches Google branding guidelines and Phoenix Print card layout.
 *
 * Layout: the label is centered across the FULL button width independent of
 * the icon (icon is absolutely positioned on the RTL/LTR leading edge), so
 * the text never visually shifts off-center to make room for the icon.
 */
export default function GoogleSignInButton({
  onPress,
  loading = false,
  disabled = false,
}: Props) {
  const { t, i18n } = useTranslation();
  const isEnglish = i18n.language === "en";
  const { isDark, themeColors } = useAppTheme();
  const styles = getStyles(isDark, themeColors.borderSoft, isEnglish);
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.button, isDisabled && styles.buttonDisabled]}
      accessibilityRole="button"
      accessibilityLabel={t("auth_google_continue")}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#1F1F1F" />
      ) : (
        <>
          <View style={styles.iconSlot} pointerEvents="none">
            <Image
              source={require("../assets/images/google-g.png")}
              style={styles.icon}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.label}>{t("auth_google_continue")}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const getStyles = (isDark: boolean, lightBorderColor: string, isEnglish: boolean) =>
  StyleSheet.create({
    button: {
      position: "relative",
      minHeight: 54,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      // Button surface stays white regardless of app theme (Google branding
      // requirement), so the border needs its own light-mode-appropriate
      // color rather than the current theme's (possibly dark-surface) token.
      borderColor: isDark ? "rgba(255,255,255,0.18)" : lightBorderColor,
      paddingHorizontal: 44,
      paddingVertical: 12,
      // Minimal neutral shadow — no visible glow.
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 3,
      elevation: isDark ? 0 : 1,
    },
    buttonDisabled: {
      opacity: 0.65,
    },
    iconSlot: {
      position: "absolute",
      top: 0,
      bottom: 0,
      // Leading edge: right in Arabic (RTL), left in English (LTR).
      ...(isEnglish ? { left: 20 } : { right: 20 }),
      width: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    icon: {
      width: 20,
      height: 20,
    },
    label: {
      width: "100%",
      color: "#1F1F1F",
      fontSize: 14,
      fontWeight: "600",
      letterSpacing: 0.1,
      textAlign: "center",
    },
  });
