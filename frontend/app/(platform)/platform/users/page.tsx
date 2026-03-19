'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api-client';
import { PlatformCompany, PlatformGlobalUser } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type GlobalUserStatus = 'ACTIVE' | 'PENDING' | 'BLOCKED';
type PlatformRole = 'SUPER_ADMIN' | 'SUPPORT';
type TenantRole = 'ADMIN' | 'MANAGER' | 'AGENT' | 'SELLER';
type MembershipStatus = 'ACTIVE' | 'INVITED' | 'INACTIVE';

const USER_STATUS_OPTIONS: GlobalUserStatus[] = ['ACTIVE', 'PENDING', 'BLOCKED'];
const PLATFORM_ROLE_OPTIONS: Array<PlatformRole | 'NONE'> = ['NONE', 'SUPER_ADMIN', 'SUPPORT'];
const TENANT_ROLE_OPTIONS: TenantRole[] = ['ADMIN', 'MANAGER', 'AGENT', 'SELLER'];
const MEMBERSHIP_STATUS_OPTIONS: MembershipStatus[] = ['ACTIVE', 'INVITED', 'INACTIVE'];

function UserCard({
  user,
  companies,
  onUpdate,
  onUpsertMembership,
  busy,
}: {
  user: PlatformGlobalUser;
  companies: PlatformCompany[];
  onUpdate: (payload: {
    globalUserId: string;
    name: string;
    status: GlobalUserStatus;
    platformRole: PlatformRole | 'NONE';
    password: string;
    confirmPassword: string;
  }) => void;
  onUpsertMembership: (payload: {
    globalUserId: string;
    companyId: string;
    tenantRole: TenantRole;
    status: MembershipStatus;
    isDefault: boolean;
  }) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(user.name);
  const [status, setStatus] = useState<GlobalUserStatus>((user.status as GlobalUserStatus) ?? 'ACTIVE');
  const [platformRole, setPlatformRole] = useState<PlatformRole | 'NONE'>(
    (user.platformRole as PlatformRole) ?? 'NONE',
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '');
  const [tenantRole, setTenantRole] = useState<TenantRole>('SELLER');
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus>('ACTIVE');
  const [isDefault, setIsDefault] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{user.name}</CardTitle>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as GlobalUserStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USER_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role de plataforma</Label>
            <Select value={platformRole} onValueChange={(value) => setPlatformRole(value as PlatformRole | 'NONE')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORM_ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              variant="secondary"
              onClick={() =>
                onUpdate({
                  globalUserId: user.id,
                  name,
                  status,
                  platformRole,
                  password,
                  confirmPassword,
                })
              }
              disabled={busy}
            >
              Salvar usuário
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input
            type="password"
            placeholder="Nova senha (opcional)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Input
            type="password"
            placeholder="Confirmar senha"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>

        <div className="rounded-xl border border-border/70 p-3">
          <p className="mb-2 text-sm font-medium">Vincular a empresa</p>
          <div className="grid gap-3 md:grid-cols-5">
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={tenantRole} onValueChange={(value) => setTenantRole(value as TenantRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Tenant role" />
              </SelectTrigger>
              <SelectContent>
                {TENANT_ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={membershipStatus}
              onValueChange={(value) => setMembershipStatus(value as MembershipStatus)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status vínculo" />
              </SelectTrigger>
              <SelectContent>
                {MEMBERSHIP_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center justify-between rounded-lg border border-border/70 px-3">
              <Label className="text-xs">Padrão</Label>
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            </div>

            <Button
              onClick={() =>
                onUpsertMembership({
                  globalUserId: user.id,
                  companyId,
                  tenantRole,
                  status: membershipStatus,
                  isDefault,
                })
              }
              disabled={busy || !companyId}
            >
              Salvar vínculo
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {user.memberships.map((membership) => (
              <span
                key={membership.id}
                className="rounded-full border border-border/70 px-2.5 py-1 text-xs text-muted-foreground"
              >
                {membership.company.name} • {membership.tenantRole} • {membership.status}
                {membership.isDefault ? ' • padrão' : ''}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PlatformUsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    platformRole: 'NONE' as PlatformRole | 'NONE',
    status: 'ACTIVE' as GlobalUserStatus,
  });

  const usersQuery = useQuery({
    queryKey: ['platform-users', search],
    queryFn: () =>
      apiRequest<PlatformGlobalUser[]>(
        `platform-admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const companiesQuery = useQuery({
    queryKey: ['platform-companies-for-users'],
    queryFn: () => apiRequest<PlatformCompany[]>('platform-admin/companies'),
  });

  const companies = useMemo(() => companiesQuery.data ?? [], [companiesQuery.data]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest('platform-admin/users', {
        method: 'POST',
        body: {
          name: createForm.name,
          email: createForm.email,
          password: createForm.password,
          confirmPassword: createForm.confirmPassword,
          platformRole:
            createForm.platformRole === 'NONE'
              ? undefined
              : createForm.platformRole,
          status: createForm.status,
        },
      }),
    onSuccess: () => {
      toast.success('Usuário global criado.');
      setCreateForm({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        platformRole: 'NONE',
        status: 'ACTIVE',
      });
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['platform-dashboard'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: {
      globalUserId: string;
      name: string;
      status: GlobalUserStatus;
      platformRole: PlatformRole | 'NONE';
      password: string;
      confirmPassword: string;
    }) =>
      apiRequest(`platform-admin/users/${payload.globalUserId}`, {
        method: 'PATCH',
        body: {
          name: payload.name,
          status: payload.status,
          platformRole:
            payload.platformRole === 'NONE' ? null : payload.platformRole,
          password: payload.password || undefined,
          confirmPassword: payload.confirmPassword || undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Usuário atualizado.');
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['platform-dashboard'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const membershipMutation = useMutation({
    mutationFn: (payload: {
      globalUserId: string;
      companyId: string;
      tenantRole: TenantRole;
      status: MembershipStatus;
      isDefault: boolean;
    }) =>
      apiRequest(`platform-admin/users/${payload.globalUserId}/memberships`, {
        method: 'POST',
        body: {
          companyId: payload.companyId,
          tenantRole: payload.tenantRole,
          status: payload.status,
          isDefault: payload.isDefault,
        },
      }),
    onSuccess: () => {
      toast.success('Vínculo salvo.');
      queryClient.invalidateQueries({ queryKey: ['platform-users'] });
      queryClient.invalidateQueries({ queryKey: ['platform-companies'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários globais</h1>
        <p className="text-sm text-muted-foreground">Identidade central e vínculos por empresa.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Criar usuário global</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              placeholder="Nome"
              value={createForm.name}
              onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
            />
            <Input
              type="email"
              placeholder="Email"
              value={createForm.email}
              onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
            />
            <Select
              value={createForm.platformRole}
              onValueChange={(value) => setCreateForm((current) => ({ ...current, platformRole: value as PlatformRole | 'NONE' }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORM_ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              type="password"
              placeholder="Senha"
              value={createForm.password}
              onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
            />
            <Input
              type="password"
              placeholder="Confirmar senha"
              value={createForm.confirmPassword}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  confirmPassword: event.target.value,
                }))
              }
            />
            <Select
              value={createForm.status}
              onValueChange={(value) => setCreateForm((current) => ({ ...current, status: value as GlobalUserStatus }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USER_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              Criar usuário
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <Input
            placeholder="Buscar por nome ou email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(usersQuery.data ?? []).map((user) => (
          <UserCard
            key={user.id}
            user={user}
            companies={companies}
            onUpdate={(payload) => updateMutation.mutate(payload)}
            onUpsertMembership={(payload) => membershipMutation.mutate(payload)}
            busy={updateMutation.isPending || membershipMutation.isPending}
          />
        ))}
        {!usersQuery.isLoading && (usersQuery.data ?? []).length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
