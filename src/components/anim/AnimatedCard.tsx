/**
 * AnimatedCard — a lightweight wrapper that fades + slides a card into view,
 * with an optional stagger based on list index. Powered by Reanimated.
 *
 * Designed to animate ONLY on first render of the initially visible items:
 * cards whose index is >= `maxAnimatedIndex` render statically (no animation),
 * which prevents re-animation while scrolling a virtualized list.
 *
 * Presentational only: it adds a wrapping View and never changes data/logic.
 */

import React, { useEffect } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

export interface AnimatedCardProps {
  children: React.ReactNode;
  /** Position in the list; used to stagger the entrance. Defaults to 0. */
  index?: number;
  /** Per-item stagger in ms. Defaults to 55. */
  stagger?: number;
  /** Entrance duration in ms. Defaults to 260. */
  duration?: number;
  /** Vertical slide distance in px. Defaults to 12. */
  offsetY?: number;
  /**
   * Items with index >= this value skip the animation entirely (render static).
   * Keeps scrolling smooth and avoids re-animating recycled cells. Defaults to 10.
   */
  maxAnimatedIndex?: number;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedCard({
  children,
  index = 0,
  stagger = 55,
  duration = 260,
  offsetY = 12,
  maxAnimatedIndex = 10,
  style,
}: AnimatedCardProps) {
  const shouldAnimate = index < maxAnimatedIndex;
  const progress = useSharedValue(shouldAnimate ? 0 : 1);

  useEffect(() => {
    if (!shouldAnimate) return;
    progress.value = withDelay(
      Math.min(index, maxAnimatedIndex) * stagger,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) })
    );
  }, [progress, shouldAnimate, index, stagger, duration, maxAnimatedIndex]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * offsetY }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

export default AnimatedCard;
