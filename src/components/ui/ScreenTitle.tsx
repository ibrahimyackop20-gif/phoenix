/**
 * ScreenTitle — reusable large page title with optional subtitle. Prepared for
 * future Library / Marketplace screens. Not yet wired into any existing screen.
 */

import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export interface ScreenTitleProps extends ViewProps {
  title: string;
  subtitle?: string;
  align?: "left" | "center" | "right";
  style?: ViewStyle | ViewStyle[];
}

export function ScreenTitle({
  title,
  subtitle,
  align = "left",
  style,
  ...rest
}: ScreenTitleProps) {
  return (
    <View style={[styles.container, style as ViewStyle]} {...rest}>
      <Text
        style={[styles.title, { textAlign: align }]}
        maxFontSizeMultiplier={1.4}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[styles.subtitle, { textAlign: align }]}
          maxFontSizeMultiplier={1.4}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing[4],
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
});

export default ScreenTitle;
