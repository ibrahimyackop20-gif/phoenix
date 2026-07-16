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
import {
  createRealtimeChannel,
  teardownRealtimeChannel,
} from "../../../lib/realtimeChannel";
import { useChat } from "../../../components/ChatProvider";
import { useNotifications } from "../../../components/NotificationProvider";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../../components/ThemeProvider";

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
  const { t } = useTranslation();
  const { themeColors } = useAppTheme();
  const styles = getStyles(themeColors);

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
          other_name: profileRes.data?.full_name || t("chat_user_fallback"),
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
  }, [t]);

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

  useEffect(() => {
    if (!activeConv || !userId) return;
    fetchMessages(activeConv);
  }, [activeConv, userId, fetchMessages]);

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

  useEffect(() => {
    if (!activeConv || !userId) return;

    const channel = createRealtimeChannel(`chat-${activeConv}-rn`)
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
      teardownRealtimeChannel(channel);
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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.chatWindow}
        >
          <View style={styles.chatHeader}>
            <TouchableOpacity onPress={() => setActiveConv(null)} style={styles.backButton}>
              <Feather name="arrow-right" size={20} color={themeColors.text} />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>{activeConvDetails?.other_name}</Text>
              <Text style={styles.headerSubtitle}>{t("chat_active_now")}</Text>
            </View>
            {activeConvDetails?.other_avatar ? (
              <Image source={{ uri: activeConvDetails.other_avatar }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarPlaceholder}>
                <Feather name="user" size={16} color={themeColors.textMuted} />
              </View>
            )}
          </View>

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
              placeholder={t("chat_placeholder")}
              placeholderTextColor={themeColors.textMuted}
              style={styles.textInput}
            />

            <TouchableOpacity onPress={() => setShowEmoji(!showEmoji)} style={styles.emojiToggle}>
              <Feather name="smile" size={20} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.listContainer}>
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>{t("chat_messages_title")}</Text>
            <View style={styles.searchWrapper}>
              <Feather name="search" size={16} color={themeColors.textMuted} style={styles.searchIcon} />
              <TextInput
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholder={t("chat_search_placeholder")}
                placeholderTextColor={themeColors.textMuted}
                style={styles.searchInput}
              />
            </View>
          </View>

          {loading ? (
            <View style={styles.listLoader}>
              <ActivityIndicator size="large" color={themeColors.primary} />
            </View>
          ) : filteredConversations.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color={themeColors.textMuted} />
              <Text style={styles.emptyTitle}>{t("chat_empty_title")}</Text>
              <Text style={styles.emptySubtitle}>{t("chat_empty_subtitle")}</Text>
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
                      {item.last_snippet || t("chat_no_messages")}
                    </Text>
                  </View>

                  {item.other_avatar ? (
                    <Image source={{ uri: item.other_avatar }} style={styles.convAvatar} />
                  ) : (
                    <View style={styles.convAvatarPlaceholder}>
                      <Feather name="user" size={18} color={themeColors.textMuted} />
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

const getStyles = (themeColors: {
  background: string;
  text: string;
  textMuted: string;
  primary: string;
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  inputBorder: string;
  secondary: string;
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    chatWindow: {
      flex: 1,
    },
    chatHeader: {
      flexDirection: "row-reverse",
      alignItems: "center",
      backgroundColor: themeColors.cardBg,
      borderBottomWidth: 1,
      borderColor: themeColors.cardBorder,
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
      color: themeColors.text,
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
      backgroundColor: themeColors.inputBg,
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
      backgroundColor: themeColors.primary,
      borderBottomRightRadius: 4,
    },
    theirBubble: {
      backgroundColor: themeColors.inputBg,
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
      color: themeColors.text,
    },
    emojiContainer: {
      flexDirection: "row-reverse",
      justifyContent: "space-around",
      backgroundColor: themeColors.cardBg,
      borderColor: themeColors.cardBorder,
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
      backgroundColor: themeColors.cardBg,
      borderTopWidth: 1,
      borderColor: themeColors.cardBorder,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: themeColors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    textInput: {
      flex: 1,
      height: 40,
      backgroundColor: themeColors.inputBg,
      borderColor: themeColors.inputBorder,
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 16,
      marginHorizontal: 8,
      color: themeColors.text,
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
      borderColor: themeColors.cardBorder,
    },
    listHeaderTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: themeColors.text,
      marginBottom: 12,
      textAlign: "right",
    },
    searchWrapper: {
      flexDirection: "row-reverse",
      alignItems: "center",
      backgroundColor: themeColors.cardBg,
      borderColor: themeColors.cardBorder,
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
      color: themeColors.text,
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
      color: themeColors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 14,
      color: themeColors.textMuted,
      textAlign: "center",
      lineHeight: 20,
    },
    convItem: {
      flexDirection: "row-reverse",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderColor: themeColors.cardBorder,
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
      backgroundColor: themeColors.inputBg,
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
      color: themeColors.text,
      marginBottom: 4,
    },
    convSnippet: {
      fontSize: 13,
      color: themeColors.textMuted,
    },
    unreadBadge: {
      backgroundColor: themeColors.primary,
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
