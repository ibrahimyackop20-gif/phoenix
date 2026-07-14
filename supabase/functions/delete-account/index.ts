import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight options
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      throw new Error("Missing environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, or SERVICE_ROLE_KEY");
    }

    // 1. Get user JWT from Authorization header
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // 2. Initialize Supabase Admin client (with service key)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify token validity and fetch user details
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid user token: " + (userError?.message || "User not found") }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    console.log(`🧹 Deletion sequence started for user: ${userId} (${user.email})`);

    // 3. Initialize User-context Supabase client (using anon key + user token)
    // This ensures auth.uid() inside postgres RPC resolves correctly to the logged-in user.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // 4. Call public.delete_user_account() RPC as the authenticated user
    console.log("⚡ Calling public.delete_user_account RPC...");
    const { data: rpcSuccess, error: rpcError } = await userClient.rpc("delete_user_account");

    if (rpcError) {
      throw new Error(`Database cleanup RPC failed: ${rpcError.message}`);
    }

    if (!rpcSuccess) {
      throw new Error("Database cleanup RPC returned false or empty response.");
    }

    // 5. Clean up Storage files using admin permissions
    try {
      console.log("🧹 Cleaning avatars bucket...");
      const { data: avatarFiles } = await supabaseAdmin.storage.from("avatars").list(userId);
      if (avatarFiles && avatarFiles.length > 0) {
        const paths = avatarFiles.map((f: { name: string }) => `${userId}/${f.name}`);
        await supabaseAdmin.storage.from("avatars").remove(paths);
      }
      await supabaseAdmin.storage.from("avatars").remove([userId]);
    } catch (e) {
      console.warn("Avatars bucket clean warning:", e);
    }

    try {
      console.log("🧹 Cleaning products bucket...");
      const { data: productFiles } = await supabaseAdmin.storage.from("products").list(userId);
      if (productFiles && productFiles.length > 0) {
        const paths = productFiles.map((f: { name: string }) => `${userId}/${f.name}`);
        await supabaseAdmin.storage.from("products").remove(paths);
      }
      const { data: printFiles } = await supabaseAdmin.storage.from("products").list(`${userId}/prints`);
      if (printFiles && printFiles.length > 0) {
        const paths = printFiles.map((f: { name: string }) => `${userId}/prints/${f.name}`);
        await supabaseAdmin.storage.from("products").remove(paths);
      }
    } catch (e) {
      console.warn("Products bucket clean warning:", e);
    }

    try {
      console.log("🧹 Cleaning receipts bucket...");
      const { data: receiptFiles } = await supabaseAdmin.storage.from("receipts").list(userId);
      if (receiptFiles && receiptFiles.length > 0) {
        const paths = receiptFiles.map((f: { name: string }) => `${userId}/${f.name}`);
        await supabaseAdmin.storage.from("receipts").remove(paths);
      }
    } catch (e) {
      console.warn("Receipts bucket clean warning:", e);
    }

    // 6. Delete User from Supabase Auth
    console.log("⚡ Executing auth.admin.deleteUser...");
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw new Error(`Auth deletion failed: ${deleteError.message}`);
    }

    console.log(`✅ Account deletion completed successfully for user ${userId}`);
    return new Response(
      JSON.stringify({ success: true, message: "Account deleted successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Account deletion edge function error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
