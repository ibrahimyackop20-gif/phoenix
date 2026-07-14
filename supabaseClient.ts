console.log("supabaseClient.ts (Root) file loading...");

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const centralUrl = process.env.EXPO_PUBLIC_CENTRAL_SUPABASE_URL!;
const centralKey = process.env.EXPO_PUBLIC_CENTRAL_SUPABASE_ANON_KEY!;

console.log("Supabase (Root) initialization: Starting with URL:", centralUrl);
export let supabase: any;
try {
  supabase = createClient(centralUrl, centralKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  console.log("Supabase (Root) initialization: Completed successfully.");
} catch (error) {
  console.error("Startup Error:", error);
  throw error;
}
