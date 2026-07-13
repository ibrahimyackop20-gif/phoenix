import React, { useEffect, useRef } from "react";
import { StyleSheet, Text, View, Animated } from "react-native";

interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  Pending: {
    label: "قيد الانتظار",
    color: "#fbbf24", // text-amber-400
    bg: "rgba(251, 191, 36, 0.1)", // bg-amber-400/10
    border: "rgba(251, 191, 36, 0.2)", // border-amber-400/20
  },
  Printing: {
    label: "جاري الطباعة",
    color: "#60a5fa", // text-blue-400
    bg: "rgba(96, 165, 250, 0.1)", // bg-blue-400/10
    border: "rgba(96, 165, 250, 0.2)", // border-blue-400/20
  },
  Completed: {
    label: "مكتمل",
    color: "#34d399", // text-emerald-400
    bg: "rgba(52, 211, 153, 0.1)", // bg-emerald-400/10
    border: "rgba(52, 211, 153, 0.2)", // border-emerald-400/20
  },
  Rejected: {
    label: "مرفوض",
    color: "#f87171", // text-red-400
    bg: "rgba(248, 113, 113, 0.1)", // bg-red-400/10
    border: "rgba(248, 113, 113, 0.2)", // border-red-400/20
  },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.Pending;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === "Pending") {
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnimation.start();
      return () => pulseAnimation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, pulseAnim]);

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: config.bg,
          borderColor: config.border,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.dot,
          {
            backgroundColor: config.color,
            opacity: status === "Pending" ? pulseAnim : 1,
          },
        ]}
      />
      <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
  },
});
