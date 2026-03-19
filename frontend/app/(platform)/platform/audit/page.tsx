'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { PlatformAuditLog } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function PlatformAuditPage() {
  const [search, setSearch] = useState('');
  const auditQuery = useQuery({
    queryKey: ['platform-audit', search],
    queryFn: () =>
      apiRequest<PlatformAuditLog[]>(
        `platform-admin/audit-logs${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria da plataforma</h1>
        <p className="text-sm text-muted-foreground">Rastreamento de ações administrativas sensíveis.</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <Input
            placeholder="Buscar por entidade ou ID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(auditQuery.data ?? []).map((log) => (
            <div key={log.id} className="rounded-xl border border-border/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {log.action} • {log.entityType}
                  {log.entityId ? `:${log.entityId}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Ator: {log.actor?.email ?? 'sistema'}
                {log.ipAddress ? ` • IP ${log.ipAddress}` : ''}
              </p>
              {log.metadata ? (
                <pre className="mt-2 overflow-auto rounded-lg bg-background-panel/60 p-2 text-[11px] leading-4 text-muted-foreground">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
          {!auditQuery.isLoading && (auditQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento encontrado.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
