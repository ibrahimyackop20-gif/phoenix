import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Linking,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather, FontAwesome5 } from "@expo/vector-icons";
import { useAppTheme } from "@/../components/ThemeProvider";

export default function ContactSupport() {
  const router = useRouter();
  const { themeColors } = useAppTheme();

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
          Alert.alert("تنبيه", "عذراً، لا يمكن فتح التطبيق المطلوبة على هذا الجهاز.");
        }
      }
    } catch (e) {
      Alert.alert("خطأ", "فشل فتح قناة الاتصال المطلوبة.");
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-right" size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.appBarTitle, { color: themeColors.text }]}>الدعم الفني والمساعدة</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerSection}>
          <View style={styles.iconWrapper}>
            <Feather name="message-square" size={32} color="#ea580c" />
          </View>
          <Text style={[styles.title, { color: themeColors.text }]}>فريق الدعم الفني في خدمتك</Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
            نسعد بالإجابة عن كافة استفساراتك وحل أي مشكلة تواجهك أثناء طباعة أو توصيل مستنداتك.
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
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>تواصل عبر واتساب (WhatsApp)</Text>
              <Text style={[styles.cardDesc, { color: themeColors.textMuted }]}>
                محادثة فورية وسريعة مع موظف خدمة العملاء لاستفسارات الطلبات.
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
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>تواصل عبر تليجرام (Telegram)</Text>
              <Text style={[styles.cardDesc, { color: themeColors.textMuted }]}>
                أرسل استفسارك أو الملفات التي تواجه مشكلة في معالجتها مباشرة.
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
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>البريد الإلكتروني الرسمي</Text>
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
            <Text style={[styles.infoTitle, { color: themeColors.text }]}>ساعات عمل الدعم الفني:</Text>
            <Text style={[styles.infoText, { color: themeColors.textMuted }]}>
              يومياً من الساعة 8:00 صباحاً وحتى الساعة 10:00 مساءً (توقيت العراق).
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
    height: 56,
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
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
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
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "bold",
  },
  cardDesc: {
    fontSize: 10,
    marginTop: 4,
    textAlign: "right",
    lineHeight: 14,
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
  },
  infoText: {
    fontSize: 11,
    lineHeight: 18,
    textAlign: "right",
    marginTop: 4,
  },
});
