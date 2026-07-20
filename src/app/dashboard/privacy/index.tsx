import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/../lib/supabaseClient";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useAppTheme, type ThemeColors } from "@/../components/ThemeProvider";
import { useResponsiveTheme } from "@/hooks/useResponsiveTheme";
import * as ExpoPrint from "expo-print";
import * as ExpoSharing from "expo-sharing";
import { useTranslation } from "react-i18next";

export default function PrivacyCenter() {
  const router = useRouter();
  const { themeColors } = useAppTheme();
  const { horizontalPadding, formMaxWidth } = useResponsiveTheme();
  const styles = useMemo(() => getStyles(themeColors, horizontalPadding, formMaxWidth), [themeColors, horizontalPadding, formMaxWidth]);
  const { t, i18n } = useTranslation();
  const [downloading, setDownloading] = useState(false);

  const menuItems = useMemo(
    () => [
      {
        title: t("privacy_menu_policy_title"),
        description: t("privacy_menu_policy_desc"),
        icon: "shield",
        route: "/dashboard/privacy/policy",
        color: themeColors.primary,
      },
      {
        title: t("privacy_menu_terms_title"),
        description: t("privacy_menu_terms_desc"),
        icon: "file-text",
        route: "/dashboard/privacy/terms",
        color: themeColors.primary,
      },
      {
        title: t("privacy_menu_permissions_title"),
        description: t("privacy_menu_permissions_desc"),
        icon: "key",
        route: "/dashboard/privacy/permissions",
        color: themeColors.primary,
      },
      {
        title: t("privacy_menu_support_title"),
        description: t("privacy_menu_support_desc"),
        icon: "help-circle",
        route: "/dashboard/privacy/support",
        color: themeColors.primary,
      },
      {
        title: t("privacy_menu_about_title"),
        description: t("privacy_menu_about_desc"),
        icon: "info",
        route: "/dashboard/privacy/about",
        color: themeColors.primary,
      },
    ],
    [t, i18n.language, themeColors.primary]
  );

  const handleDownloadData = async () => {
    setDownloading(true);
    try {
      const dateLocale = i18n.language === "ar" ? "ar-EG" : "en-US";
      const htmlDir = i18n.language === "ar" ? "rtl" : "ltr";
      const htmlLang = i18n.language === "ar" ? "ar" : "en";

      const mapOrderStatus = (status: string) => {
        switch (status) {
          case "Pending":
            return t("privacy_export_status_pending");
          case "Printing":
            return t("privacy_export_status_printing");
          case "Completed":
            return t("privacy_export_status_completed");
          default:
            return t("privacy_export_status_cancelled");
        }
      };

      const mapRole = (role: string | undefined) => {
        if (role === "student") return t("privacy_export_role_student");
        if (role === "admin") return t("privacy_export_role_admin");
        return t("privacy_export_role_library");
      };

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("privacy_export_no_session"));

      // Fetch Profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      // Fetch Addresses
      const { data: addresses } = await supabase
        .from("delivery_addresses")
        .select("*")
        .eq("user_id", user.id);

      // Fetch Orders
      const { data: orders } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id);

      // Generate HTML Template
      const htmlContent = `
        <html dir="${htmlDir}" lang="${htmlLang}">
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'system-ui', sans-serif; padding: 30px; background-color: #ffffff; color: #18181b; line-height: 1.6; }
              h1 { color: #ea580c; border-bottom: 2px solid #ea580c; padding-bottom: 12px; font-size: 24px; text-align: center; }
              h2 { color: #27272a; margin-top: 30px; border-right: 4px solid #ea580c; padding-right: 10px; font-size: 18px; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; }
              th, td { border: 1px solid #e4e4e7; padding: 12px; text-align: right; font-size: 13px; }
              th { background-color: #f4f4f5; font-weight: bold; color: #3f3f46; }
              .meta { font-size: 11px; color: #71717a; margin-bottom: 30px; text-align: left; }
              .section { margin-bottom: 40px; }
              .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #a1a1aa; border-top: 1px solid #e4e4e7; padding-top: 15px; }
            </style>
          </head>
          <body>
            <h1>${t("privacy_export_report_title")}</h1>
            <div class="meta">${t("privacy_export_report_date", { date: new Date().toLocaleDateString(dateLocale) })}</div>
            
            <div class="section">
              <h2>${t("privacy_export_section_profile")}</h2>
              <table>
                <tr><th>${t("privacy_export_uuid")}</th><td>${user.id}</td></tr>
                <tr><th>${t("privacy_export_email")}</th><td>${user.email || t("privacy_export_na")}</td></tr>
                <tr><th>${t("privacy_export_full_name")}</th><td>${profile?.full_name || t("privacy_export_na")}</td></tr>
                <tr><th>${t("privacy_export_phone")}</th><td>${profile?.phone_number || t("privacy_export_na")}</td></tr>
                <tr><th>${t("privacy_export_role")}</th><td>${mapRole(profile?.role)}</td></tr>
                <tr><th>${t("privacy_export_balance")}</th><td>${profile?.balance || 0} ${t("currency")}</td></tr>
                <tr><th>${t("privacy_export_joined")}</th><td>${profile?.created_at ? new Date(profile.created_at).toLocaleDateString(dateLocale) : t("privacy_export_unknown")}</td></tr>
              </table>
            </div>

            <div class="section">
              <h2>${t("privacy_export_section_addresses")}</h2>
              ${addresses && addresses.length > 0 ? `
                <table>
                  <thead>
                    <tr>
                      <th>${t("privacy_export_addr_title")}</th>
                      <th>${t("privacy_export_addr_area")}</th>
                      <th>${t("privacy_export_addr_landmark")}</th>
                      <th>${t("privacy_export_addr_phone")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${addresses.map((a: any) => `
                      <tr>
                        <td><strong>${a.title}</strong></td>
                        <td>${a.area}</td>
                        <td>${a.nearby_landmark || t("privacy_export_no_landmark")}</td>
                        <td>${a.phone_number}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : `<p style="color: #71717a; font-style: italic;">${t("privacy_export_no_addresses")}</p>`}
            </div>

            <div class="section">
              <h2>${t("privacy_export_section_orders")}</h2>
              ${orders && orders.length > 0 ? `
                <table>
                  <thead>
                    <tr>
                      <th>${t("privacy_export_order_id")}</th>
                      <th>${t("privacy_export_order_status")}</th>
                      <th>${t("privacy_export_order_date")}</th>
                      <th>${t("privacy_export_order_total")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${orders.map((o: any) => `
                      <tr>
                        <td><code>${o.id.substring(0, 8)}...</code></td>
                        <td>${mapOrderStatus(o.status)}</td>
                        <td>${new Date(o.created_at).toLocaleDateString(dateLocale)}</td>
                        <td>${o.total_price || 0} ${t("currency")}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : `<p style="color: #71717a; font-style: italic;">${t("privacy_export_no_orders")}</p>`}
            </div>

            <div class="footer">
              ${t("privacy_export_footer")}
            </div>
          </body>
        </html>
      `;

      // Print PDF
      const { uri } = await ExpoPrint.printToFileAsync({ html: htmlContent });
      
      // Share PDF
      await ExpoSharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: t("privacy_export_dialog_title"),
        UTI: "com.adobe.pdf"
      });

    } catch (err: any) {
      console.error(err);
      Alert.alert(t("privacy_export_error_title"), t("privacy_export_error_prefix") + err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.screenBg }]}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-right" size={22} color={themeColors.textStrong} />
        </TouchableOpacity>
        <Text style={[styles.appBarTitle, { color: themeColors.textStrong }]} maxFontSizeMultiplier={1.35}>{t("privacy_center_title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionDesc, { color: themeColors.textSoft }]} maxFontSizeMultiplier={1.35}>
          {t("privacy_center_desc")}
        </Text>

        <View style={styles.listContainer}>
          {menuItems.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => router.push(item.route as any)}
              style={[styles.menuCard, { backgroundColor: themeColors.surface, borderColor: themeColors.borderSoft }]}
            >
              <Feather name="chevron-left" size={16} color={themeColors.textSoft} />
              <View style={styles.cardContent}>
                <Text style={[styles.cardTitle, { color: themeColors.textStrong }]} maxFontSizeMultiplier={1.35}>{item.title}</Text>
                <Text style={[styles.cardDesc, { color: themeColors.textSoft }]} maxFontSizeMultiplier={1.35}>{item.description}</Text>
              </View>
              <View style={[styles.iconWrapper, { backgroundColor: themeColors.primarySoftBg }]}>
                <Feather name={item.icon as any} size={18} color={item.color} />
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            onPress={handleDownloadData}
            disabled={downloading}
            style={[styles.menuCard, { backgroundColor: themeColors.surface, borderColor: themeColors.borderSoft }]}
          >
            {downloading ? (
              <ActivityIndicator size="small" color={themeColors.primary} />
            ) : (
              <Feather name="chevron-left" size={16} color={themeColors.textSoft} />
            )}
            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: themeColors.textStrong }]} maxFontSizeMultiplier={1.35}>{t("privacy_export_title")}</Text>
              <Text style={[styles.cardDesc, { color: themeColors.textSoft }]} maxFontSizeMultiplier={1.35}>
                {t("privacy_export_desc")}
              </Text>
            </View>
            <View style={[styles.iconWrapper, { backgroundColor: themeColors.successSoftBg }]}>
              <Feather name="download" size={18} color={themeColors.success} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/dashboard/privacy/delete-account" as any)}
            style={[styles.menuCard, styles.dangerCard, { backgroundColor: themeColors.surface, borderColor: themeColors.dangerSoftBorder }]}
          >
            <Feather name="chevron-left" size={16} color={themeColors.danger} />
            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: themeColors.danger }]} maxFontSizeMultiplier={1.35}>{t("privacy_delete_menu_title")}</Text>
              <Text style={[styles.cardDesc, { color: themeColors.textSoft }]} maxFontSizeMultiplier={1.35}>
                {t("privacy_delete_menu_desc")}
              </Text>
            </View>
            <View style={[styles.iconWrapper, { backgroundColor: themeColors.dangerSoftBg }]}>
              <Feather name="trash-2" size={18} color={themeColors.danger} />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (c: ThemeColors, horizontalPadding: number, formMaxWidth: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    appBar: {
      flexDirection: "row-reverse",
      minHeight: 56,
      paddingVertical: 8,
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: horizontalPadding,
      borderBottomWidth: 1,
      borderBottomColor: c.borderSoft,
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
    padding: horizontalPadding,
    paddingBottom: 40,
    width: "100%",
    maxWidth: formMaxWidth,
    alignSelf: "center",
  },
  sectionDesc: {
    fontSize: 13,
    lineHeight: 22,
    textAlign: "right",
    marginBottom: 24,
  },
  listContainer: {
    gap: 12,
  },
  menuCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  dangerCard: {
    borderColor: c.dangerSoftBorder,
  },
  cardContent: {
    flex: 1,
    marginRight: 16,
    alignItems: "flex-end",
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "right",
    flexShrink: 1,
  },
  cardDesc: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
    textAlign: "right",
    flexShrink: 1,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
