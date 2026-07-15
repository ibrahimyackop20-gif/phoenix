import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { SignJWT, importPKCS8 } from "https://esm.sh/jose@5.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Exchange the Firebase service-account credentials for a short-lived
 * Google OAuth2 access token scoped to Firebase Cloud Messaging.
 */
async function getFcmAccessToken(
  clientEmail: string,
  privateKeyPem: string
): Promise<string> {
  const normalizedKey = privateKeyPem.replace(/\\n/g, "\n");
  const key = await importPKCS8(normalizedKey, "RS256");
  const now = Math.floor(Date.now() / 1000);

  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`OAuth2 token exchange failed (${tokenRes.status}): ${errText}`);
  }

  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) {
    throw new Error("OAuth2 response missing access_token");
  }
  return tokenJson.access_token as string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";
    const projectId = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
    const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") ?? "";
    const privateKey = Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SERVICE_ROLE_KEY");
    }
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        "Missing Firebase secrets: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY"
      );
    }

    // Require service-role Authorization for this privileged endpoint.
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!bearer || bearer !== serviceRoleKey) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const payload = (await req.json()) as PushPayload;
    const { user_id, title, body, data } = payload;

    if (!user_id || !title || !body) {
      return jsonResponse(
        { error: "user_id, title, and body are required" },
        400
      );
    }

    // Lookup latest FCM token for the user.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: devices, error: deviceError } = await admin
      .from("user_devices")
      .select("fcm_token, updated_at")
      .eq("user_id", user_id)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (deviceError) {
      throw new Error(`user_devices query failed: ${deviceError.message}`);
    }

    const fcmToken = devices?.[0]?.fcm_token;
    if (!fcmToken) {
      return jsonResponse(
        { error: "No FCM token found for this user_id" },
        404
      );
    }

    const accessToken = await getFcmAccessToken(clientEmail, privateKey);

    // Stringify all data values — FCM data payload must be string→string.
    const dataPayload: Record<string, string> = {};
    if (data && typeof data === "object") {
      for (const [k, v] of Object.entries(data)) {
        dataPayload[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
    }

    const fcmBody = {
      message: {
        token: fcmToken,
        notification: {
          title,
          body,
        },
        data: dataPayload,
        android: {
          priority: "high",
          notification: {
            channelId: "phoenix_alerts",
            sound: "default",
            defaultSound: true,
            defaultVibrateTimings: true,
            defaultLightSettings: true,
            notificationPriority: "PRIORITY_MAX",
            visibility: "PUBLIC",
            notificationCount: 1,
          },
        },
      },
    };

    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fcmBody),
      }
    );

    const fcmResult = await fcmRes.json();
    if (!fcmRes.ok) {
      return jsonResponse(
        {
          error: "FCM send failed",
          status: fcmRes.status,
          details: fcmResult,
        },
        502
      );
    }

    return jsonResponse({
      success: true,
      message_name: fcmResult.name ?? null,
    });
  } catch (err: any) {
    console.error("send-push error:", err?.message ?? err);
    return jsonResponse(
      { error: err?.message || "Internal server error" },
      500
    );
  }
});
