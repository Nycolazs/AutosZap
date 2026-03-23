'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bug,
  CircleHelp,
  HelpCircle,
  Lightbulb,
  Loader2,
  TicketCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiRequest } from '@/lib/api-client';
import { cn, formatDate } from '@/lib/utils';

type TicketCategory = 'IMPROVEMENT' | 'BUG' | 'QUESTION';
type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

type SupportTicket = {
  id: string;
  title: string;
  body: string;
  category: TicketCategory;
  status: TicketStatus;
  companyName: string;
  authorName: string;
  authorEmail: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PaginatedTickets = {
  data: SupportTicket[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

const CATEGORY_CONFIG: Record<TicketCategory, { label: string; icon: React.ElementType; color: string }> = {
  IMPROVEMENT: { label: 'Melhoria', icon: Lightbulb, color: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
  BUG: { label: 'Bug / Correção', icon: Bug, color: 'border-red-500/30 bg-red-500/10 text-red-400' },
  QUESTION: { label: 'Dúvida', icon: HelpCircle, color: 'border-blue-500/30 bg-blue-500/10 text-blue-400' },
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string }> = {
  OPEN: { label: 'Aberto', color: 'border-primary/30 bg-primary/10 text-primary' },
  IN_PROGRESS: { label: 'Em análise', color: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
  RESOLVED: { label: 'Resolvido', color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
  CLOSED: { label: 'Encerrado', color: 'border-border bg-white/[0.04] text-muted-foreground' },
};

const NEXT_STATUS: Partial<Record<TicketStatus, TicketStatus>> = {
  OPEN: 'IN_PROGRESS',
  IN_PROGRESS: 'RESOLVED',
  RESOLVED: 'CLOSED',
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'OPEN', label: 'Abertos' },
  { value: 'IN_PROGRESS', label: 'Em análise' },
  { value: 'RESOLVED', label: 'Resolvidos' },
  { value: 'CLOSED', label: 'Encerrados' },
];

export default function PlatformSupportePage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);

  const ticketsQuery = useQuery({
    queryKey: ['platform-support-tickets', statusFilter],
    queryFn: () =>
      apiRequest<PaginatedTickets>(
        `platform-admin/support-tickets${statusFilter ? `?status=${statusFilter}` : ''}`,
      ),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TicketStatus }) =>
      apiRequest<SupportTicket>(`platform-admin/support-tickets/${id}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform-support-tickets'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const tickets = ticketsQuery.data?.data ?? [];
  const meta = ticketsQuery.data?.meta;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-[20px] font-semibold">
          <TicketCheck className="h-5 w-5 text-primary" />
          Chamados de Suporte
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chamados abertos pelos clientes da plataforma.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((status) => {
          const conf = STATUS_CONFIG[status as TicketStatus];
          const count = (ticketsQuery.data?.data ?? []).filter((t) => t.status === status).length;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
              className={cn(
                'rounded-xl border p-3 text-left transition hover:border-primary/30',
                statusFilter === status ? 'border-primary/50 bg-primary/5' : 'border-border bg-white/[0.02]',
              )}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{conf.label}</p>
              <p className="mt-1 text-xl font-semibold">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0 rounded-xl bg-white/[0.04] p-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-[13px] font-medium transition',
              statusFilter === f.value
                ? 'bg-white/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
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
          <p className="text-sm text-muted-foreground">Nenhum chamado encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {meta && (
            <p className="text-[12px] text-muted-foreground">
              {meta.total} chamado{meta.total !== 1 ? 's' : ''}
            </p>
          )}
          {tickets.map((ticket) => {
            const categoryConf = CATEGORY_CONFIG[ticket.category];
            const statusConf = STATUS_CONFIG[ticket.status];
            const CategoryIcon = categoryConf.icon;
            const nextStatus = NEXT_STATUS[ticket.status];
            const isExpanded = expandedTicket === ticket.id;

            return (
              <Card key={ticket.id} className="p-0">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', categoryConf.color)}>
                      <CategoryIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="text-left text-[15px] font-medium hover:text-primary transition-colors"
                            onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                          >
                            {ticket.title}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground/70">{ticket.companyName}</span>
                            <span>·</span>
                            <span>{ticket.authorName}</span>
                            <span>·</span>
                            <span>{ticket.authorEmail}</span>
                            <span>·</span>
                            <span>{formatDate(ticket.createdAt)}</span>
                          </div>
                          {isExpanded && (
                            <p className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-white/[0.03] p-3 text-[13px] leading-5 text-foreground/80">
                              {ticket.body}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <div className="flex gap-1.5">
                            <Badge className={cn('text-[10px]', statusConf.color)}>{statusConf.label}</Badge>
                            <Badge className={cn('text-[10px]', categoryConf.color)}>{categoryConf.label}</Badge>
                          </div>
                          {nextStatus && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-7 text-[11px]"
                              disabled={updateStatusMutation.isPending}
                              onClick={() => updateStatusMutation.mutate({ id: ticket.id, status: nextStatus })}
                            >
                              Mover para: {STATUS_CONFIG[nextStatus].label}
                            </Button>
                          )}
                        </div>
                      </div>
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
