'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Activity, MessageSquareText, Send, Users } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest } from '@/lib/api-client';
import { DashboardOverview } from '@/lib/types';
import { formatDate } from '@/lib/utils';

export default function DashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiRequest<DashboardOverview>('dashboard'),
  });

  if (dashboardQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  const data = dashboardQuery.data;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel inicial"
        description="Mantenha sua operacao sob controle com uma visao rapida de inbox, CRM, disparos e atividade recente."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Conversas ativas" value={data.metrics.activeConversations} helper="Atendimentos abertos agora" icon={MessageSquareText} />
        <StatCard title="Contatos totais" value={data.metrics.totalContacts} helper="Base disponivel na workspace" icon={Users} />
        <StatCard title="Taxa de resposta" value={`${data.metrics.responseRate}%`} helper="Mensagens entregues ou lidas" icon={Activity} />
        <StatCard title="Campanhas enviadas" value={data.metrics.sentCampaigns} helper="Disparos finalizados com sucesso" icon={Send} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="p-0">
          <CardHeader className="p-6">
            <div>
              <CardTitle>Evolucao recente</CardTitle>
              <CardDescription>Volume das ultimas acoes outbound na operacao.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <div className="grid grid-cols-7 gap-3">
              {data.chart.map((point) => (
                <div key={point.label} className="flex flex-col items-center gap-3">
                  <div className="flex h-48 w-full items-end rounded-[22px] bg-white/[0.03] p-3">
                    <div
                      className="w-full rounded-2xl bg-gradient-to-t from-primary to-secondary"
                      style={{ height: `${Math.max(point.value * 12, 18)}px` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{point.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="p-0">
            <CardHeader className="p-6">
              <CardTitle>Atalhos rapidos</CardTitle>
              <CardDescription>Navegacao direta para as operacoes mais usadas.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 p-6 pt-0">
              {data.shortcuts.map((shortcut) => (
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

          <Card className="p-0">
            <CardHeader className="p-6">
              <CardTitle>Notificacoes</CardTitle>
              <CardDescription>Alertas recentes da sua operacao.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-6 pt-0">
              {data.notifications.map((notification) => (
                <div key={notification.id} className="rounded-2xl border border-border bg-white/[0.03] p-4">
                  <p className="font-medium">{notification.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="p-0">
        <CardHeader className="p-6">
          <CardTitle>Atividade recente</CardTitle>
          <CardDescription>Auditoria resumida das ultimas acoes registradas no backend.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-6 pt-0">
          {data.recentActivity.map((activity) => (
            <div key={activity.id} className="flex items-center justify-between rounded-2xl border border-border bg-white/[0.03] px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  {activity.action} em <span className="text-primary">{activity.entityType}</span>
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(activity.createdAt)}</p>
              </div>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
