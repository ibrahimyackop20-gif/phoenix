import React, { type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useResponsiveTheme } from "../src/hooks/useResponsiveTheme";

type ScreenContentProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function ScreenContent({ children, style }: ScreenContentProps) {
  const { contentMaxWidth, horizontalPadding } = useResponsiveTheme();

  return (
    <View style={[styles.content, { maxWidth: contentMaxWidth, paddingHorizontal: horizontalPadding }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
  },
});
