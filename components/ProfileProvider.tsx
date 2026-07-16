import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import {
  createRealtimeChannel,
  teardownRealtimeChannel,
} from "../lib/realtimeChannel";
import { resolveAuthEmail } from "../lib/adminAccess";

interface ProfileContextType {
  fullName: string;
  avatarUrl: string | null;
  role: string;
  email: string;
  balance: number;
  profileReady: boolean;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  fullName: "",
  avatarUrl: null,
  role: "",
  email: "",
  balance: 0,
  profileReady: false,
  refreshProfile: async () => {},
});

export function useProfile() {
  return useContext(ProfileContext);
}

interface ProfileProviderProps {
  children: React.ReactNode;
  initialName: string;
  initialAvatar: string | null;
  initialRole: string;
  initialEmail?: string;
  initialBalance?: number;
  profileReady?: boolean;
}

export default function ProfileProvider({
  children,
  initialName,
  initialAvatar,
  initialRole,
  initialEmail = "",
  initialBalance = 0,
  profileReady = false,
}: ProfileProviderProps) {
  const [fullName, setFullName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatar);
  const [role, setRole] = useState(initialRole);
  const [email, setEmail] = useState(initialEmail);
  const [balance, setBalance] = useState(initialBalance);
  const [ready, setReady] = useState(profileReady);

  // Keep state in sync if parent re-provides initials after auth fetch
  useEffect(() => {
    setFullName(initialName);
    setAvatarUrl(initialAvatar);
    setRole(initialRole);
    setEmail(initialEmail);
    setBalance(initialBalance);
    setReady(profileReady);
  }, [initialName, initialAvatar, initialRole, initialEmail, initialBalance, profileReady]);

  const refreshProfile = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setEmail(resolveAuthEmail(user));

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, balance, role")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("❌ ProfileProvider refresh error:", error.message);
        return;
      }

      if (data) {
        setFullName(data.full_name || "");
        setAvatarUrl(data.avatar_url || null);
        setBalance(data.balance ?? 0);
        if (typeof data.role === "string") setRole(data.role);
        setReady(true);
      }
    } catch (err) {
      console.error("❌ ProfileProvider refreshProfile exception:", err);
    }
  }, []);

  // Real-time profile/balance — channel → on → subscribe; never .on() after .subscribe()
  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const teardown = () => {
      teardownRealtimeChannel(channel);
      channel = null;
    };

    const setup = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) {
          teardown();
          return;
        }

        // Replace any prior topic, then bind handlers before subscribe
        channel = createRealtimeChannel("profile-balance-rt-rn")
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "profiles",
              filter: `id=eq.${user.id}`,
            },
            (payload: any) => {
              const updated = payload.new as {
                balance?: number;
                full_name?: string;
                avatar_url?: string;
                role?: string;
              };
              if (updated.balance !== undefined) setBalance(updated.balance);
              if (updated.full_name) setFullName(updated.full_name);
              if (updated.avatar_url !== undefined) {
                setAvatarUrl(updated.avatar_url || null);
              }
              if (typeof updated.role === "string") setRole(updated.role);
            }
          )
          .subscribe();

        if (cancelled) teardown();
      } catch (err) {
        console.error("❌ ProfileProvider real-time setup error:", err);
      }
    };

    void setup();

    const { data: authSub } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT" || !session?.user) {
          setEmail("");
          teardown();
          return;
        }
        setEmail(resolveAuthEmail(session.user));
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          void setup();
        }
      }
    );

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      teardown();
    };
  }, []);

  const value = useMemo(
    () => ({ fullName, avatarUrl, role, email, balance, profileReady: ready, refreshProfile }),
    [fullName, avatarUrl, role, email, balance, ready, refreshProfile]
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}
