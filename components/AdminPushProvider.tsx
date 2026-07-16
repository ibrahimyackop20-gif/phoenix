import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabaseClient";
import { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import {
  createRealtimeChannel,
  teardownRealtimeChannel,
} from "../lib/realtimeChannel";
import { isAdminUser, resolveAuthEmail } from "../lib/adminAccess";

/**
 * AdminPushProvider (React Native)
 * - Checks if the current user is an admin
 * - Listens for new print orders and sales orders in real-time
 * - Shows native system alerts for new orders
 */
export default function AdminPushProvider() {
  const channelRef = useRef<ReturnType<typeof createRealtimeChannel> | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (!isAdminUser({ role: profile?.role, email: resolveAuthEmail(user) }) || cancelled) return;

        // channel → on → on → subscribe
        const channel = createRealtimeChannel("admin-new-orders-rn")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "orders" },
            (
              payload: RealtimePostgresInsertPayload<Record<string, unknown>>
            ) => {
              const order = payload.new;
              const fileName = (order.file_name as string) || "ملف";

              Alert.alert(
                "📦 طلب طباعة جديد!",
                `طلب جديد: ${fileName} — اضغط للمعاينة`,
                [{ text: "موافق", style: "default" }]
              );
            }
          )
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "sales_orders" },
            (
              payload: RealtimePostgresInsertPayload<Record<string, unknown>>
            ) => {
              const order = payload.new;
              const orderType = order.order_type as string;

              const title =
                orderType === "print"
                  ? "📦 طلب طباعة جديد!"
                  : "🛒 طلب شراء جديد!";
              const body =
                orderType === "print"
                  ? "لديك طلب طباعة جديد — اضغط للمعاينة"
                  : "لديك طلب شراء جديد من المتجر — اضغط للمعاينة";

              Alert.alert(title, body, [
                { text: "موافق", style: "default" },
              ]);
            }
          )
          .subscribe();

        if (cancelled) {
          teardownRealtimeChannel(channel);
          return;
        }
        channelRef.current = channel;
      } catch (err) {
        console.error("❌ AdminPushProvider error:", err);
      }
    };

    void setup();

    return () => {
      cancelled = true;
      teardownRealtimeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, []);

  return null;
}
