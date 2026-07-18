/**
 * Divider — reusable horizontal separator with an optional centered label.
 * Prepared for future Library / Marketplace screens. Not yet wired into any
 * existing screen.
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

export interface DividerProps extends ViewProps {
  label?: string;
  spacingVertical?: number;
  style?: ViewStyle | ViewStyle[];
}

export function Divider({
  label,
  spacingVertical = spacing[16],
  style,
  ...rest
}: DividerProps) {
  if (label) {
    return (
      <View
        style={[
          styles.labelledRow,
          { marginVertical: spacingVertical },
          style as ViewStyle,
        ]}
        {...rest}
      >
        <View style={styles.line} />
        <Text style={styles.label} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        <View style={styles.line} />
      </View>
    );
  }

  return (
    <View
      style={[styles.line, { marginVertical: spacingVertical }, style as ViewStyle]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  labelledRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[12],
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

export default Divider;
