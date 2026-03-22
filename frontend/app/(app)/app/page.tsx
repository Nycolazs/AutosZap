'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, MessageSquareText, Send, Trophy, Users } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest } from '@/lib/api-client';
import { DashboardOverview, DashboardPerformance } from '@/lib/types';
import { formatDate } from '@/lib/utils';

function formatDuration(milliseconds: number | null) {
  if (!milliseconds) {
    return '-';
  }

  const totalMinutes = Math.max(1, Math.round(milliseconds / 60000));

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
}

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 1000 * 60 * 60 * 24 * 30);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

const EMPTY_DASHBOARD_OVERVIEW: DashboardOverview = {
  metrics: {
    activeConversations: 0,
    totalContacts: 0,
    responseRate: 0,
    sentCampaigns: 0,
    crmLeads: 0,
    quickMessagesUsed: 0,
    assignmentAutoMessagesSent: 0,
  },
  chart: [],
  recentActivity: [],
  notifications: [],
  shortcuts: [],
};

const EMPTY_DASHBOARD_PERFORMANCE: DashboardPerformance = {
  period: {
    from: '',
    to: '',
  },
  totals: {
    resolvedCount: 0,
    closedCount: 0,
    assignedCount: 0,
    avgFirstResponseMs: null,
    avgResolutionMs: null,
  },
  chart: [],
  ranking: [],
};

export default function DashboardPage() {
  const defaultDateRange = useMemo(() => getDefaultDateRange(), []);
  const [from, setFrom] = useState(defaultDateRange.from);
  const [to, setTo] = useState(defaultDateRange.to);
  const [selectedUserId, setSelectedUserId] = useState<string>('ALL');

  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiRequest<DashboardOverview>('dashboard'),
    retry: 2,
  });
  const performanceQuery = useQuery({
    queryKey: ['dashboard-performance', from, to, selectedUserId],
    queryFn: () =>
      apiRequest<DashboardPerformance>(
        `dashboard/performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${
          selectedUserId !== 'ALL' ? `&userId=${encodeURIComponent(selectedUserId)}` : ''
        }`,
      ),
    retry: 2,
  });

  const isInitialLoading =
    (!dashboardQuery.data && dashboardQuery.isLoading) ||
    (!performanceQuery.data && performanceQuery.isLoading);

  if (isInitialLoading) {
    return (
      <div className="space-y-5 2xl:space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7 2xl:gap-4">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const overview = dashboardQuery.data ?? EMPTY_DASHBOARD_OVERVIEW;
  const performance = performanceQuery.data ?? EMPTY_DASHBOARD_PERFORMANCE;
  const hasErrors = dashboardQuery.isError || performanceQuery.isError;
  const shouldShowErrorBanner =
    hasErrors && !dashboardQuery.data && !performanceQuery.data;

  return (
    <div className="space-y-5 2xl:space-y-6">
      <PageHeader
        title="Painel inicial"
        description="Acompanhe a operação em tempo real e compare a performance dos vendedores por conversas resolvidas."
      />

      {shouldShowErrorBanner ? (
        <div className="rounded-[20px] border border-danger/20 bg-danger/8 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-danger">
                Nao foi possivel carregar os dados do painel.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Verifique a conexao com o backend e tente atualizar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void dashboardQuery.refetch();
                void performanceQuery.refetch();
              }}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-foreground transition hover:bg-white/[0.08]"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7 2xl:gap-4">
        <StatCard title="Conversas ativas" value={overview.metrics.activeConversations} helper="Novas, em atendimento e aguardando" icon={MessageSquareText} />
        <StatCard title="Contatos totais" value={overview.metrics.totalContacts} helper="Base disponível na empresa" icon={Users} />
        <StatCard title="Taxa de resposta" value={`${overview.metrics.responseRate}%`} helper="Mensagens entregues ou lidas" icon={Activity} />
        <StatCard title="Campanhas enviadas" value={overview.metrics.sentCampaigns} helper="Disparos finalizados com sucesso" icon={Send} />
        <StatCard
          title="Uso de rápidas (30d)"
          value={overview.metrics.quickMessagesUsed}
          helper="Envios + edição no input"
          icon={MessageSquareText}
        />
        <StatCard
          title="Autos transfer. (30d)"
          value={overview.metrics.assignmentAutoMessagesSent}
          helper="Avisos automáticos enviados"
          icon={Send}
        />
        <StatCard title="Mais resoluções" value={performance.ranking[0]?.resolvedCount ?? 0} helper={performance.ranking[0] ? performance.ranking[0].name : 'Sem vendedores'} icon={Trophy} />
      </div>

      <Card>
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Performance de vendedores</CardTitle>
            <CardDescription>Compare resoluções, encerramentos, assunções e tempos médios por período.</CardDescription>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">De</p>
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Até</p>
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Usuário</p>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  {performance.ranking.map((seller) => (
                    <SelectItem key={seller.userId} value={seller.userId}>
                      {seller.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr] 2xl:gap-5">
          <div className="space-y-4 2xl:space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:gap-4">
              <StatCard title="Resolvidos" value={performance.totals.resolvedCount} helper="Conversas concluídas com sucesso" icon={Trophy} />
              <StatCard title="Encerrados" value={performance.totals.closedCount} helper="Atendimentos encerrados sem conversão" icon={MessageSquareText} />
              <StatCard title="Assumidos" value={performance.totals.assignedCount} helper="Total de conversas assumidas" icon={Users} />
              <StatCard title="1ª resposta média" value={formatDuration(performance.totals.avgFirstResponseMs)} helper="Tempo médio até a primeira resposta" icon={Activity} />
            </div>

            <Card className="border-border/70 bg-background-panel/55">
              <CardHeader>
                <CardTitle className="text-base">Resolvidos por vendedor</CardTitle>
                <CardDescription>Gráfico comparativo das conversas marcadas como resolvidas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {performance.chart.length ? (
                  performance.chart.map((point) => (
                    <div key={point.userId} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{point.label}</span>
                        <span className="text-muted-foreground">{point.value} resolvidas</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
                          style={{
                            width: `${Math.max(
                              8,
                              performance.chart[0]?.value
                                ? (point.value / performance.chart[0].value) * 100
                                : 0,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhuma performance encontrada para o período selecionado.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 2xl:space-y-5">
            <Card className="border-border/70 bg-background-panel/55">
              <CardHeader>
                <CardTitle className="text-base">Ranking de vendedores</CardTitle>
                <CardDescription>Quem mais resolveu conversas no período filtrado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {performance.ranking.length ? (
                  performance.ranking.map((seller, index) => (
                    <div key={seller.userId} className="rounded-[22px] border border-border bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">#{index + 1} {seller.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {seller.resolvedCount} resolvidas • {seller.closedCount} encerradas • {seller.assignedCount} assumidas
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-primary">{seller.conversionRate}%</p>
                          <p className="text-xs text-muted-foreground">conversão</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <span>1ª resposta média: {formatDuration(seller.avgFirstResponseMs)}</span>
                        <span>Resolução média: {formatDuration(seller.avgResolutionMs)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[22px] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhum vendedor com movimentação no período.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="p-0">
              <CardHeader className="p-5 2xl:p-6">
                <CardTitle>Atalhos rápidos</CardTitle>
                <CardDescription>Navegação direta para as operações mais usadas.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 p-5 pt-0 2xl:p-6 2xl:pt-0">
                {overview.shortcuts.map((shortcut) => (
                  <Link
                    key={shortcut.href}
                    href={shortcut.href}
                    className="rounded-2xl border border-border bg-white/[0.03] px-4 py-3 text-sm font-medium transition hover:bg-white/[0.05]"
                  >
                    {shortcut.title}
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr] 2xl:gap-5">
        <Card className="p-0">
          <CardHeader className="p-5 2xl:p-6">
            <div>
              <CardTitle>Evolução recente</CardTitle>
              <CardDescription>Volume das últimas ações outbound na operação.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0 2xl:p-6 2xl:pt-0">
            <div className="-mx-1 overflow-x-auto px-1">
              <div className="grid min-w-[520px] grid-cols-7 gap-3">
                {overview.chart.map((point) => (
                  <div key={point.label} className="flex flex-col items-center gap-3">
                    <div className="flex h-36 w-full items-end rounded-[22px] bg-white/[0.03] p-3 sm:h-40 2xl:h-48">
                      <div
                        className="w-full rounded-2xl bg-gradient-to-t from-primary to-secondary"
                        style={{ height: `${Math.max(point.value * 12, 18)}px` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{point.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="p-0">
          <CardHeader className="p-5 2xl:p-6">
            <CardTitle>Atividade recente</CardTitle>
            <CardDescription>Auditoria resumida das últimas ações registradas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-0 2xl:p-6 2xl:pt-0">
            {overview.recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between rounded-2xl border border-border bg-white/[0.03] px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    <span className="text-primary">{activity.actorName ?? 'Sistema'}</span>
                    {' • '}
                    {activity.actionLabel ?? activity.action}
                    {' em '}
                    <span className="text-foreground/90">{activity.entityLabel ?? activity.entityType}</span>
                  </p>
                  {activity.detail ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{activity.detail}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">{formatDate(activity.createdAt)}</p>
                </div>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
