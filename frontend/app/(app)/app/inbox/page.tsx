'use client';

import type { KeyboardEvent, MutableRefObject } from 'react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCheck,
  ChevronLeft,
  FileImage,
  Inbox,
  MessageSquareText,
  Mic,
  Pause,
  Paperclip,
  Play,
  Reply,
  Search,
  SendHorizontal,
  SlidersHorizontal,
  StickyNote,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { WhatsAppFormattedText } from '@/components/shared/whatsapp-formatted-text';
import {
  ConversationRemindersPanel,
  DEFAULT_REMINDER_FORM,
  type ReminderFormState,
} from '@/components/inbox/conversation-reminders-panel';
import {
  ConversationStatusFilter,
  type ConversationStatusFilterValue,
} from '@/components/inbox/conversation-status-filter';
import { QuickMessagesDialog } from '@/components/inbox/quick-messages-dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/select';
import { apiRequest } from '@/lib/api-client';
import { formatManualMessageContent } from '@/lib/message-formatting';
import { canAccess, getRoleLabel } from '@/lib/permissions';
import {
  AuthMeResponse,
  Conversation,
  ConversationMessage,
  ConversationReminder,
  ConversationStatusSummary,
  PaginatedResponse,
  Tag,
  UserSummary,
} from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';
import { useSearchParams } from 'next/navigation';

const INBOX_REFRESH_INTERVAL = 12000;
const AUDIO_WAVEFORM_BARS = [8, 12, 18, 14, 24, 16, 20, 28, 18, 24, 14, 20, 30, 18, 14, 24, 18, 28, 20, 16, 24, 14, 18, 12, 8, 12, 18, 14, 24, 16, 20, 28, 18, 24, 14];
const HIDDEN_MEDIA_LABELS = new Set([
  'Imagem',
  'Audio',
  'Video',
  'Figurinha',
  'Documento',
  'Documento anexado',
]);
const MESSAGE_STATUS_LABELS: Record<string, string> = {
  READ: 'Lida',
  DELIVERED: 'Entregue',
  SENT: 'Enviada',
  FAILED: 'Falhou',
  QUEUED: 'Na fila',
};

function formatMessageTime(value?: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function getDateLabel(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Hoje';
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function shouldShowDateSeparator(
  messages: ConversationMessage[],
  index: number,
) {
  if (index === 0) return true;
  const current = new Date(messages[index].createdAt);
  const previous = new Date(messages[index - 1].createdAt);
  return current.toDateString() !== previous.toDateString();
}

const STATUS_LABELS: Record<string, string> = {
  ALL: 'Todas',
  NEW: 'Novo',
  OPEN: 'Aberto',
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em atendimento',
  WAITING: 'Aguardando',
  RESOLVED: 'Resolvido',
  CLOSED: 'Encerrado',
};

function getConversationStatusLabel(
  status: string,
  closeReason?: Conversation['closeReason'],
) {
  if (status === 'CLOSED' && closeReason === 'UNANSWERED') {
    return 'Nao respondido';
  }

  return STATUS_LABELS[status] ?? status;
}
const DEFAULT_CONVERSATION_STATUS_SUMMARY: ConversationStatusSummary = {
  ALL: 0,
  NEW: 0,
  IN_PROGRESS: 0,
  WAITING: 0,
  RESOLVED: 0,
  CLOSED: 0,
};

type RecordingMimeConfig = {
  mimeType: string;
  extension: string;
};

function InboxPageContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const lastAutoScrolledConversationRef = useRef<string | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const pendingRecordingActionRef = useRef<'discard' | 'send' | null>(null);
  const recordingMimeConfigRef = useRef<RecordingMimeConfig | null>(null);
  const requestedConversationId = searchParams.get('conversationId');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<ConversationStatusFilterValue>('ALL');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [quotedMessageId, setQuotedMessageId] = useState<string | null>(null);
  const [quickMessagesOpen, setQuickMessagesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [reminderForm, setReminderForm] = useState<ReminderFormState>(DEFAULT_REMINDER_FORM);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);

  const conversationsQuery = useQuery({
    queryKey: ['conversations', search, statusFilter],
    queryFn: () =>
      apiRequest<PaginatedResponse<Conversation>>(
        `conversations?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}${
          statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''
        }`,
      ),
    refetchInterval: INBOX_REFRESH_INTERVAL,
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiRequest<AuthMeResponse>('auth/me'),
  });
  const conversationSummaryQuery = useQuery({
    queryKey: ['conversations-summary', search],
    queryFn: () =>
      apiRequest<ConversationStatusSummary>(
        `conversations/summary${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const isInitialLoading =
    conversationsQuery.isLoading ||
    meQuery.isLoading ||
    conversationSummaryQuery.isLoading;

  const conversations = useMemo(() => conversationsQuery.data?.data ?? [], [conversationsQuery.data]);
  const activeConversationId = useMemo(() => {
    if (!conversations.length) {
      return null;
    }

    if (selectedConversationId && conversations.some((conversation) => conversation.id === selectedConversationId)) {
      return selectedConversationId;
    }

    if (!isDesktopLayout) {
      return null;
    }

    return conversations[0]?.id ?? null;
  }, [conversations, isDesktopLayout, selectedConversationId]);

  const selectedConversationQuery = useQuery({
    queryKey: ['conversation', activeConversationId, 'messages'],
    enabled: Boolean(activeConversationId),
    queryFn: () =>
      apiRequest<Conversation>(
        `conversations/${activeConversationId}?include=messages`,
      ),
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const conversationDetailsEnabled = Boolean(activeConversationId) && (detailsOpen || isDesktopLayout);

  const selectedConversationDetailsQuery = useQuery({
    queryKey: ['conversation', activeConversationId, 'details'],
    enabled: conversationDetailsEnabled,
    queryFn: () =>
      apiRequest<Conversation>(
        `conversations/${activeConversationId}?include=details`,
      ),
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    enabled: detailsOpen || isDesktopLayout,
    queryFn: () => apiRequest<UserSummary[]>('users'),
  });

  const tagsQuery = useQuery({
    queryKey: ['tags'],
    enabled: detailsOpen || isDesktopLayout,
    queryFn: () => apiRequest<Tag[]>('tags'),
  });

  const applyOptimisticConversationMessage = (
    conversationId: string,
    message: ConversationMessage,
    preview: string,
  ) => {
    queryClient.setQueriesData<Conversation | undefined>(
      { queryKey: ['conversation', conversationId] },
      (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          lastMessageAt: message.createdAt,
          lastMessagePreview: preview,
          messages: [...(current.messages ?? []), message],
        };
      },
    );

    queryClient.setQueryData<PaginatedResponse<Conversation>>(
      ['conversations', search, statusFilter],
      (current) => {
        if (!current) {
          return current;
        }

        const updatedConversations = current.data.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                lastMessageAt: message.createdAt,
                lastMessagePreview: preview,
              }
            : conversation,
        );

        updatedConversations.sort((left, right) => {
          const leftTimestamp = left.lastMessageAt
            ? new Date(left.lastMessageAt).getTime()
            : 0;
          const rightTimestamp = right.lastMessageAt
            ? new Date(right.lastMessageAt).getTime()
            : 0;

          return rightTimestamp - leftTimestamp;
        });

        return {
          ...current,
          data: updatedConversations,
        };
      },
    );
  };

  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest<ConversationMessage>('messages', {
        method: 'POST',
        body: {
          conversationId: activeConversationId,
          content: formatManualMessageContent(
            meQuery.data?.name ?? 'Equipe',
            messageDraft,
          ),
          quotedMessageId: effectiveQuotedMessageId ?? undefined,
        },
      }),
    onMutate: async () => {
      if (!activeConversationId) {
        return null;
      }

      const formattedContent = formatManualMessageContent(
        meQuery.data?.name ?? 'Equipe',
        messageDraft,
      );
      const optimisticQuotedMessage = effectiveQuotedMessageId
        ? queryClient
            .getQueryData<Conversation>(['conversation', activeConversationId, 'messages'])
            ?.messages?.find((message) => message.id === effectiveQuotedMessageId) ?? null
        : null;
      const optimisticMessage: ConversationMessage = {
        id: `optimistic-${Date.now()}`,
        direction: 'OUTBOUND',
        messageType: 'text',
        content: formattedContent,
        metadata: buildQuoteMetadataForComposer(optimisticQuotedMessage),
        status: 'QUEUED',
        createdAt: new Date().toISOString(),
      };
      const conversationSnapshots = queryClient.getQueriesData<Conversation | undefined>({
        queryKey: ['conversation', activeConversationId],
      });
      const conversationsSnapshot = queryClient.getQueryData<PaginatedResponse<Conversation>>([
        'conversations',
        search,
        statusFilter,
      ]);

      await queryClient.cancelQueries({ queryKey: ['conversation', activeConversationId] });
      await queryClient.cancelQueries({ queryKey: ['conversations', search, statusFilter] });

      applyOptimisticConversationMessage(
        activeConversationId,
        optimisticMessage,
        formattedContent,
      );

      return {
        activeConversationId,
        conversationSnapshots,
        conversationsSnapshot,
      };
    },
    onSuccess: async (message) => {
      setMessageDraft('');
      setQuotedMessageId(null);

      if (message.metadata?.windowClosedTemplateReply) {
        toast.success(
          'Mensagem enviada via template aprovado porque a janela de 24 horas estava fechada.',
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['conversations-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['conversation', activeConversationId] }),
      ]);
    },
    onError: (error: Error, _variables, context) => {
      if (context?.activeConversationId) {
        for (const [queryKey, value] of context.conversationSnapshots) {
          queryClient.setQueryData(queryKey, value);
        }

        queryClient.setQueryData(
          ['conversations', search, statusFilter],
          context.conversationsSnapshot,
        );
      }

      toast.error(error.message);
    },
  });

  const sendMediaMutation = useMutation({
    mutationFn: async (payload?: { file?: File; caption?: string; isVoiceNote?: boolean }) => {
      const file = payload?.file ?? selectedFile;

      if (!activeConversationId || !file) {
        throw new Error('Selecione um arquivo para enviar.');
      }

      const formData = new FormData();
      formData.append('conversationId', activeConversationId);
      formData.append('file', file);

      const caption = payload?.caption ?? messageDraft.trim();

      if (caption) {
        formData.append(
          'caption',
          formatManualMessageContent(meQuery.data?.name ?? 'Equipe', caption),
        );
      }

      if (payload?.isVoiceNote) {
        formData.append('isVoiceNote', 'true');
      }

      if (effectiveQuotedMessageId) {
        formData.append('quotedMessageId', effectiveQuotedMessageId);
      }

      return apiRequest('messages/media', {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: async () => {
      setMessageDraft('');
      setQuotedMessageId(null);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['conversations-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['conversation', activeConversationId] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const noteMutation = useMutation({
    mutationFn: () =>
      apiRequest(`conversations/${activeConversationId}/notes`, {
        method: 'POST',
        body: { content: noteDraft },
      }),
    onSuccess: async () => {
      setNoteDraft('');
      await queryClient.invalidateQueries({ queryKey: ['conversation', activeConversationId] });
      toast.success('Nota registrada.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveReminderMutation = useMutation({
    mutationFn: async () => {
      if (!activeConversationId) {
        throw new Error('Selecione uma conversa antes de salvar o lembrete.');
      }

      if (!reminderForm.messageToSend.trim()) {
        throw new Error('Informe a mensagem planejada para o cliente.');
      }

      if (!reminderForm.date || !reminderForm.time) {
        throw new Error('Defina data e hora para o lembrete.');
      }

      return apiRequest(
        editingReminderId
          ? `conversations/${activeConversationId}/reminders/${editingReminderId}`
          : `conversations/${activeConversationId}/reminders`,
        {
          method: editingReminderId ? 'PATCH' : 'POST',
          body: {
            messageToSend: reminderForm.messageToSend.trim(),
            internalDescription:
              reminderForm.internalDescription.trim() || undefined,
            remindAt: `${reminderForm.date}T${reminderForm.time}`,
          },
        },
      );
    },
    onSuccess: async () => {
      setReminderForm(DEFAULT_REMINDER_FORM);
      setEditingReminderId(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['conversation', activeConversationId],
        }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
      toast.success(
        editingReminderId ? 'Lembrete atualizado.' : 'Lembrete criado.',
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const completeReminderMutation = useMutation({
    mutationFn: (reminderId: string) =>
      apiRequest(
        `conversations/${activeConversationId}/reminders/${reminderId}/complete`,
        {
          method: 'POST',
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['conversation', activeConversationId],
        }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
      toast.success('Lembrete concluído.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelReminderMutation = useMutation({
    mutationFn: (reminderId: string) =>
      apiRequest(
        `conversations/${activeConversationId}/reminders/${reminderId}/cancel`,
        {
          method: 'POST',
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['conversation', activeConversationId],
        }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);
      toast.success('Lembrete cancelado.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateConversationMutation = useMutation({
    mutationFn: (payload: { assignedUserId?: string; tagIds?: string[] }) =>
      apiRequest(`conversations/${activeConversationId}`, {
        method: 'PATCH',
        body: payload,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['conversations-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['conversation', activeConversationId] }),
      ]);
      toast.success('Conversa atualizada.');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const resolveConversationMutation = useMutation({
    mutationFn: () =>
      apiRequest(`conversations/${activeConversationId}/resolve`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['conversations-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['conversation', activeConversationId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-performance'] }),
      ]);
      toast.success('Conversa marcada como resolvida.');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const closeConversationMutation = useMutation({
    mutationFn: () =>
      apiRequest(`conversations/${activeConversationId}/close`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['conversations-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['conversation', activeConversationId] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-performance'] }),
      ]);
      toast.success('Conversa encerrada.');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const reopenConversationMutation = useMutation({
    mutationFn: () =>
      apiRequest(`conversations/${activeConversationId}/reopen`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['conversations-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['conversation', activeConversationId] }),
      ]);
      toast.success('Conversa reaberta.');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const selectedConversation = useMemo(() => {
    const baseConversation = selectedConversationQuery.data;
    const detailsConversation = selectedConversationDetailsQuery.data;

    if (!baseConversation) {
      return detailsConversation;
    }

    if (!detailsConversation) {
      return baseConversation;
    }

    return {
      ...baseConversation,
      ...detailsConversation,
      contact: {
        ...baseConversation.contact,
        ...detailsConversation.contact,
      },
      assignedUser: detailsConversation.assignedUser ?? baseConversation.assignedUser,
      tags: detailsConversation.tags ?? baseConversation.tags,
      messages: baseConversation.messages ?? detailsConversation.messages,
      notes: detailsConversation.notes ?? baseConversation.notes,
      reminders: detailsConversation.reminders ?? baseConversation.reminders,
    } satisfies Conversation;
  }, [selectedConversationDetailsQuery.data, selectedConversationQuery.data]);

  const isConversationLoading =
    Boolean(activeConversationId) &&
    !selectedConversation &&
    (selectedConversationQuery.isLoading || selectedConversationDetailsQuery.isLoading);

  const selectedTagIds = useMemo(
    () => selectedConversation?.tags.map((tag) => tag.id) ?? [],
    [selectedConversation],
  );
  const quotedMessage = useMemo(
    () =>
      quotedMessageId
        ? selectedConversation?.messages?.find((message) => message.id === quotedMessageId) ?? null
        : null,
    [quotedMessageId, selectedConversation?.messages],
  );
  const effectiveQuotedMessageId = quotedMessage?.id ?? null;
  const latestSelectedMessageId =
    selectedConversation?.messages?.length
      ? selectedConversation.messages[selectedConversation.messages.length - 1]
          ?.id
      : null;

  const isNearBottom = (container: HTMLDivElement) => {
    const threshold = 80;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <=
      threshold
    );
  };

  const scrollMessagesToBottom = () => {
    const container = messagesScrollRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(min-width: 1280px)');
    const updateLayout = () => setIsDesktopLayout(mediaQuery.matches);

    updateLayout();
    mediaQuery.addEventListener('change', updateLayout);

    return () => mediaQuery.removeEventListener('change', updateLayout);
  }, []);

  useEffect(() => {
    if (!requestedConversationId) {
      return;
    }

    const syncConversationId = window.setTimeout(() => {
      setSelectedConversationId(requestedConversationId);
    }, 0);

    return () => window.clearTimeout(syncConversationId);
  }, [requestedConversationId]);

  useEffect(() => {
    const resetPanels = window.setTimeout(() => {
      setReminderForm(DEFAULT_REMINDER_FORM);
      setEditingReminderId(null);
      setDetailsOpen(false);
      setQuickMessagesOpen(false);
      setQuotedMessageId(null);
    }, 0);

    return () => window.clearTimeout(resetPanels);
  }, [activeConversationId]);

  useEffect(() => {
    if (!selectedConversation?.id) {
      return;
    }

    if (lastAutoScrolledConversationRef.current === selectedConversation.id) {
      return;
    }

    lastAutoScrolledConversationRef.current = selectedConversation.id;
    shouldStickToBottomRef.current = true;

    // Wait one frame so the messages list is fully painted before measuring height.
    const frame = window.requestAnimationFrame(() => {
      scrollMessagesToBottom();
      window.setTimeout(scrollMessagesToBottom, 0);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedConversation?.id]);

  useEffect(() => {
    const container = messagesScrollRef.current;

    if (!container) {
      return;
    }

    const updateStickiness = () => {
      shouldStickToBottomRef.current = isNearBottom(container);
    };

    updateStickiness();
    container.addEventListener('scroll', updateStickiness, { passive: true });

    return () => container.removeEventListener('scroll', updateStickiness);
  }, [selectedConversation?.id]);

  useEffect(() => {
    if (!selectedConversation?.id) {
      return;
    }

    const isComposerFocused =
      typeof document !== 'undefined' &&
      document.activeElement === composerTextareaRef.current;

    if (!shouldStickToBottomRef.current && !isComposerFocused) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollMessagesToBottom();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    selectedConversation?.id,
    selectedConversation?.messages?.length,
    latestSelectedMessageId,
  ]);

  useEffect(() => {
    if (!isRecording || recordingPaused) {
      return;
    }

    const interval = window.setInterval(() => {
      setRecordingDuration((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRecording, recordingPaused]);

  useEffect(() => {
    const eventSource = new EventSource('/api/proxy/conversations/stream');

    const handleInboxEvent = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          conversationId?: string;
        };

        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
        void queryClient.invalidateQueries({ queryKey: ['conversations-summary'] });

        if (
          payload.conversationId &&
          payload.conversationId === activeConversationId
        ) {
          void queryClient.invalidateQueries({
            queryKey: ['conversation', activeConversationId],
          });
        }
      } catch {
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
        void queryClient.invalidateQueries({ queryKey: ['conversations-summary'] });
      }
    };

    eventSource.addEventListener(
      'inbox-event',
      handleInboxEvent as EventListener,
    );

    return () => {
      eventSource.removeEventListener(
        'inbox-event',
        handleInboxEvent as EventListener,
      );
      eventSource.close();
    };
  }, [activeConversationId, queryClient]);

  useEffect(
    () => () => {
      const recorder = mediaRecorderRef.current;

      if (recorder && recorder.state !== 'inactive') {
        pendingRecordingActionRef.current = 'discard';
        recorder.stop();
      }

      stopRecordingStream(recordingStreamRef);
    },
    [],
  );

  const submitComposer = () => {
    if (!activeConversationId || sendMutation.isPending || sendMediaMutation.isPending) {
      return;
    }

    if (selectedFile) {
      sendMediaMutation.mutate(undefined);
      return;
    }

    if (!messageDraft.trim()) {
      return;
    }

    sendMutation.mutate();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    submitComposer();
  };

  const startAudioRecording = async () => {
    if (!activeConversationId) {
      toast.error('Selecione uma conversa antes de gravar.');
      return;
    }

    if (selectedFile) {
      toast.error('Envie ou remova o arquivo atual antes de gravar.');
      return;
    }

    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      toast.error('Seu navegador nao suporta gravacao de audio.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeConfig = getPreferredRecordingMimeType();
      const recorder = mimeConfig?.mimeType
        ? new MediaRecorder(stream, { mimeType: mimeConfig.mimeType })
        : new MediaRecorder(stream);

      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingMimeConfigRef.current =
        mimeConfig ??
        inferRecordingMimeConfig(recorder.mimeType || 'audio/webm');
      pendingRecordingActionRef.current = null;
      setRecordingDuration(0);
      setRecordingPaused(false);
      setIsRecording(true);

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        const action = pendingRecordingActionRef.current;
        const mimeType =
          recorder.mimeType ||
          recordingMimeConfigRef.current?.mimeType ||
          'audio/webm';
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        const fileName = `voice-note-${Date.now()}.${
          recordingMimeConfigRef.current?.extension ?? 'webm'
        }`;
        const file = new File([blob], fileName, { type: mimeType });

        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];
        recordingMimeConfigRef.current = null;
        pendingRecordingActionRef.current = null;
        setIsRecording(false);
        setRecordingPaused(false);
        setRecordingDuration(0);
        stopRecordingStream(recordingStreamRef);

        if (action !== 'send' || blob.size === 0) {
          return;
        }

        void sendMediaMutation.mutateAsync({
          file,
          caption: '',
          isVoiceNote: true,
        });
      });

      recorder.start(250);
    } catch {
      stopRecordingStream(recordingStreamRef);
      toast.error('Nao foi possivel acessar o microfone.');
    }
  };

  const toggleRecordingPause = () => {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      return;
    }

    if (recorder.state === 'recording') {
      recorder.pause();
      setRecordingPaused(true);
      return;
    }

    if (recorder.state === 'paused') {
      recorder.resume();
      setRecordingPaused(false);
    }
  };

  const finishRecording = (action: 'discard' | 'send') => {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      return;
    }

    pendingRecordingActionRef.current = action;

    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const permissionMap = meQuery.data?.permissionMap;
  const canManageQuickMessages = canAccess(
    permissionMap,
    'CONFIGURE_AUTO_MESSAGES',
  );
  const canTransferConversation = canAccess(permissionMap, 'TRANSFER_CONVERSATION');
  const canResolveConversation = canAccess(permissionMap, 'RESOLVE_CONVERSATION');
  const canCloseConversation = canAccess(permissionMap, 'CLOSE_CONVERSATION');
  const canReopenConversation = canAccess(permissionMap, 'REOPEN_CONVERSATION');
  const isConversationClosed =
    selectedConversation?.status === 'RESOLVED' ||
    selectedConversation?.status === 'CLOSED';

  const refreshConversationQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['conversations'] }),
      queryClient.invalidateQueries({ queryKey: ['conversations-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['conversation', activeConversationId] }),
    ]);
  };

  const startReminderEdit = (reminder: ConversationReminder) => {
    setEditingReminderId(reminder.id);
    setReminderForm({
      messageToSend: reminder.messageToSend,
      internalDescription: reminder.internalDescription ?? '',
      date: reminder.remindAt.slice(0, 10),
      time: reminder.remindAt.slice(11, 16),
    });
  };

  const clearReminderEditor = () => {
    setEditingReminderId(null);
    setReminderForm(DEFAULT_REMINDER_FORM);
  };

  if (isInitialLoading) {
    return <InboxPageSkeleton />;
  }

  return (
    <div className="grid h-full min-h-0 overflow-hidden gap-3 xl:gap-4 xl:grid-cols-[296px_minmax(0,1fr)_320px]">
      <Card
        className={cn(
          'h-full min-h-0 overflow-hidden p-0',
          activeConversationId ? 'hidden xl:block' : '',
        )}
      >
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <div className="shrink-0 border-b border-border p-3.5 sm:p-4">
            <ConversationStatusFilter
              value={statusFilter}
              onValueChange={setStatusFilter}
              counts={
                conversationSummaryQuery.data ?? {
                  ...DEFAULT_CONVERSATION_STATUS_SUMMARY,
                  ALL: conversationsQuery.data?.meta.total ?? conversations.length,
                }
              }
            />
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar contato, telefone ou trecho"
                className="pl-11"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            {conversations.length ? (
              <div className="space-y-1.5">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    className={`w-full rounded-[22px] border px-3.5 py-3.5 text-left transition ${
                      activeConversationId === conversation.id
                        ? 'border-primary/40 bg-primary-soft'
                        : 'border-transparent bg-white/[0.03] hover:border-border'
                    }`}
                    onClick={() => setSelectedConversationId(conversation.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{conversation.contact.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {conversation.contact.company ?? conversation.contact.phone}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground">{formatDate(conversation.lastMessageAt)}</span>
                        <div className="mt-2">
                          <StatusBadge
                            status={conversation.status}
                            closeReason={conversation.closeReason}
                          />
                        </div>
                      </div>
                    </div>
                    <p className="mt-2.5 line-clamp-2 text-sm text-foreground/78">
                      {conversation.lastMessagePreview ?? 'Sem mensagens recentes'}
                    </p>
                    <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap gap-2">
                        {conversation.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag.id} variant="secondary">
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {conversation.assignedUser ? (
                          <span className="text-[11px] text-muted-foreground">
                            {conversation.status === 'WAITING'
                              ? `Último responsável: ${conversation.assignedUser.name}`
                              : `Responsável: ${conversation.assignedUser.name}`}
                          </span>
                        ) : null}
                        {conversation.unreadCount ? <Badge>{conversation.unreadCount}</Badge> : null}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={Inbox} title="Nenhuma conversa aqui" description="As conversas aparecerao assim que entrarem pelo canal configurado." />
            )}
          </div>
        </CardContent>
      </Card>

      <Card
        className={cn(
          'h-full min-h-0 overflow-hidden p-0',
          !activeConversationId ? 'hidden xl:block' : '',
        )}
      >
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          {isConversationLoading ? (
            <ChatConversationLoadingState />
          ) : selectedConversation ? (
            <>
              <div className="shrink-0 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="mt-0.5 shrink-0 xl:hidden"
                      onClick={() => setSelectedConversationId(null)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0">
                      <h2 className="font-heading text-[18px] font-semibold">{selectedConversation.contact.name}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedConversation.contact.company ?? selectedConversation.contact.phone}
                      </p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {selectedConversation.assignedUser
                          ? `Responsável atual: ${selectedConversation.assignedUser.name} (${getRoleLabel(
                              selectedConversation.assignedUser.normalizedRole ?? selectedConversation.assignedUser.role,
                            )})`
                          : selectedConversation.status === 'WAITING'
                            ? 'Disponível para retomada por qualquer vendedor liberado.'
                            : 'Ainda sem responsável definido.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="xl:hidden"
                      onClick={() => setDetailsOpen(true)}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </Button>
                    <StatusBadge
                      status={selectedConversation.status}
                      closeReason={selectedConversation.closeReason}
                    />
                  </div>
                </div>
              </div>

              <div className="sticky top-0 z-10 border-b border-border bg-background/92 px-3.5 py-2.5 backdrop-blur xl:hidden sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!canResolveConversation || isConversationClosed || resolveConversationMutation.isPending}
                    onClick={() => resolveConversationMutation.mutate()}
                  >
                    Resolver
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!canCloseConversation || isConversationClosed || closeConversationMutation.isPending}
                    onClick={() => closeConversationMutation.mutate()}
                  >
                    Encerrar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!canReopenConversation || !isConversationClosed || reopenConversationMutation.isPending}
                    onClick={() => reopenConversationMutation.mutate()}
                  >
                    Reabrir
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => setDetailsOpen(true)}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Detalhes
                  </Button>
                </div>
              </div>

              <div ref={messagesScrollRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(10,30,60,0.3),transparent_70%)] px-3 py-3 sm:px-4">
                {selectedConversation.messages?.map((message, index) => (
                  <div key={message.id}>
                    {shouldShowDateSeparator(selectedConversation.messages!, index) && (
                      <div className="my-3 flex items-center justify-center first:mt-0">
                        <span className="rounded-lg bg-[#1a2a3d]/80 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
                          {getDateLabel(message.createdAt)}
                        </span>
                      </div>
                    )}
                    <div
                      className={cn(
                        'group relative mb-[2px] w-fit max-w-[88%] text-[13.5px] leading-[1.35] sm:max-w-[min(65%,32rem)]',
                        message.direction === 'OUTBOUND'
                          ? 'ml-auto'
                          : message.direction === 'SYSTEM'
                            ? 'mx-auto'
                            : '',
                      )}
                    >
                      <div
                        className={cn(
                          'relative rounded-lg px-2.5 py-1.5 shadow-sm',
                          message.direction === 'OUTBOUND'
                            ? 'rounded-tr-[4px] bg-[#005c4b] text-[#e9edef]'
                            : message.direction === 'SYSTEM'
                              ? 'rounded-lg border border-amber-500/20 bg-[#1a2a3d]/80 text-center text-[12px] text-muted-foreground'
                              : 'rounded-tl-[4px] bg-[#1a2a3d] text-[#e9edef]',
                        )}
                      >
                        {canQuoteMessage(message) ? (
                          <button
                            type="button"
                            className="absolute right-1 top-1 rounded-full p-1 text-white/0 transition group-hover:text-white/60 group-hover:hover:bg-white/10 group-hover:hover:text-white"
                            onClick={() => {
                              setQuotedMessageId(message.id);
                              composerTextareaRef.current?.focus();
                            }}
                            title="Responder"
                            aria-label="Responder"
                          >
                            <Reply className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        <MessageBubbleContent message={message} />
                        <span
                          className={cn(
                            'mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-none',
                            message.direction === 'OUTBOUND'
                              ? 'text-[#ffffff99]'
                              : message.direction === 'SYSTEM'
                                ? 'text-muted-foreground/60'
                                : 'text-[#ffffff66]',
                          )}
                        >
                          {formatMessageTime(message.createdAt)}
                          {message.direction === 'OUTBOUND' && message.status !== 'QUEUED' && (
                            <MessageStatusIcon status={message.status} />
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="safe-bottom-pad shrink-0 border-t border-border/40 bg-[#0b141a] px-3 py-2 sm:px-4">
                <div className="rounded-xl bg-[#1a2a3d]/80 p-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  />
                  {isRecording ? (
                    <div className="flex items-center gap-2.5 rounded-xl bg-[#1a2a3d] px-2.5 py-2">
                      <button
                        type="button"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/85 transition hover:bg-white/6 hover:text-foreground"
                        onClick={() => finishRecording('discard')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.035] px-3.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        <span
                          className={cn(
                            'h-3 w-3 shrink-0 rounded-full bg-[#ff4d5e] shadow-[0_0_20px_rgba(255,77,94,0.75)]',
                            recordingPaused ? 'opacity-55' : 'animate-pulse',
                          )}
                        />
                        <span className="w-10 shrink-0 font-semibold tabular-nums text-[12px] text-white/95">
                          {formatMediaDuration(recordingDuration)}
                        </span>
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-[2px] overflow-hidden">
                          {AUDIO_WAVEFORM_BARS.map((barHeight, index) => (
                            <span
                              key={`recording-bar-${barHeight}-${index}`}
                              className={cn(
                                'shrink-0 rounded-full transition-all duration-200',
                                recordingPaused ? 'bg-white/16 opacity-70' : 'bg-white/72',
                              )}
                              style={{
                                height: `${Math.max(7, barHeight - 4)}px`,
                                width: index % 4 === 0 ? '5px' : '4px',
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/7 text-foreground transition hover:bg-white/12"
                        onClick={toggleRecordingPause}
                      >
                        {recordingPaused ? <Play className="ml-0.5 h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
                      </button>

                      <button
                        type="button"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition hover:bg-[#00a884]/85"
                        onClick={() => finishRecording('send')}
                        disabled={sendMediaMutation.isPending}
                      >
                        <SendHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  ) : selectedFile ? (
                    <div className="mb-2 flex items-center justify-between gap-2.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        {selectedFile.type.startsWith('audio/') ? (
                          <Mic className="h-3.5 w-3.5 shrink-0 text-primary" />
                        ) : (
                          <FileImage className="h-3.5 w-3.5 shrink-0 text-primary" />
                        )}
                        <span className="truncate">
                          {selectedFile.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="rounded-full p-1 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                        onClick={() => {
                          setSelectedFile(null);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                          }
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                  {!isRecording ? (
                    <>
                      {quotedMessage ? (
                        <div className="mb-2 flex items-start justify-between gap-2 rounded-lg border-l-[3px] border-l-[#06cf9c] bg-[#1a2a3d] px-2.5 py-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-[#06cf9c]">
                              Respondendo
                            </p>
                            <p className="truncate text-xs text-foreground/75">
                              {buildMessageQuotePreview(quotedMessage)}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="rounded-full p-1 text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
                            onClick={() => setQuotedMessageId(null)}
                            aria-label="Remover quote"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                      <Textarea
                        ref={composerTextareaRef}
                        value={messageDraft}
                        onChange={(event) => setMessageDraft(event.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        placeholder={
                          isConversationClosed
                            ? 'Reabra a conversa para voltar a responder.'
                            : selectedFile
                              ? selectedFile.type.startsWith('audio/')
                                ? 'Adicione uma legenda opcional para a mensagem de voz...'
                                : 'Adicione uma legenda opcional para a mídia...'
                              : 'Digite uma resposta para enviar pelo canal selecionado...'
                        }
                        className="min-h-[42px] max-h-32 resize-none border-none bg-transparent px-1 py-1 text-[13.5px] leading-5 placeholder:text-muted-foreground/50"
                        disabled={isConversationClosed}
                      />
                      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!activeConversationId || sendMediaMutation.isPending || isConversationClosed}
                            className="h-8 rounded-[12px] px-3 text-xs font-medium"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            Anexar
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setQuickMessagesOpen(true)}
                            disabled={!activeConversationId || sendMutation.isPending}
                            className="h-8 rounded-[12px] px-3 text-xs font-medium"
                          >
                            <MessageSquareText className="h-3.5 w-3.5" />
                            Mensagens rapidas
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              void startAudioRecording();
                            }}
                            disabled={!activeConversationId || Boolean(selectedFile) || sendMediaMutation.isPending || isConversationClosed}
                            className="h-8 rounded-[12px] px-3 text-xs font-medium"
                          >
                            <Mic className="h-3.5 w-3.5" />
                            Gravar áudio
                          </Button>
                        </div>
                        <div className="sm:ml-auto">
                          <Button
                            onClick={submitComposer}
                            disabled={
                              (!messageDraft.trim() && !selectedFile) ||
                              !activeConversationId ||
                              sendMutation.isPending ||
                              sendMediaMutation.isPending ||
                              isConversationClosed
                            }
                            className="h-8 w-full rounded-[12px] px-3.5 text-xs font-medium sm:w-auto"
                          >
                            <SendHorizontal className="h-3.5 w-3.5" />
                            {selectedFile ? 'Enviar mídia' : 'Enviar'}
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <EmptyState
                icon={Inbox}
                title="Selecione uma conversa"
                description="Escolha uma conversa na lista lateral para abrir o historico e responder."
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="hidden h-full min-h-0 overflow-hidden p-0 xl:block">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <ConversationSidebar
            selectedConversation={selectedConversation}
            selectedTagIds={selectedTagIds}
            tags={tagsQuery.data ?? []}
            users={usersQuery.data ?? []}
            canTransferConversation={canTransferConversation}
            canResolveConversation={canResolveConversation}
            canCloseConversation={canCloseConversation}
            canReopenConversation={canReopenConversation}
            isConversationClosed={isConversationClosed}
            noteDraft={noteDraft}
            onNoteDraftChange={setNoteDraft}
            onAddNote={() => noteMutation.mutate()}
            onResolve={() => resolveConversationMutation.mutate()}
            onClose={() => closeConversationMutation.mutate()}
            onReopen={() => reopenConversationMutation.mutate()}
            onUpdateConversation={(payload) => updateConversationMutation.mutate(payload)}
            reminderForm={reminderForm}
            onReminderFormChange={setReminderForm}
            editingReminderId={editingReminderId}
            onEditReminder={startReminderEdit}
            onClearReminderEditor={clearReminderEditor}
            onSaveReminder={() => saveReminderMutation.mutateAsync()}
            onCompleteReminder={(reminderId) => completeReminderMutation.mutate(reminderId)}
            onCancelReminder={(reminderId) => cancelReminderMutation.mutate(reminderId)}
            remindersBusy={
              saveReminderMutation.isPending ||
              completeReminderMutation.isPending ||
              cancelReminderMutation.isPending
            }
          />
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-full p-0 xl:hidden sm:w-[min(94vw,680px)]">
          <div className="max-h-[92vh] overflow-y-auto">
            <ConversationSidebar
              selectedConversation={selectedConversation}
              selectedTagIds={selectedTagIds}
              tags={tagsQuery.data ?? []}
              users={usersQuery.data ?? []}
              canTransferConversation={canTransferConversation}
              canResolveConversation={canResolveConversation}
              canCloseConversation={canCloseConversation}
              canReopenConversation={canReopenConversation}
              isConversationClosed={isConversationClosed}
              noteDraft={noteDraft}
              onNoteDraftChange={setNoteDraft}
              onAddNote={() => noteMutation.mutate()}
              onResolve={() => resolveConversationMutation.mutate()}
              onClose={() => closeConversationMutation.mutate()}
              onReopen={() => reopenConversationMutation.mutate()}
              onUpdateConversation={(payload) => updateConversationMutation.mutate(payload)}
              reminderForm={reminderForm}
              onReminderFormChange={setReminderForm}
              editingReminderId={editingReminderId}
              onEditReminder={startReminderEdit}
              onClearReminderEditor={clearReminderEditor}
              onSaveReminder={() => saveReminderMutation.mutateAsync()}
              onCompleteReminder={(reminderId) => completeReminderMutation.mutate(reminderId)}
              onCancelReminder={(reminderId) => cancelReminderMutation.mutate(reminderId)}
              remindersBusy={
                saveReminderMutation.isPending ||
                completeReminderMutation.isPending ||
                cancelReminderMutation.isPending
              }
            />
          </div>
        </DialogContent>
      </Dialog>

      <QuickMessagesDialog
        open={quickMessagesOpen}
        onOpenChange={setQuickMessagesOpen}
        conversationId={activeConversationId}
        canManage={canManageQuickMessages}
        isConversationClosed={isConversationClosed}
        onInsertInInput={(value) => {
          setMessageDraft(value);
          window.requestAnimationFrame(() => {
            composerTextareaRef.current?.focus();
          });
        }}
        onMessageSent={refreshConversationQueries}
      />
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<InboxPageSkeleton />}>
      <InboxPageContent />
    </Suspense>
  );
}

function InboxPageSkeleton() {
  return (
    <div className="grid h-full gap-3 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_340px]">
      <div className="rounded-[26px] border border-border bg-background-elevated/45 p-3">
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-8 w-full rounded-xl" />
          <Skeleton className="h-8 w-5/6 rounded-xl" />
          <Skeleton className="h-8 w-4/5 rounded-xl" />
        </div>
        <div className="mt-4 space-y-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </div>

      <div className="rounded-[26px] border border-border bg-background-elevated/45 p-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-11 w-52 rounded-xl" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
        <div className="mt-4 space-y-3">
          <Skeleton className="h-18 w-3/4 rounded-2xl" />
          <Skeleton className="ml-auto h-20 w-2/3 rounded-2xl" />
          <Skeleton className="h-16 w-1/2 rounded-2xl" />
          <Skeleton className="ml-auto h-22 w-3/5 rounded-2xl" />
          <Skeleton className="h-18 w-2/3 rounded-2xl" />
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-11 rounded-xl" />
        </div>
      </div>

      <div className="hidden rounded-[26px] border border-border bg-background-elevated/45 p-4 xl:block">
        <Skeleton className="h-10 w-2/3 rounded-xl" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function ChatConversationLoadingState() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-heading text-[18px] font-semibold">Carregando conversa...</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Buscando histórico e informações do contato.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Carregando
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3.5 py-3.5 sm:px-5">
        <Skeleton className="h-18 w-[72%] rounded-[20px]" />
        <Skeleton className="ml-auto h-16 w-[58%] rounded-[20px]" />
        <Skeleton className="h-20 w-[66%] rounded-[20px]" />
        <Skeleton className="ml-auto h-14 w-[44%] rounded-[20px]" />
        <Skeleton className="h-16 w-[54%] rounded-[20px]" />
      </div>

      <div className="safe-bottom-pad shrink-0 border-t border-border p-3.5 sm:p-4">
        <div className="rounded-[16px] border border-white/8 bg-[linear-gradient(180deg,rgba(7,20,38,0.92),rgba(5,17,31,0.98))] p-3">
          <p className="text-xs text-muted-foreground">
            Preparando o chat para envio de mensagens...
          </p>
        </div>
      </div>
    </div>
  );
}

function ConversationSidebar({
  selectedConversation,
  selectedTagIds,
  tags,
  users,
  canTransferConversation,
  canResolveConversation,
  canCloseConversation,
  canReopenConversation,
  isConversationClosed,
  noteDraft,
  onNoteDraftChange,
  onAddNote,
  onResolve,
  onClose,
  onReopen,
  onUpdateConversation,
  reminderForm,
  onReminderFormChange,
  editingReminderId,
  onEditReminder,
  onClearReminderEditor,
  onSaveReminder,
  onCompleteReminder,
  onCancelReminder,
  remindersBusy,
}: {
  selectedConversation?: Conversation;
  selectedTagIds: string[];
  tags: Tag[];
  users: UserSummary[];
  canTransferConversation: boolean;
  canResolveConversation: boolean;
  canCloseConversation: boolean;
  canReopenConversation: boolean;
  isConversationClosed: boolean;
  noteDraft: string;
  onNoteDraftChange: (value: string) => void;
  onAddNote: () => void;
  onResolve: () => void;
  onClose: () => void;
  onReopen: () => void;
  onUpdateConversation: (payload: {
    assignedUserId?: string;
    tagIds?: string[];
  }) => void;
  reminderForm: ReminderFormState;
  onReminderFormChange: (
    value: ReminderFormState | ((current: ReminderFormState) => ReminderFormState),
  ) => void;
  editingReminderId: string | null;
  onEditReminder: (reminder: ConversationReminder) => void;
  onClearReminderEditor: () => void;
  onSaveReminder: () => Promise<unknown>;
  onCompleteReminder: (reminderId: string) => void;
  onCancelReminder: (reminderId: string) => void;
  remindersBusy: boolean;
}) {
  if (!selectedConversation) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <EmptyState
          icon={Inbox}
          title="Sem detalhes"
          description="Selecione uma conversa para exibir dados do contato, tags, lembretes e notas internas."
        />
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Contato</p>
          <h3 className="mt-1 font-heading text-[22px] font-semibold">
            {selectedConversation.contact.name}
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {selectedConversation.contact.phone}
          </p>
          <p className="text-sm text-muted-foreground">
            {selectedConversation.contact.email ?? 'Sem email cadastrado'}
          </p>
        </div>

        <div className="space-y-3 rounded-[20px] border border-border bg-white/[0.03] p-3.5">
          <p className="font-medium">Atribuição e status</p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={selectedConversation.status}
              closeReason={selectedConversation.closeReason}
            />
            {selectedConversation.status === 'WAITING' ? (
              <Badge variant="secondary">Disponível para retomada</Badge>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              variant="secondary"
              disabled={!canResolveConversation || isConversationClosed}
              onClick={onResolve}
            >
              Resolver
            </Button>
            <Button
              variant="secondary"
              disabled={!canCloseConversation || isConversationClosed}
              onClick={onClose}
            >
              Encerrar
            </Button>
            <Button
              variant="ghost"
              disabled={!canReopenConversation || !isConversationClosed}
              onClick={onReopen}
            >
              Reabrir
            </Button>
          </div>
          <NativeSelect
            className="h-10 rounded-xl px-3.5 text-sm"
            value={selectedConversation.assignedUser?.id ?? ''}
            onChange={(event) =>
              onUpdateConversation({
                assignedUserId: event.target.value || undefined,
              })
            }
            disabled={!canTransferConversation || isConversationClosed}
          >
            <option value="">Sem responsável</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </NativeSelect>
          {!canTransferConversation ? (
            <p className="text-xs text-muted-foreground">
              Transferência de conversa não liberada para seu usuário.
            </p>
          ) : null}
        </div>

        <div className="space-y-3 rounded-[20px] border border-border bg-white/[0.03] p-3.5">
          <p className="font-medium">Tags da conversa</p>
          {tags.length ? (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const active = selectedTagIds.includes(tag.id);

                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={cn(
                      'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition',
                      active
                        ? 'border-transparent bg-primary text-white shadow-[0_10px_24px_rgba(50,151,255,0.24)]'
                        : 'border-white/10 bg-white/[0.03] text-foreground/76 hover:border-primary/30 hover:text-foreground',
                    )}
                    onClick={() =>
                      onUpdateConversation({
                        tagIds: active
                          ? selectedTagIds.filter((tagId) => tagId !== tag.id)
                          : [...selectedTagIds, tag.id],
                      })
                    }
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-muted-foreground">
              Nenhuma tag cadastrada ainda.
            </div>
          )}
        </div>

        <ConversationRemindersPanel
          reminders={selectedConversation.reminders ?? []}
          reminderForm={reminderForm}
          onReminderFormChange={onReminderFormChange}
          editingReminderId={editingReminderId}
          onEditReminder={onEditReminder}
          onClearReminderEditor={onClearReminderEditor}
          onSaveReminder={onSaveReminder}
          onCompleteReminder={onCompleteReminder}
          onCancelReminder={onCancelReminder}
          remindersBusy={remindersBusy}
        />

        <div className="space-y-3 rounded-[20px] border border-border bg-white/[0.03] p-3.5">
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" />
            <p className="font-medium">Notas internas</p>
          </div>
          <Textarea
            value={noteDraft}
            onChange={(event) => onNoteDraftChange(event.target.value)}
            placeholder="Registre um contexto interno para o time..."
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={onAddNote}
            disabled={!noteDraft.trim()}
          >
            Adicionar nota
          </Button>
          <div className="space-y-3">
            {selectedConversation.notes?.map((note) => (
              <div
                key={note.id}
                className="rounded-2xl border border-border bg-background-panel p-3"
              >
                <p className="text-sm">{note.content}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {note.author.name} • {formatDate(note.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubbleContent({
  message,
}: {
  message: ConversationMessage;
}) {
  const mediaUrl = `/api/proxy/messages/${message.id}/media`;
  const messageCaption = getMessageCaption(message);
  const normalizedMessageType = normalizeConversationMessageType(message.messageType);
  const mediaMetadata = resolveMessageMediaMetadata(message.metadata);
  const tone =
    message.direction === 'OUTBOUND'
      ? 'outgoing'
      : message.direction === 'SYSTEM'
        ? 'system'
        : 'incoming';
  const quote = message.metadata?.quote;
  const quoteBlock = quote ? <QuotedMessageBlock quote={quote} tone={tone} /> : null;
  const hasUnknownMedia =
    Boolean(mediaMetadata.mediaId) &&
    !['image', 'sticker', 'audio', 'video', 'document', 'template', 'text'].includes(
      normalizedMessageType,
    );

  if (normalizedMessageType === 'image' || normalizedMessageType === 'sticker') {
    return (
      <div className="space-y-2">
        {quoteBlock}
        <ImageMessagePreview
          src={mediaUrl}
          alt={normalizedMessageType === 'sticker' ? 'Figurinha' : 'Imagem'}
          isSticker={normalizedMessageType === 'sticker'}
        />
        {messageCaption ? <FormattedMessageText content={messageCaption} tone={tone} /> : null}
      </div>
    );
  }

  if (normalizedMessageType === 'audio') {
    return (
      <div className="space-y-2">
        {quoteBlock}
        <CompactAudioPlayer
          src={mediaUrl}
          isVoiceMessage={Boolean(message.metadata?.voice)}
          outgoing={message.direction === 'OUTBOUND'}
        />
        {messageCaption ? <FormattedMessageText content={messageCaption} tone={tone} /> : null}
      </div>
    );
  }

  if (normalizedMessageType === 'video') {
    return (
      <div className="space-y-2">
        {quoteBlock}
        <video
          controls
          playsInline
          preload="metadata"
          className="max-h-[280px] w-full max-w-[300px] rounded-md bg-black object-cover"
          src={mediaUrl}
        />
        {messageCaption ? <FormattedMessageText content={messageCaption} tone={tone} /> : null}
      </div>
    );
  }

  if (normalizedMessageType === 'document' || hasUnknownMedia) {
    return (
      <div className="space-y-2">
        {quoteBlock}
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.06] px-2.5 py-2 text-xs underline-offset-4 hover:bg-white/[0.1]"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {mediaMetadata.fileName ?? (hasUnknownMedia ? 'Abrir midia' : 'Abrir documento')}
        </a>
        {messageCaption ? <FormattedMessageText content={messageCaption} tone={tone} /> : null}
      </div>
    );
  }

  if (normalizedMessageType === 'template') {
    return (
      <div className="space-y-2">
        {quoteBlock}
        <div className="inline-flex rounded-md bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium opacity-75">
          {message.metadata?.windowClosedTemplateReply
            ? `Template automatico: ${message.metadata?.templateName ?? 'aprovado'}`
            : `Template: ${message.metadata?.templateName ?? 'aprovado'}`}
        </div>
        <FormattedMessageText content={message.content} tone={tone} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {quoteBlock}
      <FormattedMessageText content={message.content} tone={tone} />
    </div>
  );
}

function QuotedMessageBlock({
  quote,
  tone,
}: {
  quote: NonNullable<NonNullable<ConversationMessage['metadata']>['quote']>;
  tone: 'outgoing' | 'incoming' | 'system';
}) {
  const sourceLabel =
    quote.direction === 'OUTBOUND'
      ? 'Mensagem do atendimento'
      : quote.direction === 'SYSTEM'
        ? 'Mensagem do sistema'
        : 'Mensagem do cliente';

  return (
    <div
      className={cn(
        'rounded-md border-l-[3px] px-2 py-1.5',
        tone === 'outgoing'
          ? 'border-l-[#06cf9c] bg-[#025144]/60'
          : tone === 'system'
            ? 'border-l-primary/50 bg-primary/10'
            : 'border-l-[#06cf9c] bg-white/[0.06]',
      )}
    >
      <p className="text-[11px] font-semibold text-[#06cf9c]">
        {sourceLabel}
      </p>
      <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-[12px] leading-4 opacity-75">
        {quote.contentPreview?.trim() || 'Mensagem citada'}
      </p>
    </div>
  );
}

function FormattedMessageText({
  content,
  tone,
}: {
  content?: string | null;
  tone: 'outgoing' | 'incoming' | 'system';
}) {
  if (!content?.trim()) {
    return null;
  }

  return (
    <WhatsAppFormattedText
      content={content}
      tone={tone === 'outgoing' ? 'outgoing' : 'incoming'}
      className="text-[13px] leading-5"
    />
  );
}

function getMessageStatusLabel(status?: string | null) {
  if (!status) {
    return 'Sem status';
  }

  return MESSAGE_STATUS_LABELS[status] ?? status;
}

function MessageStatusIcon({ status }: { status?: string | null }) {
  if (status === 'READ') {
    return <CheckCheck className="h-[14px] w-[14px] text-[#53bdeb]" />;
  }
  if (status === 'DELIVERED') {
    return <CheckCheck className="h-[14px] w-[14px]" />;
  }
  if (status === 'SENT') {
    return <Check className="h-[14px] w-[14px]" />;
  }
  if (status === 'FAILED') {
    return <span className="text-[10px] text-red-400">!</span>;
  }
  return null;
}

function StatusBadge({
  status,
  closeReason,
}: {
  status: string;
  closeReason?: Conversation['closeReason'];
}) {
  const badgeClassName =
    status === 'NEW' || status === 'OPEN'
      ? 'border-transparent bg-[#2f7df6]/20 text-[#7fc1ff]'
      : status === 'IN_PROGRESS' || status === 'PENDING'
        ? 'border-transparent bg-primary/20 text-primary'
        : status === 'WAITING'
          ? 'border-transparent bg-amber-500/15 text-amber-300'
          : status === 'RESOLVED'
            ? 'border-transparent bg-emerald-500/15 text-emerald-300'
            : 'border-transparent bg-rose-500/15 text-rose-300';

  return (
    <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium', badgeClassName)}>
      {getConversationStatusLabel(status, closeReason)}
    </span>
  );
}

function ImageMessagePreview({
  src,
  alt,
  isSticker,
}: {
  src: string;
  alt: string;
  isSticker: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (isSticker) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} className="max-h-32 max-w-[132px] object-contain" />
    );
  }

  return (
    <>
      <button
        type="button"
        className="block overflow-hidden rounded-md"
        onClick={() => setOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="max-h-[280px] w-full max-w-[300px] object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-auto max-w-[92vw] border-white/10 bg-black/90 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[85vh] w-auto max-w-[90vw] rounded-lg object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

function CompactAudioPlayer({
  src,
  isVoiceMessage,
  outgoing,
}: {
  src: string;
  isVoiceMessage: boolean;
  outgoing: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [src]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const togglePlayback = async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        toast.error('Nao foi possivel reproduzir este audio.');
      }
      return;
    }

    audio.pause();
  };

  const handleSeek = (value: number) => {
    const audio = audioRef.current;

    if (!audio || !duration) {
      return;
    }

    audio.currentTime = value;
    setCurrentTime(value);
  };

  return (
    <div className="w-[260px] max-w-full">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition',
            outgoing ? 'bg-[#00a884] text-white hover:bg-[#00a884]/80' : 'bg-[#00a884] text-white hover:bg-[#00a884]/80',
          )}
          onClick={() => {
            void togglePlayback();
          }}
        >
          {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="relative h-6">
            <div className="pointer-events-none absolute inset-0 flex items-end gap-[1.5px] overflow-hidden">
              {AUDIO_WAVEFORM_BARS.map((barHeight, index) => {
                const threshold = ((index + 1) / AUDIO_WAVEFORM_BARS.length) * 100;

                return (
                  <span
                    key={`${barHeight}-${index}`}
                    className={cn(
                      'rounded-full transition-colors',
                      progress >= threshold
                        ? 'bg-[#00a884]'
                        : outgoing
                          ? 'bg-[#ffffff40]'
                          : 'bg-[#ffffff25]',
                    )}
                    style={{ height: `${Math.max(4, Math.round(barHeight * 0.65))}px`, width: '2.5px' }}
                  />
                );
              })}
            </div>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={duration ? currentTime : 0}
              onChange={(event) => handleSeek(Number(event.target.value))}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <div className="flex items-center gap-1 text-[10px] opacity-60">
            <span>{formatMediaDuration(duration > 0 ? (isPlaying ? currentTime : duration) : currentTime)}</span>
            {isVoiceMessage && <Mic className="h-2.5 w-2.5" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeConversationMessageType(messageType?: string | null) {
  const normalized = (messageType ?? '').trim().toLowerCase();

  const typeMap: Record<string, string> = {
    voice: 'audio',
    ptt: 'audio',
    video_note: 'video',
    video_note_message: 'video',
    animated_sticker: 'sticker',
  };

  if (!normalized) {
    return 'text';
  }

  return typeMap[normalized] ?? normalized;
}

function canQuoteMessage(message: ConversationMessage) {
  return message.direction !== 'SYSTEM' && message.status !== 'QUEUED';
}

function resolveMessageMediaMetadata(messageMetadata: ConversationMessage['metadata']) {
  const metadataAsRecord =
    messageMetadata &&
    typeof messageMetadata === 'object' &&
    !Array.isArray(messageMetadata)
      ? (messageMetadata as Record<string, unknown>)
      : null;
  const media = metadataAsRecord?.media;
  const mediaAsRecord =
    media && typeof media === 'object' && !Array.isArray(media)
      ? (media as Record<string, unknown>)
      : null;

  const pickString = (...values: unknown[]) => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  };

  return {
    mediaId: pickString(
      messageMetadata?.mediaId,
      metadataAsRecord?.media_id,
      metadataAsRecord?.id,
      mediaAsRecord?.mediaId,
      mediaAsRecord?.media_id,
      mediaAsRecord?.id,
    ),
    fileName: pickString(
      messageMetadata?.fileName,
      metadataAsRecord?.file_name,
      metadataAsRecord?.filename,
      mediaAsRecord?.fileName,
      mediaAsRecord?.file_name,
      mediaAsRecord?.filename,
      metadataAsRecord?.documentName,
    ),
    mimeType: pickString(
      messageMetadata?.mimeType,
      metadataAsRecord?.mime_type,
      metadataAsRecord?.mimetype,
      mediaAsRecord?.mimeType,
      mediaAsRecord?.mime_type,
      mediaAsRecord?.mimetype,
    ),
  };
}

function buildMessageQuotePreview(message: ConversationMessage) {
  const content = message.content?.trim();

  if (content && !HIDDEN_MEDIA_LABELS.has(content)) {
    return content.slice(0, 220);
  }

  const normalizedType = normalizeConversationMessageType(message.messageType);
  const mediaMetadata = resolveMessageMediaMetadata(message.metadata);

  if (normalizedType === 'document') {
    return mediaMetadata.fileName
      ? `Documento: ${mediaMetadata.fileName}`
      : 'Documento';
  }

  if (normalizedType === 'template') {
    return message.metadata?.templateName
      ? `Template: ${message.metadata.templateName}`
      : 'Template enviado';
  }

  if (normalizedType === 'image') return 'Imagem';
  if (normalizedType === 'audio') {
    return message.metadata?.voice ? 'Mensagem de voz' : 'Audio';
  }
  if (normalizedType === 'video') return 'Video';
  if (normalizedType === 'sticker') return 'Figurinha';

  return content?.slice(0, 220) || 'Mensagem';
}

function buildQuoteMetadataForComposer(message?: ConversationMessage | null) {
  if (!message) {
    return null;
  }

  return {
    quote: {
      messageId: message.id,
      contentPreview: buildMessageQuotePreview(message),
      messageType: normalizeConversationMessageType(message.messageType),
      direction: message.direction,
      createdAt: message.createdAt,
    },
  };
}

function getMessageCaption(message: ConversationMessage) {
  const content = message.content?.trim();

  if (!content) {
    return null;
  }

  if (HIDDEN_MEDIA_LABELS.has(content)) {
    return null;
  }

  if (
    normalizeConversationMessageType(message.messageType) === 'document' &&
    content.startsWith('Documento:')
  ) {
    return null;
  }

  return content;
}

function formatMediaDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0:00';
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getPreferredRecordingMimeType(): RecordingMimeConfig | null {
  if (typeof MediaRecorder === 'undefined') {
    return null;
  }

  const candidates: RecordingMimeConfig[] = [
    { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
    { mimeType: 'audio/mp4', extension: 'm4a' },
    { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
    { mimeType: 'audio/webm', extension: 'webm' },
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }

  return null;
}

function inferRecordingMimeConfig(mimeType: string): RecordingMimeConfig {
  if (mimeType.includes('ogg')) {
    return { mimeType, extension: 'ogg' };
  }

  if (mimeType.includes('mp4')) {
    return { mimeType, extension: 'm4a' };
  }

  return { mimeType, extension: 'webm' };
}

function stopRecordingStream(streamRef: MutableRefObject<MediaStream | null>) {
  streamRef.current?.getTracks().forEach((track) => track.stop());
  streamRef.current = null;
}
