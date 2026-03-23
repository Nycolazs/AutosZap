'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bug,
  CircleHelp,
  HelpCircle,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  TicketCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
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

const CATEGORY_CONFIG: Record<TicketCategory, { label: string; icon: React.ElementType; color: string }> = {
  IMPROVEMENT: {
    label: 'Melhoria',
    icon: Lightbulb,
    color: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  },
  BUG: {
    label: 'Bug / Correção',
    icon: Bug,
    color: 'border-red-500/30 bg-red-500/10 text-red-400',
  },
  QUESTION: {
    label: 'Dúvida',
    icon: HelpCircle,
    color: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  },
};

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string }> = {
  OPEN: { label: 'Aberto', color: 'border-primary/30 bg-primary/10 text-primary' },
  IN_PROGRESS: { label: 'Em análise', color: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
  RESOLVED: { label: 'Resolvido', color: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' },
  CLOSED: { label: 'Encerrado', color: 'border-border bg-white/[0.04] text-muted-foreground' },
};

export default function SupportePage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<TicketCategory | ''>('');

  const ticketsQuery = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => apiRequest<SupportTicket[]>('platform/support-tickets'),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!title.trim() || title.length < 5) throw new Error('Titulo deve ter ao menos 5 caracteres.');
      if (!body.trim() || body.length < 10) throw new Error('Descricao deve ter ao menos 10 caracteres.');
      if (!category) throw new Error('Selecione uma categoria.');

      return apiRequest<SupportTicket>('platform/support-tickets', {
        method: 'POST',
        body: { title: title.trim(), body: body.trim(), category },
      });
    },
    onSuccess: async () => {
      toast.success('Chamado aberto com sucesso!');
      setDialogOpen(false);
      setTitle('');
      setBody('');
      setCategory('');
      await queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const tickets = ticketsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suporte"
        description="Abra um chamado para relatar um problema, sugerir uma melhoria ou tirar uma duvida."
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <MessageSquarePlus className="h-4 w-4" />
            Abrir chamado
          </Button>
        }
      />

      {/* Info card */}
      <Card className="border-primary/20 bg-primary/[0.04]">
        <CardContent className="flex items-start gap-3 p-4">
          <TicketCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Como funciona?</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Abra um chamado descrevendo sua necessidade. Nossa equipe de suporte vai analisar e responder o mais rapido possivel. Em breve, voce podera conversar diretamente com nossa IA de suporte.
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
            return (
              <Card key={ticket.id} className="p-0">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', categoryConf.color)}>
                        <CategoryIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-5">{ticket.title}</p>
                        <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">{ticket.body}</p>
                        <p className="mt-2 text-[11px] text-muted-foreground/60">
                          Aberto em {formatDate(ticket.createdAt)}
                          {ticket.resolvedAt ? ` · Resolvido em ${formatDate(ticket.resolvedAt)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge className={cn('text-[10px]', statusConf.color)}>{statusConf.label}</Badge>
                      <Badge className={cn('text-[10px]', categoryConf.color)}>{categoryConf.label}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create ticket dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Abrir chamado</DialogTitle>
            <DialogDescription>
              Descreva sua necessidade e nossa equipe entrara em contato.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Category selection */}
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(CATEGORY_CONFIG) as [TicketCategory, typeof CATEGORY_CONFIG[TicketCategory]][]).map(([key, conf]) => {
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
                      <span className="text-[11px] font-medium leading-3">{conf.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input
                placeholder="Resumo do que aconteceu ou precisa..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
              <p className="text-right text-[10px] text-muted-foreground">{title.length}/120</p>
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                placeholder="Descreva com detalhes o problema, melhoria ou duvida. Quanto mais informacoes, mais rapido conseguimos ajudar."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[120px] resize-none text-sm"
                maxLength={5000}
              />
              <p className="text-right text-[10px] text-muted-foreground">{body.length}/5000</p>
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
