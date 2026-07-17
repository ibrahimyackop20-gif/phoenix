import React, { useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "@/../components/ThemeProvider";
import { useTranslation } from "react-i18next";

export default function TermsOfService() {
  const router = useRouter();
  const { themeColors } = useAppTheme();
  const { t, i18n } = useTranslation();

  const sections = useMemo(
    () => [
      {
        title: t("privacy_terms_s1_title"),
        content: t("privacy_terms_s1_body"),
      },
      {
        title: t("privacy_terms_s2_title"),
        content: t("privacy_terms_s2_body"),
      },
      {
        title: t("privacy_terms_s3_title"),
        content: t("privacy_terms_s3_body"),
      },
      {
        title: t("privacy_terms_s4_title"),
        content: t("privacy_terms_s4_body"),
      },
      {
        title: t("privacy_terms_s5_title"),
        content: t("privacy_terms_s5_body"),
      },
      {
        title: t("privacy_terms_s6_title"),
        content: t("privacy_terms_s6_body"),
      },
      {
        title: t("privacy_terms_s7_title"),
        content: t("privacy_terms_s7_body"),
      },
    ],
    [t, i18n.language]
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-right" size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.appBarTitle, { color: themeColors.text }]}>{t("privacy_terms_appbar")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.introHeader}>
          <View style={styles.iconWrapper}>
            <Feather name="file-text" size={32} color="#ea580c" />
          </View>
          <Text style={[styles.introTitle, { color: themeColors.text }]}>{t("privacy_terms_intro")}</Text>
          <Text style={[styles.introDate, { color: themeColors.textMuted }]}>{t("privacy_terms_updated")}</Text>
        </View>

        <View style={styles.contentBody}>
          {sections.map((sec, idx) => (
            <View key={idx} style={[styles.sectionCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{sec.title}</Text>
              <Text style={[styles.sectionText, { color: themeColors.textMuted }]}>{sec.content}</Text>
            </View>
          ))}
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
  introHeader: {
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
  introTitle: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    flexShrink: 1,
  },
  introDate: {
    fontSize: 11,
    marginTop: 6,
    textAlign: "center",
    flexShrink: 1,
  },
  contentBody: {
    gap: 16,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "right",
    flexShrink: 1,
  },
  sectionText: {
    fontSize: 12,
    lineHeight: 20,
    textAlign: "right",
    flexShrink: 1,
  },
});
