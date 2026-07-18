/**
 * SectionHeader — reusable section label with optional trailing action.
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

export interface SectionHeaderProps extends ViewProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export function SectionHeader({
  title,
  subtitle,
  action,
  style,
  ...rest
}: SectionHeaderProps) {
  return (
    <View style={[styles.container, style as ViewStyle]} {...rest}>
      <View style={styles.textGroup}>
        <Text style={styles.title} maxFontSizeMultiplier={1.4}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[12],
  },
  textGroup: {
    flex: 1,
    gap: spacing[4],
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  action: {
    flexShrink: 0,
  },
});

export default SectionHeader;
