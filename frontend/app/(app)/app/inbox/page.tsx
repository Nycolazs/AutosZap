'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileImage,
  Inbox,
  Paperclip,
  Search,
  SendHorizontal,
  StickyNote,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { formatDate } from '@/lib/utils';

const INBOX_REFRESH_INTERVAL = 1500;

export default function InboxPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
    mutationFn: async () => {
      if (!activeConversationId || !selectedFile) {
        throw new Error('Selecione um arquivo para enviar.');
      }

      const formData = new FormData();
      formData.append('conversationId', activeConversationId);
      formData.append('file', selectedFile);

      if (messageDraft.trim()) {
        formData.append('caption', messageDraft.trim());
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

              <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
                {selectedConversation.messages?.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[76%] rounded-[20px] px-3.5 py-2.5 text-sm ${
                      message.direction === 'OUTBOUND'
                        ? 'ml-auto bg-primary text-white'
                        : 'bg-white/[0.04] text-foreground'
                    }`}
                  >
                    <MessageBubbleContent message={message} />
                    <p className={`mt-2 text-[11px] ${message.direction === 'OUTBOUND' ? 'text-white/80' : 'text-muted-foreground'}`}>
                      {formatDate(message.createdAt)} • {message.status}
                    </p>
                  </div>
                ))}
              </div>

              <div className="shrink-0 border-t border-border p-4">
                <div className="rounded-[20px] border border-border bg-white/[0.03] p-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  />
                  {selectedFile ? (
                    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-border bg-background-panel px-3 py-2 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileImage className="h-4 w-4 shrink-0 text-primary" />
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
                  <Textarea
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    placeholder={
                      selectedFile
                        ? 'Adicione uma legenda opcional para a midia...'
                        : 'Digite uma resposta para enviar pelo canal selecionado...'
                    }
                    className="min-h-20 border-none bg-transparent p-0"
                  />
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!activeConversationId}
                    >
                      <Paperclip className="h-4 w-4" />
                      Anexar
                    </Button>
                    <Button
                      onClick={() =>
                        selectedFile ? sendMediaMutation.mutate() : sendMutation.mutate()
                      }
                      disabled={
                        (!messageDraft.trim() && !selectedFile) ||
                        !activeConversationId ||
                        sendMutation.isPending ||
                        sendMediaMutation.isPending
                      }
                    >
                      <SendHorizontal className="h-4 w-4" />
                      {selectedFile ? 'Enviar midia' : 'Enviar'}
                    </Button>
                  </div>
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
                  <select
                    multiple
                    className="min-h-24 w-full rounded-xl border border-border bg-background-panel px-3.5 py-2.5 text-sm"
                    value={selectedTagIds}
                    onChange={(event) =>
                      updateConversationMutation.mutate({
                        tagIds: Array.from(event.target.selectedOptions).map((option) => option.value),
                      })
                    }
                  >
                    {tagsQuery.data?.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
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

  if (message.messageType === 'image' || message.messageType === 'sticker') {
    return (
      <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl}
          alt={message.messageType === 'sticker' ? 'Figurinha' : 'Imagem'}
          className={message.messageType === 'sticker' ? 'max-h-40 max-w-[160px]' : 'max-h-72 rounded-2xl object-cover'}
        />
        {message.content ? <p>{message.content}</p> : null}
      </div>
    );
  }

  if (message.messageType === 'audio') {
    return (
      <div className="space-y-2">
        <audio controls className="max-w-full" src={mediaUrl} />
        {message.content ? <p>{message.content}</p> : null}
      </div>
    );
  }

  if (message.messageType === 'video') {
    return (
      <div className="space-y-2">
        <video controls className="max-h-72 rounded-2xl" src={mediaUrl} />
        {message.content ? <p>{message.content}</p> : null}
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
        {message.content ? <p>{message.content}</p> : null}
      </div>
    );
  }

  return <p>{message.content}</p>;
}
