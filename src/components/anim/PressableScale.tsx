/**
 * PressableScale — a Pressable that gently scales down on press (1 → 0.97) for
 * premium tactile feedback, powered by React Native Reanimated.
 *
 * Presentational only: it forwards all Pressable props (onPress, disabled, etc.)
 * unchanged, so it is a drop-in replacement for TouchableOpacity/Pressable
 * without altering any behavior.
 */

import React from "react";
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, "style"> {
  /** Target scale while pressed. Defaults to 0.97. */
  scaleTo?: number;
  /** Press animation duration in ms. Defaults to 100. */
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function PressableScale({
  scaleTo = 0.97,
  duration = 100,
  onPressIn,
  onPressOut,
  disabled,
  style,
  children,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    if (!disabled) {
      scale.value = withTiming(scaleTo, {
        duration,
        easing: Easing.out(Easing.quad),
      });
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    scale.value = withTiming(1, {
      duration,
      easing: Easing.out(Easing.quad),
    });
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

export default PressableScale;
