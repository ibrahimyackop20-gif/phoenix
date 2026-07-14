console.log("lib/supabaseClient.ts file loading...");

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

console.log("Supabase (Lib) initialization: Starting with URL:", supabaseUrl);
export let supabase: any;
try {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  console.log("Supabase (Lib) initialization: Completed successfully.");
} catch (error) {
  console.error("Startup Error:", error);
  throw error;
}

const centralUrl = process.env.EXPO_PUBLIC_CENTRAL_SUPABASE_URL!;
const centralAnonKey = process.env.EXPO_PUBLIC_CENTRAL_SUPABASE_ANON_KEY!;

console.log("Central Supabase (Lib) initialization: Starting with URL:", centralUrl);
export let centralSupabase: any;
try {
  centralSupabase = createClient(centralUrl, centralAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  console.log("Central Supabase (Lib) initialization: Completed successfully.");
} catch (error) {
  console.error("Startup Error:", error);
  throw error;
}

