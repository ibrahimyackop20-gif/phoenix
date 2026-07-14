import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../lib/supabaseClient";

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markChatNotificationsAsRead: () => Promise<void>;
  latestToast: string | null;
  clearToast: () => void;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
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
  console.log("Entering NotificationProvider");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [latestToast, setLatestToast] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Fetch notifications
  const refreshNotifications = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      setNotifications((data || []) as Notification[]);
    } catch (err) {
      console.error("🔔 NotificationProvider refreshNotifications error:", err);
    }
  }, []);

  // Mark one as read
  const markAsRead = useCallback(async (id: string) => {
    try {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error("🔔 NotificationProvider markAsRead error:", err);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    try {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error("🔔 NotificationProvider markAllAsRead error:", err);
    }
  }, [userId]);

  // Mark chat-related notifications as read
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
        setNotifications((prev) =>
          prev.map((n) =>
            n.title === "رسالة جديدة" ? { ...n, is_read: true } : n
          )
        );
      }
    } catch (err) {
      console.error("❌ markChatNotificationsAsRead error:", err);
    }
  }, [userId]);

  const clearToast = useCallback(() => setLatestToast(null), []);

  // Initial load + real-time subscription
  useEffect(() => {
    console.log("Provider initialized: NotificationProvider");
    refreshNotifications();

    if (!userId) return;

    const channel = supabase
      .channel("user-notifications-rt-rn")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const newNotif = payload.new as Notification;
          // Only add if it's for the current user
          if (newNotif.user_id === userId) {
            setNotifications((prev) => [newNotif, ...prev.slice(0, 19)]);
            setLatestToast(newNotif.message);
            
            // Auto dismiss toast after 4 seconds
            const timer = setTimeout(() => setLatestToast(null), 4000);
            return () => clearTimeout(timer);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refreshNotifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  console.log("Leaving NotificationProvider");
  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
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
