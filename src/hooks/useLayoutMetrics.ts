import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

export function useLayoutMetrics() {
  const { width, height, fontScale } = useWindowDimensions();

  return useMemo(() => {
    const isTablet = width >= 600;
    const isCompactWidth = width < 380;
    const isCompactHeight = height < 700;

    return {
      width,
      height,
      fontScale,
      isTablet,
      isCompactWidth,
      isCompactHeight,
      horizontalPadding: isTablet ? 24 : isCompactWidth ? 12 : 16,
      contentMaxWidth: 1024,
      formMaxWidth: 720,
      drawerWidth: Math.min(isTablet ? 360 : 280, width * 0.86),
    };
  }, [fontScale, height, width]);
}
