import React, { type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useLayoutMetrics } from "../src/hooks/useLayoutMetrics";

type ScreenContentProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export default function ScreenContent({ children, style }: ScreenContentProps) {
  const { contentMaxWidth } = useLayoutMetrics();

  return (
    <View style={[styles.content, { maxWidth: contentMaxWidth }, style]}>
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
