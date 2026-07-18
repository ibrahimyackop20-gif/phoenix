/**
 * AppCard — reusable surface card built on the Phoenix Print design system.
 *
 * Prepared for future Library / Marketplace screens. Not yet wired into any
 * existing screen.
 */

import React from "react";
import {
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import { colors } from "@/theme/colors";
import { components } from "@/theme/components";
import { spacing } from "@/theme/spacing";
import { shadows } from "@/theme/shadows";

export type AppCardElevation = "none" | "small" | "medium" | "large";
export type AppCardPadding = "none" | "sm" | "md" | "lg";

export interface AppCardProps extends ViewProps {
  elevation?: AppCardElevation;
  padding?: AppCardPadding;
  bordered?: boolean;
  style?: ViewStyle | ViewStyle[];
}

const PADDING_BY_SIZE: Record<AppCardPadding, number> = {
  none: 0,
  sm: spacing[12],
  md: spacing[16],
  lg: spacing[24],
};

export function AppCard({
  elevation = "small",
  padding = "md",
  bordered = true,
  style,
  children,
  ...rest
}: AppCardProps) {
  return (
    <View
      style={[
        styles.card,
        { padding: PADDING_BY_SIZE[padding] },
        bordered && styles.bordered,
        elevation !== "none" && shadows[elevation],
        style as ViewStyle,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: components.cardRadius,
  },
  bordered: {
    borderWidth: 1,
    borderColor: colors.border,
  },
});

export default AppCard;
