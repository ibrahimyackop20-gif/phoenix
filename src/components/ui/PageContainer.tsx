/**
 * PageContainer — reusable screen wrapper providing safe-area insets, the
 * design-system background and consistent horizontal padding. Prepared for
 * future Library / Marketplace screens. Not yet wired into any existing screen.
 */

import React from "react";
import {
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import {
  SafeAreaView,
  type Edge,
} from "react-native-safe-area-context";

import { colors } from "@/theme/colors";
import { spacing } from "@/theme/spacing";

export interface PageContainerProps extends ViewProps {
  padded?: boolean;
  edges?: readonly Edge[];
  contentStyle?: ViewStyle | ViewStyle[];
  style?: ViewStyle | ViewStyle[];
}

const DEFAULT_EDGES: readonly Edge[] = ["top", "left", "right"];

export function PageContainer({
  padded = true,
  edges = DEFAULT_EDGES,
  contentStyle,
  style,
  children,
  ...rest
}: PageContainerProps) {
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safeArea, style as ViewStyle]}
    >
      <View
        style={[
          styles.content,
          padded && { paddingHorizontal: spacing[16] },
          contentStyle as ViewStyle,
        ]}
        {...rest}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
});

export default PageContainer;
