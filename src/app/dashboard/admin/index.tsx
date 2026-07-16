import { useEffect } from "react";
import { useRouter } from "expo-router";

/** Legacy alias — admin panel lives at /admin, not /dashboard/admin */
export default function DashboardAdminRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin" as any);
  }, [router]);

  return null;
}
