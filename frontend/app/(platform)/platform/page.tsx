'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  ShieldAlert,
  Users2,
  XCircle,
} from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api-client';
import { PlatformDashboardResponse } from '@/lib/types';

const JOB_STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'success' | 'danger' | 'secondary'; icon: typeof CheckCircle2 }> = {
  SUCCEEDED: { label: 'Sucesso', variant: 'success', icon: CheckCircle2 },
  RUNNING: { label: 'Executando', variant: 'default', icon: Clock },
  QUEUED: { label: 'Na fila', variant: 'secondary', icon: Clock },
  FAILED: { label: 'Falhou', variant: 'danger', icon: XCircle },
};

export default function PlatformDashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ['platform-dashboard'],
    queryFn: () => apiRequest<PlatformDashboardResponse>('platform-admin/dashboard'),
  });

  const dashboard = dashboardQuery.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Visao geral da plataforma AutosZap.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm" className="rounded-xl">
            <Link href="/platform/interessados">
              Ver interessados
            </Link>
          </Button>
          <Button asChild size="sm" className="rounded-xl">
            <Link href="/platform/companies">
              Gerenciar empresas
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Empresas"
          value={dashboard?.totals.companies ?? 0}
          icon={Building2}
          helper={`${dashboard?.totals.activeCompanies ?? 0} ativas`}
        />
        <StatCard
          title="Usuarios globais"
          value={dashboard?.totals.globalUsers ?? 0}
          icon={Users2}
          helper={`${dashboard?.totals.blockedUsers ?? 0} bloqueados`}
        />
        <StatCard
          title="Tenants prontos"
          value={dashboard?.provisioning.byStatus.READY ?? 0}
          icon={Database}
          helper={`${dashboard?.provisioning.total ?? 0} total`}
        />
        <StatCard
          title="Alertas de seguranca"
          value={
            (dashboard?.securityAlerts.failedProvisioningJobs ?? 0) +
            (dashboard?.securityAlerts.blockedUsers ?? 0)
          }
          icon={ShieldAlert}
          helper={`${dashboard?.securityAlerts.blockedUsers ?? 0} usuarios bloqueados`}
        />
      </div>

      {/* Content grid */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Provisioning jobs */}
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px]">Provisionamento recente</CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                {dashboard?.provisioning.recentJobs?.length ?? 0} jobs
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {(dashboard?.provisioning.recentJobs ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Database className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Nenhum job registrado.</p>
              </div>
            ) : (
              dashboard?.provisioning.recentJobs.map((job) => {
                const config = JOB_STATUS_CONFIG[job.status] ?? JOB_STATUS_CONFIG.QUEUED!;
                const StatusIcon = config.icon;
                return (
                  <div
                    key={job.id}
                    className="flex items-center gap-3 rounded-xl border border-border/50 bg-white/[0.02] p-3 transition hover:bg-white/[0.04]"
                  >
                    <div className={`shrink-0 rounded-lg p-1.5 ${
                      config.variant === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
                      config.variant === 'danger' ? 'bg-danger/10 text-danger' :
                      'bg-primary/10 text-primary'
                    }`}>
                      <StatusIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{job.company.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(job.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <Badge variant={config.variant} className="shrink-0 text-[10px]">
                      {config.label}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Security alerts */}
        <Card className="rounded-2xl border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[15px]">Alertas de seguranca</CardTitle>
              {(dashboard?.securityAlerts.failedProvisioningJobs ?? 0) > 0 && (
                <Badge variant="danger" className="text-[10px]">
                  Atencao
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Blocked users */}
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-white/[0.02] p-3">
              <div className="shrink-0 rounded-lg bg-amber-500/10 p-1.5 text-amber-500">
                <Users2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">Usuarios bloqueados</p>
                <p className="text-[11px] text-muted-foreground">Contas suspensas na plataforma</p>
              </div>
              <span className="text-lg font-bold tabular-nums">
                {dashboard?.securityAlerts.blockedUsers ?? 0}
              </span>
            </div>

            {/* Failed provisioning */}
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-white/[0.02] p-3">
              <div className="shrink-0 rounded-lg bg-danger/10 p-1.5 text-danger">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">Falhas de provisionamento</p>
                <p className="text-[11px] text-muted-foreground">Jobs com erro recentes</p>
              </div>
              <span className="text-lg font-bold tabular-nums">
                {dashboard?.securityAlerts.failedProvisioningJobs ?? 0}
              </span>
            </div>

            {/* Recent failures list */}
            {(dashboard?.securityAlerts.recentFailures ?? []).length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Falhas recentes
                </p>
                {dashboard?.securityAlerts.recentFailures.map((failure) => (
                  <div key={failure.id} className="rounded-lg border border-danger/20 bg-danger/[0.04] p-2.5">
                    <p className="text-[12px] font-medium text-danger">{failure.companyName ?? 'Empresa desconhecida'}</p>
                    {failure.errorMessage && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{failure.errorMessage}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(dashboard?.securityAlerts.blockedUsers ?? 0) === 0 &&
             (dashboard?.securityAlerts.failedProvisioningJobs ?? 0) === 0 && (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/40" />
                <p className="text-sm text-muted-foreground">Nenhum alerta ativo.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
