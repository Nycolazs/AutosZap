'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bug,
  ChevronDown,
  CircleHelp,
  HelpCircle,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Send,
  TicketCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { SupportTicketThread } from '@/components/support/support-ticket-thread';
import type {
  SupportTicketDetail,
  SupportTicketSummary,
  TicketCategory,
  TicketStatus,
} from '@/components/support/support-ticket-types';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { cn, formatDate } from '@/lib/utils';

const CATEGORY_CONFIG: Record<
  TicketCategory,
  { label: string; icon: React.ElementType; color: string }
> = {
  IMPROVEMENT: {
    label: 'Melhoria',
    icon: Lightbulb,
    color: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  },
  BUG: {
    label: 'Bug / Correcao',
    icon: Bug,
    color: 'border-red-500/30 bg-red-500/10 text-red-400',
  },
  QUESTION: {
    label: 'Duvida',
    icon: HelpCircle,
    color: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  },
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string }> = {
  OPEN: { label: 'Aberto', color: 'border-primary/30 bg-primary/10 text-primary' },
  IN_PROGRESS: {
    label: 'Em analise',
    color: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  },
  RESOLVED: {
    label: 'Resolvido',
    color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  },
  CLOSED: {
    label: 'Encerrado',
    color: 'border-border bg-white/[0.04] text-muted-foreground',
  },
};

export default function SuportePage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const highlightedTicketId = searchParams.get('ticket');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<TicketCategory | ''>('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (highlightedTicketId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpandedTicket(highlightedTicketId);
    }
  }, [highlightedTicketId]);

  const ticketsQuery = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => apiRequest<SupportTicketSummary[]>('platform/support-tickets'),
  });

  const ticketDetailQuery = useQuery({
    queryKey: ['support-ticket', expandedTicket],
    enabled: Boolean(expandedTicket),
    queryFn: () =>
      apiRequest<SupportTicketDetail>(
        `platform/support-tickets/${expandedTicket}`,
      ),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!title.trim() || title.trim().length < 5) {
        throw new Error('Titulo deve ter ao menos 5 caracteres.');
      }
      if (!body.trim() || body.trim().length < 10) {
        throw new Error('Descricao deve ter ao menos 10 caracteres.');
      }
      if (!category) {
        throw new Error('Selecione uma categoria.');
      }

      return apiRequest<SupportTicketSummary>('platform/support-tickets', {
        method: 'POST',
        body: { title: title.trim(), body: body.trim(), category },
      });
    },
    onSuccess: async (ticket) => {
      toast.success('Chamado aberto com sucesso!');
      setDialogOpen(false);
      setTitle('');
      setBody('');
      setCategory('');
      setExpandedTicket(ticket.id);
      await queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const replyMutation = useMutation({
    mutationFn: ({ ticketId, messageBody }: { ticketId: string; messageBody: string }) =>
      apiRequest<SupportTicketDetail>(`platform/support-tickets/${ticketId}/messages`, {
        method: 'POST',
        body: { body: messageBody },
      }),
    onSuccess: async (ticket) => {
      toast.success('Resposta enviada para o suporte.');
      setReplyDrafts((current) => ({
        ...current,
        [ticket.id]: '',
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['support-tickets'] }),
        queryClient.invalidateQueries({ queryKey: ['support-ticket', ticket.id] }),
      ]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const tickets = ticketsQuery.data ?? [];

  function updateReplyDraft(ticketId: string, value: string) {
    setReplyDrafts((current) => ({
      ...current,
      [ticketId]: value,
    }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suporte"
        description="Abra um chamado, acompanhe a conversa e responda diretamente ao time da plataforma."
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <MessageSquarePlus className="h-4 w-4" />
            Abrir chamado
          </Button>
        }
      />

      <Card className="border-primary/20 bg-primary/[0.04]">
        <CardContent className="flex items-start gap-3 p-4">
          <TicketCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Como funciona?</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Abra um chamado descrevendo sua necessidade. O suporte pode responder
              por aqui e voce continua a conversa no mesmo ticket ate a resolucao.
            </p>
          </div>
        </CardContent>
      </Card>

      {ticketsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={CircleHelp}
          title="Nenhum chamado aberto"
          description="Abra um chamado para falar com o suporte."
        />
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const categoryConf = CATEGORY_CONFIG[ticket.category];
            const statusConf = STATUS_CONFIG[ticket.status];
            const CategoryIcon = categoryConf.icon;
            const isExpanded = expandedTicket === ticket.id;
            const detail = isExpanded ? ticketDetailQuery.data : null;
            const replyDraft = replyDrafts[ticket.id] ?? '';

            return (
              <Card key={ticket.id} className="overflow-hidden p-0">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div
                        className={cn(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                          categoryConf.color,
                        )}
                      >
                        <CategoryIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTicket(isExpanded ? null : ticket.id)
                          }
                          className="text-left transition-colors hover:text-primary"
                        >
                          <p className="font-medium leading-5">{ticket.title}</p>
                        </button>
                        <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
                          {ticket.body}
                        </p>
                        <p className="mt-2 text-[11px] text-muted-foreground/70">
                          Aberto em {formatDate(ticket.createdAt)}
                          {ticket.updatedAt !== ticket.createdAt
                            ? ` · Ultima atividade em ${formatDate(ticket.updatedAt)}`
                            : ''}
                          {ticket.resolvedAt
                            ? ` · Resolvido em ${formatDate(ticket.resolvedAt)}`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Badge className={cn('text-[10px]', statusConf.color)}>
                          {statusConf.label}
                        </Badge>
                        <Badge className={cn('text-[10px]', categoryConf.color)}>
                          {categoryConf.label}
                        </Badge>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 gap-1.5 text-[11px]"
                        onClick={() =>
                          setExpandedTicket(isExpanded ? null : ticket.id)
                        }
                      >
                        {isExpanded ? 'Ocultar conversa' : 'Abrir conversa'}
                        <ChevronDown
                          className={cn(
                            'h-3.5 w-3.5 transition-transform',
                            isExpanded ? 'rotate-180' : 'rotate-0',
                          )}
                        />
                      </Button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-4 space-y-4 border-t border-border pt-4">
                      {ticketDetailQuery.isLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : detail?.id === ticket.id ? (
                        <>
                          <SupportTicketThread ticket={detail} viewer="customer" />

                          <div className="rounded-[24px] border border-border bg-white/[0.03] p-4">
                            <div className="space-y-2">
                              <Label htmlFor={`ticket-reply-${ticket.id}`}>
                                Responder ao suporte
                              </Label>
                              <Textarea
                                id={`ticket-reply-${ticket.id}`}
                                placeholder="Escreva sua resposta para continuar a conversa..."
                                value={replyDraft}
                                onChange={(event) =>
                                  updateReplyDraft(ticket.id, event.target.value)
                                }
                                className="min-h-[120px] resize-none text-sm"
                                maxLength={5000}
                              />
                              <div className="flex flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                                <p>
                                  O status do chamado e atualizado apenas pela equipe
                                  da plataforma.
                                </p>
                                <span>{replyDraft.length}/5000</span>
                              </div>
                            </div>

                            <div className="mt-3 flex justify-end">
                              <Button
                                onClick={() =>
                                  replyMutation.mutate({
                                    ticketId: ticket.id,
                                    messageBody: replyDraft.trim(),
                                  })
                                }
                                disabled={
                                  replyMutation.isPending || !replyDraft.trim()
                                }
                              >
                                {replyMutation.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Send className="mr-2 h-4 w-4" />
                                )}
                                Enviar resposta
                              </Button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                          Nao foi possivel carregar a conversa deste chamado agora.
                        </div>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg sm:max-w-xl sm:h-[min(580px,calc(100dvh-2rem))] sm:overflow-hidden">
          <DialogHeader>
            <DialogTitle>Abrir chamado</DialogTitle>
            <DialogDescription>
              Descreva sua necessidade e o suporte respondera no proprio ticket.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  Object.entries(CATEGORY_CONFIG) as [
                    TicketCategory,
                    (typeof CATEGORY_CONFIG)[TicketCategory],
                  ][]
                ).map(([key, conf]) => {
                  const Icon = conf.icon;
                  const selected = category === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCategory(key)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition',
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-white/[0.03] text-muted-foreground hover:border-primary/30 hover:text-foreground',
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-[11px] font-medium leading-3">
                        {conf.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Titulo</Label>
              <Input
                placeholder="Resumo do que aconteceu ou precisa..."
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
              />
              <p className="text-right text-[10px] text-muted-foreground">
                {title.length}/120
              </p>
            </div>

            <div className="flex min-h-0 flex-1 flex-col space-y-1.5">
              <Label>Descricao</Label>
              <Textarea
                placeholder="Descreva com detalhes o problema, melhoria ou duvida. Quanto mais contexto, mais rapido conseguimos ajudar."
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-[180px] resize-none text-sm sm:min-h-0 sm:flex-1"
                maxLength={5000}
              />
              <p className="text-right text-[10px] text-muted-foreground">
                {body.length}/5000
              </p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !category || !title.trim() || !body.trim()}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MessageSquarePlus className="mr-2 h-4 w-4" />
              )}
              Enviar chamado
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
