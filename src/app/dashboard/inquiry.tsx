import React, { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabaseClient";
import {
  createRealtimeChannel,
  teardownRealtimeChannel,
} from "../../../lib/realtimeChannel";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

interface Inquiry {
  id: string;
  subject: string;
  message: string;
  admin_reply: string | null;
  is_read: boolean;
  created_at: string;
}

export default function InquiryScreen() {
  const { t, i18n } = useTranslation();
  const { themeColors, isDark } = useAppTheme();
  const styles = getStyles(themeColors, isDark);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchInquiries = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from("inquiries")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) {
        console.error("Fetch Inquiries Error:", fetchError.message);
      }

      setInquiries(data || []);
    } catch (err) {
      console.error("Error loading support tickets:", err);
    } finally {
      setLoadingInquiries(false);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchInquiries();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchInquiries();

    const channel = createRealtimeChannel("student-inquiries-rt-rn")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inquiries" },
        () => {
          fetchInquiries();
        }
      )
      .subscribe();

    return () => {
      teardownRealtimeChannel(channel);
    };
  }, [fetchInquiries]);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      setError(t("inq_fill_required"));
      return;
    }

    setSending(true);
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError(t("inq_login_required"));
        setSending(false);
        return;
      }

      const { error: insertError } = await supabase.from("inquiries").insert({
        user_id: user.id,
        subject: subject.trim(),
        message: message.trim(),
      });

      if (insertError) {
        setError(t("inq_send_fail", { message: insertError.message }));
        setSending(false);
        return;
      }

      setSuccess(true);
      setSubject("");
      setMessage("");
      fetchInquiries();

      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      console.error(err);
      setError(t("inq_send_fail_retry"));
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateString: string) => {
    const locale = i18n.language === "en" ? "en-US" : "ar-SA";
    return new Date(dateString).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity onPress={handleRefresh} disabled={refreshing} style={styles.refreshButton}>
              <Feather name="refresh-cw" size={16} color={themeColors.text} style={refreshing && styles.spinning} />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.title}>{t("contact_us")}</Text>
              <Text style={styles.subtitle}>{t("inq_subtitle")}</Text>
            </View>
          </View>

          <View style={styles.glassCard}>
            <View style={styles.cardHeader}>
              <Feather name="send" size={18} color={themeColors.primary} />
              <Text style={styles.cardTitle}>{t("inq_new_title")}</Text>
            </View>

            {success && (
              <View style={styles.successContainer}>
                <Feather name="check-circle" size={14} color="#34d399" />
                <Text style={styles.successText}>{t("inq_success")}</Text>
              </View>
            )}

            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("inq_subject")}</Text>
              <View style={styles.inputWrapper}>
                <Feather name="message-square" size={16} color={themeColors.textMuted} style={styles.inputIcon} />
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder={t("inq_subject_placeholder")}
                  placeholderTextColor={themeColors.textMuted}
                  style={styles.textInput}
                  textAlign="right"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("inq_message")}</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder={t("inq_message_placeholder")}
                placeholderTextColor={themeColors.textMuted}
                multiline
                numberOfLines={5}
                style={[styles.textInput, styles.textArea]}
                textAlign="right"
              />
            </View>

            <TouchableOpacity onPress={handleSubmit} disabled={sending} style={styles.primaryButton}>
              {sending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <View style={styles.buttonInner}>
                  <Feather name="send" size={16} color="#ffffff" style={styles.buttonIcon} />
                  <Text style={styles.buttonText}>{t("inq_submit")}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.historyContainer}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>
                {t("inq_history_title")}
                {inquiries.length > 0 && ` (${inquiries.length})`}
              </Text>
              <Feather name="mail" size={18} color={themeColors.primary} />
            </View>

            {loadingInquiries ? (
              <View style={styles.loader}>
                <ActivityIndicator size="large" color={themeColors.primary} />
              </View>
            ) : inquiries.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="message-square" size={48} color={themeColors.textMuted} style={styles.emptyIcon} />
                <Text style={styles.emptyTitle}>{t("inq_empty_title")}</Text>
                <Text style={styles.emptySubtitle}>{t("inq_empty_subtitle")}</Text>
              </View>
            ) : (
              <View style={styles.ticketsList}>
                {inquiries.map((inq) => (
                  <View key={inq.id} style={styles.ticketCard}>
                    <View style={styles.ticketHeader}>
                      <View style={styles.timeBadge}>
                        <Feather name="clock" size={12} color={themeColors.textMuted} style={styles.timeIcon} />
                        <Text style={styles.timeText}>{formatDate(inq.created_at)}</Text>
                      </View>
                      <Text style={styles.ticketSubject}>{inq.subject}</Text>
                    </View>

                    <View style={styles.studentMessageBubble}>
                      <Text style={styles.messageContentText}>{inq.message}</Text>
                    </View>

                    {inq.admin_reply ? (
                      <View style={styles.adminReplyBubble}>
                        <Text style={styles.replyLabel}>
                          <Feather name="mail" size={12} color="#60a5fa" /> {t("inq_admin_reply")}
                        </Text>
                        <Text style={styles.replyContentText}>{inq.admin_reply}</Text>
                      </View>
                    ) : (
                      <View style={styles.pendingBadge}>
                        <Feather name="clock" size={12} color="#fb923c" style={styles.pendingIcon} />
                        <Text style={styles.pendingText}>{t("inq_pending_reply")}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (
  themeColors: {
    background: string;
    text: string;
    textMuted: string;
    primary: string;
    cardBg: string;
    cardBorder: string;
    inputBg: string;
    inputBorder: string;
  },
  isDark: boolean
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
      width: "100%",
      maxWidth: 720,
      alignSelf: "center",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 24,
      gap: 12,
    },
    refreshButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: themeColors.cardBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    spinning: {},
    headerText: {
      alignItems: "flex-end",
      flex: 1,
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      color: themeColors.text,
      textAlign: "right",
      flexShrink: 1,
    },
    subtitle: {
      fontSize: 13,
      color: themeColors.textMuted,
      marginTop: 4,
      textAlign: "right",
      flexShrink: 1,
    },
    glassCard: {
      backgroundColor: themeColors.cardBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      borderRadius: 20,
      padding: 20,
      marginBottom: 28,
    },
    cardHeader: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 8,
      marginBottom: 20,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "bold",
      color: themeColors.text,
      flexShrink: 1,
    },
    successContainer: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(52, 211, 153, 0.1)",
      borderColor: "rgba(52, 211, 153, 0.2)",
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    successText: {
      color: "#34d399",
      fontSize: 12,
      flex: 1,
      textAlign: "right",
    },
    errorContainer: {
      backgroundColor: "rgba(239, 68, 68, 0.1)",
      borderColor: "rgba(239, 68, 68, 0.2)",
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    errorText: {
      color: "#ef4444",
      fontSize: 12,
      textAlign: "center",
    },
    inputGroup: {
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 12,
      color: themeColors.textMuted,
      marginBottom: 8,
      textAlign: "right",
    },
    inputWrapper: {
      flexDirection: "row-reverse",
      alignItems: "center",
      backgroundColor: themeColors.inputBg,
      borderColor: themeColors.inputBorder,
      borderWidth: 1,
      borderRadius: 12,
      minHeight: 48,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    inputIcon: {
      marginLeft: 8,
    },
    textInput: {
      flex: 1,
      color: themeColors.text,
      fontSize: 14,
      minHeight: 40,
      paddingVertical: 8,
    },
    textArea: {
      backgroundColor: themeColors.inputBg,
      borderColor: themeColors.inputBorder,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      minHeight: 120,
      textAlignVertical: "top",
    },
    primaryButton: {
      minHeight: 48,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: themeColors.primary,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    buttonInner: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      justifyContent: "center",
    },
    buttonIcon: {
      marginLeft: 4,
    },
    buttonText: {
      color: "#ffffff",
      fontSize: 14,
      fontWeight: "bold",
      textAlign: "center",
      flexShrink: 1,
    },
    historyContainer: {
      marginBottom: 20,
    },
    historyHeader: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 8,
      marginBottom: 16,
    },
    historyTitle: {
      fontSize: 16,
      fontWeight: "bold",
      color: themeColors.text,
      flexShrink: 1,
    },
    loader: {
      paddingVertical: 40,
      alignItems: "center",
    },
    emptyCard: {
      backgroundColor: themeColors.cardBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      borderRadius: 20,
      padding: 32,
      alignItems: "center",
    },
    emptyIcon: {
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: "bold",
      color: themeColors.text,
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 13,
      color: themeColors.textMuted,
      textAlign: "center",
    },
    ticketsList: {
      gap: 16,
    },
    ticketCard: {
      backgroundColor: themeColors.cardBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
    },
    ticketHeader: {
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 12,
    },
    ticketSubject: {
      fontSize: 14,
      fontWeight: "bold",
      color: themeColors.text,
      flex: 1,
      textAlign: "right",
    },
    timeBadge: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: 4,
      flexShrink: 1,
    },
    timeIcon: {
      marginLeft: 2,
    },
    timeText: {
      fontSize: 11,
      color: themeColors.textMuted,
      flexShrink: 1,
      textAlign: "right",
    },
    studentMessageBubble: {
      backgroundColor: themeColors.inputBg,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    messageContentText: {
      fontSize: 13,
      color: themeColors.text,
      lineHeight: 18,
      textAlign: "right",
    },
    adminReplyBubble: {
      backgroundColor: isDark ? "rgba(96, 165, 250, 0.08)" : "rgba(96, 165, 250, 0.12)",
      borderColor: isDark ? "rgba(96, 165, 250, 0.15)" : "rgba(96, 165, 250, 0.25)",
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
    },
    replyLabel: {
      fontSize: 11,
      fontWeight: "bold",
      color: "#60a5fa",
      marginBottom: 6,
      textAlign: "right",
    },
    replyContentText: {
      fontSize: 13,
      color: themeColors.text,
      lineHeight: 18,
      textAlign: "right",
    },
    pendingBadge: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: "rgba(251, 146, 60, 0.08)",
      borderColor: "rgba(251, 146, 60, 0.15)",
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
    },
    pendingIcon: {
      marginLeft: 4,
    },
    pendingText: {
      color: "#fb923c",
      fontSize: 12,
      fontWeight: "500",
      textAlign: "center",
      flexShrink: 1,
    },
  });
