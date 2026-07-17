/**
 * Phoenix Print design system — shared component sizing constants.
 */

import { radius } from "./radius";

export const components = {
  buttonHeight: 56,
  inputHeight: 56,
  cardRadius: radius.xl,
  iconSizes: {
    small: 16,
    medium: 20,
    large: 24,
    xl: 32,
  },
  avatarSizes: {
    small: 32,
    medium: 40,
    large: 56,
    xl: 72,
  },
} as const;

export type ComponentToken = keyof typeof components;
