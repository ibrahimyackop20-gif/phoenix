console.log("lib/supabase/client.ts file loading...");

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createClient() {
  console.log("createClient (lib/supabase/client) called: Starting...");
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
    console.log("createClient (lib/supabase/client) URL:", supabaseUrl);
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
    console.log("createClient (lib/supabase/client) completed successfully.");
    return client;
  } catch (error) {
    console.error("Startup Error:", error);
    throw error;
  }
}
