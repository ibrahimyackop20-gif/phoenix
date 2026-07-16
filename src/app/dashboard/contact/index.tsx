import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Clipboard,
  KeyboardAvoidingView,
  Platform,
  I18nManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather, FontAwesome, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../../components/ThemeProvider";
import {
  CONTACT_EMAIL,
  CONTACT_MAILTO,
  CONTACT_TEL,
  CONTACT_TELEGRAM_URL,
  CONTACT_TELEGRAM_USER,
  CONTACT_WHATSAPP_DISPLAY,
  CONTACT_WHATSAPP_URL,
  sendContactMessage,
} from "../../../../lib/contactApi";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactUsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { themeColors, isDark } = useAppTheme();
  const styles = useMemo(
    () => getStyles(themeColors, isDark),
    [themeColors, isDark]
  );
  const rtl = i18n.language === "ar" || I18nManager.isRTL;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = (key: string, value: string) => {
    Clipboard.setString(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setFormError(t("contact_open_failed"));
    }
  };

  const validate = (): boolean => {
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      setFieldError(t("contact_err_required"));
      return false;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setFieldError(t("contact_err_email"));
      return false;
    }
    if (message.trim().length < 10) {
      setFieldError(t("contact_err_message_short"));
      return false;
    }
    setFieldError("");
    return true;
  };

  const handleSubmit = async () => {
    setFormError("");
    setSuccess(false);
    if (!validate()) return;

    setSending(true);
    try {
      const result = await sendContactMessage({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
      });

      if (!result.ok) {
        if (result.error === "validation_email") {
          setFieldError(t("contact_err_email"));
        } else if (result.error === "validation_message_short") {
          setFieldError(t("contact_err_message_short"));
        } else if (result.error === "validation_required") {
          setFieldError(t("contact_err_required"));
        } else if (result.error === "not_configured") {
          setFormError(t("contact_err_config"));
        } else {
          setFormError(t("contact_err_send"));
        }
        return;
      }

      setSuccess(true);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      setFieldError("");
    } catch {
      setFormError(t("contact_err_send"));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.appBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
          >
            <Feather
              name={rtl ? "arrow-right" : "arrow-left"}
              size={22}
              color={themeColors.text}
            />
          </TouchableOpacity>
          <Text style={styles.appBarTitle}>{t("contact_title")}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.headerTitle}>{t("contact_title")}</Text>
          <Text style={styles.headerSubtitle}>{t("contact_subtitle")}</Text>

          {/* Email card */}
          <View style={styles.card}>
            <View style={styles.cardIconWrap}>
              <Feather name="mail" size={22} color="#ea580c" />
            </View>
            <Text style={styles.cardLabel}>{t("contact_email_label")}</Text>
            <Text style={styles.cardValue} selectable>
              {CONTACT_EMAIL}
            </Text>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => copyText("email", CONTACT_EMAIL)}
              >
                <Feather name="copy" size={14} color={themeColors.text} />
                <Text style={styles.secondaryBtnText}>
                  {copiedKey === "email" ? t("contact_copied") : t("contact_copy")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => openUrl(CONTACT_MAILTO)}
              >
                <Feather name="send" size={14} color="#ffffff" />
                <Text style={styles.primaryBtnText}>{t("contact_send_email")}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* WhatsApp card */}
          <View style={styles.card}>
            <View style={[styles.cardIconWrap, { backgroundColor: "rgba(37, 211, 102, 0.12)" }]}>
              <FontAwesome name="whatsapp" size={24} color="#25d366" />
            </View>
            <Text style={styles.cardLabel}>{t("contact_whatsapp_label")}</Text>
            <Text style={styles.cardValue} selectable>
              {CONTACT_WHATSAPP_DISPLAY}
            </Text>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => copyText("wa", CONTACT_WHATSAPP_DISPLAY)}
              >
                <Feather name="copy" size={14} color={themeColors.text} />
                <Text style={styles.secondaryBtnText}>
                  {copiedKey === "wa" ? t("contact_copied") : t("contact_copy")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: "#25d366" }]}
                onPress={() => openUrl(CONTACT_WHATSAPP_URL)}
              >
                <FontAwesome name="whatsapp" size={14} color="#ffffff" />
                <Text style={styles.primaryBtnText}>{t("contact_open_whatsapp")}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Telegram card */}
          <View style={styles.card}>
            <View style={[styles.cardIconWrap, { backgroundColor: "rgba(41, 182, 246, 0.12)" }]}>
              <FontAwesome name="telegram" size={22} color="#29b6f6" />
            </View>
            <Text style={styles.cardLabel}>{t("contact_telegram_label")}</Text>
            <Text style={styles.cardValue} selectable>
              @{CONTACT_TELEGRAM_USER}
            </Text>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => copyText("tg", `@${CONTACT_TELEGRAM_USER}`)}
              >
                <Feather name="copy" size={14} color={themeColors.text} />
                <Text style={styles.secondaryBtnText}>
                  {copiedKey === "tg" ? t("contact_copied") : t("contact_copy")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: "#0088cc" }]}
                onPress={() => openUrl(CONTACT_TELEGRAM_URL)}
              >
                <FontAwesome name="telegram" size={14} color="#ffffff" />
                <Text style={styles.primaryBtnText}>{t("contact_open_telegram")}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Send message form */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{t("contact_form_title")}</Text>

            {success ? (
              <View style={styles.successBanner}>
                <Feather name="check-circle" size={18} color="#10b981" />
                <Text style={styles.successText}>{t("contact_success")}</Text>
              </View>
            ) : null}

            {fieldError ? <Text style={styles.errorText}>{fieldError}</Text> : null}
            {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

            <Text style={styles.inputLabel}>{t("contact_form_name")}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t("contact_form_name_placeholder")}
              placeholderTextColor={themeColors.textMuted}
              style={styles.input}
              textAlign={rtl ? "right" : "left"}
              editable={!sending}
            />

            <Text style={styles.inputLabel}>{t("contact_form_email")}</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t("contact_form_email_placeholder")}
              placeholderTextColor={themeColors.textMuted}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textAlign={rtl ? "right" : "left"}
              editable={!sending}
            />

            <Text style={styles.inputLabel}>{t("contact_form_subject")}</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder={t("contact_form_subject_placeholder")}
              placeholderTextColor={themeColors.textMuted}
              style={styles.input}
              textAlign={rtl ? "right" : "left"}
              editable={!sending}
            />

            <Text style={styles.inputLabel}>{t("contact_form_message")}</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={t("contact_form_message_placeholder")}
              placeholderTextColor={themeColors.textMuted}
              style={[styles.input, styles.messageInput]}
              multiline
              textAlignVertical="top"
              textAlign={rtl ? "right" : "left"}
              editable={!sending}
            />

            <TouchableOpacity
              style={[styles.submitBtn, sending && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Feather name="send" size={16} color="#ffffff" />
                  <Text style={styles.submitBtnText}>{t("contact_form_submit")}</Text>
                </>
              )}
            </TouchableOpacity>
            {sending ? (
              <Text style={styles.sendingHint}>{t("contact_form_sending")}</Text>
            ) : null}
          </View>

          {/* Quick actions */}
          <Text style={styles.quickTitle}>{t("contact_quick_actions")}</Text>
          <View style={styles.quickGrid}>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => openUrl(CONTACT_TEL)}
            >
              <Ionicons name="call-outline" size={18} color="#ea580c" />
              <Text style={styles.quickBtnText}>{t("contact_call_us")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => openUrl(CONTACT_WHATSAPP_URL)}
            >
              <FontAwesome name="whatsapp" size={18} color="#25d366" />
              <Text style={styles.quickBtnText}>{t("contact_open_whatsapp")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => openUrl(CONTACT_TELEGRAM_URL)}
            >
              <FontAwesome name="telegram" size={18} color="#29b6f6" />
              <Text style={styles.quickBtnText}>{t("contact_open_telegram")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => openUrl(CONTACT_MAILTO)}
            >
              <MaterialCommunityIcons name="email-outline" size={18} color="#ea580c" />
              <Text style={styles.quickBtnText}>{t("contact_send_email")}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (themeColors: any, _isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    appBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.cardBorder,
    },
    backBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    appBarTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: themeColors.text,
    },
    scroll: {
      padding: 20,
      paddingBottom: 40,
      gap: 14,
    },
    headerTitle: {
      fontSize: 26,
      fontWeight: "800",
      color: themeColors.text,
      textAlign: "center",
      marginTop: 4,
    },
    headerSubtitle: {
      fontSize: 14,
      lineHeight: 22,
      color: themeColors.textMuted,
      textAlign: "center",
      marginBottom: 8,
      paddingHorizontal: 8,
    },
    card: {
      backgroundColor: themeColors.cardBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      borderRadius: 18,
      padding: 18,
      alignItems: "center",
    },
    cardIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: "rgba(234, 88, 12, 0.12)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    cardLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: themeColors.textMuted,
      marginBottom: 4,
    },
    cardValue: {
      fontSize: 16,
      fontWeight: "700",
      color: themeColors.text,
      marginBottom: 14,
      textAlign: "center",
    },
    cardActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "center",
      width: "100%",
    },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "#ea580c",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
    },
    primaryBtnText: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "700",
    },
    secondaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: themeColors.secondary,
      borderWidth: 1,
      borderColor: themeColors.cardBorder,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
    },
    secondaryBtnText: {
      color: themeColors.text,
      fontSize: 13,
      fontWeight: "600",
    },
    formCard: {
      backgroundColor: themeColors.cardBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      borderRadius: 18,
      padding: 18,
      marginTop: 6,
    },
    formTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: themeColors.text,
      textAlign: "center",
      marginBottom: 14,
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: themeColors.textMuted,
      marginBottom: 6,
      marginTop: 8,
    },
    input: {
      backgroundColor: themeColors.inputBg,
      borderColor: themeColors.inputBorder,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: themeColors.text,
      fontSize: 14,
    },
    messageInput: {
      minHeight: 120,
    },
    submitBtn: {
      marginTop: 16,
      backgroundColor: "#ea580c",
      borderRadius: 14,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    submitBtnDisabled: {
      opacity: 0.65,
    },
    submitBtnText: {
      color: "#ffffff",
      fontSize: 15,
      fontWeight: "800",
    },
    sendingHint: {
      marginTop: 8,
      textAlign: "center",
      color: themeColors.textMuted,
      fontSize: 12,
    },
    errorText: {
      color: "#ef4444",
      fontSize: 13,
      textAlign: "center",
      marginBottom: 8,
    },
    successBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: "rgba(16, 185, 129, 0.12)",
      borderColor: "rgba(16, 185, 129, 0.3)",
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    successText: {
      color: "#10b981",
      fontSize: 13,
      fontWeight: "600",
      flexShrink: 1,
      textAlign: "center",
    },
    quickTitle: {
      marginTop: 10,
      fontSize: 15,
      fontWeight: "700",
      color: themeColors.text,
      textAlign: "center",
    },
    quickGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      justifyContent: "center",
    },
    quickBtn: {
      width: "46%",
      minWidth: 140,
      backgroundColor: themeColors.cardBg,
      borderColor: themeColors.cardBorder,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 10,
      alignItems: "center",
      gap: 6,
    },
    quickBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: themeColors.text,
      textAlign: "center",
    },
  });
