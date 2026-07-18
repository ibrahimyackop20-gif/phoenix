/**
 * Skeleton — a smooth pulsing placeholder block for loading states, powered by
 * Reanimated. Use to replace full-screen spinners with content-shaped skeletons
 * and avoid flashing/layout shifts.
 *
 * Presentational only.
 */

import React, { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useAppTheme } from "../../../components/ThemeProvider";

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = 8,
  style,
}: SkeletonProps) {
  const { isDark } = useAppTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + progress.value * 0.45,
  }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(15,23,42,0.08)",
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/**
 * SkeletonCard — a convenience card-shaped skeleton (title + two lines) for
 * list loading states.
 */
export function SkeletonCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { themeColors } = useAppTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder },
        style,
      ]}
    >
      <Skeleton width="55%" height={18} />
      <Skeleton width="85%" height={12} style={styles.line} />
      <Skeleton width="70%" height={12} style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  line: {
    marginTop: 2,
  },
});

export default Skeleton;
