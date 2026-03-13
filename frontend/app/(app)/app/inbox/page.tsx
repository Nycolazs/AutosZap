'use client';

import type { KeyboardEvent, MutableRefObject } from 'react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  FileImage,
  Inbox,
  Mic,
  Pause,
  Paperclip,
  Play,
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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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

const INBOX_REFRESH_INTERVAL = 1500;
const AUDIO_WAVEFORM_BARS = [8, 12, 18, 14, 24, 16, 20, 28, 18, 24, 14, 20, 30, 18, 14, 24, 18, 28, 20, 16, 24, 14, 18, 12, 8, 12, 18, 14, 24, 16, 20, 28, 18, 24, 14];
const HIDDEN_MEDIA_LABELS = new Set(['Imagem', 'Audio', 'Video', 'Figurinha', 'Documento anexado']);
const MESSAGE_STATUS_LABELS: Record<string, string> = {
  READ: 'Lida',
  DELIVERED: 'Entregue',
  SENT: 'Enviada',
  FAILED: 'Falhou',
  QUEUED: 'Na fila',
};

const STATUS_LABELS: Record<string, string> = {
  ALL: 'Todas',
  NEW: 'Novo',
  IN_PROGRESS: 'Em atendimento',
  WAITING: 'Aguardando',
  RESOLVED: 'Resolvido',
  CLOSED: 'Encerrado',
};
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
    refetchInterval: INBOX_REFRESH_INTERVAL,
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

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
    queryKey: ['conversation', activeConversationId],
    enabled: Boolean(activeConversationId),
    queryFn: () => apiRequest<Conversation>(`conversations/${activeConversationId}`),
    refetchInterval: activeConversationId ? INBOX_REFRESH_INTERVAL : false,
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiRequest<UserSummary[]>('users'),
  });

  const tagsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: () => apiRequest<Tag[]>('tags'),
  });

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
        },
      }),
    onSuccess: async (message) => {
      setMessageDraft('');

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
    onError: (error: Error) => toast.error(error.message),
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

      return apiRequest('messages/media', {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: async () => {
      setMessageDraft('');
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
  const selectedConversation = selectedConversationQuery.data;

  const selectedTagIds = useMemo(
    () => selectedConversation?.tags.map((tag) => tag.id) ?? [],
    [selectedConversation],
  );

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
    }, 0);

    return () => window.clearTimeout(resetPanels);
  }, [activeConversationId]);

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
  const canTransferConversation = canAccess(permissionMap, 'TRANSFER_CONVERSATION');
  const canResolveConversation = canAccess(permissionMap, 'RESOLVE_CONVERSATION');
  const canCloseConversation = canAccess(permissionMap, 'CLOSE_CONVERSATION');
  const canReopenConversation = canAccess(permissionMap, 'REOPEN_CONVERSATION');
  const isConversationClosed =
    selectedConversation?.status === 'RESOLVED' ||
    selectedConversation?.status === 'CLOSED';

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
                          <StatusBadge status={conversation.status} />
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
          {selectedConversation ? (
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
                      <h2 className="font-heading text-[20px] font-semibold sm:text-[22px]">{selectedConversation.contact.name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedConversation.contact.company ?? selectedConversation.contact.phone}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
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
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                    <StatusBadge status={selectedConversation.status} />
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-4 sm:px-5">
                {selectedConversation.messages?.map((message) => (
                  <div
                    key={message.id}
                    className={`w-fit max-w-[92%] rounded-[22px] px-4 py-3 text-[14px] leading-6 shadow-[0_16px_36px_rgba(2,10,22,0.16)] sm:max-w-[min(68%,34rem)] ${
                      message.direction === 'OUTBOUND'
                        ? 'ml-auto bg-[linear-gradient(180deg,#45a0ff,#3a8eed)] text-white'
                        : message.direction === 'SYSTEM'
                          ? 'mx-auto border border-primary/15 bg-primary/10 text-foreground'
                          : 'border border-white/6 bg-white/[0.045] text-foreground'
                    }`}
                  >
                    <MessageBubbleContent message={message} />
                    <p
                      className={`mt-2 text-[10px] ${
                        message.direction === 'OUTBOUND' ? 'text-white/80' : 'text-muted-foreground'
                      }`}
                    >
                      {formatDate(message.createdAt)} • {getMessageStatusLabel(message.status)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="safe-bottom-pad shrink-0 border-t border-border p-3.5 sm:p-4">
                <div className="rounded-[18px] border border-white/8 bg-[linear-gradient(180deg,rgba(7,20,38,0.92),rgba(5,17,31,0.98))] p-2.5 shadow-[0_16px_36px_rgba(2,10,22,0.24)]">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  />
                  {isRecording ? (
                    <div className="flex items-center gap-3 rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,24,44,0.92),rgba(7,18,33,0.98))] px-3 py-3 shadow-[0_18px_42px_rgba(2,10,22,0.38)]">
                      <button
                        type="button"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground/85 transition hover:bg-white/6 hover:text-foreground"
                        onClick={() => finishRecording('discard')}
                      >
                        <Trash2 className="h-[18px] w-[18px]" />
                      </button>

                      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-white/10 bg-white/[0.035] px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        <span
                          className={cn(
                            'h-3 w-3 shrink-0 rounded-full bg-[#ff4d5e] shadow-[0_0_20px_rgba(255,77,94,0.75)]',
                            recordingPaused ? 'opacity-55' : 'animate-pulse',
                          )}
                        />
                        <span className="w-11 shrink-0 font-semibold tabular-nums text-[13px] text-white/95">
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
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/7 text-foreground transition hover:bg-white/12"
                        onClick={toggleRecordingPause}
                      >
                        {recordingPaused ? <Play className="ml-0.5 h-[18px] w-[18px] fill-current" /> : <Pause className="h-[18px] w-[18px] fill-current" />}
                      </button>

                      <button
                        type="button"
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_10px_26px_rgba(50,151,255,0.38)] transition hover:bg-primary/92"
                        onClick={() => finishRecording('send')}
                        disabled={sendMediaMutation.isPending}
                      >
                        <SendHorizontal className="h-[18px] w-[18px]" />
                      </button>
                    </div>
                  ) : selectedFile ? (
                    <div className="mb-2.5 flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        {selectedFile.type.startsWith('audio/') ? (
                          <Mic className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <FileImage className="h-4 w-4 shrink-0 text-primary" />
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
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                  {!isRecording ? (
                    <>
                      <div className="mb-2 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
                        As mensagens manuais são enviadas com assinatura automática no formato
                        <span className="mx-1 font-medium text-foreground">
                          *{(meQuery.data?.name ?? 'Equipe').toUpperCase()}*:
                        </span>
                      </div>
                      <Textarea
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
                        className="min-h-[58px] max-h-36 resize-none border-none bg-transparent px-1 py-1 text-[15px] leading-6"
                        disabled={isConversationClosed}
                      />
                      <div className="mt-2 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!activeConversationId || sendMediaMutation.isPending || isConversationClosed}
                            className="h-10 rounded-[14px] px-3.5 text-[13px] font-medium"
                          >
                            <Paperclip className="h-4 w-4" />
                            Anexar
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              void startAudioRecording();
                            }}
                            disabled={!activeConversationId || Boolean(selectedFile) || sendMediaMutation.isPending || isConversationClosed}
                            className="h-10 rounded-[14px] px-3.5 text-[13px] font-medium"
                          >
                            <Mic className="h-4 w-4" />
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
                            className="h-10 w-full rounded-[14px] px-4 text-[13px] font-medium sm:w-auto"
                          >
                            <SendHorizontal className="h-4 w-4" />
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
          <div className="max-h-[85vh] overflow-y-auto">
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
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={<div className="h-full rounded-[28px] border border-border bg-background-elevated/40" />}>
      <InboxPageContent />
    </Suspense>
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
            <StatusBadge status={selectedConversation.status} />
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
  const tone =
    message.direction === 'OUTBOUND'
      ? 'outgoing'
      : message.direction === 'SYSTEM'
        ? 'system'
        : 'incoming';

  if (message.messageType === 'image' || message.messageType === 'sticker') {
    return (
      <div className="space-y-2.5">
        <ImageMessagePreview
          src={mediaUrl}
          alt={message.messageType === 'sticker' ? 'Figurinha' : 'Imagem'}
          isSticker={message.messageType === 'sticker'}
        />
        {messageCaption ? <FormattedMessageText content={messageCaption} tone={tone} /> : null}
      </div>
    );
  }

  if (message.messageType === 'audio') {
    return (
      <div className="space-y-2.5">
        <CompactAudioPlayer
          src={mediaUrl}
          isVoiceMessage={Boolean(message.metadata?.voice)}
          outgoing={message.direction === 'OUTBOUND'}
        />
        {messageCaption ? <FormattedMessageText content={messageCaption} tone={tone} /> : null}
      </div>
    );
  }

  if (message.messageType === 'video') {
    return (
      <div className="space-y-2">
        <video
          controls
          playsInline
          preload="metadata"
          className="max-h-64 w-full max-w-[280px] rounded-[16px] border border-white/10 bg-black/25 object-cover"
          src={mediaUrl}
        />
        {messageCaption ? <FormattedMessageText content={messageCaption} tone={tone} /> : null}
      </div>
    );
  }

  if (message.messageType === 'document') {
    return (
      <div className="space-y-2">
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-sm underline-offset-4 hover:underline"
        >
          <Paperclip className="h-4 w-4" />
          {message.metadata?.fileName ?? 'Abrir documento'}
        </a>
        {messageCaption ? <FormattedMessageText content={messageCaption} tone={tone} /> : null}
      </div>
    );
  }

  if (message.messageType === 'template') {
    return (
      <div className="space-y-2">
        <div className="inline-flex rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-current/85">
          {message.metadata?.windowClosedTemplateReply
            ? `Template automatico: ${message.metadata?.templateName ?? 'aprovado'}`
            : `Template: ${message.metadata?.templateName ?? 'aprovado'}`}
        </div>
        <FormattedMessageText content={message.content} tone={tone} />
      </div>
    );
  }

  return <FormattedMessageText content={message.content} tone={tone} />;
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
    />
  );
}

function getMessageStatusLabel(status?: string | null) {
  if (!status) {
    return 'Sem status';
  }

  return MESSAGE_STATUS_LABELS[status] ?? status;
}

function StatusBadge({ status }: { status: string }) {
  const badgeClassName =
    status === 'NEW'
      ? 'border-transparent bg-[#2f7df6]/20 text-[#7fc1ff]'
      : status === 'IN_PROGRESS'
        ? 'border-transparent bg-primary/20 text-primary'
        : status === 'WAITING'
          ? 'border-transparent bg-amber-500/15 text-amber-300'
          : status === 'RESOLVED'
            ? 'border-transparent bg-emerald-500/15 text-emerald-300'
            : 'border-transparent bg-rose-500/15 text-rose-300';

  return (
    <span className={cn('inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium', badgeClassName)}>
      {STATUS_LABELS[status] ?? status}
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
        className="block overflow-hidden rounded-[16px] border border-white/10"
        onClick={() => setOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="max-h-60 w-full max-w-[280px] object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-auto max-w-[92vw] border-white/10 bg-[#04111f]/95 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-[82vh] w-auto max-w-[88vw] rounded-2xl object-contain" />
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
    <div
      className={cn(
        'w-[236px] max-w-full rounded-[16px] border px-2.5 py-2.5',
        outgoing ? 'border-white/15 bg-[#1b75d8]/20' : 'border-white/10 bg-white/[0.03]',
      )}
    >
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          className={cn(
            'flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full transition',
            outgoing ? 'bg-white/18 text-white hover:bg-white/24' : 'bg-primary/18 text-primary hover:bg-primary/24',
          )}
          onClick={() => {
            void togglePlayback();
          }}
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="relative h-7">
            <div className="pointer-events-none absolute inset-0 flex items-center gap-[2px] overflow-hidden">
              {AUDIO_WAVEFORM_BARS.map((barHeight, index) => {
                const threshold = ((index + 1) / AUDIO_WAVEFORM_BARS.length) * 100;

                return (
                  <span
                    key={`${barHeight}-${index}`}
                    className={cn(
                      'w-[4px] rounded-full transition-colors',
                      progress >= threshold
                        ? outgoing
                          ? 'bg-white'
                          : 'bg-primary'
                        : outgoing
                          ? 'bg-white/35'
                          : 'bg-white/18',
                    )}
                    style={{ height: `${Math.max(6, Math.round(barHeight * 0.72))}px`, width: '3px' }}
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
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
            <div className="flex items-center gap-1.5">
              {isVoiceMessage ? <Mic className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              <span>{isVoiceMessage ? 'Mensagem de voz' : 'Audio'}</span>
            </div>
            <span>{formatMediaDuration(duration || currentTime)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getMessageCaption(message: ConversationMessage) {
  const content = message.content?.trim();

  if (!content) {
    return null;
  }

  if (HIDDEN_MEDIA_LABELS.has(content)) {
    return null;
  }

  if (message.messageType === 'document' && content.startsWith('Documento:')) {
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
