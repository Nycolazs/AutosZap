'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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

  const clearForm = () => {
    setEditingId(null);
    setTitleDraft('');
    setContentDraft('');
  };

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:min-h-[76vh] sm:max-h-[90vh] sm:w-[min(760px,calc(100vw-1rem))]">
        <DialogHeader>
          <DialogTitle>Mensagens rapidas</DialogTitle>
          <DialogDescription>
            Ganhe velocidade no atendimento com respostas prontas e personalizadas.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-background-panel/70 p-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
              Dica
            </span>
            <p className="text-xs text-muted-foreground">{HELP_TEXT}</p>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(nextValue) => setActiveTab(nextValue as 'use' | 'manage')}
          className="min-h-0 flex-1 overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="use">Usar no chat</TabsTrigger>
              {canManage ? <TabsTrigger value="manage">Gerenciar</TabsTrigger> : null}
            </TabsList>
          </div>

          <TabsContent value="use" className="min-h-0 space-y-3 overflow-hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por titulo ou trecho da mensagem"
                className="pl-9"
              />
            </div>

            <div className="max-h-[44vh] space-y-2 overflow-y-auto pr-1">
              {quickMessagesQuery.isLoading ? (
                <p className="rounded-xl border border-border bg-white/[0.02] px-3 py-4 text-sm text-muted-foreground">
                  Carregando mensagens rapidas...
                </p>
              ) : filteredQuickMessages.length ? (
                filteredQuickMessages.map((quickMessage) => (
                  <div
                    key={quickMessage.id}
                    className="rounded-xl border border-border bg-white/[0.03] px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{quickMessage.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {quickMessage.content}
                        </p>
                      </div>
                      {canManage ? (
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                          onClick={() => handleEdit(quickMessage)}
                          aria-label={`Editar mensagem ${quickMessage.title}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          applyQuickMessageMutation.mutate({
                            quickMessageId: quickMessage.id,
                            action: 'EDIT_IN_INPUT',
                          })
                        }
                        disabled={applyQuickMessageMutation.isPending}
                      >
                        Editar no input
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          applyQuickMessageMutation.mutate({
                            quickMessageId: quickMessage.id,
                            action: 'SEND_NOW',
                          })
                        }
                        disabled={
                          applyQuickMessageMutation.isPending ||
                          isConversationClosed
                        }
                      >
                        <SendHorizontal className="h-3.5 w-3.5" />
                        Enviar agora
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  Nenhuma mensagem rapida encontrada para esse filtro.
                </p>
              )}
            </div>
          </TabsContent>

          {canManage ? (
            <TabsContent value="manage" className="min-h-0 space-y-3 overflow-hidden">
              <div className="space-y-2 rounded-xl border border-border bg-white/[0.03] p-3">
                <div className="space-y-1">
                  <Label htmlFor="quick-message-title">Titulo</Label>
                  <Input
                    id="quick-message-title"
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    placeholder="Ex.: Retomada de atendimento"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="quick-message-content">Conteudo</Label>
                  <Textarea
                    id="quick-message-content"
                    value={contentDraft}
                    onChange={(event) => setContentDraft(event.target.value)}
                    placeholder="Ex.: Ola {nome}, aqui e {vendedor}, vou dar continuidade ao seu atendimento."
                    className="min-h-24"
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => bootstrapQuickMessagesMutation.mutate()}
                    disabled={bootstrapQuickMessagesMutation.isPending}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Adicionar templates padrao
                  </Button>
                  {editingId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearForm}
                    >
                      Cancelar edicao
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => saveQuickMessageMutation.mutate()}
                    disabled={saveQuickMessageMutation.isPending}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {editingId ? 'Salvar alteracoes' : 'Cadastrar mensagem'}
                  </Button>
                </div>
              </div>

              <div className="max-h-[34vh] space-y-2 overflow-y-auto pr-1">
                {filteredQuickMessages.length ? (
                  filteredQuickMessages.map((quickMessage) => (
                    <div
                      key={quickMessage.id}
                      className="flex items-start justify-between gap-2 rounded-xl border border-border bg-white/[0.02] px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{quickMessage.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {quickMessage.content}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                          onClick={() => handleEdit(quickMessage)}
                          aria-label={`Editar mensagem ${quickMessage.title}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-danger/15 hover:text-danger"
                          onClick={() => handleDelete(quickMessage)}
                          aria-label={`Excluir mensagem ${quickMessage.title}`}
                          disabled={deleteQuickMessageMutation.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                    Nenhuma mensagem rapida cadastrada ainda.
                  </p>
                )}
              </div>
            </TabsContent>
          ) : null}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
