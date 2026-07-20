import { useMemo } from "react";
import type { TextStyle } from "react-native";
import { useAppTheme } from "../../components/ThemeProvider";
import { useLayoutMetrics } from "./useLayoutMetrics";

/** Scale a font size for accessibility while capping runaway growth. */
function scaledSize(base: number, fontScale: number, maxMultiplier = 1.35): number {
  return Math.round(base * Math.min(fontScale, maxMultiplier));
}

/**
 * Combines layout metrics, theme tokens, and scaled typography for
 * responsive, theme-aware screens.
 */
export function useResponsiveTheme() {
  const metrics = useLayoutMetrics();
  const theme = useAppTheme();
  const { fontScale } = metrics;

  const typography = useMemo(() => {
    const s = (base: number, lineRatio = 1.3) => ({
      fontSize: scaledSize(base, fontScale),
      lineHeight: scaledSize(base * lineRatio, fontScale),
    });

    return {
      display: { ...s(32, 1.25), fontWeight: "800" as TextStyle["fontWeight"] },
      heading: { ...s(24, 1.33), fontWeight: "800" as TextStyle["fontWeight"] },
      title: { ...s(18, 1.44), fontWeight: "700" as TextStyle["fontWeight"] },
      subtitle: { ...s(15, 1.47), fontWeight: "600" as TextStyle["fontWeight"] },
      body: { ...s(14, 1.5), fontWeight: "400" as TextStyle["fontWeight"] },
      caption: { ...s(12, 1.5), fontWeight: "500" as TextStyle["fontWeight"] },
      button: { ...s(15, 1.47), fontWeight: "700" as TextStyle["fontWeight"] },
    };
  }, [fontScale]);

  return {
    ...metrics,
    ...theme,
    typography,
  };
}
