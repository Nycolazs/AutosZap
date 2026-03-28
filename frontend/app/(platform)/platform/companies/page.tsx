'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, apiRequest } from '@/lib/api-client';
import { PlatformCompany } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CompanyStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
type CompanyActivityFilter = 'all' | 'active' | 'inactive';
type UpdateCompanyPayload = {
  companyId: string;
  name?: string;
  legalName?: string | null;
  status?: CompanyStatus;
};

const STATUS_OPTIONS: CompanyStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
const ACTIVITY_FILTER_OPTIONS: Array<{
  value: CompanyActivityFilter;
  label: string;
}> = [
  { value: 'all', label: 'Todas' },
  { value: 'active', label: 'Ativas' },
  { value: 'inactive', label: 'Desativadas' },
];

const STATUS_LABELS: Record<CompanyStatus, string> = {
  ACTIVE: 'Ativa',
  INACTIVE: 'Desativada',
  SUSPENDED: 'Suspensa',
};

function getCompanyStatusLabel(status: CompanyStatus) {
  return STATUS_LABELS[status];
}

function getCompanyStatusBadgeVariant(status: CompanyStatus): 'success' | 'danger' | 'secondary' {
  if (status === 'ACTIVE') {
    return 'success';
  }

  if (status === 'INACTIVE') {
    return 'danger';
  }

  return 'secondary';
}

function filterCompaniesByActivity(
  companies: PlatformCompany[],
  activity: CompanyActivityFilter,
) {
  if (activity === 'active') {
    return companies.filter((company) => company.status === 'ACTIVE');
  }

  if (activity === 'inactive') {
    return companies.filter((company) => company.status !== 'ACTIVE');
  }

  return companies;
}

function CompanyCard({
  company,
  onSave,
  onProvision,
  saving,
  provisioning,
}: {
  company: PlatformCompany;
  onSave: (payload: UpdateCompanyPayload) => void;
  onProvision: (companyId: string) => void;
  saving: boolean;
  provisioning: boolean;
}) {
  const [name, setName] = useState(company.name);
  const [legalName, setLegalName] = useState(company.legalName ?? '');
  const [status, setStatus] = useState<CompanyStatus>((company.status as CompanyStatus) ?? 'ACTIVE');
  const companyStatus = (company.status as CompanyStatus) ?? 'ACTIVE';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{company.name}</CardTitle>
          <Badge variant={getCompanyStatusBadgeVariant(companyStatus)}>
            {getCompanyStatusLabel(companyStatus)}
          </Badge>
          <Badge variant="secondary">
            {company.memberships?.length ?? 0} usuários ativos
          </Badge>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {company.slug} • Workspace {company.workspaceId}
          </p>
          {company.deactivatedAt ? (
            <p className="text-xs text-muted-foreground">
              Desativada em {new Date(company.deactivatedAt).toLocaleString('pt-BR')}
            </p>
          ) : null}
        </div>
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
                    {getCompanyStatusLabel(option)}
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
              variant={companyStatus === 'ACTIVE' ? 'danger' : 'secondary'}
              onClick={() =>
                onSave({
                  companyId: company.id,
                  name,
                  legalName,
                  status: companyStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                })
              }
              disabled={saving}
            >
              {companyStatus === 'ACTIVE' ? 'Desativar' : 'Reativar'}
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
  const [activityFilter, setActivityFilter] = useState<CompanyActivityFilter>('all');
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
    queryKey: ['platform-companies', search, activityFilter],
    queryFn: async () => {
      const baseParams = new URLSearchParams();

      if (search.trim()) {
        baseParams.set('search', search.trim());
      }

      if (activityFilter === 'all') {
        const query = baseParams.toString();
        return apiRequest<PlatformCompany[]>(
          `platform-admin/companies${query ? `?${query}` : ''}`,
        );
      }

      const filteredParams = new URLSearchParams(baseParams);
      filteredParams.set('activity', activityFilter);

      try {
        const query = filteredParams.toString();
        return await apiRequest<PlatformCompany[]>(
          `platform-admin/companies${query ? `?${query}` : ''}`,
        );
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 400) {
          throw error;
        }

        const fallbackQuery = baseParams.toString();
        const companies = await apiRequest<PlatformCompany[]>(
          `platform-admin/companies${fallbackQuery ? `?${fallbackQuery}` : ''}`,
        );

        return filterCompaniesByActivity(companies, activityFilter);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateCompanyPayload) =>
      apiRequest(`platform-admin/companies/${payload.companyId}`, {
        method: 'PATCH',
        body: {
          name: payload.name,
          legalName:
            payload.legalName === undefined
              ? undefined
              : payload.legalName || null,
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
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <Input
            placeholder="Buscar por nome, slug ou workspace"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="space-y-1">
            <Label className="text-xs">Filtro</Label>
            <Select value={activityFilter} onValueChange={(value) => setActivityFilter(value as CompanyActivityFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {companiesQuery.isError ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-danger">
                {(companiesQuery.error as Error).message}
              </p>
            </CardContent>
          </Card>
        ) : null}
        {(companiesQuery.data ?? []).map((company) => (
          <CompanyCard
            key={`${company.id}:${company.updatedAt}`}
            company={company}
            onSave={(payload) => updateMutation.mutate(payload)}
            onProvision={(companyId) => provisionMutation.mutate(companyId)}
            saving={
              updateMutation.isPending &&
              updateMutation.variables?.companyId === company.id
            }
            provisioning={
              provisionMutation.isPending &&
              provisionMutation.variables === company.id
            }
          />
        ))}
        {!companiesQuery.isLoading &&
        !companiesQuery.isError &&
        (companiesQuery.data ?? []).length === 0 ? (
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
