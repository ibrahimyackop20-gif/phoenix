import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../../lib/supabaseClient";
import { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { useChat } from "../../../components/ChatProvider";
import { useNotifications } from "../../../components/NotificationProvider";
import { Feather, Ionicons } from "@expo/vector-icons";

interface Conversation {
  id: string;
  participant_1: string;
  participant_2: string;
  last_message_at: string;
  other_name?: string;
  other_avatar?: string | null;
  last_snippet?: string;
  unread?: number;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

const EMOJI_LIST = [
  "😀", "😂", "❤️", "🔥", "👍", "🎉",
  "😍", "🤝", "💯", "✨", "🙏", "😊"
];

export default function ChatScreen() {
  const { refreshUnread, markChatAsRead } = useChat();
  const { markChatNotificationsAsRead, refreshNotifications } = useNotifications();
  const params = useLocalSearchParams();
  const convFromUrl = params.conv as string | undefined;

  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const flatListRef = useRef<FlatList>(null);

  const fetchConversations = useCallback(async (uid: string) => {
    try {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .or(`participant_1.eq.${uid},participant_2.eq.${uid}`)
        .order("last_message_at", { ascending: false });

      if (!data) return;

      const enriched: Conversation[] = [];
      for (const conv of data) {
        const otherId = conv.participant_1 === uid ? conv.participant_2 : conv.participant_1;

        const [profileRes, lastMsgRes, unreadRes] = await Promise.all([
          supabase.from("profiles").select("full_name, avatar_url").eq("id", otherId).maybeSingle(),
          supabase.from("chat_messages").select("content").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("chat_messages").select("*", { count: "exact", head: true }).eq("conversation_id", conv.id).eq("is_read", false).neq("sender_id", uid),
        ]);

        enriched.push({
          ...conv,
          other_name: profileRes.data?.full_name || "مستخدم",
          other_avatar: profileRes.data?.avatar_url,
          last_snippet: lastMsgRes.data?.content || "",
          unread: unreadRes.count || 0,
        });
      }

      setConversations(enriched);
    } catch (err) {
      console.error("Error loading chat conversations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      setMessages((data || []) as ChatMessage[]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err) {
      console.error("Error loading chat messages:", err);
    }
  }, []);

  // Initialize
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      await fetchConversations(user.id);

      if (convFromUrl) {
        setActiveConv(convFromUrl);
      }
    };
    init();
  }, [convFromUrl, fetchConversations]);

  // Load messages when conversation selected
  useEffect(() => {
    if (!activeConv || !userId) return;
    fetchMessages(activeConv);
  }, [activeConv, userId, fetchMessages]);

  // Auto-read messages
  useEffect(() => {
    if (!activeConv || !userId) return;

    const performAutoRead = async () => {
      try {
        const currentConv = conversations.find((c) => c.id === activeConv);
        const unreadInConv = currentConv?.unread || 0;

        setConversations((prev) =>
          prev.map((c) => (c.id === activeConv ? { ...c, unread: 0 } : c))
        );

        await markChatAsRead(activeConv, unreadInConv);
        await markChatNotificationsAsRead();
        await refreshNotifications();
        await fetchConversations(userId);
      } catch (err) {
        console.error("Auto-read trigger error:", err);
      }
    };

    performAutoRead();
  }, [activeConv, userId, markChatAsRead, markChatNotificationsAsRead, refreshNotifications, fetchConversations]);

  // Real-time listener
  useEffect(() => {
    if (!activeConv || !userId) return;

    const channel = supabase
      .channel(`chat-${activeConv}-rn`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${activeConv}`,
        },
        (payload: RealtimePostgresInsertPayload<ChatMessage>) => {
          const newMessage = payload.new;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

          if (newMessage.sender_id !== userId) {
            Promise.all([
              supabase.from("chat_messages").update({ is_read: true }).eq("id", newMessage.id),
              supabase
                .from("notifications")
                .update({ is_read: true })
                .eq("user_id", userId)
                .eq("title", "رسالة جديدة")
                .eq("is_read", false),
            ]).then(() => {
              refreshUnread();
              refreshNotifications();
              fetchConversations(userId);
            });
          } else {
            fetchConversations(userId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConv, userId, refreshUnread, refreshNotifications, fetchConversations]);

  const handleSend = async () => {
    if (!newMsg.trim() || !activeConv || !userId || sending) return;
    setSending(true);
    setShowEmoji(false);

    const content = newMsg.trim();
    setNewMsg("");

    try {
      await supabase.from("chat_messages").insert({
        conversation_id: activeConv,
        sender_id: userId,
        content,
        is_read: false,
      });

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", activeConv);

      const conv = conversations.find((c) => c.id === activeConv);
      if (conv) {
        const otherId = conv.participant_1 === userId ? conv.participant_2 : conv.participant_1;
        await supabase.from("notifications").insert({
          user_id: otherId,
          title: "رسالة جديدة",
          message: content,
          is_read: false,
        });
      }

      fetchConversations(userId);
    } catch (err) {
      console.error("Error sending message:", err);
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter((c) =>
    c.other_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeConvDetails = conversations.find((c) => c.id === activeConv);

  return (
    <SafeAreaView style={styles.container}>
      {activeConv ? (
        // ── ACTIVE CONVERSATION WINDOW ────────────────
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.chatWindow}
        >
          {/* Header */}
          <View style={styles.chatHeader}>
            <TouchableOpacity onPress={() => setActiveConv(null)} style={styles.backButton}>
              <Feather name="arrow-right" size={20} color="#f4f4f5" />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>{activeConvDetails?.other_name}</Text>
              <Text style={styles.headerSubtitle}>نشط الآن</Text>
            </View>
            {activeConvDetails?.other_avatar ? (
              <Image source={{ uri: activeConvDetails.other_avatar }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <Feather name="user" size={16} color="#a1a1aa" />
              </View>
            )}
          </View>

          {/* Messages List */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isMine = item.sender_id === userId;
              return (
                <View style={[styles.messageRow, isMine ? styles.myRow : styles.theirRow]}>
                  <View style={[styles.messageBubble, isMine ? styles.myBubble : styles.theirBubble]}>
                    <Text style={[styles.messageText, isMine ? styles.myText : styles.theirText]}>
                      {item.content}
                    </Text>
                  </View>
                </View>
              );
            }}
            contentContainerStyle={styles.messagesListContent}
          />

          {/* Emoji suggestions */}
          {showEmoji && (
            <View style={styles.emojiContainer}>
              {EMOJI_LIST.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => {
                    setNewMsg((prev) => prev + emoji);
                    setShowEmoji(false);
                  }}
                  style={styles.emojiItem}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Input Area */}
          <View style={styles.inputArea}>
            <TouchableOpacity onPress={handleSend} disabled={sending} style={styles.sendButton}>
              {sending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Feather name="send" size={18} color="#ffffff" />
              )}
            </TouchableOpacity>

            <TextInput
              value={newMsg}
              onChangeText={setNewMsg}
              placeholder="اكتب رسالة..."
              placeholderTextColor="#71717a"
              style={styles.textInput}
            />

            <TouchableOpacity onPress={() => setShowEmoji(!showEmoji)} style={styles.emojiToggle}>
              <Feather name="smile" size={20} color="#a1a1aa" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : (
        // ── CONVERSATIONS LIST ────────────────────────
        <View style={styles.listContainer}>
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>الرسائل</Text>
            <View style={styles.searchWrapper}>
              <Feather name="search" size={16} color="#71717a" style={styles.searchIcon} />
              <TextInput
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholder="ابحث عن محادثة..."
                placeholderTextColor="#71717a"
                style={styles.searchInput}
              />
            </View>
          </View>

          {loading ? (
            <View style={styles.listLoader}>
              <ActivityIndicator size="large" color="#ea580c" />
            </View>
          ) : filteredConversations.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color="#71717a" />
              <Text style={styles.emptyTitle}>لا توجد محادثات</Text>
              <Text style={styles.emptySubtitle}>ابدأ محادثة جديدة للتواصل مع الدعم الفني</Text>
            </View>
          ) : (
            <FlatList
              data={filteredConversations}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => setActiveConv(item.id)} style={styles.convItem}>
                  {item.unread ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{item.unread}</Text>
                    </View>
                  ) : null}

                  <View style={styles.convDetails}>
                    <Text style={styles.convName}>{item.other_name}</Text>
                    <Text numberOfLines={1} style={styles.convSnippet}>
                      {item.last_snippet || "لا توجد رسائل بعد"}
                    </Text>
                  </View>

                  {item.other_avatar ? (
                    <Image source={{ uri: item.other_avatar }} style={styles.convAvatar} />
                  ) : (
                    <View style={styles.convAvatarPlaceholder}>
                      <Feather name="user" size={18} color="#a1a1aa" />
                    </View>
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b", // zinc-950
  },
  chatWindow: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#18181b", // zinc-900
    borderBottomWidth: 1,
    borderColor: "#27272a",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
  },
  headerInfo: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: "flex-end",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f4f4f5",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#22c55e",
    marginTop: 2,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#27272a",
    alignItems: "center",
    justifyContent: "center",
  },
  messagesListContent: {
    padding: 16,
    paddingBottom: 24,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 12,
    width: "100%",
  },
  myRow: {
    justifyContent: "flex-end",
  },
  theirRow: {
    justifyContent: "flex-start",
  },
  messageBubble: {
    maxWidth: "80%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  myBubble: {
    backgroundColor: "#ea580c",
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: "#27272a",
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  myText: {
    color: "#ffffff",
  },
  theirText: {
    color: "#f4f4f5",
  },
  emojiContainer: {
    flexDirection: "row-reverse",
    justifyContent: "space-around",
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderTopWidth: 1,
    paddingVertical: 8,
  },
  emojiItem: {
    padding: 6,
  },
  emojiText: {
    fontSize: 20,
  },
  inputArea: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#18181b",
    borderTopWidth: 1,
    borderColor: "#27272a",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ea580c",
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    flex: 1,
    height: 40,
    backgroundColor: "#09090b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    marginHorizontal: 8,
    color: "#f4f4f5",
    fontSize: 14,
    textAlign: "right",
  },
  emojiToggle: {
    padding: 6,
  },
  listContainer: {
    flex: 1,
  },
  listHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#27272a",
  },
  listHeaderTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 12,
    textAlign: "right",
  },
  searchWrapper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#18181b",
    borderColor: "#27272a",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginLeft: 8,
  },
  searchInput: {
    flex: 1,
    color: "#f4f4f5",
    fontSize: 14,
    textAlign: "right",
  },
  listLoader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#71717a",
    textAlign: "center",
    lineHeight: 20,
  },
  convItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "rgba(39, 39, 42, 0.5)",
  },
  convAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  convAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#27272a",
    alignItems: "center",
    justifyContent: "center",
  },
  convDetails: {
    flex: 1,
    marginRight: 16,
    alignItems: "flex-end",
  },
  convName: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#f4f4f5",
    marginBottom: 4,
  },
  convSnippet: {
    fontSize: 13,
    color: "#71717a",
  },
  unreadBadge: {
    backgroundColor: "#ea580c",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "bold",
  },
});
