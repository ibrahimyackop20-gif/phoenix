import { createClient } from "./client";

export async function updateSession() {
  const supabaseClient = createClient();
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  return { user };
}
