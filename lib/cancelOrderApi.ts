/**
 * User-initiated print order cancellation API.
 * All validation is enforced server-side via cancel_print_order RPC.
 */

import { supabase } from "./supabaseClient";

export type CancelOrderErrorCode =
  | "not_authenticated"
  | "not_found"
  | "forbidden"
  | "already_cancelled"
  | "already_accepted"
  | "invalid_status"
  | "expired"
  | "unknown";

export type CancelOrderResult = {
  success: boolean;
  error?: CancelOrderErrorCode;
  cancelled_at?: string;
};

type RpcPayload = {
  success?: boolean;
  error?: string;
  cancelled_at?: string;
};

export async function cancelPrintOrder(orderId: string): Promise<CancelOrderResult> {
  const { data, error } = await supabase.rpc("cancel_print_order", {
    p_order_id: orderId,
  });

  if (error) {
    console.error("[cancelPrintOrder] RPC error:", error.message);
    return { success: false, error: "unknown" };
  }

  const payload = (data ?? {}) as RpcPayload;

  if (payload.success) {
    return {
      success: true,
      cancelled_at: payload.cancelled_at,
    };
  }

  const code = payload.error as CancelOrderErrorCode | undefined;
  const known: CancelOrderErrorCode[] = [
    "not_authenticated",
    "not_found",
    "forbidden",
    "already_cancelled",
    "already_accepted",
    "invalid_status",
    "expired",
  ];

  return {
    success: false,
    error: code && known.includes(code) ? code : "unknown",
  };
}
