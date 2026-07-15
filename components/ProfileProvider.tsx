import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabaseClient";

interface ProfileContextType {
  fullName: string;
  avatarUrl: string | null;
  role: string;
  balance: number;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  fullName: "",
  avatarUrl: null,
  role: "",
  balance: 0,
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
  initialBalance?: number;
}

export default function ProfileProvider({
  children,
  initialName,
  initialAvatar,
  initialRole,
  initialBalance = 0,
}: ProfileProviderProps) {
  console.log("Entering ProfileProvider");
  const [fullName, setFullName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatar);
  const [role, setRole] = useState(initialRole);
  const [balance, setBalance] = useState(initialBalance);

  useEffect(() => {
    console.log("Provider initialized: ProfileProvider");
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

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
      }
    } catch (err) {
      console.error("❌ ProfileProvider refreshProfile exception:", err);
    }
  }, []);

  // Real-time balance subscription
  useEffect(() => {
    let userId: string | null = null;
    let channel: any = null;

    const setupSub = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        userId = user.id;

        channel = supabase
          .channel("profile-balance-rt-rn")
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
      } catch (err) {
        console.error("❌ ProfileProvider real-time setup error:", err);
      }
    };

    setupSub();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const value = useMemo(
    () => ({ fullName, avatarUrl, role, balance, refreshProfile }),
    [fullName, avatarUrl, role, balance, refreshProfile]
  );

  console.log("Leaving ProfileProvider");
  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}
