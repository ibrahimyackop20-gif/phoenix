import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import ProfileProvider from "./ProfileProvider";
import CartProvider from "./CartProvider";
import NotificationProvider from "./NotificationProvider";
import ChatProvider from "./ChatProvider";
import { resolveAuthEmail } from "../lib/adminAccess";

/**
 * Single mount point for session providers (profile / cart / notifications / chat).
 * Always wraps the tree so login does not remount routes, and dashboard ↔ library
 * navigation does not recreate realtime channels.
 */
export default function AppSessionProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, setProfile] = useState<{
    full_name?: string | null;
    avatar_url?: string | null;
    role?: string | null;
    balance?: number | null;
  } | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    const loadProfile = async (userId: string, sessionEmail: string) => {
      if (active) setAuthEmail(sessionEmail);

      const { data } = await supabase
        .from("profiles")
        .select("full_name, role, avatar_url, balance")
        .eq("id", userId)
        .maybeSingle();
      if (!active) return;

      setProfile(data);
      setProfileLoaded(true);
    };

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (session?.user) {
        const sessionEmail = resolveAuthEmail(session.user);
        await loadProfile(session.user.id, sessionEmail);
      } else {
        setProfile(null);
        setAuthEmail("");
        setProfileLoaded(false);
      }
    };

    void init();

    const { data: authSub } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        if (session?.user) {
          setProfileLoaded(false);
          const sessionEmail = resolveAuthEmail(session.user);
          void loadProfile(session.user.id, sessionEmail);
        } else {
          setProfile(null);
          setAuthEmail("");
          setProfileLoaded(false);
        }
      }
    );

    return () => {
      active = false;
      authSub.subscription.unsubscribe();
    };
  }, []);

  return (
    <ProfileProvider
      initialName={profile?.full_name || ""}
      initialAvatar={profile?.avatar_url || null}
      initialRole={profile?.role || "student"}
      initialEmail={authEmail}
      initialBalance={profile?.balance || 0}
      profileReady={profileLoaded}
    >
      <CartProvider>
        <NotificationProvider>
          <ChatProvider>{children}</ChatProvider>
        </NotificationProvider>
      </CartProvider>
    </ProfileProvider>
  );
}
