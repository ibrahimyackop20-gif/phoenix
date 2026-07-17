/**
 * Phoenix Print design system — border radius tokens.
 */

export const radius = {
  small: 8,
  medium: 12,
  large: 16,
  xl: 20,
  round: 9999,
} as const;

export type RadiusToken = keyof typeof radius;
