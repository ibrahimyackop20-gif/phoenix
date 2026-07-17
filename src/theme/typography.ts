/**
 * Phoenix Print design system — typography styles.
 */

import type { TextStyle } from "react-native";
import { colors } from "./colors";

export const typography = {
  display: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: colors.textPrimary,
  } satisfies TextStyle,

  heading: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: colors.textPrimary,
  } satisfies TextStyle,

  title: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "700",
    color: colors.textPrimary,
  } satisfies TextStyle,

  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    color: colors.textSecondary,
  } satisfies TextStyle,

  body: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400",
    color: colors.textPrimary,
  } satisfies TextStyle,

  caption: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
    color: colors.textSecondary,
  } satisfies TextStyle,

  button: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
    color: colors.textPrimary,
  } satisfies TextStyle,
} as const;

export type TypographyToken = keyof typeof typography;
