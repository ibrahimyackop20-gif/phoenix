/**
 * AppButton — reusable button built on the Phoenix Print design system.
 *
 * Prepared for future Library / Marketplace screens. Not yet wired into any
 * existing screen. Supports variants, sizes, loading and icon slots.
 */

import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type TextStyle,
  type TouchableOpacityProps,
  type ViewStyle,
} from "react-native";

import { colors } from "@/theme/colors";
import { radius } from "@/theme/radius";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";
import { components } from "@/theme/components";

export type AppButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger";

export type AppButtonSize = "sm" | "md" | "lg";

export interface AppButtonProps extends Omit<TouchableOpacityProps, "style"> {
  label: string;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle | TextStyle[];
}

const HEIGHT_BY_SIZE: Record<AppButtonSize, number> = {
  sm: 40,
  md: 48,
  lg: components.buttonHeight,
};

const FONT_SIZE_BY_SIZE: Record<AppButtonSize, number> = {
  sm: 13,
  md: 14,
  lg: 15,
};

function backgroundForVariant(variant: AppButtonVariant): string {
  switch (variant) {
    case "primary":
      return colors.primary;
    case "secondary":
      return colors.surface;
    case "danger":
      return colors.danger;
    case "outline":
    case "ghost":
    default:
      return "transparent";
  }
}

function textColorForVariant(variant: AppButtonVariant): string {
  switch (variant) {
    case "outline":
    case "ghost":
      return colors.primary;
    case "secondary":
      return colors.textPrimary;
    default:
      return colors.textPrimary;
  }
}

export function AppButton({
  label,
  variant = "primary",
  size = "lg",
  loading = false,
  fullWidth = true,
  leftIcon,
  rightIcon,
  disabled,
  style,
  textStyle,
  ...rest
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const height = HEIGHT_BY_SIZE[size];
  const backgroundColor = backgroundForVariant(variant);
  const color = textColorForVariant(variant);

  const containerStyle: ViewStyle = {
    height,
    minHeight: height,
    backgroundColor,
    borderRadius: size === "lg" ? 18 : radius.large,
    borderWidth: variant === "outline" ? 1 : 0,
    borderColor: variant === "outline" ? colors.primary : "transparent",
    alignSelf: fullWidth ? "stretch" : "flex-start",
    paddingHorizontal: fullWidth ? spacing[16] : spacing[24],
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      activeOpacity={0.85}
      disabled={isDisabled}
      style={[
        styles.base,
        containerStyle,
        isDisabled && styles.disabled,
        style as ViewStyle,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <View style={styles.content}>
          {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={[
              typography.button,
              { color, fontSize: FONT_SIZE_BY_SIZE[size] },
              textStyle as TextStyle,
            ]}
          >
            {label}
          </Text>
          {rightIcon ? <View style={styles.icon}>{rightIcon}</View> : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[8],
  },
  icon: {
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.5,
  },
});

export default AppButton;
