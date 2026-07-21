/**
 * Print-order PDF receipt (A4 invoice) for Phoenix Print.
 * Uses expo-print + expo-sharing. QR embeds Order ID via a stable QR image API.
 */

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { TFunction } from "i18next";
import {
  displayOrderId,
  formatOrderDate,
  getColorModeLabel,
  getPaperSizeLabel,
  getPaymentLabel,
  getPrintStatusLabel,
  getPrintTotal,
  type PrintOrder,
} from "./ordersShared";

export type PrintReceiptData = {
  order: PrintOrder;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  bwPrice: number;
  colorPrice: number;
  locale: string;
  brandName: string;
};

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getPaymentStatusLabel(
  status: string | null | undefined,
  t: TFunction
): string {
  if (!status) return "—";
  const map: Record<string, string> = {
    paid: "payment_status_paid",
    unpaid: "payment_status_unpaid",
    pending: "payment_status_pending",
    pending_verification: "payment_status_pending_verification",
  };
  const key = map[status];
  return key ? t(key) : status;
}

/** Soft ETA text when no DB estimated_completion_at exists. */
export function getEstimatedCompletionLabel(
  order: PrintOrder,
  t: TFunction,
  locale = "en"
): string | null {
  const fromDb = (order as PrintOrder & { estimated_completion_at?: string | null })
    .estimated_completion_at;
  if (fromDb) {
    return formatOrderDate(fromDb, locale);
  }

  switch (order.status) {
    case "Pending":
      return t("order_detail_eta_pending");
    case "Accepted":
    case "Printing":
      return t("order_detail_eta_processing");
    case "Out for Delivery":
      return t("order_detail_eta_delivery");
    case "Completed":
      return t("order_detail_eta_done");
    default:
      return null;
  }
}

export function buildPrintReceiptHtml(
  data: PrintReceiptData,
  t: TFunction
): string {
  const { order, customerName, customerPhone, customerEmail, bwPrice, colorPrice, brandName } =
    data;
  const orderNo = displayOrderId(order.id).replace("#", "");
  const dateLabel = formatOrderDate(order.created_at, data.locale);
  const total = getPrintTotal(order, bwPrice, colorPrice).toLocaleString();
  const currency = t("currency");
  const status = getPrintStatusLabel(order.status, t);
  const payment = getPaymentLabel(order.payment_method, t);
  const payStatus = getPaymentStatusLabel(order.payment_status, t);
  const paperType = order.a4_paper_type || order.paper_type || "—";
  const paperSize = getPaperSizeLabel(order, t);
  const colorMode = getColorModeLabel(order, t);
  const qty = String(order.num_copies ?? order.copies ?? 1);
  const notes = order.description?.trim() || "—";
  const fileName = order.file_name || "—";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(order.id)}`;
  const isRtl = data.locale === "ar" || data.locale.startsWith("ar");

  return `<!DOCTYPE html>
<html lang="${isRtl ? "ar" : "en"}" dir="${isRtl ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 portrait; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #0F172A;
      background: #ffffff;
      font-size: 12px;
      line-height: 1.45;
    }
    .top-bar {
      height: 6px;
      background: linear-gradient(90deg, #FF5A1F 0%, #ea580c 55%, #0F172A 100%);
      border-radius: 4px;
      margin-bottom: 22px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 22px;
      padding-bottom: 16px;
      border-bottom: 2px solid #E2E8F0;
    }
    .brand-row { display: flex; align-items: center; gap: 12px; }
    .logo {
      width: 52px; height: 52px; border-radius: 14px;
      background: #0F172A;
      color: #FF5A1F;
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: 18px;
      border: 2px solid #FF5A1F;
    }
    .brand-name { margin: 0; font-size: 24px; font-weight: 900; color: #0F172A; letter-spacing: -0.3px; }
    .brand-sub { margin: 2px 0 0; font-size: 11px; color: #64748B; font-weight: 600; }
    .doc-title { text-align: ${isRtl ? "left" : "right"}; }
    .doc-title h2 { margin: 0 0 6px; font-size: 20px; color: #FF5A1F; font-weight: 800; }
    .mono { font-family: ui-monospace, Consolas, monospace; font-weight: 700; }
    .grid {
      display: flex; gap: 14px; margin-bottom: 18px;
    }
    .card {
      flex: 1;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 14px;
      padding: 14px 16px;
    }
    .card h3 {
      margin: 0 0 10px;
      font-size: 12px;
      color: #FF5A1F;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    table.info { width: 100%; border-collapse: collapse; }
    table.info td { padding: 4px 0; vertical-align: top; }
    .label { color: #64748B; font-weight: 600; width: 42%; }
    .value { color: #0F172A; font-weight: 700; }
    .summary {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 18px;
      overflow: hidden;
      border-radius: 12px;
    }
    .summary th {
      background: #0F172A;
      color: #ffffff;
      padding: 11px 12px;
      font-size: 11px;
      font-weight: 700;
      text-align: ${isRtl ? "right" : "left"};
    }
    .summary td {
      padding: 11px 12px;
      border-bottom: 1px solid #E2E8F0;
      font-weight: 600;
    }
    .summary tr:nth-child(even) td { background: #F8FAFC; }
    .total-row {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 22px;
    }
    .total-box {
      min-width: 240px;
      background: #0F172A;
      color: #ffffff;
      border-radius: 14px;
      padding: 14px 18px;
    }
    .total-box .lbl { font-size: 11px; color: #94A3B8; font-weight: 600; }
    .total-box .amt { font-size: 22px; font-weight: 900; color: #FF5A1F; margin-top: 4px; }
    .qr-block {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px;
      border: 1px dashed #CBD5E1;
      border-radius: 14px;
      margin-bottom: 22px;
      background: #ffffff;
    }
    .qr-block img { width: 110px; height: 110px; border-radius: 8px; }
    .qr-caption { font-size: 11px; color: #64748B; }
    .qr-caption strong { display: block; color: #0F172A; font-size: 13px; margin-bottom: 4px; }
    .footer {
      border-top: 2px solid #E2E8F0;
      padding-top: 14px;
      text-align: center;
    }
    .footer strong { color: #FF5A1F; font-size: 13px; }
    .footer p { margin: 4px 0 0; color: #94A3B8; font-size: 10px; }
    .pill {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      background: rgba(255,90,31,0.12);
      color: #ea580c;
      font-weight: 800;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="top-bar"></div>
  <div class="header">
    <div class="brand-row">
      <div class="logo">PP</div>
      <div>
        <h1 class="brand-name">${esc(brandName)}</h1>
        <p class="brand-sub">${esc(t("receipt_brand_tagline"))}</p>
      </div>
    </div>
    <div class="doc-title">
      <h2>${esc(t("receipt_title"))}</h2>
      <div class="mono">#${esc(orderNo)}</div>
      <div style="margin-top:6px;color:#64748B;font-weight:600;">${esc(dateLabel)}</div>
      <div style="margin-top:8px;"><span class="pill">${esc(status)}</span></div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h3>${esc(t("receipt_customer_section"))}</h3>
      <table class="info">
        <tr><td class="label">${esc(t("order_detail_customer"))}</td><td class="value">${esc(customerName || "—")}</td></tr>
        <tr><td class="label">${esc(t("order_detail_phone"))}</td><td class="value" dir="ltr">${esc(customerPhone || "—")}</td></tr>
        <tr><td class="label">${esc(t("order_detail_email"))}</td><td class="value" dir="ltr">${esc(customerEmail || "—")}</td></tr>
      </table>
    </div>
    <div class="card">
      <h3>${esc(t("receipt_payment_section"))}</h3>
      <table class="info">
        <tr><td class="label">${esc(t("order_detail_payment"))}</td><td class="value">${esc(payment)}</td></tr>
        <tr><td class="label">${esc(t("order_detail_payment_status"))}</td><td class="value">${esc(payStatus)}</td></tr>
        <tr><td class="label">${esc(t("order_list_status"))}</td><td class="value">${esc(status)}</td></tr>
      </table>
    </div>
  </div>

  <table class="summary">
    <thead>
      <tr>
        <th>${esc(t("receipt_col_item"))}</th>
        <th>${esc(t("order_detail_paper_type"))}</th>
        <th>${esc(t("order_detail_paper_size"))}</th>
        <th>${esc(t("order_detail_color_mode"))}</th>
        <th>${esc(t("order_detail_copies"))}</th>
        <th>${esc(t("order_detail_price"))}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${esc(fileName)}</td>
        <td>${esc(paperType)}</td>
        <td>${esc(paperSize)}</td>
        <td>${esc(colorMode)}</td>
        <td>${esc(qty)}</td>
        <td>${esc(total)} ${esc(currency)}</td>
      </tr>
    </tbody>
  </table>

  <div class="total-row">
    <div class="total-box">
      <div class="lbl">${esc(t("receipt_grand_total"))}</div>
      <div class="amt">${esc(total)} ${esc(currency)}</div>
    </div>
  </div>

  <div class="card" style="margin-bottom:18px;">
    <h3>${esc(t("order_detail_notes"))}</h3>
    <div class="value" style="font-weight:600;color:#334155;">${esc(notes)}</div>
  </div>

  <div class="qr-block">
    <img src="${qrUrl}" alt="QR" />
    <div class="qr-caption">
      <strong>${esc(t("receipt_qr_title"))}</strong>
      ${esc(t("receipt_qr_hint"))}
      <div class="mono" style="margin-top:8px;font-size:11px;color:#0F172A;" dir="ltr">${esc(order.id)}</div>
    </div>
  </div>

  <div class="footer">
    <strong>${esc(t("receipt_thank_you"))}</strong>
    <p>${esc(t("receipt_footer_note"))}</p>
  </div>
</body>
</html>`;
}

export async function generatePrintReceiptPdf(
  data: PrintReceiptData,
  t: TFunction
): Promise<string> {
  const html = buildPrintReceiptHtml(data, t);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

export async function sharePrintReceiptPdf(
  uri: string,
  orderId: string,
  dialogTitle: string
): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("sharing_unavailable");
  }
  const short = displayOrderId(orderId).replace("#", "");
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: dialogTitle || `PhoenixPrint_Receipt_${short}.pdf`,
  });
}
