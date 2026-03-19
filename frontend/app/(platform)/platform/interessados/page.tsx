'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api-client';
import {
  PlatformLeadInterest,
  PlatformLeadInterestStatus,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATUS_OPTIONS: Array<{
  value: PlatformLeadInterestStatus;
  label: string;
}> = [
  { value: 'PENDING', label: 'Pendente' },
  { value: 'CONTACTED', label: 'Contatado' },
  { value: 'CONVERTED', label: 'Convertido' },
  { value: 'ARCHIVED', label: 'Arquivado' },
];

function statusLabel(status: PlatformLeadInterestStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function statusClassName(status: PlatformLeadInterestStatus) {
  if (status === 'CONVERTED') {
    return 'border-primary/40 bg-primary-soft text-primary';
  }

  if (status === 'CONTACTED') {
    return 'border-secondary/35 bg-secondary/12 text-secondary';
  }

  if (status === 'ARCHIVED') {
    return 'border-border/70 bg-white/5 text-muted-foreground';
  }

  return 'border-border-strong bg-background-panel/55 text-foreground/90';
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'n/d';
  }

  return new Date(value).toLocaleString('pt-BR');
}

export default function PlatformLeadInterestsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | PlatformLeadInterestStatus>('ALL');
  const [sort, setSort] = useState<'createdAt_desc' | 'createdAt_asc'>('createdAt_desc');

  const leadInterestsQuery = useQuery({
    queryKey: ['platform-lead-interests', search, status, sort],
    queryFn: () =>
      apiRequest<PlatformLeadInterest[]>(
        `platform-admin/lead-interests?search=${encodeURIComponent(search)}${status === 'ALL' ? '' : `&status=${status}`}&sort=${sort}`,
      ),
  });

  const updateStatusMutation = useMutation({
    mutationFn: (payload: { leadInterestId: string; nextStatus: PlatformLeadInterestStatus }) =>
      apiRequest(`platform-admin/lead-interests/${payload.leadInterestId}`, {
        method: 'PATCH',
        body: {
          status: payload.nextStatus,
        },
      }),
    onSuccess: () => {
      toast.success('Status atualizado.');
      queryClient.invalidateQueries({ queryKey: ['platform-lead-interests'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusTotals = useMemo(() => {
    const base: Record<'PENDING' | 'CONTACTED' | 'CONVERTED' | 'ARCHIVED', number> = {
      PENDING: 0,
      CONTACTED: 0,
      CONVERTED: 0,
      ARCHIVED: 0,
    };

    for (const lead of leadInterestsQuery.data ?? []) {
      base[lead.status] += 1;
    }

    return base;
  }, [leadInterestsQuery.data]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Interessados</h1>
        <p className="text-sm text-muted-foreground">
          Leads recebidos pela home publica no formulario Quero ser cliente.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STATUS_OPTIONS.map((option) => (
          <Card key={option.value}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{option.label}</p>
              <p className="mt-1 text-2xl font-semibold">{statusTotals[option.value]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_220px_220px]">
          <Input
            placeholder="Buscar por nome, email, telefone ou empresa"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select value={status} onValueChange={(value) => setStatus(value as 'ALL' | PlatformLeadInterestStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os status</SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setSort(value as 'createdAt_desc' | 'createdAt_asc')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt_desc">Mais recentes</SelectItem>
              <SelectItem value="createdAt_asc">Mais antigos</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leads capturados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(leadInterestsQuery.data ?? []).map((lead) => (
            <div key={lead.id} className="rounded-2xl border border-border/70 bg-background-panel/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold leading-tight">{lead.name}</p>
                  <p className="text-sm text-muted-foreground">{lead.email}</p>
                  <p className="text-xs text-muted-foreground">Enviado em {formatDate(lead.createdAt)}</p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClassName(lead.status)}`}
                >
                  {statusLabel(lead.status)}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-foreground/88 md:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Telefone:</span> {lead.phone || 'n/d'}
                </p>
                <p>
                  <span className="text-muted-foreground">Empresa:</span> {lead.companyName || 'n/d'}
                </p>
                <p>
                  <span className="text-muted-foreground">Qtd. atendentes:</span>{' '}
                  {lead.attendantsCount ?? 'n/d'}
                </p>
                <p>
                  <span className="text-muted-foreground">Fonte:</span> {lead.source || 'n/d'}
                </p>
              </div>

              {lead.notes ? (
                <div className="mt-2 rounded-xl border border-border/70 bg-background-panel/45 px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Observacoes</p>
                  <p className="mt-1 text-sm text-foreground/90">{lead.notes}</p>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {STATUS_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={lead.status === option.value ? 'default' : 'secondary'}
                    disabled={updateStatusMutation.isPending || lead.status === option.value}
                    onClick={() =>
                      updateStatusMutation.mutate({
                        leadInterestId: lead.id,
                        nextStatus: option.value,
                      })
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}

          {!leadInterestsQuery.isLoading && (leadInterestsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum interessado encontrado com os filtros atuais.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
