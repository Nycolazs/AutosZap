'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock3,
  Info,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  SendHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api-client';
import { QuickMessage, QuickMessageApplyResponse } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type QuickMessagesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  canManage: boolean;
  isConversationClosed: boolean;
  onInsertInInput: (value: string) => void;
  onMessageSent: () => Promise<void> | void;
};

const HELP_TEXT =
  'Use variaveis como {nome}, {vendedor}, {novo_vendedor} e {empresa} para personalizar automaticamente a mensagem.';
const HELP_VARIABLES = ['{nome}', '{vendedor}', '{novo_vendedor}', '{empresa}'];

function formatQuickMessageTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function QuickMessagesDialog({
  open,
  onOpenChange,
  conversationId,
  canManage,
  isConversationClosed,
  onInsertInInput,
  onMessageSent,
}: QuickMessagesDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'use' | 'manage'>('use');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [contentDraft, setContentDraft] = useState('');

  const clearForm = () => {
    setEditingId(null);
    setTitleDraft('');
    setContentDraft('');
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);

    if (!nextOpen) {
      setSearch('');
      setActiveTab('use');
      clearForm();
    }
  };

  const quickMessagesQuery = useQuery({
    queryKey: ['quick-messages'],
    enabled: open,
    queryFn: () => apiRequest<QuickMessage[]>('quick-messages'),
  });

  const quickMessages = useMemo(
    () => quickMessagesQuery.data ?? [],
    [quickMessagesQuery.data],
  );

  const filteredQuickMessages = useMemo(() => {
    if (!search.trim()) {
      return quickMessages;
    }

    const normalizedSearch = search.trim().toLowerCase();
    return quickMessages.filter((quickMessage) => {
      return (
        quickMessage.title.toLowerCase().includes(normalizedSearch) ||
        quickMessage.content.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [quickMessages, search]);

  const applyQuickMessageMutation = useMutation({
    mutationFn: async (payload: {
      quickMessageId: string;
      action: 'SEND_NOW' | 'EDIT_IN_INPUT';
    }) => {
      if (!conversationId) {
        throw new Error('Selecione uma conversa para usar mensagens rapidas.');
      }

      return apiRequest<QuickMessageApplyResponse>(
        `quick-messages/${payload.quickMessageId}/apply`,
        {
          method: 'POST',
          body: {
            conversationId,
            action: payload.action,
          },
        },
      );
    },
    onSuccess: async (response) => {
      if (response.action === 'EDIT_IN_INPUT') {
        onInsertInInput(response.content);
        toast.success('Mensagem aplicada no campo de resposta.');
      } else {
        toast.success('Mensagem rapida enviada ao cliente.');
        await onMessageSent();
      }

      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveQuickMessageMutation = useMutation({
    mutationFn: async () => {
      const trimmedTitle = titleDraft.trim();
      const trimmedContent = contentDraft.trim();

      if (!trimmedTitle || !trimmedContent) {
        throw new Error('Informe titulo e conteudo da mensagem rapida.');
      }

      const payload = {
        title: trimmedTitle,
        content: trimmedContent,
      };

      if (editingId) {
        return apiRequest<QuickMessage>(`quick-messages/${editingId}`, {
          method: 'PATCH',
          body: payload,
        });
      }

      return apiRequest<QuickMessage>('quick-messages', {
        method: 'POST',
        body: payload,
      });
    },
    onSuccess: async () => {
      toast.success(
        editingId
          ? 'Mensagem rapida atualizada com sucesso.'
          : 'Mensagem rapida criada com sucesso.',
      );
      clearForm();
      await queryClient.invalidateQueries({ queryKey: ['quick-messages'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteQuickMessageMutation = useMutation({
    mutationFn: async (quickMessageId: string) => {
      return apiRequest(`quick-messages/${quickMessageId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: async () => {
      toast.success('Mensagem rapida removida.');
      if (editingId) {
        clearForm();
      }
      await queryClient.invalidateQueries({ queryKey: ['quick-messages'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bootstrapQuickMessagesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<{
        createdCount: number;
        totalAvailable: number;
      }>('quick-messages/bootstrap-defaults', {
        method: 'POST',
      });
    },
    onSuccess: async (result) => {
      if (result.createdCount > 0) {
        toast.success(
          `${result.createdCount} templates padrao adicionados com sucesso.`,
        );
      } else {
        toast.success('Os templates padrao ja estavam disponiveis.');
      }
      await queryClient.invalidateQueries({ queryKey: ['quick-messages'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleEdit = (quickMessage: QuickMessage) => {
    setActiveTab('manage');
    setEditingId(quickMessage.id);
    setTitleDraft(quickMessage.title);
    setContentDraft(quickMessage.content);
  };

  const handleDelete = (quickMessage: QuickMessage) => {
    if (
      !window.confirm(
        `Excluir a mensagem rapida "${quickMessage.title}"? Essa acao nao pode ser desfeita.`,
      )
    ) {
      return;
    }

    deleteQuickMessageMutation.mutate(quickMessage.id);
  };

  const totalQuickMessages = quickMessages.length;
  const hasSearch = Boolean(search.trim());
  const isApplyPending = applyQuickMessageMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="min-h-[78vh] max-h-[96vh] w-[min(980px,calc(100vw-0.75rem))] border-white/[0.1] bg-background/96 p-0 sm:min-h-0 sm:h-[min(90vh,860px)] sm:max-h-[90vh] sm:w-[min(940px,calc(100vw-1.25rem))]">
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="border-b border-white/[0.06] bg-background-panel/70 px-4 pb-4 pt-4 pr-12 sm:px-5 sm:pt-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-primary/25 bg-primary/12">
                <MessageSquareText className="h-4 w-4 text-primary" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-[18px] text-white">
                  Mensagens rapidas
                </DialogTitle>
                <DialogDescription className="mt-0.5 max-w-[72ch] text-xs leading-5 text-muted-foreground">
                  Crie respostas prontas, aplique em um clique e mantenha o atendimento mais rapido e padronizado.
                </DialogDescription>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge className="border-primary/20 bg-primary/12 px-2.5 py-1 text-[10px] text-foreground">
                {totalQuickMessages} template{totalQuickMessages === 1 ? '' : 's'}
              </Badge>
              {canManage ? (
                <Badge
                  variant="secondary"
                  className="border-white/[0.08] bg-white/[0.05] px-2.5 py-1 text-[10px]"
                >
                  Gestao habilitada
                </Badge>
              ) : null}
              {isConversationClosed ? (
                <Badge
                  variant="danger"
                  className="border-danger/30 bg-danger/15 px-2.5 py-1 text-[10px]"
                >
                  Conversa encerrada
                </Badge>
              ) : null}
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 pb-5 sm:gap-4 sm:p-5">
            <div className="rounded-[14px] border border-white/[0.08] bg-background-panel/60 p-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.03] text-primary">
                  <Info className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white/92">
                    Personalize com variaveis
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {HELP_TEXT}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {HELP_VARIABLES.map((variable) => (
                  <span
                    key={variable}
                    className="rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[11px] font-medium text-foreground"
                  >
                    {variable}
                  </span>
                ))}
              </div>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(nextValue) =>
                setActiveTab(nextValue === 'manage' ? 'manage' : 'use')
              }
              className="min-h-0 flex-1 overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TabsList className="rounded-[12px] bg-white/[0.03] p-1">
                  <TabsTrigger
                    value="use"
                    className="rounded-[10px] px-3 py-1.5 text-xs data-[state=active]:bg-white/[0.1] data-[state=active]:text-white"
                  >
                    Usar no chat
                  </TabsTrigger>
                  {canManage ? (
                    <TabsTrigger
                      value="manage"
                      className="rounded-[10px] px-3 py-1.5 text-xs data-[state=active]:bg-white/[0.1] data-[state=active]:text-white"
                    >
                      Gerenciar
                    </TabsTrigger>
                  ) : null}
                </TabsList>

                <p className="text-[11px] text-muted-foreground">
                  {hasSearch
                    ? `${filteredQuickMessages.length} resultado${filteredQuickMessages.length === 1 ? '' : 's'}`
                    : `${totalQuickMessages} mensagem${totalQuickMessages === 1 ? '' : 'ens'} disponiveis`}
                </p>
              </div>

              <TabsContent
                value="use"
                className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por titulo ou trecho da mensagem"
                    className="h-10 rounded-[12px] border-white/[0.1] bg-background-soft/70 pl-9 text-sm"
                  />
                </div>

                {isConversationClosed ? (
                  <div className="rounded-[14px] border border-amber-300/20 bg-amber-400/8 px-3 py-2.5 text-xs text-amber-100/90">
                    A conversa esta encerrada. Voce ainda pode inserir no input, mas o envio imediato fica desativado.
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  {quickMessagesQuery.isLoading ? (
                    <div className="space-y-2.5">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div
                          key={index}
                          className="animate-pulse rounded-[14px] border border-white/[0.07] bg-white/[0.025] p-3"
                        >
                          <div className="h-3.5 w-1/3 rounded bg-white/[0.1]" />
                          <div className="mt-2 h-3 w-11/12 rounded bg-white/[0.06]" />
                          <div className="mt-1.5 h-3 w-8/12 rounded bg-white/[0.06]" />
                        </div>
                      ))}
                    </div>
                  ) : filteredQuickMessages.length ? (
                    <div className="space-y-2.5">
                      {filteredQuickMessages.map((quickMessage) => {
                        const updatedLabel = formatQuickMessageTimestamp(
                          quickMessage.updatedAt,
                        );

                        return (
                          <article
                            key={quickMessage.id}
                            className="rounded-[14px] border border-white/[0.08] bg-background-panel/55 p-3.5 transition-all duration-200 hover:border-primary/24 hover:bg-background-panel/70"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">
                                  {quickMessage.title}
                                </p>
                                <p className="mt-1.5 text-xs leading-5 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                                  {quickMessage.content}
                                </p>
                              </div>
                              {canManage ? (
                                <button
                                  type="button"
                                  className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-1.5 text-muted-foreground transition hover:border-primary/28 hover:bg-primary/10 hover:text-primary"
                                  onClick={() => handleEdit(quickMessage)}
                                  aria-label={`Editar mensagem ${quickMessage.title}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70">
                                <Clock3 className="h-3.5 w-3.5 text-primary/85" />
                                {updatedLabel
                                  ? `Atualizada em ${updatedLabel}`
                                  : 'Atualizacao indisponivel'}
                              </div>
                              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="h-9 rounded-[12px] px-3 text-xs"
                                  onClick={() =>
                                    applyQuickMessageMutation.mutate({
                                      quickMessageId: quickMessage.id,
                                      action: 'EDIT_IN_INPUT',
                                    })
                                  }
                                  disabled={isApplyPending}
                                >
                                  Editar no input
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-9 rounded-[12px] px-3 text-xs"
                                  onClick={() =>
                                    applyQuickMessageMutation.mutate({
                                      quickMessageId: quickMessage.id,
                                      action: 'SEND_NOW',
                                    })
                                  }
                                  disabled={isApplyPending || isConversationClosed}
                                >
                                  <SendHorizontal className="h-3.5 w-3.5" />
                                  Enviar agora
                                </Button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-white/[0.12] bg-white/[0.02] px-4 py-8 text-center">
                      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[14px] border border-primary/20 bg-primary/10 text-primary">
                        <MessageSquareText className="h-4 w-4" />
                      </div>
                      <p className="mt-3 text-sm font-medium text-white">
                        Nenhuma mensagem encontrada
                      </p>
                      <p className="mx-auto mt-1.5 max-w-[44ch] text-xs leading-5 text-muted-foreground">
                        {hasSearch
                          ? 'Tente ajustar o filtro de busca para localizar outro template.'
                          : 'Crie sua primeira mensagem rapida na aba Gerenciar para ganhar velocidade no atendimento.'}
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              {canManage ? (
                <TabsContent
                  value="manage"
                  className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
                >
                  <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <section className="rounded-[14px] border border-white/[0.08] bg-background-panel/60 p-3.5 sm:p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">
                            {editingId
                              ? 'Editar mensagem rapida'
                              : 'Nova mensagem rapida'}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Defina um titulo objetivo e um texto pronto para acelerar o atendimento.
                          </p>
                        </div>
                        {editingId ? (
                          <Badge
                            variant="secondary"
                            className="shrink-0 border-primary/20 bg-primary/10 px-2 py-1 text-[10px] text-primary"
                          >
                            Em edicao
                          </Badge>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-3">
                        <div className="space-y-1.5">
                          <Label
                            htmlFor="quick-message-title"
                            className="text-xs text-white/90"
                          >
                            Titulo
                          </Label>
                          <Input
                            id="quick-message-title"
                            value={titleDraft}
                            onChange={(event) => setTitleDraft(event.target.value)}
                            placeholder="Ex.: Retomada de atendimento"
                            className="h-10 rounded-[12px] border-white/[0.1] bg-background-soft/70 text-sm"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label
                            htmlFor="quick-message-content"
                            className="text-xs text-white/90"
                          >
                            Conteudo
                          </Label>
                          <Textarea
                            id="quick-message-content"
                            value={contentDraft}
                            onChange={(event) => setContentDraft(event.target.value)}
                            placeholder="Ex.: Ola {nome}, aqui e {vendedor}, vou dar continuidade ao seu atendimento."
                            className="min-h-28 rounded-[12px] border-white/[0.1] bg-background-soft/70 text-sm leading-5"
                          />
                        </div>

                        <div
                          className={cn(
                            'rounded-[14px] border px-3 py-2.5 text-xs leading-5',
                            contentDraft.trim()
                              ? 'border-white/[0.07] bg-white/[0.03] text-foreground/85'
                              : 'border-dashed border-white/[0.1] bg-white/[0.02] text-muted-foreground',
                          )}
                        >
                          {contentDraft.trim()
                            ? contentDraft
                            : 'Preview: escreva o conteudo para visualizar como a mensagem vai aparecer.'}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] pt-3">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-9 rounded-[12px] px-3 text-xs"
                          onClick={() => bootstrapQuickMessagesMutation.mutate()}
                          disabled={bootstrapQuickMessagesMutation.isPending}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Templates padrao
                        </Button>
                        {editingId ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 rounded-[12px] px-3 text-xs"
                            onClick={clearForm}
                          >
                            Cancelar edicao
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 rounded-[12px] px-3 text-xs"
                          onClick={() => saveQuickMessageMutation.mutate()}
                          disabled={saveQuickMessageMutation.isPending}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {editingId ? 'Salvar alteracoes' : 'Cadastrar mensagem'}
                        </Button>
                      </div>
                    </section>

                    <section className="flex min-h-0 flex-col rounded-[14px] border border-white/[0.08] bg-background-panel/55 p-3.5 sm:p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            Biblioteca de templates
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Clique em editar para carregar no formulario.
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className="border-white/[0.08] bg-white/[0.05] px-2.5 py-1 text-[10px]"
                        >
                          {filteredQuickMessages.length}
                        </Badge>
                      </div>

                      <div className="relative mt-3">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Filtrar templates"
                          className="h-10 rounded-[12px] border-white/[0.1] bg-background-soft/70 pl-9 text-sm"
                        />
                      </div>

                      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                        {filteredQuickMessages.length ? (
                          <div className="space-y-2.5">
                            {filteredQuickMessages.map((quickMessage) => (
                              <article
                                key={quickMessage.id}
                                className="rounded-[14px] border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 transition hover:border-primary/22 hover:bg-primary/7"
                              >
                                <div className="flex items-start justify-between gap-2.5">
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-white">
                                      {quickMessage.title}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                                      {quickMessage.content}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button
                                      type="button"
                                      className="rounded-[10px] p-1.5 text-muted-foreground transition hover:bg-primary/12 hover:text-primary"
                                      onClick={() => handleEdit(quickMessage)}
                                      aria-label={`Editar mensagem ${quickMessage.title}`}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-[10px] p-1.5 text-muted-foreground transition hover:bg-danger/14 hover:text-danger"
                                      onClick={() => handleDelete(quickMessage)}
                                      aria-label={`Excluir mensagem ${quickMessage.title}`}
                                      disabled={deleteQuickMessageMutation.isPending}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-[14px] border border-dashed border-white/[0.12] bg-white/[0.02] px-3 py-5 text-center text-xs text-muted-foreground">
                            {hasSearch
                              ? 'Nenhum template corresponde a essa busca.'
                              : 'Nenhuma mensagem rapida cadastrada ainda.'}
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                </TabsContent>
              ) : null}
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
