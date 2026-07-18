/**
 * ScreenTransition — wraps a screen's content in a subtle entrance animation
 * (fade in + slight slide up), powered by React Native Reanimated.
 *
 * Presentational only: it renders a flex container and animates it once on
 * mount. It does not affect navigation, data, or layout semantics beyond adding
 * a wrapping View (defaults to flex: 1).
 */

import React, { useEffect } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

export interface ScreenTransitionProps {
  children: React.ReactNode;
  /** Delay before the entrance starts, in ms. Defaults to 0. */
  delay?: number;
  /** Entrance duration in ms (180–250 recommended). Defaults to 220. */
  duration?: number;
  /** Vertical slide distance in px (12–16 recommended). Defaults to 14. */
  offsetY?: number;
  style?: StyleProp<ViewStyle>;
}

export function ScreenTransition({
  children,
  delay = 0,
  duration = 220,
  offsetY = 14,
  style,
}: ScreenTransitionProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) })
    );
  }, [progress, delay, duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * offsetY }],
  }));

  return (
    <Animated.View style={[styles.fill, animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

export default ScreenTransition;
