console.log("lib/supabase/server.ts file loading...");

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function createClient() {
  console.log("createClient (lib/supabase/server) called: Starting...");
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
    console.log("createClient (lib/supabase/server) URL:", supabaseUrl);
    const client = createSupabaseClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      }
    );
    console.log("createClient (lib/supabase/server) completed successfully.");
    return client;
  } catch (error) {
    console.error("Startup Error:", error);
    throw error;
  }
}
