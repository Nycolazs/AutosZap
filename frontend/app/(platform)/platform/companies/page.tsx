'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api-client';
import { PlatformCompany } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CompanyStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

const STATUS_OPTIONS: CompanyStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

function CompanyCard({
  company,
  onSave,
  onProvision,
  saving,
  provisioning,
}: {
  company: PlatformCompany;
  onSave: (payload: { companyId: string; name: string; legalName: string; status: CompanyStatus }) => void;
  onProvision: (companyId: string) => void;
  saving: boolean;
  provisioning: boolean;
}) {
  const [name, setName] = useState(company.name);
  const [legalName, setLegalName] = useState(company.legalName ?? '');
  const [status, setStatus] = useState<CompanyStatus>((company.status as CompanyStatus) ?? 'ACTIVE');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{company.name}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {company.slug} • Workspace {company.workspaceId}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Razão social</Label>
            <Input value={legalName} onChange={(event) => setLegalName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as CompanyStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background-panel/40 p-3">
          <p className="text-xs text-muted-foreground">
            Banco: {company.tenantDatabase?.databaseName ?? 'n/d'} • Status{' '}
            {company.tenantDatabase?.status ?? 'n/d'} • Última migration{' '}
            {company.tenantDatabase?.lastMigrationAt
              ? new Date(company.tenantDatabase.lastMigrationAt).toLocaleString('pt-BR')
              : 'n/d'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                onSave({
                  companyId: company.id,
                  name,
                  legalName,
                  status,
                })
              }
              disabled={saving}
            >
              Salvar
            </Button>
            <Button
              onClick={() => onProvision(company.id)}
              disabled={provisioning}
            >
              Reprovisionar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PlatformCompaniesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [createForm, setCreateForm] = useState({
    name: '',
    legalName: '',
    slug: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    adminPasswordConfirm: '',
  });

  const companiesQuery = useQuery({
    queryKey: ['platform-companies', search],
    queryFn: () =>
      apiRequest<PlatformCompany[]>(
        `platform-admin/companies${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { companyId: string; name: string; legalName: string; status: CompanyStatus }) =>
      apiRequest(`platform-admin/companies/${payload.companyId}`, {
        method: 'PATCH',
        body: {
          name: payload.name,
          legalName: payload.legalName || null,
          status: payload.status,
        },
      }),
    onSuccess: () => {
      toast.success('Empresa atualizada.');
      queryClient.invalidateQueries({ queryKey: ['platform-companies'] });
      queryClient.invalidateQueries({ queryKey: ['platform-dashboard'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest('platform-admin/companies', {
        method: 'POST',
        body: {
          ...createForm,
          legalName: createForm.legalName || undefined,
          slug: createForm.slug || undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Empresa criada e provisionada.');
      setCreateForm({
        name: '',
        legalName: '',
        slug: '',
        adminName: '',
        adminEmail: '',
        adminPassword: '',
        adminPasswordConfirm: '',
      });
      queryClient.invalidateQueries({ queryKey: ['platform-companies'] });
      queryClient.invalidateQueries({ queryKey: ['platform-dashboard'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const provisionMutation = useMutation({
    mutationFn: (companyId: string) =>
      apiRequest(`platform-admin/companies/${companyId}/provision`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Provisionamento executado.');
      queryClient.invalidateQueries({ queryKey: ['platform-companies'] });
      queryClient.invalidateQueries({ queryKey: ['platform-dashboard'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
        <p className="text-sm text-muted-foreground">Gestão central de tenants e provisionamento.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Criar nova empresa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              placeholder="Nome da empresa"
              value={createForm.name}
              onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
            />
            <Input
              placeholder="Razão social (opcional)"
              value={createForm.legalName}
              onChange={(event) => setCreateForm((current) => ({ ...current, legalName: event.target.value }))}
            />
            <Input
              placeholder="Slug (opcional)"
              value={createForm.slug}
              onChange={(event) => setCreateForm((current) => ({ ...current, slug: event.target.value }))}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Nome do admin inicial"
              value={createForm.adminName}
              onChange={(event) => setCreateForm((current) => ({ ...current, adminName: event.target.value }))}
            />
            <Input
              type="email"
              placeholder="Email do admin"
              value={createForm.adminEmail}
              onChange={(event) => setCreateForm((current) => ({ ...current, adminEmail: event.target.value }))}
            />
            <Input
              type="password"
              placeholder="Senha"
              value={createForm.adminPassword}
              onChange={(event) => setCreateForm((current) => ({ ...current, adminPassword: event.target.value }))}
            />
            <Input
              type="password"
              placeholder="Confirmar senha"
              value={createForm.adminPasswordConfirm}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  adminPasswordConfirm: event.target.value,
                }))
              }
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              Criar e provisionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <Input
            placeholder="Buscar por nome, slug ou workspace"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(companiesQuery.data ?? []).map((company) => (
          <CompanyCard
            key={company.id}
            company={company}
            onSave={(payload) => updateMutation.mutate(payload)}
            onProvision={(companyId) => provisionMutation.mutate(companyId)}
            saving={updateMutation.isPending}
            provisioning={provisionMutation.isPending}
          />
        ))}
        {!companiesQuery.isLoading && (companiesQuery.data ?? []).length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Nenhuma empresa encontrada.</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
