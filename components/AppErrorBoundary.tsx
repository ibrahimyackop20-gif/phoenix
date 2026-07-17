import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import i18n from "../i18n";
import { useAppTheme } from "./ThemeProvider";
import { useLayoutMetrics } from "../src/hooks/useLayoutMetrics";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

function ErrorFallbackUI({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { themeColors } = useAppTheme();
  const { formMaxWidth } = useLayoutMetrics();
  const styles = getStyles(themeColors);

  return (
    <ScrollView
      style={{ backgroundColor: themeColors.background }}
      contentContainerStyle={styles.container}
    >
      <View style={[styles.card, { maxWidth: formMaxWidth }]}>
        <Text style={styles.title}>{i18n.t("err_startup_title")}</Text>
        <Text style={styles.body}>{i18n.t("err_startup_body")}</Text>
        {!!message && <Text style={styles.detail}>{message}</Text>}
        <Pressable style={styles.button} onPress={onRetry}>
          <Text style={styles.buttonText}>{i18n.t("err_retry")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/**
 * Catches render-time exceptions so a single provider/screen failure
 * cannot bring down the entire release process.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || i18n.t("err_unexpected"),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[AppErrorBoundary]", error, info?.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallbackUI message={this.state.message} onRetry={this.handleRetry} />
      );
    }

    return this.props.children;
  }
}

const getStyles = (themeColors: ReturnType<typeof useAppTheme>["themeColors"]) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      flexGrow: 1,
    },
    card: {
      width: "100%",
      alignItems: "center",
      alignSelf: "center",
    },
    title: {
      color: "#f97316",
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 12,
      textAlign: "center",
    },
    body: {
      color: themeColors.textMuted,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 16,
    },
    detail: {
      color: themeColors.textMuted,
      fontSize: 11,
      textAlign: "center",
      marginBottom: 20,
      opacity: 0.8,
    },
    button: {
      backgroundColor: "#ea580c",
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
      minHeight: 48,
      justifyContent: "center",
    },
    buttonText: {
      color: "#fff",
      fontWeight: "700",
      fontSize: 15,
      textAlign: "center",
      flexShrink: 1,
    },
  });
