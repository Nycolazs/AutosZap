import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConversationMessage } from '@autoszap/platform-types';
import { ScreenTransition } from '@/components/screen-transition';
import { resolveApiUrl } from '@/lib/api';
import { useSession } from '@/providers/session-provider';
import { palette } from '@/theme';

// ── WhatsApp text formatting ─────────────────────────────────

function WhatsAppText({ text, style }: { text: string; style?: object }) {
  const parts = useMemo(() => {
    const result: { text: string; bold?: boolean; italic?: boolean; strike?: boolean; mono?: boolean }[] = [];
    let remaining = text;

    const patterns = [
      { regex: /\*([^*]+)\*/, key: 'bold' },
      { regex: /_([^_]+)_/, key: 'italic' },
      { regex: /~([^~]+)~/, key: 'strike' },
      { regex: /```([^`]+)```/, key: 'mono' },
    ];

    while (remaining.length > 0) {
      let earliest = -1;
      let earliestIdx = remaining.length;
      for (let i = 0; i < patterns.length; i++) {
        const match = remaining.search(patterns[i].regex);
        if (match !== -1 && match < earliestIdx) {
          earliestIdx = match;
          earliest = i;
        }
      }

      if (earliest === -1) {
        result.push({ text: remaining });
        break;
      }

      if (earliestIdx > 0) {
        result.push({ text: remaining.substring(0, earliestIdx) });
      }

      const match = remaining.match(patterns[earliest].regex)!;
      result.push({ text: match[1], [patterns[earliest].key]: true });
      remaining = remaining.substring(earliestIdx + match[0].length);
    }

    return result;
  }, [text]);

  return (
    <Text style={style}>
      {parts.map((part, i) => (
        <Text
          key={i}
          style={[
            part.bold && { fontWeight: '700' },
            part.italic && { fontStyle: 'italic' },
            part.strike && { textDecorationLine: 'line-through' },
            part.mono && { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, backgroundColor: 'rgba(255,255,255,0.06)' },
          ]}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

// ── Media bubble renderers ───────────────────────────────────

function normalizeMessageType(messageType?: string | null) {
  const normalized = String(messageType ?? '').trim().toLowerCase();

  if (normalized === 'voice' || normalized === 'ptt') return 'audio';
  if (normalized === 'video_note' || normalized === 'video_note_message') return 'video';
  if (normalized === 'animated_sticker') return 'sticker';
  return normalized || 'text';
}

function buildAuthenticatedMediaUrl(messageId: string, accessToken?: string | null) {
  if (!accessToken) {
    return null;
  }

  const url = new URL(`/api/messages/${messageId}/media`, resolveApiUrl());
  url.searchParams.set('accessToken', accessToken);

  return url.toString();
}

function MediaBubble({
  msg,
  outbound,
  mediaUrl,
}: {
  msg: ConversationMessage;
  outbound: boolean;
  mediaUrl?: string | null;
}) {
  const meta = msg.metadata as Record<string, unknown> | null | undefined;
  const normalizedType = normalizeMessageType(msg.messageType);
  const mimeType = String(meta?.mimeType ?? '');
  const caption = String(meta?.caption ?? msg.content ?? '');
  const fileName = String(meta?.fileName ?? '');

  if (normalizedType === 'image' || normalizedType === 'sticker' || mimeType.startsWith('image/')) {
    return (
      <View style={[styles.bubble, outbound ? styles.bubbleOutbound : styles.bubbleInbound, { padding: 4 }]}>
        {mediaUrl ? (
          <Image source={{ uri: mediaUrl }} style={styles.mediaImage} resizeMode="cover" />
        ) : (
          <View style={styles.mediaPlaceholder}>
            <Ionicons name="image-outline" size={32} color={palette.textMuted} />
            <Text style={styles.mediaPlaceholderText}>Imagem</Text>
          </View>
        )}
        {caption && caption !== '[image]' ? (
          <WhatsAppText text={caption} style={[styles.messageText, outbound && { color: palette.text }, { paddingHorizontal: 10, paddingBottom: 4 }]} />
        ) : null}
        <Text style={[styles.messageMeta, { paddingHorizontal: 10 }]}>{new Date(msg.createdAt).toLocaleString('pt-BR')}</Text>
      </View>
    );
  }

  if (normalizedType === 'audio' || mimeType.startsWith('audio/')) {
    const isVoice = normalizedType === 'audio' && (msg.messageType === 'ptt' || msg.messageType === 'voice' || meta?.voice);
    return (
      <View style={[styles.bubble, outbound ? styles.bubbleOutbound : styles.bubbleInbound]}>
        <View style={styles.audioRow}>
          <Ionicons name={isVoice ? 'mic-outline' : 'musical-notes-outline'} size={22} color={outbound ? palette.text : palette.primary} />
          <Text style={[styles.messageText, outbound && { color: palette.text }, { flex: 1 }]}>
            {isVoice ? 'Mensagem de voz' : 'Audio'}
          </Text>
          {mediaUrl ? (
            <Pressable onPress={() => Linking.openURL(mediaUrl)}>
              <Ionicons name="play-circle-outline" size={28} color={outbound ? palette.text : palette.primary} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.messageMeta}>{new Date(msg.createdAt).toLocaleString('pt-BR')}</Text>
      </View>
    );
  }

  if (normalizedType === 'video' || mimeType.startsWith('video/')) {
    return (
      <View style={[styles.bubble, outbound ? styles.bubbleOutbound : styles.bubbleInbound]}>
        <View style={styles.audioRow}>
          <Ionicons name="videocam-outline" size={22} color={outbound ? palette.text : palette.primary} />
          <Text style={[styles.messageText, outbound && { color: palette.text }, { flex: 1 }]}>
            {caption && caption !== '[video]' ? caption : 'Video'}
          </Text>
          {mediaUrl ? (
            <Pressable onPress={() => Linking.openURL(mediaUrl)}>
              <Ionicons name="play-circle-outline" size={28} color={outbound ? palette.text : palette.primary} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.messageMeta}>{new Date(msg.createdAt).toLocaleString('pt-BR')}</Text>
      </View>
    );
  }

  if (normalizedType === 'document' || mimeType.startsWith('application/')) {
    return (
      <View style={[styles.bubble, outbound ? styles.bubbleOutbound : styles.bubbleInbound]}>
        <View style={styles.audioRow}>
          <Ionicons name="document-outline" size={22} color={outbound ? palette.text : palette.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.messageText, outbound && { color: palette.text }]} numberOfLines={2}>
              {fileName || 'Documento'}
            </Text>
            {caption && caption !== fileName ? (
              <Text style={[styles.messageMeta, { marginTop: 2 }]}>{caption}</Text>
            ) : null}
          </View>
          {mediaUrl ? (
            <Pressable onPress={() => Linking.openURL(mediaUrl)}>
              <Ionicons name="download-outline" size={24} color={outbound ? palette.text : palette.primary} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.messageMeta}>{new Date(msg.createdAt).toLocaleString('pt-BR')}</Text>
      </View>
    );
  }

  if (normalizedType === 'location') {
    const lat = meta?.latitude as number | undefined;
    const lng = meta?.longitude as number | undefined;
    return (
      <View style={[styles.bubble, outbound ? styles.bubbleOutbound : styles.bubbleInbound]}>
        <View style={styles.audioRow}>
          <Ionicons name="location-outline" size={22} color={outbound ? palette.text : palette.primary} />
          <Text style={[styles.messageText, outbound && { color: palette.text }, { flex: 1 }]}>
            Localizacao
          </Text>
        </View>
        {lat && lng ? (
          <Pressable onPress={() => Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`)}>
            <Text style={[styles.linkText, outbound && { color: 'rgba(255,255,255,0.85)' }]}>Abrir no Maps</Text>
          </Pressable>
        ) : null}
        <Text style={styles.messageMeta}>{new Date(msg.createdAt).toLocaleString('pt-BR')}</Text>
      </View>
    );
  }

  if (normalizedType === 'contacts' || normalizedType === 'contact') {
    return (
      <View style={[styles.bubble, outbound ? styles.bubbleOutbound : styles.bubbleInbound]}>
        <View style={styles.audioRow}>
          <Ionicons name="person-outline" size={22} color={outbound ? palette.text : palette.primary} />
          <Text style={[styles.messageText, outbound && { color: palette.text }, { flex: 1 }]}>
            {msg.content || 'Contato compartilhado'}
          </Text>
        </View>
        <Text style={styles.messageMeta}>{new Date(msg.createdAt).toLocaleString('pt-BR')}</Text>
      </View>
    );
  }

  // Default: text message with quote support
  return null;
}

// ── Quoted message ───────────────────────────────────────────

function QuotedMessage({ metadata }: { metadata: Record<string, unknown> | null | undefined }) {
  if (!metadata) return null;
  const quote = metadata.quote as { content?: string; senderName?: string } | undefined;
  if (!quote) return null;

  return (
    <View style={styles.quotedMessage}>
      <View style={styles.quotedBar} />
      <View style={{ flex: 1 }}>
        {quote.senderName ? (
          <Text style={styles.quotedSender}>{quote.senderName}</Text>
        ) : null}
        <Text style={styles.quotedText} numberOfLines={2}>{quote.content || ''}</Text>
      </View>
    </View>
  );
}

// ── Message status icon ──────────────────────────────────────

function MessageStatusIcon({ status }: { status?: string | null }) {
  if (!status) return null;
  if (status === 'READ') return <Ionicons name="checkmark-done" size={14} color={palette.primary} />;
  if (status === 'DELIVERED') return <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.5)" />;
  if (status === 'SENT') return <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.5)" />;
  if (status === 'FAILED') return <Ionicons name="close-circle" size={14} color={palette.danger} />;
  if (status === 'QUEUED') return <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.5)" />;
  return null;
}

// ── Main Screen ──────────────────────────────────────────────

type ActivePanel = 'none' | 'reminders' | 'notes' | 'info';

export default function ConversationScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const conversationId = String(params.id);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<ConversationMessage> | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const pendingInitialScrollRef = useRef(true);
  const previousConversationIdRef = useRef<string | null>(null);
  const [message, setMessage] = useState('');
  const [activePanel, setActivePanel] = useState<ActivePanel>('none');
  const [sending, setSending] = useState(false);

  // Reminder form state
  const [savingReminder, setSavingReminder] = useState(false);
  const [reminderDescription, setReminderDescription] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');

  // Note form state
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Quick messages
  const [quickMessagesVisible, setQuickMessagesVisible] = useState(false);

  const { api, me, session } = useSession();

  const canResolve = Boolean(me?.permissionMap?.RESOLVE_CONVERSATION);
  const canClose = Boolean(me?.permissionMap?.CLOSE_CONVERSATION);
  const canReopen = Boolean(me?.permissionMap?.REOPEN_CONVERSATION);

  const conversationQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.getConversation(conversationId),
    refetchInterval: 8000,
  });

  const quickMessagesQuery = useQuery({
    queryKey: ['quick-messages'],
    queryFn: () => api.listQuickMessages(),
    enabled: quickMessagesVisible,
  });

  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.listTags(),
    enabled: activePanel === 'info',
  });

  const teamQuery = useQuery({
    queryKey: ['team'],
    queryFn: () => api.listTeam(),
    enabled: activePanel === 'info',
  });

  const statusMutation = useMutation({
    mutationFn: async (action: 'resolve' | 'close' | 'reopen') => {
      if (action === 'resolve') return api.resolveConversation(conversationId);
      if (action === 'close') return api.closeConversation(conversationId);
      return api.reopenConversation(conversationId);
    },
    onSuccess: async () => {
      await Promise.all([
        conversationQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['conversations-summary'] }),
      ]);
    },
    onError: (error: Error) => {
      Alert.alert('Falha ao atualizar conversa', error.message);
    },
  });

  const updateConversationMutation = useMutation({
    mutationFn: (payload: { assignedUserId?: string | null; tagIds?: string[] }) =>
      api.updateConversation(conversationId, payload),
    onSuccess: async () => {
      await conversationQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: Error) => {
      Alert.alert('Falha ao atualizar conversa', error.message);
    },
  });

  useEffect(() => {
    if (previousConversationIdRef.current === conversationId) return;
    previousConversationIdRef.current = conversationId;
    pendingInitialScrollRef.current = true;
    shouldAutoScrollRef.current = true;
  }, [conversationId]);

  const conversation = conversationQuery.data;
  const reminders = useMemo(() => conversation?.reminders ?? [], [conversation?.reminders]);
  const notes = useMemo(() => conversation?.notes ?? [], [conversation?.notes]);
  const messages = useMemo(
    () =>
      [...(conversation?.messages ?? [])].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [conversation?.messages],
  );

  const isClosed = conversation?.status === 'RESOLVED' || conversation?.status === 'CLOSED';

  const scrollToBottom = useCallback(
    (animated: boolean) => {
      if (!listRef.current || !messages.length) return;
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated });
      });
    },
    [messages.length],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const dist = contentSize.height - contentOffset.y - layoutMeasurement.height;
      shouldAutoScrollRef.current = dist < 80;
    },
    [],
  );

  useEffect(() => {
    if (!messages.length) return;
    if (pendingInitialScrollRef.current) {
      pendingInitialScrollRef.current = false;
      scrollToBottom(false);
      setTimeout(() => scrollToBottom(false), 0);
      return;
    }
    if (shouldAutoScrollRef.current) scrollToBottom(true);
  }, [messages.length, scrollToBottom]);

  if (conversationQuery.isLoading || !conversation) {
    return (
      <ScreenTransition>
        <View style={styles.centerState}>
          <ActivityIndicator color={palette.primary} />
        </View>
      </ScreenTransition>
    );
  }

  const statusLabel = mapStatus(conversation.status, conversation.closeReason);

  return (
    <ScreenTransition>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={96}
      >
        {/* ── Header ──────────────────────────────────────── */}
        <View style={styles.headerCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.contactName}>{conversation.contact.name}</Text>
            <Text style={styles.contactPhone}>{conversation.contact.phone}</Text>
            <Text style={styles.contactMeta}>
              {conversation.assignedUser?.name || 'Equipe disponivel'} • {statusLabel}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.headerAction} onPress={() => setActivePanel(activePanel === 'info' ? 'none' : 'info')}>
              <Ionicons name="information-circle-outline" size={20} color={palette.primary} />
            </Pressable>
            <Pressable style={styles.headerAction} onPress={() => setActivePanel(activePanel === 'notes' ? 'none' : 'notes')}>
              <Ionicons name="document-text-outline" size={20} color={palette.primary} />
            </Pressable>
            <Pressable style={styles.headerAction} onPress={() => setActivePanel(activePanel === 'reminders' ? 'none' : 'reminders')}>
              <Ionicons name="alarm-outline" size={20} color={palette.primary} />
            </Pressable>
          </View>
        </View>

        {/* ── Tags row ────────────────────────────────────── */}
        {conversation.tags.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsRow} contentContainerStyle={styles.tagsContent}>
            {conversation.tags.map((tag) => (
              <View key={tag.id} style={[styles.tagPill, { backgroundColor: (tag.color ?? palette.primary) + '22' }]}>
                <View style={[styles.tagDot, { backgroundColor: tag.color ?? palette.primary }]} />
                <Text style={[styles.tagText, { color: tag.color ?? palette.primary }]}>{tag.name}</Text>
              </View>
            ))}
          </ScrollView>
        ) : null}

        {/* ── Action buttons ──────────────────────────────── */}
        <View style={styles.conversationActions}>
          <Pressable
            style={[styles.actionButton, (!canResolve || isClosed || statusMutation.isPending) && styles.actionButtonDisabled]}
            disabled={!canResolve || isClosed || statusMutation.isPending}
            onPress={() => statusMutation.mutate('resolve')}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={palette.success} />
            <Text style={styles.actionButtonText}>Resolver</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, (!canClose || isClosed || statusMutation.isPending) && styles.actionButtonDisabled]}
            disabled={!canClose || isClosed || statusMutation.isPending}
            onPress={() => statusMutation.mutate('close')}
          >
            <Ionicons name="close-circle-outline" size={16} color={palette.danger} />
            <Text style={styles.actionButtonText}>Encerrar</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, (!canReopen || !isClosed || statusMutation.isPending) && styles.actionButtonDisabled]}
            disabled={!canReopen || !isClosed || statusMutation.isPending}
            onPress={() => statusMutation.mutate('reopen')}
          >
            <Ionicons name="refresh-outline" size={16} color={palette.warning} />
            <Text style={styles.actionButtonText}>Reabrir</Text>
          </Pressable>
        </View>

        {isClosed ? (
          <View style={styles.closedBanner}>
            <Ionicons name="lock-closed-outline" size={16} color={palette.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.closedBannerTitle}>Conversa encerrada para envio</Text>
              <Text style={styles.closedBannerDescription}>
                Reabra para voltar a responder mensagens.
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Messages ────────────────────────────────────── */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onContentSizeChange={() => {
            if (pendingInitialScrollRef.current) scrollToBottom(false);
          }}
          refreshControl={
            <RefreshControl
              tintColor={palette.primary}
              refreshing={conversationQuery.isRefetching}
              onRefresh={() => void conversationQuery.refetch()}
            />
          }
          renderItem={({ item }) => {
            const outbound = item.direction !== 'INBOUND';
            const isSystem = item.direction === 'SYSTEM';

            if (isSystem) {
              return (
                <View style={styles.systemMessage}>
                  <Text style={styles.systemMessageText}>{item.content}</Text>
                </View>
              );
            }

            // Check for media types
            const mediaUrl = buildAuthenticatedMediaUrl(
              item.id,
              session?.accessToken,
            );
            const mediaEl = (
              <MediaBubble
                msg={item}
                outbound={outbound}
                mediaUrl={mediaUrl}
              />
            );
            if (mediaEl && normalizeMessageType(item.messageType) !== 'text' && normalizeMessageType(item.messageType) !== 'template') {
              return mediaEl;
            }

            return (
              <View style={[styles.bubble, outbound ? styles.bubbleOutbound : styles.bubbleInbound]}>
                <QuotedMessage metadata={item.metadata} />
                <WhatsAppText
                  text={item.content}
                  style={[styles.messageText, outbound && { color: palette.text }]}
                />
                <View style={styles.messageFooter}>
                  <Text style={styles.messageMeta}>{new Date(item.createdAt).toLocaleString('pt-BR')}</Text>
                  {outbound ? <MessageStatusIcon status={item.status} /> : null}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <Ionicons name="chatbubbles-outline" size={32} color={palette.textMuted} />
              <Text style={styles.emptyTitle}>Ainda sem historico.</Text>
              <Text style={styles.emptyDescription}>
                Assim que esta conversa receber mensagens, o historico aparece aqui.
              </Text>
            </View>
          }
        />

        {/* ── Composer ────────────────────────────────────── */}
        <View style={[styles.composer, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
          {isClosed ? (
            <View style={[styles.composerInput, styles.composerInputDisabled]}>
              <Text style={styles.composerInputDisabledText}>
                Conversa fechada. Reabra para responder.
              </Text>
            </View>
          ) : (
            <View style={styles.composerRow}>
              <Pressable style={styles.quickMsgBtn} onPress={() => setQuickMessagesVisible(true)}>
                <Ionicons name="flash-outline" size={22} color={palette.primary} />
              </Pressable>
              <TextInput
                value={message}
                onChangeText={setMessage}
                multiline
                placeholder="Digite sua mensagem"
                placeholderTextColor={palette.textMuted}
                style={[styles.composerInput, { flex: 1 }]}
              />
            </View>
          )}
          <Pressable
            style={[styles.sendButton, (sending || isClosed || !message.trim()) && styles.sendButtonDisabled]}
            disabled={sending || isClosed || !message.trim()}
            onPress={async () => {
              if (!message.trim()) return;
              try {
                setSending(true);
                const latest = await api.getConversation(conversationId);
                if (latest.status === 'RESOLVED' || latest.status === 'CLOSED') {
                  await conversationQuery.refetch();
                  Alert.alert('Conversa encerrada', 'Reabra para responder.');
                  return;
                }
                await api.sendConversationMessage(conversationId, message);
                setMessage('');
                await Promise.all([
                  conversationQuery.refetch(),
                  queryClient.invalidateQueries({ queryKey: ['conversations'] }),
                ]);
                shouldAutoScrollRef.current = true;
                scrollToBottom(true);
              } catch (error) {
                Alert.alert('Falha ao enviar', error instanceof Error ? error.message : 'Erro inesperado.');
              } finally {
                setSending(false);
              }
            }}
          >
            <Ionicons name="send" size={18} color={palette.text} />
            <Text style={styles.sendButtonText}>{sending ? 'Enviando...' : 'Enviar'}</Text>
          </Pressable>
        </View>

        {/* ── Quick Messages Modal ────────────────────────── */}
        <Modal visible={quickMessagesVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setQuickMessagesVisible(false)}>
          <ScrollView style={styles.modalScreen} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Mensagens rapidas</Text>
                <Text style={styles.modalSubtitle}>Selecione para inserir no campo de texto.</Text>
              </View>
              <Pressable style={styles.modalClose} onPress={() => setQuickMessagesVisible(false)}>
                <Text style={styles.modalCloseText}>Fechar</Text>
              </Pressable>
            </View>
            {quickMessagesQuery.isLoading ? (
              <ActivityIndicator color={palette.primary} style={{ marginTop: 32 }} />
            ) : (quickMessagesQuery.data ?? []).length === 0 ? (
              <View style={styles.emptyMessages}>
                <Text style={styles.emptyTitle}>Nenhuma mensagem rapida.</Text>
                <Text style={styles.emptyDescription}>Crie mensagens rapidas no painel web para usar aqui.</Text>
              </View>
            ) : (
              (quickMessagesQuery.data ?? []).map((qm) => (
                <Pressable
                  key={qm.id}
                  style={styles.quickMessageCard}
                  onPress={() => {
                    setMessage((prev) => prev + qm.content);
                    setQuickMessagesVisible(false);
                  }}
                >
                  <Text style={styles.quickMessageTitle}>{qm.title}</Text>
                  <Text style={styles.quickMessageContent} numberOfLines={3}>{qm.content}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </Modal>

        {/* ── Reminders Modal ─────────────────────────────── */}
        <Modal visible={activePanel === 'reminders'} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setActivePanel('none')}>
          <ScrollView style={styles.modalScreen} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Lembretes</Text>
                <Text style={styles.modalSubtitle}>Agende retornos para este cliente.</Text>
              </View>
              <Pressable style={styles.modalClose} onPress={() => setActivePanel('none')}>
                <Text style={styles.modalCloseText}>Fechar</Text>
              </Pressable>
            </View>

            <View style={styles.metricsRow}>
              <Metric label="Total" value={String(reminders.length)} />
              <Metric label="Ativos" value={String(reminders.filter((r) => r.status === 'PENDING' || r.status === 'NOTIFIED').length)} />
              <Metric label="Vencidos" value={String(reminders.filter((r) => r.status === 'NOTIFIED' && new Date(r.remindAt).getTime() < Date.now()).length)} />
            </View>

            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Novo lembrete</Text>
              <TextInput value={reminderDescription} onChangeText={setReminderDescription} placeholder="Descricao interna" placeholderTextColor={palette.textMuted} style={styles.input} />
              <TextInput value={reminderMessage} onChangeText={setReminderMessage} multiline placeholder="Mensagem para o cliente" placeholderTextColor={palette.textMuted} style={[styles.input, styles.textarea]} />
              <View style={styles.row}>
                <TextInput value={reminderDate} onChangeText={setReminderDate} placeholder="2026-03-20" placeholderTextColor={palette.textMuted} style={[styles.input, styles.rowInput]} />
                <TextInput value={reminderTime} onChangeText={setReminderTime} placeholder="18:30" placeholderTextColor={palette.textMuted} style={[styles.input, styles.rowInput]} />
              </View>
              <Pressable
                style={[styles.primaryButton, savingReminder && styles.sendButtonDisabled]}
                disabled={savingReminder}
                onPress={async () => {
                  if (!reminderMessage.trim() || !reminderDate.trim() || !reminderTime.trim()) return;
                  try {
                    setSavingReminder(true);
                    await api.createReminder(conversationId, { internalDescription: reminderDescription, messageToSend: reminderMessage, remindAt: `${reminderDate}T${reminderTime}:00` });
                    setReminderDescription(''); setReminderMessage(''); setReminderDate(''); setReminderTime('');
                    await conversationQuery.refetch();
                  } finally { setSavingReminder(false); }
                }}
              >
                <Text style={styles.primaryButtonText}>{savingReminder ? 'Salvando...' : 'Criar lembrete'}</Text>
              </Pressable>
            </View>

            <View style={styles.listCard}>
              <Text style={styles.sectionTitle}>Historico</Text>
              {reminders.length ? reminders.map((item) => (
                <View key={item.id} style={styles.reminderCard}>
                  <View style={styles.reminderTop}>
                    <Text style={styles.reminderTitle} numberOfLines={2}>{item.internalDescription || item.messageToSend}</Text>
                    <View style={[styles.statusPill, reminderStatusStyle(item)]}>
                      <Text style={styles.statusText}>{mapReminderStatus(item)}</Text>
                    </View>
                  </View>
                  <Text style={styles.reminderBody} numberOfLines={3}>{item.messageToSend}</Text>
                  <Text style={styles.reminderMeta}>{new Date(item.remindAt).toLocaleString('pt-BR')}</Text>
                  <View style={styles.reminderActions}>
                    {item.status !== 'COMPLETED' && item.status !== 'CANCELED' ? (
                      <Pressable style={styles.secondaryButton} onPress={async () => { await api.completeReminder(conversationId, item.id); await conversationQuery.refetch(); }}>
                        <Text style={styles.secondaryButtonText}>Concluir</Text>
                      </Pressable>
                    ) : null}
                    {item.status !== 'CANCELED' && item.status !== 'COMPLETED' ? (
                      <Pressable style={styles.secondaryButton} onPress={async () => { await api.cancelReminder(conversationId, item.id); await conversationQuery.refetch(); }}>
                        <Text style={styles.secondaryButtonText}>Cancelar</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              )) : (
                <View style={styles.emptyMessages}>
                  <Text style={styles.emptyTitle}>Nenhum lembrete.</Text>
                  <Text style={styles.emptyDescription}>Crie um retorno programado acima.</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </Modal>

        {/* ── Notes Modal ─────────────────────────────────── */}
        <Modal visible={activePanel === 'notes'} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setActivePanel('none')}>
          <ScrollView style={styles.modalScreen} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Notas internas</Text>
                <Text style={styles.modalSubtitle}>Visivel apenas para a equipe.</Text>
              </View>
              <Pressable style={styles.modalClose} onPress={() => setActivePanel('none')}>
                <Text style={styles.modalCloseText}>Fechar</Text>
              </Pressable>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Nova nota</Text>
              <TextInput value={noteContent} onChangeText={setNoteContent} multiline placeholder="Escreva uma nota interna..." placeholderTextColor={palette.textMuted} style={[styles.input, styles.textarea]} />
              <Pressable
                style={[styles.primaryButton, savingNote && styles.sendButtonDisabled]}
                disabled={savingNote || !noteContent.trim()}
                onPress={async () => {
                  if (!noteContent.trim()) return;
                  try {
                    setSavingNote(true);
                    await api.addConversationNote(conversationId, noteContent);
                    setNoteContent('');
                    await conversationQuery.refetch();
                  } finally { setSavingNote(false); }
                }}
              >
                <Text style={styles.primaryButtonText}>{savingNote ? 'Salvando...' : 'Adicionar nota'}</Text>
              </Pressable>
            </View>

            <View style={styles.listCard}>
              <Text style={styles.sectionTitle}>Historico de notas</Text>
              {notes.length ? notes.map((note) => (
                <View key={note.id} style={styles.noteCard}>
                  <Text style={styles.noteAuthor}>{note.author.name}</Text>
                  <Text style={styles.noteText}>{note.content}</Text>
                  <Text style={styles.noteMeta}>{new Date(note.createdAt).toLocaleString('pt-BR')}</Text>
                </View>
              )) : (
                <View style={styles.emptyMessages}>
                  <Text style={styles.emptyTitle}>Nenhuma nota.</Text>
                  <Text style={styles.emptyDescription}>Adicione observacoes internas sobre este atendimento.</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </Modal>

        {/* ── Info/Assignment Modal ───────────────────────── */}
        <Modal visible={activePanel === 'info'} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setActivePanel('none')}>
          <ScrollView style={styles.modalScreen} contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Detalhes da conversa</Text>
              </View>
              <Pressable style={styles.modalClose} onPress={() => setActivePanel('none')}>
                <Text style={styles.modalCloseText}>Fechar</Text>
              </Pressable>
            </View>

            {/* Contact info */}
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Contato</Text>
              <InfoRow label="Nome" value={conversation.contact.name} />
              <InfoRow label="Telefone" value={conversation.contact.phone} />
              {conversation.contact.email ? <InfoRow label="Email" value={conversation.contact.email} /> : null}
              {conversation.contact.company ? <InfoRow label="Empresa" value={conversation.contact.company} /> : null}
            </View>

            {/* Assignment */}
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Atribuicao</Text>
              <Text style={styles.label}>Responsavel atual</Text>
              <Text style={styles.infoValue}>{conversation.assignedUser?.name || 'Ninguem atribuido'}</Text>

              {teamQuery.data ? (
                <View style={styles.assignmentList}>
                  <Pressable
                    style={[styles.assignmentOption, !conversation.assignedUser && styles.assignmentOptionSelected]}
                    onPress={() => updateConversationMutation.mutate({ assignedUserId: null })}
                  >
                    <Text style={styles.assignmentOptionText}>Remover atribuicao</Text>
                  </Pressable>
                  {teamQuery.data.map((member) => (
                    <Pressable
                      key={member.id}
                      style={[styles.assignmentOption, conversation.assignedUser?.id === member.userId && styles.assignmentOptionSelected]}
                      onPress={() => updateConversationMutation.mutate({ assignedUserId: member.userId })}
                    >
                      <Text style={styles.assignmentOptionText}>{member.name}</Text>
                      <Text style={styles.assignmentOptionRole}>{member.role}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : teamQuery.isLoading ? (
                <ActivityIndicator color={palette.primary} style={{ marginTop: 12 }} />
              ) : null}
            </View>

            {/* Tags management */}
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Tags</Text>
              {tagsQuery.data ? (
                <View style={styles.tagsList}>
                  {tagsQuery.data.map((tag) => {
                    const isActive = conversation.tags.some((t) => t.id === tag.id);
                    return (
                      <Pressable
                        key={tag.id}
                        style={[styles.tagOption, isActive && { backgroundColor: (tag.color ?? palette.primary) + '33', borderColor: tag.color ?? palette.primary }]}
                        onPress={() => {
                          const currentIds = conversation.tags.map((t) => t.id);
                          const newIds = isActive ? currentIds.filter((id) => id !== tag.id) : [...currentIds, tag.id];
                          updateConversationMutation.mutate({ tagIds: newIds });
                        }}
                      >
                        <View style={[styles.tagDot, { backgroundColor: tag.color ?? palette.primary }]} />
                        <Text style={[styles.tagOptionText, isActive && { color: tag.color ?? palette.primary }]}>{tag.name}</Text>
                        {isActive ? <Ionicons name="checkmark" size={16} color={tag.color ?? palette.primary} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : tagsQuery.isLoading ? (
                <ActivityIndicator color={palette.primary} style={{ marginTop: 12 }} />
              ) : null}
            </View>
          </ScrollView>
        </Modal>
      </KeyboardAvoidingView>
    </ScreenTransition>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2, marginTop: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function mapStatus(status: string, closeReason?: string | null) {
  if (status === 'IN_PROGRESS') return 'Em atendimento';
  if (status === 'WAITING') return 'Aguardando';
  if (status === 'RESOLVED') return 'Resolvido';
  if (status === 'CLOSED' && closeReason === 'UNANSWERED') return 'Nao respondido';
  if (status === 'CLOSED') return 'Encerrado';
  return 'Novo';
}

function mapReminderStatus(reminder: { status: string; remindAt: string }) {
  if (reminder.status === 'COMPLETED') return 'Concluido';
  if (reminder.status === 'CANCELED') return 'Cancelado';
  const remindAt = new Date(reminder.remindAt);
  if (remindAt.toDateString() === new Date().toDateString()) return 'Hoje';
  if (remindAt.getTime() < Date.now()) return 'Atrasado';
  return reminder.status === 'NOTIFIED' ? 'Notificado' : 'Pendente';
}

function reminderStatusStyle(reminder: { status: string; remindAt: string }) {
  const label = mapReminderStatus(reminder);
  if (label === 'Atrasado') return { backgroundColor: 'rgba(243, 201, 63, 0.14)' };
  if (label === 'Concluido') return { backgroundColor: 'rgba(73, 216, 185, 0.14)' };
  if (label === 'Cancelado') return { backgroundColor: 'rgba(255, 141, 155, 0.14)' };
  return { backgroundColor: palette.primarySoft };
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },

  // Header
  headerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.backgroundElevated },
  contactName: { color: palette.text, fontSize: 17, fontWeight: '700' },
  contactPhone: { color: palette.textMuted, fontSize: 12, marginTop: 2 },
  contactMeta: { color: palette.textMuted, fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 6 },
  headerAction: { width: 38, height: 38, borderRadius: 12, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center' },

  // Tags row
  tagsRow: { maxHeight: 40, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.background },
  tagsContent: { paddingHorizontal: 16, gap: 6, alignItems: 'center', paddingVertical: 6 },
  tagPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  tagText: { fontSize: 11, fontWeight: '600' },

  // Actions
  conversationActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.border },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  actionButtonDisabled: { opacity: 0.4 },
  actionButtonText: { color: palette.text, fontSize: 12, fontWeight: '700' },

  closedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,141,155,0.4)', backgroundColor: 'rgba(255,141,155,0.1)' },
  closedBannerTitle: { color: palette.text, fontSize: 13, fontWeight: '700' },
  closedBannerDescription: { color: palette.textMuted, fontSize: 12 },

  // Messages
  messagesContent: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  bubble: { maxWidth: '84%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleInbound: { alignSelf: 'flex-start', backgroundColor: palette.backgroundElevated, borderWidth: 1, borderColor: palette.border },
  bubbleOutbound: { alignSelf: 'flex-end', backgroundColor: palette.primary },
  messageText: { color: palette.text, fontSize: 15, lineHeight: 22 },
  messageFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  messageMeta: { color: 'rgba(242,247,255,0.6)', fontSize: 11 },

  systemMessage: { alignSelf: 'center', backgroundColor: palette.surfaceSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, marginVertical: 4 },
  systemMessageText: { color: palette.textMuted, fontSize: 12, fontStyle: 'italic', textAlign: 'center' },

  // Media
  mediaImage: { width: '100%', height: 200, borderRadius: 16 },
  mediaPlaceholder: { width: '100%', height: 120, borderRadius: 16, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center', gap: 4 },
  mediaPlaceholderText: { color: palette.textMuted, fontSize: 12 },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkText: { color: palette.primary, fontSize: 13, fontWeight: '600', marginTop: 4 },

  // Quoted message
  quotedMessage: { flexDirection: 'row', gap: 8, marginBottom: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  quotedBar: { width: 3, borderRadius: 2, backgroundColor: palette.primary },
  quotedSender: { color: palette.primary, fontSize: 12, fontWeight: '700' },
  quotedText: { color: palette.textMuted, fontSize: 13 },

  emptyMessages: { padding: 20, borderRadius: 22, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.backgroundElevated, gap: 8, alignItems: 'center' },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '700' },
  emptyDescription: { color: palette.textMuted, fontSize: 14, lineHeight: 22, textAlign: 'center' },

  // Composer
  composer: { borderTopWidth: 1, borderTopColor: palette.border, paddingHorizontal: 16, paddingTop: 10, backgroundColor: palette.background, gap: 8 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  composerInput: { minHeight: 48, maxHeight: 120, borderRadius: 18, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, color: palette.text, fontSize: 15 },
  composerInputDisabled: { opacity: 0.6, justifyContent: 'center' },
  composerInputDisabledText: { color: palette.textMuted, fontSize: 14 },
  quickMsgBtn: { width: 44, height: 48, borderRadius: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
  sendButton: { height: 46, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: palette.primary },
  sendButtonDisabled: { opacity: 0.6 },
  sendButtonText: { color: palette.text, fontSize: 15, fontWeight: '700' },

  // Quick Messages
  quickMessageCard: { padding: 14, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, gap: 4 },
  quickMessageTitle: { color: palette.text, fontSize: 14, fontWeight: '700' },
  quickMessageContent: { color: palette.textMuted, fontSize: 13, lineHeight: 20 },

  // Modal
  modalScreen: { flex: 1, backgroundColor: palette.background },
  modalContent: { padding: 16, gap: 16, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  modalTitle: { color: palette.text, fontSize: 22, fontWeight: '800' },
  modalSubtitle: { color: palette.textMuted, fontSize: 14, lineHeight: 22, marginTop: 4 },
  modalClose: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  modalCloseText: { color: palette.text, fontSize: 13, fontWeight: '700' },

  // Metrics
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, padding: 14, borderRadius: 18, backgroundColor: palette.backgroundElevated, borderWidth: 1, borderColor: palette.border, gap: 4 },
  metricLabel: { color: palette.textMuted, fontSize: 12 },
  metricValue: { color: palette.text, fontSize: 20, fontWeight: '700' },

  // Form
  formCard: { padding: 16, borderRadius: 22, backgroundColor: palette.backgroundElevated, borderWidth: 1, borderColor: palette.border, gap: 10 },
  listCard: { padding: 16, borderRadius: 22, backgroundColor: palette.backgroundElevated, borderWidth: 1, borderColor: palette.border, gap: 10 },
  sectionTitle: { color: palette.text, fontSize: 17, fontWeight: '700' },
  input: { minHeight: 48, borderRadius: 16, paddingHorizontal: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, color: palette.text, fontSize: 15 },
  textarea: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  rowInput: { flex: 1 },
  label: { color: palette.textMuted, fontSize: 12, fontWeight: '600' },
  infoValue: { color: palette.text, fontSize: 14 },

  primaryButton: { height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.primary },
  primaryButtonText: { color: palette.text, fontSize: 15, fontWeight: '700' },

  // Reminders
  reminderCard: { padding: 14, borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, gap: 6 },
  reminderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  reminderTitle: { flex: 1, color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  reminderBody: { color: palette.textMuted, fontSize: 13, lineHeight: 20 },
  reminderMeta: { color: palette.textMuted, fontSize: 11 },
  reminderActions: { flexDirection: 'row', gap: 8 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { color: palette.text, fontSize: 11, fontWeight: '600' },
  secondaryButton: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: palette.backgroundElevated, borderWidth: 1, borderColor: palette.border },
  secondaryButtonText: { color: palette.text, fontSize: 12, fontWeight: '700' },

  // Notes
  noteCard: { padding: 14, borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, gap: 4 },
  noteAuthor: { color: palette.primary, fontSize: 12, fontWeight: '700' },
  noteText: { color: palette.text, fontSize: 14, lineHeight: 21 },
  noteMeta: { color: palette.textMuted, fontSize: 11 },

  // Info / Assignment
  assignmentList: { gap: 6, marginTop: 8 },
  assignmentOption: { padding: 12, borderRadius: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  assignmentOptionSelected: { borderColor: palette.primary, backgroundColor: palette.primarySoft },
  assignmentOptionText: { color: palette.text, fontSize: 14, fontWeight: '600' },
  assignmentOptionRole: { color: palette.textMuted, fontSize: 12 },

  // Tags management
  tagsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tagOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  tagOptionText: { color: palette.text, fontSize: 13, fontWeight: '600' },
});
