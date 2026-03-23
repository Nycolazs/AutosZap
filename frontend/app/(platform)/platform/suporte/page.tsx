'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bug,
  ChevronDown,
  CircleHelp,
  HelpCircle,
  Lightbulb,
  Loader2,
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { cn, formatDate } from '@/lib/utils';

type PaginatedTickets = {
  data: SupportTicketSummary[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

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

const NEXT_STATUS: Partial<Record<TicketStatus, TicketStatus>> = {
  OPEN: 'IN_PROGRESS',
  IN_PROGRESS: 'RESOLVED',
  RESOLVED: 'CLOSED',
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'OPEN', label: 'Abertos' },
  { value: 'IN_PROGRESS', label: 'Em analise' },
  { value: 'RESOLVED', label: 'Resolvidos' },
  { value: 'CLOSED', label: 'Encerrados' },
];

export default function PlatformSuportePage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const ticketsQuery = useQuery({
    queryKey: ['platform-support-tickets', statusFilter],
    queryFn: () =>
      apiRequest<PaginatedTickets>(
        `platform-admin/support-tickets${statusFilter ? `?status=${statusFilter}` : ''}`,
      ),
  });

  const countsQuery = useQuery({
    queryKey: ['platform-support-tickets-counts'],
    queryFn: () =>
      apiRequest<{
        OPEN: number;
        IN_PROGRESS: number;
        RESOLVED: number;
        CLOSED: number;
      }>('platform-admin/support-tickets/counts'),
  });

  const ticketDetailQuery = useQuery({
    queryKey: ['platform-support-ticket', expandedTicket],
    enabled: Boolean(expandedTicket),
    queryFn: () =>
      apiRequest<SupportTicketDetail>(
        `platform-admin/support-tickets/${expandedTicket}`,
      ),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TicketStatus }) =>
      apiRequest<SupportTicketSummary>(`platform-admin/support-tickets/${id}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform-support-tickets'] }),
        queryClient.invalidateQueries({
          queryKey: ['platform-support-tickets-counts'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['platform-support-ticket', variables.id],
        }),
      ]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const replyMutation = useMutation({
    mutationFn: ({ ticketId, messageBody }: { ticketId: string; messageBody: string }) =>
      apiRequest<SupportTicketDetail>(`platform-admin/support-tickets/${ticketId}/messages`, {
        method: 'POST',
        body: { body: messageBody },
      }),
    onSuccess: async (ticket) => {
      toast.success('Resposta enviada. O cliente foi notificado.');
      setReplyDrafts((current) => ({
        ...current,
        [ticket.id]: '',
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform-support-tickets'] }),
        queryClient.invalidateQueries({
          queryKey: ['platform-support-ticket', ticket.id],
        }),
      ]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const tickets = ticketsQuery.data?.data ?? [];
  const meta = ticketsQuery.data?.meta;

  function updateReplyDraft(ticketId: string, value: string) {
    setReplyDrafts((current) => ({
      ...current,
      [ticketId]: value,
    }));
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-[20px] font-semibold">
          <TicketCheck className="h-5 w-5 text-primary" />
          Chamados de Suporte
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Converse com o cliente no proprio ticket e controle o status por aqui.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as TicketStatus[]).map(
          (status) => {
            const conf = STATUS_CONFIG[status];
            const count = countsQuery.data?.[status] ?? 0;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
                className={cn(
                  'rounded-xl border p-3 text-left transition hover:border-primary/30',
                  statusFilter === status
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border bg-white/[0.02]',
                )}
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  {conf.label}
                </p>
                <p className="mt-1 text-xl font-semibold">{count}</p>
              </button>
            );
          },
        )}
      </div>

      <div className="flex gap-0 rounded-xl bg-white/[0.04] p-1">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-[13px] font-medium transition',
              statusFilter === filter.value
                ? 'bg-white/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {ticketsQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16">
          <CircleHelp className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Nenhum chamado encontrado.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {meta ? (
            <p className="text-[12px] text-muted-foreground">
              {meta.total} chamado{meta.total !== 1 ? 's' : ''}
            </p>
          ) : null}

          {tickets.map((ticket) => {
            const categoryConf = CATEGORY_CONFIG[ticket.category];
            const statusConf = STATUS_CONFIG[ticket.status];
            const CategoryIcon = categoryConf.icon;
            const nextStatus = NEXT_STATUS[ticket.status];
            const isExpanded = expandedTicket === ticket.id;
            const detail = isExpanded ? ticketDetailQuery.data : null;
            const replyDraft = replyDrafts[ticket.id] ?? '';

            return (
              <Card key={ticket.id} className="overflow-hidden p-0">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                        categoryConf.color,
                      )}
                    >
                      <CategoryIcon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="text-left text-[15px] font-medium transition-colors hover:text-primary"
                            onClick={() =>
                              setExpandedTicket(isExpanded ? null : ticket.id)
                            }
                          >
                            {ticket.title}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground/70">
                              {ticket.companyName}
                            </span>
                            <span>·</span>
                            <span>{ticket.authorName}</span>
                            <span>·</span>
                            <span>{ticket.authorEmail}</span>
                            <span>·</span>
                            <span>{formatDate(ticket.createdAt)}</span>
                            {ticket.updatedAt !== ticket.createdAt ? (
                              <>
                                <span>·</span>
                                <span>Ultima atividade {formatDate(ticket.updatedAt)}</span>
                              </>
                            ) : null}
                          </div>
                          <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">
                            {ticket.body}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <div className="flex gap-1.5">
                            <Badge className={cn('text-[10px]', statusConf.color)}>
                              {statusConf.label}
                            </Badge>
                            <Badge className={cn('text-[10px]', categoryConf.color)}>
                              {categoryConf.label}
                            </Badge>
                          </div>
                          <div className="flex flex-col items-end gap-2 sm:flex-row">
                            {nextStatus ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-8 text-[11px]"
                                disabled={updateStatusMutation.isPending}
                                onClick={() =>
                                  updateStatusMutation.mutate({
                                    id: ticket.id,
                                    status: nextStatus,
                                  })
                                }
                              >
                                Mover para: {STATUS_CONFIG[nextStatus].label}
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
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
                      </div>

                      {isExpanded ? (
                        <div className="mt-4 space-y-4 border-t border-border pt-4">
                          {ticketDetailQuery.isLoading ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                          ) : detail?.id === ticket.id ? (
                            <>
                              <SupportTicketThread
                                ticket={detail}
                                viewer="platform"
                              />

                              <div className="rounded-[24px] border border-border bg-white/[0.03] p-4">
                                <div className="space-y-2">
                                  <Label htmlFor={`platform-ticket-reply-${ticket.id}`}>
                                    Responder ao cliente
                                  </Label>
                                  <Textarea
                                    id={`platform-ticket-reply-${ticket.id}`}
                                    placeholder="Escreva a resposta do suporte..."
                                    value={replyDraft}
                                    onChange={(event) =>
                                      updateReplyDraft(ticket.id, event.target.value)
                                    }
                                    className="min-h-[120px] resize-none text-sm"
                                    maxLength={5000}
                                  />
                                  <div className="flex flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                                    <p>
                                      Quando voce responder, o autor do chamado
                                      recebe um alerta no app.
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
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
