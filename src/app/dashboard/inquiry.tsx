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
  SafeAreaView,
} from "react-native";
import { supabase } from "../../../lib/supabaseClient";
import { Feather, Ionicons } from "@expo/vector-icons";

interface Inquiry {
  id: string;
  subject: string;
  message: string;
  admin_reply: string | null;
  is_read: boolean;
  created_at: string;
}

export default function InquiryScreen() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Past inquiries
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

    // Listen for updates (admin replies)
    const channel = supabase
      .channel("student-inquiries-rt-rn")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inquiries" },
        () => {
          fetchInquiries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInquiries]);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      setError("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    setSending(true);
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("يرجى تسجيل الدخول أولاً");
        setSending(false);
        return;
      }

      const { error: insertError } = await supabase.from("inquiries").insert({
        user_id: user.id,
        subject: subject.trim(),
        message: message.trim(),
      });

      if (insertError) {
        setError(`فشل إرسال الاستفسار: ${insertError.message}`);
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
      setError("فشل إرسال التذكرة. الرجاء المحاولة مرة أخرى.");
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ar-SA", {
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
              <Feather name="refresh-cw" size={16} color="#f4f4f5" style={refreshing && styles.spinning} />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.title}>تواصل معنا</Text>
              <Text style={styles.subtitle}>أرسل استفسارك وسيتم الرد عليك في أقرب وقت</Text>
            </View>
          </View>

          {/* ── New Inquiry Form ──────────────────────────────── */}
          <View style={styles.glassCard}>
            <View style={styles.cardHeader}>
              <Feather name="send" size={18} color="#ea580c" />
              <Text style={styles.cardTitle}>استفسار جديد</Text>
            </View>

            {success && (
              <View style={styles.successContainer}>
                <Feather name="check-circle" size={14} color="#34d399" />
                <Text style={styles.successText}>تم إرسال استفسارك بنجاح، سيرد عليك المدير قريباً</Text>
              </View>
            )}

            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>الموضوع</Text>
              <View style={styles.inputWrapper}>
                <Feather name="message-square" size={16} color="#71717a" style={styles.inputIcon} />
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="مثال: استفسار عن حالة طلبي"
                  placeholderTextColor="#71717a"
                  style={styles.textInput}
                  textAlign="right"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>الرسالة</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="اكتب رسالتك هنا..."
                placeholderTextColor="#71717a"
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
                  <Text style={styles.buttonText}>إرسال الاستفسار</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* ── Past Inquiries ────────────────────────────────── */}
          <View style={styles.historyContainer}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>
                استفساراتي السابقة
                {inquiries.length > 0 && ` (${inquiries.length})`}
              </Text>
              <Feather name="mail" size={18} color="#ea580c" />
            </View>

            {loadingInquiries ? (
              <View style={styles.loader}>
                <ActivityIndicator size="large" color="#ea580c" />
              </View>
            ) : inquiries.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="message-square" size={48} color="#71717a" style={styles.emptyIcon} />
                <Text style={styles.emptyTitle}>لا توجد استفسارات</Text>
                <Text style={styles.emptySubtitle}>لم تقم بإرسال أي استفسارات بعد</Text>
              </View>
            ) : (
              <View style={styles.ticketsList}>
                {inquiries.map((inq) => (
                  <View key={inq.id} style={styles.ticketCard}>
                    {/* Header */}
                    <View style={styles.ticketHeader}>
                      <View style={styles.timeBadge}>
                        <Feather name="clock" size={12} color="#71717a" style={styles.timeIcon} />
                        <Text style={styles.timeText}>{formatDate(inq.created_at)}</Text>
                      </View>
                      <Text style={styles.ticketSubject}>{inq.subject}</Text>
                    </View>

                    {/* Student message */}
                    <View style={styles.studentMessageBubble}>
                      <Text style={styles.messageContentText}>{inq.message}</Text>
                    </View>

                    {/* Admin Reply */}
                    {inq.admin_reply ? (
                      <View style={styles.adminReplyBubble}>
                        <Text style={styles.replyLabel}>
                          <Feather name="mail" size={12} color="#60a5fa" /> رد الإدارة
                        </Text>
                        <Text style={styles.replyContentText}>{inq.admin_reply}</Text>
                      </View>
                    ) : (
                      <View style={styles.pendingBadge}>
                        <Feather name="clock" size={12} color="#fb923c" style={styles.pendingIcon} />
                        <Text style={styles.pendingText}>في انتظار رد الإدارة</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b", // zinc-950
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  spinning: {
    // Rotation is handled natively or dynamically, but we can set keyframes.
  },
  headerText: {
    alignItems: "flex-end",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#f4f4f5", // zinc-100
  },
  subtitle: {
    fontSize: 13,
    color: "#a1a1aa", // zinc-400
    marginTop: 4,
  },
  glassCard: {
    backgroundColor: "#18181b", // zinc-900
    borderColor: "#27272a",
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
    color: "#f4f4f5",
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
    color: "#71717a",
    marginBottom: 8,
    textAlign: "right",
  },
  inputWrapper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#09090b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginLeft: 8,
  },
  textInput: {
    flex: 1,
    color: "#f4f4f5",
    fontSize: 14,
  },
  textArea: {
    backgroundColor: "#09090b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 120,
    textAlignVertical: "top",
  },
  primaryButton: {
    height: 48,
    backgroundColor: "#ea580c",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  buttonIcon: {
    marginLeft: 4,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
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
    color: "#f4f4f5",
  },
  loader: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyCard: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
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
    color: "#f4f4f5",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#71717a",
    textAlign: "center",
  },
  ticketsList: {
    gap: 16,
  },
  ticketCard: {
    backgroundColor: "#18181b",
    borderColor: "#27272a",
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
    color: "#f4f4f5",
    flex: 1,
    textAlign: "right",
  },
  timeBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  timeIcon: {
    marginLeft: 2,
  },
  timeText: {
    fontSize: 11,
    color: "#71717a",
  },
  studentMessageBubble: {
    backgroundColor: "#09090b",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  messageContentText: {
    fontSize: 13,
    color: "#f4f4f5",
    lineHeight: 18,
    textAlign: "right",
  },
  adminReplyBubble: {
    backgroundColor: "rgba(96, 165, 250, 0.08)",
    borderColor: "rgba(96, 165, 250, 0.15)",
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
    color: "#f4f4f5",
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
  },
});
