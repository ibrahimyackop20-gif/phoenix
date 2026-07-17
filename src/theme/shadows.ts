/**
 * Phoenix Print design system — Material-style elevation shadows.
 */

import type { ViewStyle } from "react-native";

export const shadows = {
  small: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  } satisfies ViewStyle,

  medium: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 4,
  } satisfies ViewStyle,

  large: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 8,
  } satisfies ViewStyle,
} as const;

export type ShadowToken = keyof typeof shadows;
