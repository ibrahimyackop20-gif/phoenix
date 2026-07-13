import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "../lib/supabaseClient";

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

  const refreshUnread = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch conversations where current user is a participant
      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`);

      const convIds = convs?.map((c) => c.id) || [];

      if (convIds.length === 0) {
        setUnreadChatCount(0);
        return;
      }

      // 2. Count unread messages not sent by current user in those conversations
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

  const markChatAsRead = useCallback(
    async (convId: string, countToSubtract?: number) => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Optimistic UI update
        if (countToSubtract && countToSubtract > 0) {
          setUnreadChatCount((prev) => Math.max(0, prev - countToSubtract));
        }

        console.log("💬 markChatAsRead: Current User ID =", user.id, "Active Conversation ID =", convId);

        const { data, error } = await supabase
          .from("chat_messages")
          .update({ is_read: true })
          .eq("conversation_id", convId)
          .neq("sender_id", user.id)
          .eq("is_read", false)
          .select();

        if (error) {
          console.error("❌ Supabase Mark-As-Read Error:", error);
        } else {
          console.log("✅ Successfully marked messages as read in DB:", data);
        }

        await refreshUnread();
      } catch (err) {
        console.error("❌ markChatAsRead error:", err);
      }
    },
    [refreshUnread]
  );

  useEffect(() => {
    refreshUnread();

    // Real-time: listen for new and updated messages
    const channel = supabase
      .channel("chat-unread-rt-rn")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        () => {
          refreshUnread();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages" },
        () => {
          refreshUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshUnread]);

  return (
    <ChatContext.Provider
      value={{ unreadChatCount, refreshUnread, markChatAsRead }}
    >
      {children}
    </ChatContext.Provider>
  );
}
