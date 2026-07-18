/**
 * AppInput — reusable filled text input built on the Phoenix Print design
 * system, with an animated focus state (border color, label color, and a subtle
 * focus lift) powered by React Native Reanimated.
 *
 * Presentational only: the animation reacts to focus/blur and does not change
 * any input behavior. `onChangeText`, `value`, keyboard props, etc. are passed
 * straight through. Optional `fieldStyle` / `labelStyle` overrides let it match
 * an existing screen's look when adopted incrementally.
 */

import React from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/theme/colors";
import { components } from "@/theme/components";
import { radius } from "@/theme/radius";
import { spacing } from "@/theme/spacing";
import { typography } from "@/theme/typography";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface AppInputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  fieldStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

export function AppInput({
  label,
  error,
  leftIcon,
  rightIcon,
  containerStyle,
  fieldStyle,
  labelStyle,
  onFocus,
  onBlur,
  style,
  placeholderTextColor,
  ...rest
}: AppInputProps) {
  const focus = useSharedValue(0);

  const animatedFieldStyle = useAnimatedStyle(() => {
    // When an error is present, keep the danger border regardless of focus.
    const borderColor = error
      ? colors.danger
      : interpolateColor(
          focus.value,
          [0, 1],
          [colors.border, colors.primary]
        );
    return {
      borderColor,
      shadowOpacity: focus.value * 0.18,
      elevation: focus.value * 3,
    };
  });

  const animatedLabelStyle = useAnimatedStyle(() => ({
    color: error
      ? colors.danger
      : interpolateColor(
          focus.value,
          [0, 1],
          [colors.textSecondary, colors.primary]
        ),
  }));

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Animated.Text style={[styles.label, labelStyle, animatedLabelStyle]}>
          {label}
        </Animated.Text>
      ) : null}
      <Animated.View style={[styles.field, fieldStyle, animatedFieldStyle]}>
        {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
        <AnimatedTextInput
          style={[styles.input, style]}
          placeholderTextColor={placeholderTextColor ?? colors.textSecondary}
          maxFontSizeMultiplier={1.4}
          onFocus={(e: any) => {
            focus.value = withTiming(1, {
              duration: 180,
              easing: Easing.out(Easing.cubic),
            });
            onFocus?.(e);
          }}
          onBlur={(e: any) => {
            focus.value = withTiming(0, {
              duration: 180,
              easing: Easing.out(Easing.cubic),
            });
            onBlur?.(e);
          }}
          {...rest}
        />
        {rightIcon ? <View style={styles.icon}>{rightIcon}</View> : null}
      </Animated.View>
      {error ? (
        <Animated.Text style={styles.error}>{error}</Animated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    gap: spacing[8],
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  field: {
    minHeight: components.inputHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[8],
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    borderWidth: 1,
    paddingHorizontal: spacing[16],
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  input: {
    ...typography.body,
    flex: 1,
    paddingVertical: spacing[12],
  },
  icon: {
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});

export default AppInput;
