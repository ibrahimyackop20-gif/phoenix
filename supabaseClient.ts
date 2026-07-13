import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const centralUrl = process.env.EXPO_PUBLIC_CENTRAL_SUPABASE_URL!;
const centralKey = process.env.EXPO_PUBLIC_CENTRAL_SUPABASE_ANON_KEY!;

export const supabase = createClient(centralUrl, centralKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
