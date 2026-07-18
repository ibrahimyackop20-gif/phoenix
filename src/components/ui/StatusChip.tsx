/**
 * StatusChip — reusable status pill built on the Phoenix Print design system.
 * Prepared for future Library / Marketplace screens. Not yet wired into any
 * existing screen.
 */

import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { colors } from "@/theme/colors";
import { radius } from "@/theme/radius";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

export type StatusTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger";

export interface StatusChipProps {
  label: string;
  tone?: StatusTone;
  leftIcon?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

function toneColor(tone: StatusTone): string {
  switch (tone) {
    case "primary":
      return colors.primary;
    case "success":
      return colors.success;
    case "warning":
      return colors.warning;
    case "danger":
      return colors.danger;
    case "neutral":
    default:
      return colors.textSecondary;
  }
}

// Low-opacity background derived from the tone accent for a soft chip surface.
function toneBackground(tone: StatusTone): string {
  switch (tone) {
    case "primary":
      return "rgba(255,90,31,0.14)";
    case "success":
      return "rgba(16,185,129,0.14)";
    case "warning":
      return "rgba(245,158,11,0.14)";
    case "danger":
      return "rgba(239,68,68,0.14)";
    case "neutral":
    default:
      return "rgba(148,163,184,0.14)";
  }
}

export function StatusChip({
  label,
  tone = "neutral",
  leftIcon,
  style,
}: StatusChipProps) {
  const accent = toneColor(tone);

  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: toneBackground(tone) },
        style as ViewStyle,
      ]}
    >
      {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
      <Text style={[styles.label, { color: accent }]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing[4],
    paddingHorizontal: spacing[12],
    paddingVertical: spacing[4],
    borderRadius: radius.round,
  },
  icon: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.caption,
    fontWeight: "700",
  },
});

export default StatusChip;
