/**
 * HeroIllustration — renders the official Phoenix Print hero PNG for the
 * Landing screen. Fully responsive, keeps the image aspect ratio, and applies
 * subtle React Native Reanimated effects (fade-in, gentle float, subtle scale)
 * that run on the UI thread for a smooth 60fps feel.
 *
 * Presentational only — no navigation, state, or business logic.
 */

import React, { useEffect } from "react";
import { Image, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

// Official hero illustration (bundled transparent PNG — used exactly as provided).
const HERO_SOURCE = require("../../../assets/images/landing/hero-printer-v2.png");

const MAX_WIDTH = 380;
const WIDTH_RATIO = 0.88;

// Resolve the intrinsic size once so we can preserve the exact aspect ratio.
const resolved = Image.resolveAssetSource(HERO_SOURCE);
const ASPECT_RATIO =
  resolved && resolved.width && resolved.height
    ? resolved.width / resolved.height
    : 2 / 3;

export interface HeroIllustrationProps {
  style?: object;
}

export function HeroIllustration({ style }: HeroIllustrationProps) {
  const { width: screenWidth } = useWindowDimensions();
  const containerWidth = Math.min(screenWidth * WIDTH_RATIO, MAX_WIDTH);

  const fade = useSharedValue(0);
  const float = useSharedValue(0);

  useEffect(() => {
    fade.value = withTiming(1, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
    // Gentle, continuous float that reverses smoothly (≈3500ms per full cycle).
    float.value = withRepeat(
      withTiming(1, { duration: 1750, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [fade, float]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [
      { translateY: interpolate(float.value, [0, 1], [5, -5]) },
      { scale: interpolate(float.value, [0, 1], [0.98, 1]) },
    ],
  }));

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.container,
        { width: containerWidth, aspectRatio: ASPECT_RATIO },
        animatedStyle,
        style,
      ]}
    >
      <Image source={HERO_SOURCE} resizeMode="contain" style={styles.image} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "center",
    backgroundColor: "transparent",
  },
  image: {
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },
});

export default HeroIllustration;
