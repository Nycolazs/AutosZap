'use client';

import type { KeyboardEvent, MutableRefObject } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileImage,
  Inbox,
  Mic,
  Pause,
  Paperclip,
  Play,
  Search,
  SendHorizontal,
  StickyNote,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import {
  Conversation,
  ConversationMessage,
  PaginatedResponse,
  Tag,
  UserSummary,
} from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';

const INBOX_REFRESH_INTERVAL = 1500;
const AUDIO_WAVEFORM_BARS = [8, 12, 18, 14, 24, 16, 20, 28, 18, 24, 14, 20, 30, 18, 14, 24, 18, 28, 20, 16, 24, 14, 18, 12, 8, 12, 18, 14, 24, 16, 20, 28, 18, 24, 14];
const HIDDEN_MEDIA_LABELS = new Set(['Imagem', 'Audio', 'Video', 'Figurinha', 'Documento anexado']);

type RecordingMimeConfig = {
  mimeType: string;
  extension: string;
};

export default function InboxPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const pendingRecordingActionRef = useRef<'discard' | 'send' | null>(null);
  const recordingMimeConfigRef = useRef<RecordingMimeConfig | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

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

  const conversations = useMemo(() => conversationsQuery.data?.data ?? [], [conversationsQuery.data]);
  const activeConversationId = useMemo(() => {
    if (!conversations.length) {
      return null;
    }

    if (selectedConversationId && conversations.some((conversation) => conversation.id === selectedConversationId)) {
      return selectedConversationId;
    }

    return conversations[0]?.id ?? null;
  }, [conversations, selectedConversationId]);

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
      apiRequest('messages', {
        method: 'POST',
        body: {
          conversationId: activeConversationId,
          content: messageDraft,
        },
      }),
    onSuccess: async () => {
      setMessageDraft('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
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
        formData.append('caption', caption);
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

  const updateConversationMutation = useMutation({
    mutationFn: (payload: { status?: string; assignedUserId?: string; tagIds?: string[] }) =>
      apiRequest(`conversations/${activeConversationId}`, {
        method: 'PATCH',
        body: payload,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['conversation', activeConversationId] }),
      ]);
      toast.success('Conversa atualizada.');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const selectedConversation = selectedConversationQuery.data;

  const selectedTagIds = useMemo(
    () => selectedConversation?.tags.map((tag) => tag.id) ?? [],
    [selectedConversation],
  );

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

  return (
    <div className="grid h-full min-h-0 overflow-hidden gap-4 xl:grid-cols-[296px_minmax(0,1fr)_278px]">
      <Card className="h-full min-h-0 overflow-hidden p-0">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <div className="shrink-0 border-b border-border p-4">
            <h1 className="font-heading text-[22px] font-semibold">Conversas</h1>
            <Tabs defaultValue="ALL" value={statusFilter} onValueChange={setStatusFilter} className="mt-3">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="ALL">Todas</TabsTrigger>
                <TabsTrigger value="OPEN">Abertas</TabsTrigger>
                <TabsTrigger value="PENDING">Pendentes</TabsTrigger>
              </TabsList>
            </Tabs>
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
                    className={`w-full rounded-[20px] border px-3.5 py-3 text-left transition ${
                      activeConversationId === conversation.id
                        ? 'border-primary/40 bg-primary-soft'
                        : 'border-transparent bg-white/[0.03] hover:border-border'
                    }`}
                    onClick={() => setSelectedConversationId(conversation.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{conversation.contact.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{conversation.contact.company ?? conversation.contact.phone}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(conversation.lastMessageAt)}</span>
                    </div>
                    <p className="mt-2.5 line-clamp-2 text-sm text-foreground/78">
                      {conversation.lastMessagePreview ?? 'Sem mensagens recentes'}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {conversation.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag.id} variant="secondary">
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                      {conversation.unreadCount ? <Badge>{conversation.unreadCount}</Badge> : null}
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

      <Card className="h-full min-h-0 overflow-hidden p-0">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          {selectedConversation ? (
            <>
              <div className="shrink-0 border-b border-border px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-heading text-[22px] font-semibold">{selectedConversation.contact.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedConversation.contact.company ?? selectedConversation.contact.phone}
                    </p>
                  </div>
                  <Badge>{selectedConversation.status}</Badge>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
                {selectedConversation.messages?.map((message) => (
                  <div
                    key={message.id}
                    className={`w-fit max-w-[min(68%,32rem)] rounded-[18px] px-3 py-2 text-[14px] leading-5 ${
                      message.direction === 'OUTBOUND'
                        ? 'ml-auto bg-primary text-white'
                        : 'bg-white/[0.04] text-foreground'
                    }`}
                  >
                    <MessageBubbleContent message={message} />
                    <p className={`mt-1.5 text-[10px] ${message.direction === 'OUTBOUND' ? 'text-white/80' : 'text-muted-foreground'}`}>
                      {formatDate(message.createdAt)} • {message.status}
                    </p>
                  </div>
                ))}
              </div>

              <div className="shrink-0 border-t border-border p-4">
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
                      <Textarea
                        value={messageDraft}
                        onChange={(event) => setMessageDraft(event.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        placeholder={
                          selectedFile
                            ? selectedFile.type.startsWith('audio/')
                              ? 'Adicione uma legenda opcional para a mensagem de voz...'
                              : 'Adicione uma legenda opcional para a midia...'
                            : 'Digite uma resposta para enviar pelo canal selecionado...'
                        }
                        className="min-h-[58px] max-h-36 resize-none border-none bg-transparent px-1 py-1 text-[15px] leading-6"
                      />
                      <div className="mt-2 flex items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!activeConversationId || sendMediaMutation.isPending}
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
                            disabled={!activeConversationId || Boolean(selectedFile) || sendMediaMutation.isPending}
                            className="h-10 rounded-[14px] px-3.5 text-[13px] font-medium"
                          >
                            <Mic className="h-4 w-4" />
                            Gravar audio
                          </Button>
                        </div>
                        <Button
                          onClick={submitComposer}
                          disabled={
                            (!messageDraft.trim() && !selectedFile) ||
                            !activeConversationId ||
                            sendMutation.isPending ||
                            sendMediaMutation.isPending
                          }
                          className="h-10 rounded-[14px] px-4 text-[13px] font-medium"
                        >
                          <SendHorizontal className="h-4 w-4" />
                          {selectedFile ? 'Enviar midia' : 'Enviar'}
                        </Button>
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

      <Card className="h-full min-h-0 overflow-hidden p-0">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          {selectedConversation ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Contato</p>
                  <h3 className="mt-1 font-heading text-[22px] font-semibold">{selectedConversation.contact.name}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{selectedConversation.contact.phone}</p>
                  <p className="text-sm text-muted-foreground">{selectedConversation.contact.email ?? 'Sem email cadastrado'}</p>
                </div>

                <div className="space-y-3 rounded-[20px] border border-border bg-white/[0.03] p-3.5">
                  <p className="font-medium">Atribuicao e status</p>
                  <select
                    className="h-10 w-full rounded-xl border border-border bg-background-panel px-3.5 text-sm"
                    value={selectedConversation.status}
                    onChange={(event) => updateConversationMutation.mutate({ status: event.target.value })}
                  >
                    <option value="OPEN">Aberta</option>
                    <option value="PENDING">Pendente</option>
                    <option value="CLOSED">Fechada</option>
                  </select>
                  <select
                    className="h-10 w-full rounded-xl border border-border bg-background-panel px-3.5 text-sm"
                    value={selectedConversation.assignedUser?.id ?? ''}
                    onChange={(event) =>
                      updateConversationMutation.mutate({ assignedUserId: event.target.value || undefined })
                    }
                  >
                    <option value="">Sem responsavel</option>
                    {usersQuery.data?.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3 rounded-[20px] border border-border bg-white/[0.03] p-3.5">
                  <p className="font-medium">Tags da conversa</p>
                  {tagsQuery.data?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {tagsQuery.data.map((tag) => {
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
                              updateConversationMutation.mutate({
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

                <div className="space-y-3 rounded-[20px] border border-border bg-white/[0.03] p-3.5">
                  <div className="flex items-center gap-2">
                    <StickyNote className="h-4 w-4 text-primary" />
                    <p className="font-medium">Notas internas</p>
                  </div>
                  <Textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="Registre um contexto interno para o time..."
                  />
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => noteMutation.mutate()}
                    disabled={!noteDraft.trim()}
                  >
                    Adicionar nota
                  </Button>
                  <div className="space-y-3">
                    {selectedConversation.notes?.map((note) => (
                      <div key={note.id} className="rounded-2xl border border-border bg-background-panel p-3">
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
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <EmptyState
                icon={Inbox}
                title="Sem detalhes"
                description="Selecione uma conversa para exibir dados do contato, tags e notas internas."
              />
            </div>
          )}
        </CardContent>
      </Card>
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

  if (message.messageType === 'image' || message.messageType === 'sticker') {
    return (
      <div className="space-y-2.5">
        <ImageMessagePreview
          src={mediaUrl}
          alt={message.messageType === 'sticker' ? 'Figurinha' : 'Imagem'}
          isSticker={message.messageType === 'sticker'}
        />
        {messageCaption ? <p>{messageCaption}</p> : null}
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
        {messageCaption ? <p>{messageCaption}</p> : null}
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
        {messageCaption ? <p>{messageCaption}</p> : null}
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
        {messageCaption ? <p>{messageCaption}</p> : null}
      </div>
    );
  }

  return <p>{message.content}</p>;
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
