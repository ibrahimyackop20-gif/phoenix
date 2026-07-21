import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "./ThemeProvider";
import { cancelPrintOrder, type CancelOrderErrorCode } from "../lib/cancelOrderApi";
import { useOrderCancelCountdown } from "../src/hooks/useOrderCancelCountdown";

/** Statuses that permanently block customer cancel (admin has progressed the order). */
const PROCESSING_STATUSES = new Set([
  "Accepted",
  "Printing",
  "Ready",
  "Out for Delivery",
  "Completed",
]);

type OrderCancelSectionProps = {
  orderId: string;
  createdAt: string;
  status: string;
  onCancelled: () => void;
  onError: (message: string) => void;
};

export default function OrderCancelSection({
  orderId,
  createdAt,
  status,
  onCancelled,
  onError,
}: OrderCancelSectionProps) {
  const { t } = useTranslation();
  const { themeColors } = useAppTheme();
  const { canCancel, windowExpired, formatted, isUrgent, synced } =
    useOrderCancelCountdown(createdAt, status);
  const [cancelling, setCancelling] = useState(false);

  // Rejected / Cancelled — nothing to show in the cancel section.
  if (status === "Rejected" || status === "Cancelled") {
    return null;
  }

  // Admin accepted: stop countdown immediately (realtime status update) and explain why.
  if (status === "Accepted") {
    return (
      <View style={[styles.container, { borderTopColor: themeColors.cardBorder }]}>
        <Text style={[styles.expiredText, { color: themeColors.warning }]}>
          {t("order_cancel_processing_message")}
        </Text>
      </View>
    );
  }

  // Later processing statuses — cancel is impossible; no message needed.
  if (PROCESSING_STATUSES.has(status)) {
    return null;
  }

  if (status !== "Pending") {
    return null;
  }

  const errorMessage = (code: CancelOrderErrorCode | undefined): string => {
    switch (code) {
      case "expired":
        return t("order_cancel_error_expired");
      case "already_cancelled":
        return t("order_cancel_error_already");
      case "already_accepted":
        return t("order_cancel_processing_message");
      default:
        return t("order_cancel_error_generic");
    }
  };

  const performCancel = async () => {
    setCancelling(true);
    try {
      const result = await cancelPrintOrder(orderId);
      if (result.success) {
        onCancelled();
      } else {
        onError(errorMessage(result.error));
      }
    } finally {
      setCancelling(false);
    }
  };

  const handleCancelPress = () => {
    Alert.alert(
      t("order_cancel_dialog_title"),
      t("order_cancel_dialog_message"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("order_cancel_dialog_confirm"),
          style: "destructive",
          onPress: performCancel,
        },
      ]
    );
  };

  if (!synced) {
    return (
      <View style={[styles.container, { borderTopColor: themeColors.cardBorder }]}>
        <ActivityIndicator size="small" color={themeColors.primary} />
      </View>
    );
  }

  if (windowExpired) {
    return (
      <View style={[styles.container, { borderTopColor: themeColors.cardBorder }]}>
        <Text style={[styles.expiredText, { color: themeColors.textSoft }]}>
          {t("order_cancel_expired_message")}
        </Text>
      </View>
    );
  }

  if (!canCancel) return null;

  return (
    <View style={[styles.container, { borderTopColor: themeColors.cardBorder }]}>
      <View style={styles.countdownRow}>
        <Text style={[styles.countdownLabel, { color: themeColors.textMuted }]}>
          {t("order_cancel_remaining")}
        </Text>
        <Text
          style={[
            styles.countdownValue,
            {
              color: isUrgent ? themeColors.danger : themeColors.textStrong,
            },
          ]}
        >
          {formatted}
        </Text>
      </View>

      <TouchableOpacity
        onPress={handleCancelPress}
        disabled={cancelling}
        style={[
          styles.cancelButton,
          {
            backgroundColor: themeColors.dangerSoftBg,
            borderColor: themeColors.dangerSoftBorder,
          },
          cancelling && styles.cancelButtonDisabled,
        ]}
      >
        {cancelling ? (
          <ActivityIndicator size="small" color={themeColors.danger} />
        ) : (
          <>
            <Feather name="x-circle" size={16} color={themeColors.danger} />
            <Text style={[styles.cancelButtonText, { color: themeColors.danger }]}>
              {t("order_cancel_button")}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  countdownRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  countdownLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  countdownValue: {
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    fontFamily: "monospace",
  },
  cancelButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cancelButtonDisabled: {
    opacity: 0.6,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  expiredText: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
