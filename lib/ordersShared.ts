import type { TFunction } from "i18next";

export interface PrintOrder {
  id: string;
  type: "print";
  file_name: string;
  file_url: string | null;
  copies: number;
  color_mode: string;
  num_copies?: number;
  a4_color_type?: string;
  order_type?: string;
  total_pages?: number;
  total_price?: number;
  description: string | null;
  status: string;
  payment_method: string | null;
  payment_status?: string | null;
  created_at: string;
  updated_at?: string;
  cancelled_at?: string | null;
  cancelled_by?: "customer" | "admin" | null;
  external_file_link?: string | null;
  paper_type?: string;
  a4_paper_type?: string;
  a4_print_side?: string;
  delivery_address_id?: string | null;
  delivery_zone?: string | null;
  shipping_cost?: number | null;
  width_cm?: number | null;
  length_meters?: number | null;
  receipt_url?: string | null;
  profiles?: { full_name: string } | null;
  delivery_addresses?: {
    title: string;
    area: string;
    formatted_address: string | null;
  } | null;
}

export interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  store_name?: string;
}

export interface LibraryOrder {
  id: string;
  type: "library";
  total: number;
  status: string;
  seller_status?: string;
  items: OrderItem[] | string;
  created_at: string;
  updated_at?: string;
  store_name?: string;
  governorate?: string;
  delivery_zone?: string;
  shipping_cost?: number;
  full_address?: string;
  payment_method?: string | null;
}

export type UnifiedOrder = PrintOrder | LibraryOrder;

export const LIBRARY_STEPS = [
  { key: "pending", labelKey: "orders_lib_pending", icon: "clock" as const, color: "#fb923c" },
  { key: "shipped", labelKey: "shipped", icon: "truck" as const, color: "#60a5fa" },
  { key: "ready", labelKey: "ready", icon: "package" as const, color: "#c084fc" },
  { key: "delivered", labelKey: "delivered", icon: "check-circle" as const, color: "#34d399" },
] as const;

export const PRINT_TIMELINE = [
  { key: "pending_review", icon: "clock" as const },
  { key: "accepted", icon: "check" as const },
  { key: "preparing", icon: "folder" as const },
  { key: "printing", icon: "printer" as const },
  { key: "quality", icon: "award" as const },
  { key: "ready_pickup", icon: "package" as const },
  { key: "out_delivery", icon: "truck" as const },
  { key: "completed", icon: "check-circle" as const },
] as const;

export type PrintTimelineKey = (typeof PRINT_TIMELINE)[number]["key"];

const PRINT_STATUS_TO_STEP: Record<string, number> = {
  Pending: 0,
  Accepted: 1,
  Printing: 3,
  "Out for Delivery": 6,
  Completed: 7,
};

export function parseOrderItems(items: OrderItem[] | string): OrderItem[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  try {
    return JSON.parse(items);
  } catch {
    return [];
  }
}

export function getLibraryStepIndex(status: string): number {
  return LIBRARY_STEPS.findIndex((s) => s.key === status);
}

export function getPrintTimelineIndex(status: string): number {
  if (status === "Rejected" || status === "Cancelled") return -1;
  return PRINT_STATUS_TO_STEP[status] ?? 0;
}

export function isCancelledStatus(status: string): boolean {
  return status === "Rejected" || status === "Cancelled";
}

/** Print orders in Pending status may be cancellable within the server-enforced window. */
export function isPendingPrintOrder(status: string): boolean {
  return status === "Pending";
}

export function formatOrderDate(
  dateString: string | undefined,
  locale: string,
  style: "short" | "time" = "short"
): string {
  if (!dateString) return "—";
  const loc = locale === "en" ? "en-US" : "ar-SA";
  const date = new Date(dateString);
  if (style === "time") {
    return date.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString(loc, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function displayOrderId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

export function getPaymentLabel(method: string | null | undefined, t: TFunction): string {
  if (!method) return "—";
  const labels: Record<string, string> = {
    zaincash: t("pay_zaincash"),
    asiahawala: t("pay_asia"),
    wallet: t("no_pay_wallet"),
    cod: t("pay_cod_short"),
    electronic: t("orders_pay_electronic"),
  };
  return labels[method] || method;
}

export function getPrintUnitPrice(order: PrintOrder, bwPrice: number, colorPrice: number): number {
  return (order.a4_color_type || order.color_mode) === "color" ? colorPrice : bwPrice;
}

export function getPrintTotal(order: PrintOrder, bwPrice: number, colorPrice: number): number {
  return (
    order.total_price ??
    (order.num_copies ?? order.copies ?? 1) * getPrintUnitPrice(order, bwPrice, colorPrice)
  );
}

export function isTelegramOrder(order: PrintOrder): boolean {
  return Boolean(
    order.external_file_link?.trim() ||
      (order.file_name || "").toLowerCase().includes("telegram")
  );
}

export function getDeliveryMethodLabel(order: PrintOrder, t: TFunction): string {
  if (order.delivery_address_id || (order.shipping_cost != null && order.shipping_cost > 0)) {
    const zone = order.delivery_zone?.trim();
    return zone ? `${t("no_delivery")} — ${zone}` : t("no_delivery");
  }
  return t("order_detail_pickup");
}

export function getPaperSizeLabel(order: PrintOrder, t: TFunction): string {
  if (order.order_type === "roll_print") {
    const w = order.width_cm;
    const l = order.length_meters;
    if (w && l) return `${w} cm × ${l} m`;
    return t("order_detail_roll_print");
  }
  return t("order_detail_a4_print");
}

export function getColorModeLabel(order: PrintOrder, t: TFunction): string {
  const mode = order.a4_color_type || order.color_mode;
  return mode === "color" ? t("color") : t("grayscale");
}

export function getPrintSideLabel(order: PrintOrder, t: TFunction): string {
  if (order.order_type === "roll_print") return "—";
  return order.a4_print_side === "double"
    ? t("order_detail_double_side")
    : t("order_detail_single_side");
}

export interface StatusHistoryEntry {
  id: string;
  time: string;
  labelKey: string;
  status?: string;
}

export function buildPrintStatusHistory(
  order: PrintOrder,
  notifications: { id: string; created_at: string; message: string }[]
): StatusHistoryEntry[] {
  const entries: StatusHistoryEntry[] = [
    {
      id: "submitted",
      time: order.created_at,
      labelKey: "order_detail_history_submitted",
    },
  ];

  for (const n of notifications) {
    entries.push({
      id: n.id,
      time: n.created_at,
      labelKey: "order_detail_history_updated",
      status: n.message,
    });
  }

  const updatedAt = order.updated_at || order.created_at;
  const hasStatusNotification =
    notifications.length > 0 &&
    Math.abs(new Date(updatedAt).getTime() - new Date(notifications[notifications.length - 1].created_at).getTime()) <
      60_000;

  if (
    order.status !== "Pending" &&
    updatedAt !== order.created_at &&
    !hasStatusNotification
  ) {
    entries.push({
      id: "current-status",
      time: updatedAt,
      labelKey: "order_detail_history_status",
      status: order.status,
    });
  }

  return entries.sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  );
}

export function getPrintStatusLabel(status: string, t: TFunction): string {
  const keys: Record<string, string> = {
    Pending: "pending",
    Accepted: "badge_accepted",
    Printing: "printing",
    Completed: "completed",
    Rejected: "status_rejected",
    Cancelled: "timeline_cancelled",
    "Out for Delivery": "badge_out_delivery",
  };
  const key = keys[status];
  return key ? t(key) : status;
}

export function getLibraryStatusLabel(status: string, t: TFunction): string {
  const keys: Record<string, string> = {
    pending: "orders_lib_pending",
    shipped: "shipped",
    ready: "ready",
    delivered: "delivered",
  };
  const key = keys[status];
  return key ? t(key) : status;
}
