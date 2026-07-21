import React, { useEffect, useRef } from "react";
import { StyleSheet, Text, View, Animated } from "react-native";
import { useTranslation } from "react-i18next";

interface StatusBadgeProps {
  status: string;
}

const STATUS_KEYS: Record<string, string> = {
  Pending: "badge_pending",
  Accepted: "badge_accepted",
  Printing: "badge_printing",
  Ready: "badge_ready",
  Completed: "badge_completed",
  Rejected: "badge_rejected",
  Cancelled: "badge_cancelled",
  "Out for Delivery": "badge_out_delivery",
};

const statusColors: Record<
  string,
  { color: string; bg: string; border: string }
> = {
  Pending: {
    color: "#fbbf24",
    bg: "rgba(251, 191, 36, 0.1)",
    border: "rgba(251, 191, 36, 0.2)",
  },
  Accepted: {
    color: "#34d399",
    bg: "rgba(52, 211, 153, 0.12)",
    border: "rgba(52, 211, 153, 0.28)",
  },
  Printing: {
    color: "#60a5fa",
    bg: "rgba(96, 165, 250, 0.1)",
    border: "rgba(96, 165, 250, 0.2)",
  },
  Ready: {
    color: "#a78bfa",
    bg: "rgba(167, 139, 250, 0.12)",
    border: "rgba(167, 139, 250, 0.28)",
  },
  Completed: {
    color: "#34d399",
    bg: "rgba(52, 211, 153, 0.1)",
    border: "rgba(52, 211, 153, 0.2)",
  },
  Rejected: {
    color: "#f87171",
    bg: "rgba(248, 113, 113, 0.1)",
    border: "rgba(248, 113, 113, 0.2)",
  },
  Cancelled: {
    color: "#94a3b8",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.24)",
  },
  "Out for Delivery": {
    color: "#a78bfa",
    bg: "rgba(167, 139, 250, 0.1)",
    border: "rgba(167, 139, 250, 0.2)",
  },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();
  const colors = statusColors[status] || statusColors.Pending;
  const labelKey = STATUS_KEYS[status] || STATUS_KEYS.Pending;
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
          backgroundColor: colors.bg,
          borderColor: colors.border,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.dot,
          {
            backgroundColor: colors.color,
            opacity: status === "Pending" ? pulseAnim : 1,
          },
        ]}
      />
      <Text style={[styles.text, { color: colors.color }]}>{t(labelKey)}</Text>
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
    maxWidth: "100%",
    flexShrink: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "center",
  },
});
