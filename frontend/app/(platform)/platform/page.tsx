'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Building2, ShieldAlert, Users2 } from 'lucide-react';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api-client';
import { PlatformDashboardResponse } from '@/lib/types';

export default function PlatformDashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ['platform-dashboard'],
    queryFn: () => apiRequest<PlatformDashboardResponse>('platform-admin/dashboard'),
  });

  const dashboard = dashboardQuery.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard da Plataforma</h1>
          <p className="text-sm text-muted-foreground">Visao operacional central do control plane.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/platform/companies">Gerenciar empresas</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/platform/interessados">Ver interessados</Link>
          </Button>
          <Button asChild>
            <Link href="/platform/users">Gerenciar usuarios</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
          title="Tenants provisionados"
          value={dashboard?.provisioning.byStatus.READY ?? 0}
          icon={ShieldAlert}
          helper={`${dashboard?.provisioning.total ?? 0} total`}
        />
        <StatCard
          title="Falhas recentes"
          value={dashboard?.securityAlerts.failedProvisioningJobs ?? 0}
          icon={AlertTriangle}
          helper="Jobs de provisionamento"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Jobs de provisionamento recentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(dashboard?.provisioning.recentJobs ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum job registrado.</p>
          ) : (
            dashboard?.provisioning.recentJobs.map((job) => (
              <div key={job.id} className="rounded-xl border border-border/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{job.company.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.status} - {new Date(job.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {job.errorMessage ? (
                    <p className="max-w-xl text-xs text-danger">{job.errorMessage}</p>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
