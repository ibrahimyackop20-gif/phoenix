import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabaseClient";
import {
  createRealtimeChannel,
  teardownRealtimeChannel,
} from "../lib/realtimeChannel";

interface ChatContextType {
  unreadChatCount: number;
  refreshUnread: () => Promise<void>;
  markChatAsRead: (convId: string, countToSubtract?: number) => Promise<void>;
}

const ChatContext = createContext<ChatContextType>({
  unreadChatCount: 0,
  refreshUnread: async () => {},
  markChatAsRead: async () => {},
});

export const useChat = () => useContext(ChatContext);

export default function ChatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const refreshUnreadRef = useRef<() => Promise<void>>(async () => {});

  const refreshUnread = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`);

      const convIds = convs?.map((c: { id: string }) => c.id) || [];

      if (convIds.length === 0) {
        setUnreadChatCount(0);
        return;
      }

      const { count } = await supabase
        .from("chat_messages")
        .select("*", { count: "exact", head: true })
        .eq("is_read", false)
        .neq("sender_id", user.id)
        .in("conversation_id", convIds);

      setUnreadChatCount(count || 0);
    } catch (err) {
      console.error("💬 ChatProvider refreshUnread error:", err);
    }
  }, []);

  refreshUnreadRef.current = refreshUnread;

  const markChatAsRead = useCallback(
    async (convId: string, countToSubtract?: number) => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        if (countToSubtract && countToSubtract > 0) {
          setUnreadChatCount((prev) => Math.max(0, prev - countToSubtract));
        }

        const { error } = await supabase
          .from("chat_messages")
          .update({ is_read: true })
          .eq("conversation_id", convId)
          .neq("sender_id", user.id)
          .eq("is_read", false)
          .select();

        if (error) {
          console.error("❌ Supabase Mark-As-Read Error:", error);
        }

        await refreshUnread();
      } catch (err) {
        console.error("❌ markChatAsRead error:", err);
      }
    },
    [refreshUnread]
  );

  // Subscribe once when a user is present — do not depend on refreshUnread
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof createRealtimeChannel> | null = null;

    const setup = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      void refreshUnreadRef.current();

      // channel → on → on → subscribe
      channel = createRealtimeChannel("chat-unread-rt-rn")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages" },
          () => {
            void refreshUnreadRef.current();
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "chat_messages" },
          () => {
            void refreshUnreadRef.current();
          }
        )
        .subscribe();

      if (cancelled) {
        teardownRealtimeChannel(channel);
        channel = null;
      }
    };

    void setup();

    const { data: authSub } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT" || !session?.user) {
          teardownRealtimeChannel(channel);
          channel = null;
          setUnreadChatCount(0);
          return;
        }
        if (
          (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
          !channel
        ) {
          void setup();
        } else if (session?.user) {
          void refreshUnreadRef.current();
        }
      }
    );

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      teardownRealtimeChannel(channel);
      channel = null;
    };
  }, []);

  return (
    <ChatContext.Provider
      value={{ unreadChatCount, refreshUnread, markChatAsRead }}
    >
      {children}
    </ChatContext.Provider>
  );
}
