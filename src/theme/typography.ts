/**
 * Phoenix Print design system — typography styles.
 */

import type { TextStyle } from "react-native";
import type { ThemeColors } from "../../components/ThemeProvider";

/** Theme-aware typography tokens for screens using useAppTheme(). */
export function createTypography(colors: ThemeColors) {
  return {
    display: {
      fontSize: 32,
      lineHeight: 40,
      fontWeight: "800" as TextStyle["fontWeight"],
      letterSpacing: -0.4,
      color: colors.textStrong,
    } satisfies TextStyle,

    heading: {
      fontSize: 24,
      lineHeight: 32,
      fontWeight: "800" as TextStyle["fontWeight"],
      letterSpacing: -0.2,
      color: colors.textStrong,
    } satisfies TextStyle,

    title: {
      fontSize: 18,
      lineHeight: 26,
      fontWeight: "700" as TextStyle["fontWeight"],
      color: colors.textStrong,
    } satisfies TextStyle,

    subtitle: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: colors.textSoft,
    } satisfies TextStyle,

    body: {
      fontSize: 14,
      lineHeight: 21,
      fontWeight: "400" as TextStyle["fontWeight"],
      color: colors.textBody,
    } satisfies TextStyle,

    caption: {
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: colors.textSoft,
    } satisfies TextStyle,

    button: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: "700" as TextStyle["fontWeight"],
      color: colors.onAccent,
    } satisfies TextStyle,
  } as const;
}

/** @deprecated Use createTypography(themeColors) for theme-aware styles. */
export const typography = createTypography({
  textStrong: "#FFFFFF",
  textSoft: "#94A3B8",
  textBody: "#CBD5E1",
  onAccent: "#FFFFFF",
} as ThemeColors);

export type TypographyToken = keyof typeof typography;
