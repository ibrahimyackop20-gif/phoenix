import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  View,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

interface InvoiceItem {
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  store_name?: string;
}

interface InvoiceData {
  orderId: string;
  orderDate: string;
  customerName: string;
  customerPhone: string;
  fullAddress: string;
  governorate: string;
  deliveryZone: string;
  items: InvoiceItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  storeName: string;
}

export default function InvoiceGenerator({ data }: { data: InvoiceData }) {
  const { t } = useTranslation();
  const [generating, setGenerating] = useState(false);

  const invoiceNo = data.orderId.slice(0, 8).toUpperCase();
  const formattedDate = new Date(data.orderDate).toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const itemsSubtotal = data.items.reduce((sum, item) => sum + item.subtotal, 0);

  // Re-creates the identical invoice markup with inline CSS styling for PDF compilation
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body {
          background: #ffffff;
          color: #000000;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          direction: rtl;
          padding: 40px;
          margin: 0;
          box-sizing: border-box;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 30px;
          border-bottom: 3px solid #ea580c;
          padding-bottom: 20px;
        }
        .logo-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }
        .logo-box {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: linear-gradient(135deg, #ea580c, #f97316);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-size: 20px;
          font-weight: bold;
        }
        .brand-name {
          font-size: 28px;
          font-weight: 900;
          color: #1a1a2e;
          margin: 0;
        }
        .brand-sub {
          font-size: 11px;
          color: #666666;
          margin: 2px 0 0;
        }
        .invoice-title-col {
          text-align: left;
        }
        .invoice-title {
          font-size: 22px;
          font-weight: 800;
          color: #ea580c;
          margin: 0 0 8px;
        }
        .info-table {
          font-size: 12px;
          color: #444444;
          border-collapse: collapse;
        }
        .info-table td {
          padding: 2px 6px;
        }
        .customer-card {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 16px 20px;
          margin-bottom: 24px;
          border: 1px solid #e9ecef;
        }
        .card-title {
          font-size: 13px;
          font-weight: 700;
          color: #ea580c;
          margin: 0 0 10px;
          border-bottom: 1px solid #e0e0e0;
          padding-bottom: 6px;
        }
        .customer-table {
          font-size: 12px;
          color: #333333;
          border-collapse: collapse;
          width: 100%;
        }
        .customer-table td {
          padding: 4px 0;
        }
        .label-cell {
          width: 100px;
          color: #666666;
          font-weight: 600;
        }
        .value-cell {
          font-weight: 600;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 12px;
        }
        .items-table th {
          background: #ea580c;
          color: #ffffff;
          padding: 10px 14px;
          font-weight: 700;
        }
        .items-table td {
          padding: 10px 14px;
          border-bottom: 1px solid #eeeeee;
        }
        .total-container {
          display: flex;
          justify-content: flex-start;
          margin-bottom: 30px;
        }
        .total-card {
          width: 280px;
          background: #f8f9fa;
          border-radius: 12px;
          padding: 16px 20px;
          border: 1px solid #e9ecef;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 5px 0;
          font-size: 12px;
        }
        .grand-total-row {
          display: flex;
          justify-content: space-between;
          padding: 10px 0 0;
          margin-top: 8px;
          border-top: 2px solid #ea580c;
          font-size: 16px;
          font-weight: 800;
        }
        .store-banner {
          font-size: 11px;
          color: #888888;
          margin-bottom: 20px;
          padding: 8px 14px;
          background: #f0f0ff;
          border-radius: 8px;
          border: 1px solid #e0e0f0;
        }
        .footer {
          border-top: 2px solid #eeeeee;
          padding-top: 16px;
          text-align: center;
        }
        .footer-title {
          font-size: 13px;
          font-weight: 700;
          color: #ea580c;
          margin: 0 0 4px;
        }
        .footer-text {
          font-size: 10px;
          color: #999999;
          margin: 0;
        }
      </style>
    </head>
    <body>
      <!-- Header -->
      <div class="header">
        <div>
          <div class="logo-row">
            <div class="logo-box">🖨️</div>
            <div>
              <h1 class="brand-name">${t("brand_name")}</h1>
              <p class="brand-sub">${t("brand_name")} Library</p>
            </div>
          </div>
        </div>
        <div class="invoice-title-col">
          <h2 class="invoice-title">فاتورة</h2>
          <table class="info-table">
            <tbody>
              <tr>
                <td style="font-weight: 600; color: #666;">رقم الفاتورة:</td>
                <td style="font-weight: 700; font-family: monospace; font-size: 13px;" dir="ltr">INV-${invoiceNo}</td>
              </tr>
              <tr>
                <td style="font-weight: 600; color: #666;">التاريخ:</td>
                <td>${formattedDate}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Customer Info -->
      <div class="customer-card">
        <h3 class="card-title">معلومات العميل</h3>
        <table class="customer-table">
          <tbody>
            <tr>
              <td class="label-cell">الاسم:</td>
              <td class="value-cell">${data.customerName || "—"}</td>
            </tr>
            <tr>
              <td class="label-cell">رقم الهاتف:</td>
              <td style="text-align: right;" dir="ltr">${data.customerPhone || "—"}</td>
            </tr>
            <tr>
              <td class="label-cell">المحافظة:</td>
              <td>${data.governorate || "—"} ${data.deliveryZone ? `— ${data.deliveryZone}` : ""}</td>
            </tr>
            <tr>
              <td class="label-cell">العنوان:</td>
              <td>${data.fullAddress || "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Items Table -->
      <table class="items-table">
        <thead>
          <tr>
            <th style="text-align: right; border-radius: 0 8px 0 0;">#</th>
            <th style="text-align: right;">المنتج</th>
            <th style="text-align: center;">الكمية</th>
            <th style="text-align: center;">سعر الوحدة</th>
            <th style="text-align: left; border-radius: 8px 0 0 0;">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${data.items
            .map(
              (item, idx) => `
            <tr style="background: ${idx % 2 === 0 ? "#fafafa" : "#ffffff"};">
              <td style="text-align: right; color: #888888;">${idx + 1}</td>
              <td style="text-align: right; font-weight: 600;">
                ${item.name}
                ${
                  item.store_name
                    ? `<span style="display: block; font-size: 10px; color: #999999; margin-top: 2px;">(${item.store_name})</span>`
                    : ""
                }
              </td>
              <td style="text-align: center;">${item.quantity}</td>
              <td style="text-align: center;">${item.price} د.ع</td>
              <td style="text-align: left; font-weight: 600;">${item.subtotal} د.ع</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>

      <!-- Totals -->
      <div class="total-container">
        <div class="total-card">
          <div class="total-row">
            <span style="color: #666666;">المجموع الفرعي:</span>
            <span style="font-weight: 600;">${itemsSubtotal} د.ع</span>
          </div>
          <div class="total-row">
            <span style="color: #666666;">تكلفة التوصيل:</span>
            <span style="font-weight: 600;">${data.shippingCost || 0} د.ع</span>
          </div>
          <div class="grand-total-row">
            <span style="color: #1a1a2e;">الإجمالي الكلي:</span>
            <span style="color: #ea580c;">${data.total} د.ع</span>
          </div>
        </div>
      </div>

      <!-- Store Info -->
      ${
        data.storeName
          ? `
        <div class="store-banner">
          🏪 تم الشراء من متجر: <strong style="color: #333333;">${data.storeName}</strong>
        </div>
      `
          : ""
      }

      <!-- Footer -->
      <div class="footer">
        <p class="footer-title">شكراً لتسوقكم من مكتبة ${t("brand_name")} — مطبعة ${t("brand_name")}</p>
        <p class="footer-text">هذه الفاتورة صادرة إلكترونياً ولا تحتاج إلى توقيع أو ختم</p>
      </div>
    </body>
    </html>
  `;

  const handleDownload = async () => {
    if (generating) return;
    setGenerating(true);

    try {
      // 1. Compile HTML template to a PDF document using expo-print
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
      });

      // 2. Open sharing popup using expo-sharing for device downloads/shares
      await Sharing.shareAsync(uri, {
        UTI: "public.item",
        mimeType: "application/pdf",
        dialogTitle: `فاتورة_${invoiceNo}.pdf`,
      });
    } catch (err) {
      console.error("PDF generation/sharing error:", err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleDownload}
      disabled={generating}
      style={styles.downloadButton}
    >
      {generating ? (
        <ActivityIndicator size="small" color="#ea580c" />
      ) : (
        <Feather name="download" size={14} color="#ea580c" />
      )}
      <Text style={styles.downloadButtonText}>تحميل الفاتورة</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  downloadButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(234, 88, 12, 0.1)",
    borderColor: "rgba(234, 88, 12, 0.2)",
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  downloadButtonText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ea580c",
  },
});
