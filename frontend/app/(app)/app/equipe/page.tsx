'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import {
  Check,
  ClipboardCopy,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  UserCog,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { EntityFormDialog } from '@/components/shared/entity-form-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiRequest } from '@/lib/api-client';
import { getRoleLabel } from '@/lib/permissions';
import { TeamMember, WorkspaceRole } from '@/lib/types';
import { formatDate } from '@/lib/utils';

interface InviteCode {
  id: string;
  code: string;
  role: string;
  title: string | null;
  status: string;
  expiresAt: string | null;
  createdAt: string;
}

interface GeneratedInvite {
  code: string;
  role: string;
  title: string | null;
  workspaceRoleId: string | null;
  workspaceRoleName: string | null;
  expiresAt: string | null;
  companyName: string;
}

const inviteRoleLabelMap: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  AGENT: 'Atendente',
  SELLER: 'Vendedor',
};

const ADMIN_ROLE_SELECTION = 'system-admin';
const DEFAULT_SELLER_ROLE_SELECTION = 'system-seller';

const teamMemberSchema = z.object({
  title: z.string().optional(),
  roleSelection: z.string().min(1, 'Selecione um papel.'),
});

type TeamMemberFormValues = z.infer<typeof teamMemberSchema>;

const statusLabelMap: Record<string, string> = {
  ACTIVE: 'Ativo',
  PENDING: 'Pendente',
  INACTIVE: 'Inativo',
};

function parseRoleSelection(roleSelection: string) {
  if (roleSelection === ADMIN_ROLE_SELECTION) {
    return {
      role: 'ADMIN' as const,
      workspaceRoleId: null,
    };
  }

  if (roleSelection && roleSelection !== DEFAULT_SELLER_ROLE_SELECTION) {
    return {
      role: 'SELLER' as const,
      workspaceRoleId: roleSelection,
    };
  }

  return {
    role: 'SELLER' as const,
    workspaceRoleId: null,
  };
}

function getMemberRoleSelection(member: TeamMember | null) {
  if (!member) {
    return DEFAULT_SELLER_ROLE_SELECTION;
  }

  if (member.normalizedRole === 'ADMIN') {
    return ADMIN_ROLE_SELECTION;
  }

  if (member.workspaceRoleId) {
    return member.workspaceRoleId;
  }

  return DEFAULT_SELLER_ROLE_SELECTION;
}

export default function TeamPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<string>('SELLER');
  const [inviteWorkspaceRoleId, setInviteWorkspaceRoleId] = useState<string>('');
  const [inviteTitle, setInviteTitle] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState<GeneratedInvite | null>(
    null,
  );
  const [copiedCode, setCopiedCode] = useState(false);

  const teamQuery = useQuery({
    queryKey: ['team'],
    queryFn: () => apiRequest<TeamMember[]>('team'),
  });

  const workspaceRolesQuery = useQuery({
    queryKey: ['workspace-roles'],
    queryFn: () => apiRequest<WorkspaceRole[]>('workspace-roles'),
    retry: false,
  });

  const inviteCodesQuery = useQuery({
    queryKey: ['invite-codes'],
    queryFn: () => apiRequest<InviteCode[]>('team/invite-codes'),
  });

  const customWorkspaceRoles = useMemo(
    () => (workspaceRolesQuery.data ?? []).filter((role) => !role.isSystem),
    [workspaceRolesQuery.data],
  );

  const workspaceRoleOptions = useMemo(
    () => [
      { label: 'Administrador', value: ADMIN_ROLE_SELECTION },
      { label: 'Vendedor', value: DEFAULT_SELLER_ROLE_SELECTION },
      ...customWorkspaceRoles.map((role) => ({
        label: role.name,
        value: role.id,
      })),
    ],
    [customWorkspaceRoles],
  );

  const inviteRoleSelection = useMemo(() => {
    if (inviteWorkspaceRoleId) {
      return inviteWorkspaceRoleId;
    }

    return inviteRole === 'ADMIN'
      ? ADMIN_ROLE_SELECTION
      : DEFAULT_SELLER_ROLE_SELECTION;
  }, [inviteRole, inviteWorkspaceRoleId]);

  const handleInviteRoleSelectionChange = (roleSelection: string) => {
    const parsedSelection = parseRoleSelection(roleSelection);
    setInviteRole(parsedSelection.role);
    setInviteWorkspaceRoleId(parsedSelection.workspaceRoleId ?? '');
  };

  const generateInviteMutation = useMutation({
    mutationFn: (payload: {
      role: string;
      title?: string;
      workspaceRoleId?: string;
    }) =>
      apiRequest<GeneratedInvite>('team/invite-code', {
        method: 'POST',
        body: payload,
      }),
    onSuccess: (data) => {
      setGeneratedInvite(data);
      void queryClient.invalidateQueries({ queryKey: ['invite-codes'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`team/invite-code/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Codigo revogado.');
      void queryClient.invalidateQueries({ queryKey: ['invite-codes'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveMemberMutation = useMutation({
    mutationFn: (values: TeamMemberFormValues) => {
      if (!selectedMember) {
        throw new Error('Selecione um membro para editar.');
      }

      const { role, workspaceRoleId } = parseRoleSelection(values.roleSelection);

      return apiRequest(`team/${selectedMember.id}`, {
        method: 'PATCH',
        body: {
          title: values.title,
          role,
          workspaceRoleId,
        },
      });
    },
    onSuccess: async () => {
      toast.success('Membro atualizado.');
      setDialogOpen(false);
      setSelectedMember(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team'] }),
        queryClient.invalidateQueries({ queryKey: ['auth-me'] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`team/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Membro desativado.');
      setDialogOpen(false);
      setSelectedMember(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team'] }),
        queryClient.invalidateQueries({ queryKey: ['auth-me'] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`team/${id}/activate`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success('Membro ativado.');
      setDialogOpen(false);
      setSelectedMember(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team'] }),
        queryClient.invalidateQueries({ queryKey: ['auth-me'] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleCopyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success('Codigo copiado!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const columns = useMemo<ColumnDef<TeamMember>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Nome',
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.email}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Papel',
        cell: ({ row }) => (
          <div className="space-y-1">
            <Badge variant="secondary">
              {row.original.workspaceRole?.name ??
                getRoleLabel(row.original.normalizedRole)}
            </Badge>
            {row.original.workspaceRole ? (
              <p className="text-[11px] text-muted-foreground">
                Base: {getRoleLabel(row.original.normalizedRole)}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge>{statusLabelMap[row.original.status] ?? row.original.status}</Badge>
        ),
      },
      {
        accessorKey: 'title',
        header: 'Cargo',
        cell: ({ row }) => row.original.title ?? 'Sem cargo',
      },
      {
        accessorKey: 'lastLoginAt',
        header: 'Ultimo acesso',
        cell: ({ row }) =>
          row.original.lastLoginAt
            ? formatDate(row.original.lastLoginAt)
            : 'Sem acesso ainda',
      },
      {
        id: 'actions',
        header: 'Acoes',
        cell: ({ row }) => {
          const isInactive = row.original.status === 'INACTIVE';

          return (
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedMember(row.original);
                  setDialogOpen(true);
                }}
              >
                Editar
              </Button>
              <ConfirmDialog
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {isInactive ? 'Ativar' : 'Desativar'}
                  </Button>
                }
                title={isInactive ? 'Ativar membro' : 'Desativar membro'}
                description={
                  isInactive
                    ? 'O membro voltara a acessar a empresa com o mesmo papel atual.'
                    : 'O membro deixara de acessar a empresa ate ser reativado.'
                }
                actionLabel={isInactive ? 'Ativar' : 'Desativar'}
                actionVariant={isInactive ? 'default' : 'danger'}
                onConfirm={() =>
                  isInactive
                    ? activateMutation.mutate(row.original.id)
                    : deactivateMutation.mutate(row.original.id)
                }
              />
            </div>
          );
        },
      },
    ],
    [activateMutation, deactivateMutation],
  );

  const members = teamQuery.data ?? [];
  const selectedMemberDefaultValues: TeamMemberFormValues = selectedMember
    ? {
        title: selectedMember.title ?? '',
        roleSelection: getMemberRoleSelection(selectedMember),
      }
    : {
        title: '',
        roleSelection: DEFAULT_SELLER_ROLE_SELECTION,
      };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipe"
        description="Gerencie apenas o cargo e o papel de cada membro. Novas pessoas entram na empresa somente por codigo de convite."
        action={
          <Button
            onClick={() => {
              setInviteDialogOpen(true);
              setGeneratedInvite(null);
              setInviteRole('SELLER');
              setInviteWorkspaceRoleId('');
              setInviteTitle('');
            }}
          >
            <KeyRound className="h-4 w-4" />
            Gerar convite
          </Button>
        }
      />

      <EntityFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedMember(null);
          }
        }}
        title="Editar membro"
        description="Nome, email e senha sao definidos pelo proprio usuario quando ele entra com convite. Aqui voce ajusta apenas cargo e papel."
        schema={teamMemberSchema}
        defaultValues={selectedMemberDefaultValues}
        submitLabel="Salvar alteracoes"
        onSubmit={async (values) => saveMemberMutation.mutateAsync(values)}
        fields={[
          { name: 'title', label: 'Cargo' },
          {
            name: 'roleSelection',
            label: 'Papel',
            type: 'select',
            options: workspaceRoleOptions,
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-0 xl:col-span-2">
          <CardContent className="p-4">
            {members.length ? (
              <DataTable
                columns={columns}
                data={members}
                onRowClick={(row) => {
                  setSelectedMember(row);
                  setDialogOpen(true);
                }}
              />
            ) : (
              <EmptyState
                icon={UsersRound}
                title="Nenhum membro cadastrado"
                description="Use Gerar convite para adicionar pessoas na empresa com o papel correto desde o primeiro acesso."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumo de acesso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-[18px] border border-border bg-white/[0.03] px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                  Total
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {members.length}
                </p>
              </div>
              <div className="rounded-[18px] border border-border bg-white/[0.03] px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                  Admins
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {
                    members.filter((member) => member.normalizedRole === 'ADMIN')
                      .length
                  }
                </p>
              </div>
              <div className="rounded-[18px] border border-border bg-white/[0.03] px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                  Ativos
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {members.filter((member) => member.status === 'ACTIVE').length}
                </p>
              </div>
            </div>
            <div className="rounded-[22px] border border-border bg-white/[0.03] p-4">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Administradores
              </div>
              <p>
                Veem todas as conversas da empresa e podem gerenciar papeis,
                equipe e configuracoes.
              </p>
            </div>
            <div className="rounded-[22px] border border-border bg-white/[0.03] p-4">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <UserCog className="h-4 w-4 text-primary" />
                Vendedores
              </div>
              <p>
                Visualizam apenas as telas liberadas e so acessam conversas
                proprias ou disponiveis em novo/aguardando.
              </p>
            </div>
            <div className="rounded-[22px] border border-border bg-white/[0.03] p-4">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <KeyRound className="h-4 w-4 text-primary" />
                Convites
              </div>
              <p>
                Todo novo membro entra apenas por convite, ja vinculado a
                empresa e ao papel definido por voce.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {(inviteCodesQuery.data ?? []).filter((code) => code.status === 'ACTIVE')
        .length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Codigos de convite ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(inviteCodesQuery.data ?? [])
                .filter((code) => code.status === 'ACTIVE')
                .map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-white/[0.03] p-3"
                  >
                    <code className="rounded-lg bg-primary/10 px-3 py-1.5 font-mono text-[14px] font-semibold tracking-[0.2em] text-primary">
                      {invite.code}
                    </code>
                    <div className="flex-1 text-sm">
                      <Badge variant="secondary" className="mr-2">
                        {inviteRoleLabelMap[invite.role] ?? invite.role}
                      </Badge>
                      {invite.title ? (
                        <span className="text-xs text-muted-foreground">
                          {invite.title}
                        </span>
                      ) : null}
                    </div>
                    {invite.expiresAt ? (
                      <span className="text-[11px] text-muted-foreground">
                        Expira {formatDate(invite.expiresAt)}
                      </span>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopyCode(invite.code)}
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-3.5 w-3.5 text-danger" />
                        </Button>
                      }
                      title="Revogar convite"
                      description="O codigo deixara de funcionar imediatamente."
                      actionLabel="Revogar"
                      onConfirm={() => revokeInviteMutation.mutate(invite.id)}
                    />
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {generatedInvite ? 'Convite gerado!' : 'Gerar codigo de convite'}
            </DialogTitle>
            <DialogDescription>
              {generatedInvite
                ? 'Copie e compartilhe o codigo com o novo membro da equipe.'
                : 'Defina o papel e cargo do novo membro. O codigo sera valido por 7 dias.'}
            </DialogDescription>
          </DialogHeader>

          {generatedInvite ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] p-6">
                <code className="rounded-xl bg-primary/10 px-6 py-3 font-mono text-[28px] font-bold tracking-[0.3em] text-primary">
                  {generatedInvite.code}
                </code>
                <div className="flex flex-wrap justify-center gap-2">
                  <Badge variant="secondary">
                    {generatedInvite.workspaceRoleName ??
                      inviteRoleLabelMap[generatedInvite.role] ??
                      generatedInvite.role}
                  </Badge>
                  {generatedInvite.title ? (
                    <Badge variant="secondary">{generatedInvite.title}</Badge>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Empresa: {generatedInvite.companyName}
                </p>
              </div>

              <Button
                className="w-full"
                onClick={() => handleCopyCode(generatedInvite.code)}
              >
                {copiedCode ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <ClipboardCopy className="mr-2 h-4 w-4" />
                )}
                {copiedCode ? 'Copiado!' : 'Copiar codigo'}
              </Button>

              <Button
                variant="secondary"
                className="w-full"
                onClick={() => setInviteDialogOpen(false)}
              >
                Fechar
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[12px] font-medium" htmlFor="invite-role">
                  Papel
                </label>
                <select
                  id="invite-role"
                  value={inviteRoleSelection}
                  onChange={(event) =>
                    handleInviteRoleSelectionChange(event.target.value)
                  }
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {workspaceRoleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  {customWorkspaceRoles.length > 0
                    ? 'Administradores, vendedores e papeis personalizados ficam disponiveis no mesmo fluxo.'
                    : 'Crie papeis personalizados na pagina de Papeis para liberar mais combinacoes de acesso.'}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[12px] font-medium" htmlFor="invite-title">
                  Cargo (opcional)
                </label>
                <input
                  id="invite-title"
                  type="text"
                  placeholder="Ex: Gerente Comercial"
                  value={inviteTitle}
                  onChange={(event) => setInviteTitle(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[14px] text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <Button
                className="w-full"
                onClick={() =>
                  generateInviteMutation.mutate({
                    role: inviteRole,
                    title: inviteTitle || undefined,
                    workspaceRoleId: inviteWorkspaceRoleId || undefined,
                  })
                }
                disabled={generateInviteMutation.isPending}
              >
                {generateInviteMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                Gerar codigo de convite
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
