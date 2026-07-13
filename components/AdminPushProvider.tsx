import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { supabase } from "../lib/supabaseClient";

/**
 * AdminPushProvider (React Native)
 * - Checks if the current user is an admin
 * - Listens for new print orders and sales orders in real-time
 * - Shows native system alerts for new orders
 */
export default function AdminPushProvider() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const setup = async () => {
      try {
        // 1. Check if user is authenticated
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // 2. Check if user is an admin
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (profile?.role !== "admin") return;

        console.log("🔔 AdminPushProvider: Admin verified. Listening for real-time orders...");

        // 3. Listen for new print orders in real-time
        const channel = supabase
          .channel("admin-new-orders-rn")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "orders" },
            (payload) => {
              const order = payload.new as Record<string, unknown>;
              const fileName = (order.file_name as string) || "ملف";

              console.log("📦 New print order received:", fileName);

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
            (payload) => {
              const order = payload.new as Record<string, unknown>;
              const orderType = order.order_type as string;

              const title = orderType === "print"
                ? "📦 طلب طباعة جديد!"
                : "🛒 طلب شراء جديد!";
              const body = orderType === "print"
                ? "لديك طلب طباعة جديد — اضغط للمعاينة"
                : "لديك طلب شراء جديد من المتجر — اضغط للمعاينة";

              console.log(`📦 New sales order (${orderType}) received`);

              Alert.alert(
                title,
                body,
                [{ text: "موافق", style: "default" }]
              );
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch (err) {
        console.error("❌ AdminPushProvider error:", err);
      }
    };

    let cleanupFn: (() => void) | undefined;
    setup().then((cleanup) => {
      cleanupFn = cleanup;
    });

    return () => {
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, []);

  return null; // Headless provider
}
