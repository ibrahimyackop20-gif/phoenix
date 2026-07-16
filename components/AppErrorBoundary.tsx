import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
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
      message: error?.message || "Unexpected startup error",
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
        <View style={styles.container}>
          <Text style={styles.title}>تعذر تشغيل التطبيق</Text>
          <Text style={styles.body}>
            حدث خطأ أثناء بدء التشغيل. يمكنك إعادة المحاولة دون إغلاق التطبيق.
          </Text>
          {!!this.state.message && (
            <Text style={styles.detail}>{this.state.message}</Text>
          )}
          <Pressable style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: "#f97316",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  body: {
    color: "#a1a1aa",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  detail: {
    color: "#71717a",
    fontSize: 11,
    textAlign: "center",
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#ea580c",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
