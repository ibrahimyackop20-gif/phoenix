import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "./ThemeProvider";

type Props = {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
};

/**
 * Google Sign-In button — white surface, dark text, Google mark.
 * Matches Google branding guidelines and Phoenix Print card layout.
 */
export default function GoogleSignInButton({
  onPress,
  loading = false,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const { isDark } = useAppTheme();
  const styles = getStyles(isDark);
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
        <View style={styles.inner}>
          <AntDesign name="google" size={18} color="#4285F4" />
          <Text style={styles.label}>{t("auth_google_continue")}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    button: {
      minHeight: 48,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.18)" : "#747775",
      marginTop: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    buttonDisabled: {
      opacity: 0.65,
    },
    inner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      justifyContent: "center",
      flexWrap: "wrap",
    },
    label: {
      color: "#1F1F1F",
      fontSize: 14,
      fontWeight: "600",
      letterSpacing: 0.1,
      flexShrink: 1,
      textAlign: "center",
    },
  });
