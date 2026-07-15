import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabaseClient";
import type {
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const PAGE_SIZE = 20;

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  markAsRead: (id: string) => Promise<void>;
  markVisibleAsRead: (ids: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  loadMore: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markChatNotificationsAsRead: () => Promise<void>;
  latestToast: string | null;
  clearToast: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  hasMore: false,
  loadingMore: false,
  markAsRead: async () => {},
  markVisibleAsRead: async () => {},
  markAllAsRead: async () => {},
  deleteNotification: async () => {},
  loadMore: async () => {},
  refreshNotifications: async () => {},
  markChatNotificationsAsRead: async () => {},
  latestToast: null,
  clearToast: () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export default function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [latestToast, setLatestToast] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markingIdsRef = useRef<Set<string>>(new Set());

  const refreshUnreadCount = useCallback(async (uid: string) => {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("is_read", false);

    if (!error) {
      setUnreadCount(count ?? 0);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUserId(null);
        setNotifications([]);
        setUnreadCount(0);
        setHasMore(false);
        return;
      }
      setUserId(user.id);

      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE - 1);

      const rows = (data || []) as Notification[];
      setNotifications(rows);
      setHasMore(rows.length === PAGE_SIZE);
      await refreshUnreadCount(user.id);
    } catch (err) {
      console.error("🔔 NotificationProvider refreshNotifications error:", err);
    }
  }, [refreshUnreadCount]);

  const loadMore = useCallback(async () => {
    if (!userId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const from = notifications.length;
      const to = from + PAGE_SIZE - 1;
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);

      const rows = (data || []) as Notification[];
      setNotifications((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        const merged = [...prev];
        for (const row of rows) {
          if (!seen.has(row.id)) merged.push(row);
        }
        return merged;
      });
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      console.error("🔔 NotificationProvider loadMore error:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [userId, loadingMore, hasMore, notifications.length]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      let wasUnread = false;
      setNotifications((prev) =>
        prev.map((n) => {
          if (n.id === id && !n.is_read) {
            wasUnread = true;
            return { ...n, is_read: true };
          }
          return n;
        })
      );
      if (wasUnread) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    } catch (err) {
      console.error("🔔 NotificationProvider markAsRead error:", err);
    }
  }, []);

  const markVisibleAsRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const unique = ids.filter((id) => {
      if (markingIdsRef.current.has(id)) return false;
      markingIdsRef.current.add(id);
      return true;
    });
    if (!unique.length) return;

    try {
      let marked = 0;
      setNotifications((prev) =>
        prev.map((n) => {
          if (unique.includes(n.id) && !n.is_read) {
            marked += 1;
            return { ...n, is_read: true };
          }
          return n;
        })
      );
      if (marked > 0) {
        setUnreadCount((c) => Math.max(0, c - marked));
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .in("id", unique)
          .eq("is_read", false);
      }
    } catch (err) {
      console.error("🔔 NotificationProvider markVisibleAsRead error:", err);
    } finally {
      unique.forEach((id) => markingIdsRef.current.delete(id));
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    try {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);
    } catch (err) {
      console.error("🔔 NotificationProvider markAllAsRead error:", err);
    }
  }, [userId]);

  const deleteNotification = useCallback(async (id: string) => {
    try {
      let wasUnread = false;
      setNotifications((prev) => {
        const target = prev.find((n) => n.id === id);
        wasUnread = !!target && !target.is_read;
        return prev.filter((n) => n.id !== id);
      });
      if (wasUnread) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
      await supabase.from("notifications").delete().eq("id", id);
    } catch (err) {
      console.error("🔔 NotificationProvider deleteNotification error:", err);
    }
  }, []);

  const markChatNotificationsAsRead = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("title", "رسالة جديدة")
        .eq("is_read", false)
        .select();

      if (error) {
        console.error("❌ Supabase Mark-As-Read Error (notifications):", error);
      } else if (data) {
        const count = data.length;
        setNotifications((prev) =>
          prev.map((n) =>
            n.title === "رسالة جديدة" ? { ...n, is_read: true } : n
          )
        );
        if (count > 0) {
          setUnreadCount((c) => Math.max(0, c - count));
        }
      }
    } catch (err) {
      console.error("❌ markChatNotificationsAsRead error:", err);
    }
  }, [userId]);

  const clearToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setLatestToast(null);
  }, []);

  // Auth bootstrap
  useEffect(() => {
    refreshNotifications();
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        refreshNotifications();
      } else {
        setUserId(null);
        setNotifications([]);
        setUnreadCount(0);
        setHasMore(false);
      }
    });
    return () => {
      authSub.subscription.unsubscribe();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [refreshNotifications]);

  // Realtime — no polling
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user-notifications-rt-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresChangesPayload<Notification>) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Notification;
            setNotifications((prev) => {
              if (prev.some((n) => n.id === row.id)) return prev;
              return [row, ...prev];
            });
            if (!row.is_read) {
              setUnreadCount((c) => c + 1);
              setLatestToast(row.message);
              if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
              toastTimerRef.current = setTimeout(() => setLatestToast(null), 4000);
            }
            return;
          }

          if (payload.eventType === "UPDATE") {
            const row = payload.new as Notification;
            setNotifications((prev) => {
              const existing = prev.find((n) => n.id === row.id);
              if (existing && existing.is_read !== row.is_read) {
                if (row.is_read) {
                  setUnreadCount((c) => Math.max(0, c - 1));
                } else {
                  setUnreadCount((c) => c + 1);
                }
              }
              return prev.map((n) => (n.id === row.id ? { ...n, ...row } : n));
            });
            return;
          }

          if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<Notification>;
            if (!old.id) return;
            setNotifications((prev) => {
              const target = prev.find((n) => n.id === old.id);
              if (!target) return prev;
              if (!target.is_read) {
                setUnreadCount((c) => Math.max(0, c - 1));
              }
              return prev.filter((n) => n.id !== old.id);
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        hasMore,
        loadingMore,
        markAsRead,
        markVisibleAsRead,
        markAllAsRead,
        deleteNotification,
        loadMore,
        refreshNotifications,
        markChatNotificationsAsRead,
        latestToast,
        clearToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

/** Extract an #XXXXXXXX order prefix from notification message text. */
export function extractOrderPrefix(message: string): string | null {
  const match = message.match(/#([A-Fa-f0-9]{8})/);
  return match ? match[1].toUpperCase() : null;
}
