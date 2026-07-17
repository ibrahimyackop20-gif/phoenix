import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "@/../components/ThemeProvider";
import { useTranslation } from "react-i18next";

export default function ContactSupport() {
  const router = useRouter();
  const { themeColors } = useAppTheme();
  const { t } = useTranslation();

  const handleContactLink = async (type: "email" | "whatsapp" | "telegram") => {
    let url = "";
    if (type === "email") {
      url = "mailto:support@phoenixprint.com?subject=Phoenix%20Print%20Support";
    } else if (type === "whatsapp") {
      // Replace with your real WhatsApp support phone number (with country code, e.g., +964 for Iraq)
      const phone = "9647800000000"; 
      url = `https://wa.me/${phone}`;
    } else if (type === "telegram") {
      const username = "PhoenixPrintSupport"; // Replace with your real Telegram support username or channel link
      url = `https://t.me/${username}`;
    }

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported || type === "email") {
        await Linking.openURL(url);
      } else {
        // Fallback for WhatsApp if app is not installed
        if (type === "whatsapp") {
          await Linking.openURL(`https://api.whatsapp.com/send?phone=9647800000000`);
        } else {
          Alert.alert(t("privacy_support_alert_title"), t("privacy_support_alert_cannot_open"));
        }
      }
    } catch (e) {
      Alert.alert(t("privacy_support_error_title"), t("privacy_support_error_open"));
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-right" size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.appBarTitle, { color: themeColors.text }]}>{t("privacy_support_appbar")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerSection}>
          <View style={styles.iconWrapper}>
            <Feather name="message-square" size={32} color="#ea580c" />
          </View>
          <Text style={[styles.title, { color: themeColors.text }]}>{t("privacy_support_title")}</Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
            {t("privacy_support_subtitle")}
          </Text>
        </View>

        <View style={styles.channelsContainer}>
          {/* WhatsApp Card */}
          <TouchableOpacity
            onPress={() => handleContactLink("whatsapp")}
            style={[styles.channelCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}
          >
            <View style={styles.arrowIcon}>
              <Feather name="chevron-left" size={16} color={themeColors.textMuted} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t("privacy_support_whatsapp_title")}</Text>
              <Text style={[styles.cardDesc, { color: themeColors.textMuted }]}>
                {t("privacy_support_whatsapp_desc")}
              </Text>
            </View>
            <View style={[styles.channelIcon, { backgroundColor: "rgba(34, 197, 94, 0.08)" }]}>
              <Feather name="message-circle" size={18} color="#22c55e" />
            </View>
          </TouchableOpacity>

          {/* Telegram Card */}
          <TouchableOpacity
            onPress={() => handleContactLink("telegram")}
            style={[styles.channelCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}
          >
            <View style={styles.arrowIcon}>
              <Feather name="chevron-left" size={16} color={themeColors.textMuted} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t("privacy_support_telegram_title")}</Text>
              <Text style={[styles.cardDesc, { color: themeColors.textMuted }]}>
                {t("privacy_support_telegram_desc")}
              </Text>
            </View>
            <View style={[styles.channelIcon, { backgroundColor: "rgba(14, 165, 233, 0.08)" }]}>
              <Feather name="send" size={18} color="#0ea5e9" />
            </View>
          </TouchableOpacity>

          {/* Email Card */}
          <TouchableOpacity
            onPress={() => handleContactLink("email")}
            style={[styles.channelCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}
          >
            <View style={styles.arrowIcon}>
              <Feather name="chevron-left" size={16} color={themeColors.textMuted} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t("privacy_support_email_title")}</Text>
              <Text style={[styles.cardDesc, { color: themeColors.textMuted }]}>
                support@phoenixprint.com
              </Text>
            </View>
            <View style={[styles.channelIcon, { backgroundColor: "rgba(234, 88, 12, 0.08)" }]}>
              <Feather name="mail" size={18} color="#ea580c" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Working Hours Info */}
        <View style={[styles.infoCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          <Feather name="clock" size={20} color="#ea580c" style={styles.infoIcon} />
          <View style={styles.infoTextContainer}>
            <Text style={[styles.infoTitle, { color: themeColors.text }]}>{t("privacy_support_hours_title")}</Text>
            <Text style={[styles.infoText, { color: themeColors.textMuted }]}>
              {t("privacy_support_hours_text")}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appBar: {
    flexDirection: "row-reverse",
    minHeight: 56,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(39, 39, 42, 0.5)",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  appBarTitle: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    flexShrink: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(234, 88, 12, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: "#a1a1aa",
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  channelsContainer: {
    gap: 12,
    marginBottom: 28,
  },
  channelCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  arrowIcon: {
    marginRight: 4,
  },
  cardInfo: {
    flex: 1,
    marginRight: 16,
    alignItems: "flex-end",
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "right",
    flexShrink: 1,
  },
  cardDesc: {
    fontSize: 10,
    marginTop: 4,
    textAlign: "right",
    lineHeight: 14,
    flexShrink: 1,
  },
  channelIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCard: {
    flexDirection: "row-reverse",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    alignItems: "center",
  },
  infoIcon: {
    marginLeft: 4,
  },
  infoTextContainer: {
    flex: 1,
    alignItems: "flex-end",
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "right",
    flexShrink: 1,
  },
  infoText: {
    fontSize: 11,
    lineHeight: 18,
    textAlign: "right",
    marginTop: 4,
    flexShrink: 1,
  },
});
