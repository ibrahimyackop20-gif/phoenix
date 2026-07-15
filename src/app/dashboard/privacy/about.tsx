import React from "react";
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

export default function AboutApp() {
  const router = useRouter();
  const { themeColors } = useAppTheme();

  const licenses = [
    { name: "React & React Native", license: "MIT License" },
    { name: "Expo & Expo SDK Packages", license: "MIT License" },
    { name: "@supabase/supabase-js", license: "MIT License" },
    { name: "react-navigation / expo-router", license: "MIT License" },
    { name: "react-i18next / i18next", license: "MIT License" },
    { name: "tailwindcss / nativewind", license: "MIT License" },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-right" size={22} color={themeColors.text} />
        </TouchableOpacity>
        <Text style={[styles.appBarTitle, { color: themeColors.text }]}>معلومات حول التطبيق</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.brandSection}>
          <View style={styles.logoWrapper}>
            <Feather name="printer" size={44} color="#ea580c" />
          </View>
          <Text style={[styles.appName, { color: themeColors.text }]}>Phoenix Print</Text>
          <Text style={[styles.appSlogan, { color: themeColors.textMuted }]}>
            منصة الطباعة الذكية والمتكاملة للطلاب والجامعات
          </Text>
        </View>

        {/* Info Table */}
        <View style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoValue, { color: themeColors.text }]}>1.0.0</Text>
            <Text style={[styles.infoLabel, { color: themeColors.textMuted }]}>إصدار التطبيق (Version)</Text>
          </View>
          <View style={[styles.infoRow, styles.rowBorder, { borderTopColor: themeColors.cardBorder }]}>
            <Text style={[styles.infoValue, { color: themeColors.text }]}>104</Text>
            <Text style={[styles.infoLabel, { color: themeColors.textMuted }]}>رقم البناء (Build Number)</Text>
          </View>
          <View style={[styles.infoRow, styles.rowBorder, { borderTopColor: themeColors.cardBorder }]}>
            <Text style={[styles.infoValue, { color: themeColors.text }]}>Phoenix Team</Text>
            <Text style={[styles.infoLabel, { color: themeColors.textMuted }]}>المطور المسؤول (Developer)</Text>
          </View>
          <View style={[styles.infoRow, styles.rowBorder, { borderTopColor: themeColors.cardBorder }]}>
            <Text style={[styles.infoValue, { color: themeColors.text }]}>العراق، بغداد</Text>
            <Text style={[styles.infoLabel, { color: themeColors.textMuted }]}>المقر الإداري</Text>
          </View>
        </View>

        {/* Open Source Licenses Section */}
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>تراخيص البرمجيات مفتوحة المصدر</Text>
        <View style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
          {licenses.map((lic, idx) => (
            <View
              key={idx}
              style={[
                styles.licenseRow,
                idx > 0 && styles.rowBorder,
                idx > 0 && { borderTopColor: themeColors.cardBorder },
              ]}
            >
              <Text style={styles.licenseText}>{lic.license}</Text>
              <Text style={[styles.licenseName, { color: themeColors.text }]}>{lic.name}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.copyrightText, { color: themeColors.textMuted }]}>
          حقوق الطبع والنشر © 2026 Phoenix Print. جميع الحقوق محفوظة.
        </Text>
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
  brandSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoWrapper: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "rgba(234, 88, 12, 0.08)",
    borderColor: "rgba(234, 88, 12, 0.15)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  appName: {
    fontSize: 20,
    fontWeight: "bold",
  },
  appSlogan: {
    fontSize: 11,
    marginTop: 6,
    textAlign: "center",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  rowBorder: {
    borderTopWidth: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "bold",
  },
  infoValue: {
    fontSize: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "right",
    paddingRight: 4,
  },
  licenseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  licenseName: {
    fontSize: 12,
    fontWeight: "bold",
  },
  licenseText: {
    fontSize: 11,
    color: "#71717a",
  },
  copyrightText: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 8,
  },
});
