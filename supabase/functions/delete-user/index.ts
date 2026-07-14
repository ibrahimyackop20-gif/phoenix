import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle preflight OPTIONS requests for CORS compliance
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing environment variables SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    // 1. Initialize Supabase Admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 2. Validate User JWT from Authorization header
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid user token: " + (userError?.message || "User not found") }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    console.log(`🧹 Permanent deletion sequence initiated for: ${userId} (${user.email})`);

    // 3. Delete files from Storage buckets
    try {
      console.log("🧹 Deleting avatars storage files...");
      const { data: avatarFiles } = await supabaseAdmin.storage.from("avatars").list(userId);
      if (avatarFiles && avatarFiles.length > 0) {
        const paths = avatarFiles.map((f) => `${userId}/${f.name}`);
        await supabaseAdmin.storage.from("avatars").remove(paths);
      }
      await supabaseAdmin.storage.from("avatars").remove([userId]);
    } catch (e) {
      console.warn("Avatars storage deletion warning:", e);
    }

    try {
      console.log("🧹 Deleting product prints and receipts storage files...");
      const { data: productFiles } = await supabaseAdmin.storage.from("products").list(userId);
      if (productFiles && productFiles.length > 0) {
        const paths = productFiles.map((f) => `${userId}/${f.name}`);
        await supabaseAdmin.storage.from("products").remove(paths);
      }
      const { data: printFiles } = await supabaseAdmin.storage.from("products").list(`${userId}/prints`);
      if (printFiles && printFiles.length > 0) {
        const paths = printFiles.map((f) => `${userId}/prints/${f.name}`);
        await supabaseAdmin.storage.from("products").remove(paths);
      }
    } catch (e) {
      console.warn("Products storage deletion warning:", e);
    }

    try {
      console.log("🧹 Deleting payment receipts storage files...");
      const { data: receiptFiles } = await supabaseAdmin.storage.from("receipts").list(userId);
      if (receiptFiles && receiptFiles.length > 0) {
        const paths = receiptFiles.map((f) => `${userId}/${f.name}`);
        await supabaseAdmin.storage.from("receipts").remove(paths);
      }
    } catch (e) {
      console.warn("Receipts storage deletion warning:", e);
    }

    // 4. Delete user records from Database tables
    console.log("🧹 Wiping user records from database...");
    await supabaseAdmin.from("cart_items").delete().eq("user_id", userId);
    await supabaseAdmin.from("chat_messages").delete().eq("sender_id", userId);
    await supabaseAdmin.from("delivery_addresses").delete().eq("user_id", userId);
    await supabaseAdmin.from("notifications").delete().eq("user_id", userId);
    await supabaseAdmin.from("orders").delete().eq("user_id", userId);
    await supabaseAdmin.from("sales_orders").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    // 5. Delete from Supabase Auth
    console.log("⚡ Executing auth.admin.deleteUser...");
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw deleteError;
    }

    console.log(`✅ Deletion completed successfully for user ${userId}`);
    return new Response(
      JSON.stringify({ success: true, message: "User account deleted successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Account deletion error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
