'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { LockKeyhole, Settings2, ShieldCheck, UserCog, UsersRound } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/api-client';
import { getRoleLabel } from '@/lib/permissions';
import { PermissionCatalogEntry, TeamMember } from '@/lib/types';
import { formatDate } from '@/lib/utils';

const teamMemberSchema = z.object({
  name: z.string().min(2, 'Informe ao menos 2 caracteres.'),
  email: z.string().email('Informe um email valido.'),
  title: z.string().optional(),
  role: z.enum(['ADMIN', 'SELLER']),
  status: z.enum(['PENDING', 'ACTIVE', 'INACTIVE']),
  password: z
    .string()
    .trim()
    .optional()
    .or(z.literal('')),
  confirmPassword: z
    .string()
    .trim()
    .optional()
    .or(z.literal('')),
}).superRefine((values, ctx) => {
  const hasPassword = Boolean(values.password && values.password.length > 0);
  const hasConfirm = Boolean(values.confirmPassword && values.confirmPassword.length > 0);

  if (!hasPassword && !hasConfirm) {
    return;
  }

  if (!hasPassword || (values.password?.length ?? 0) < 6) {
    ctx.addIssue({
      code: 'custom',
      path: ['password'],
      message: 'A senha precisa ter ao menos 6 caracteres.',
    });
  }

  if (!hasConfirm || (values.confirmPassword?.length ?? 0) < 6) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'Confirme a senha com ao menos 6 caracteres.',
    });
  }

  if (values.password !== values.confirmPassword) {
    ctx.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'As senhas nao conferem.',
    });
  }
});

type TeamMemberFormValues = z.infer<typeof teamMemberSchema>;

const statusLabelMap: Record<string, string> = {
  ACTIVE: 'Ativo',
  PENDING: 'Pendente',
  INACTIVE: 'Inativo',
};

export default function TeamPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [permissionsMember, setPermissionsMember] = useState<TeamMember | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<Record<string, boolean>>({});

  const teamQuery = useQuery({
    queryKey: ['team'],
    queryFn: () => apiRequest<TeamMember[]>('team'),
  });
  const permissionCatalogQuery = useQuery({
    queryKey: ['team-permission-catalog'],
    queryFn: () => apiRequest<PermissionCatalogEntry[]>('team/permissions/catalog'),
  });

  const groupedPermissions = useMemo(() => {
    const catalog = permissionCatalogQuery.data ?? [];

    return catalog.reduce<Record<string, PermissionCatalogEntry[]>>((groups, permission) => {
      groups[permission.category] = [...(groups[permission.category] ?? []), permission];
      return groups;
    }, {});
  }, [permissionCatalogQuery.data]);

  const saveMemberMutation = useMutation({
    mutationFn: (values: TeamMemberFormValues) => {
      if (selectedMember) {
        const normalizedPassword = values.password?.trim() ?? '';
        const normalizedConfirmPassword = values.confirmPassword?.trim() ?? '';

        return apiRequest(`team/${selectedMember.id}`, {
          method: 'PATCH',
          body: {
            name: values.name,
            email: values.email,
            title: values.title,
            role: values.role,
            status: values.status,
            ...(normalizedPassword
              ? {
                  password: normalizedPassword,
                  confirmPassword: normalizedConfirmPassword,
                }
              : {}),
          },
        });
      }

      return apiRequest('team', {
        method: 'POST',
        body: values,
      });
    },
    onSuccess: async () => {
      toast.success(selectedMember ? 'Membro atualizado.' : 'Membro criado.');
      setDialogOpen(false);
      setSelectedMember(null);
      await queryClient.invalidateQueries({ queryKey: ['team'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`team/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Membro desativado.');
      await queryClient.invalidateQueries({ queryKey: ['team'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const savePermissionsMutation = useMutation({
    mutationFn: async () => {
      if (!permissionsMember || !permissionCatalogQuery.data) {
        return null;
      }

      return apiRequest(`team/${permissionsMember.id}/permissions`, {
        method: 'PATCH',
        body: {
          permissions: permissionCatalogQuery.data.map((permission) => ({
            permission: permission.key,
            allowed: Boolean(permissionDraft[permission.key]),
          })),
        },
      });
    },
    onSuccess: async () => {
      toast.success('Permissões salvas.');
      setPermissionsMember(null);
      await queryClient.invalidateQueries({ queryKey: ['team'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const columns = useMemo<ColumnDef<TeamMember>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Nome',
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Papel',
        cell: ({ row }) => <Badge variant="secondary">{getRoleLabel(row.original.normalizedRole)}</Badge>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <Badge>{statusLabelMap[row.original.status] ?? row.original.status}</Badge>,
      },
      {
        accessorKey: 'title',
        header: 'Cargo',
        cell: ({ row }) => row.original.title ?? 'Sem cargo',
      },
      {
        accessorKey: 'grantedPermissions',
        header: 'Permissões',
        cell: ({ row }) => `${row.original.grantedPermissions.length} liberadas`,
      },
      {
        accessorKey: 'lastLoginAt',
        header: 'Último acesso',
        cell: ({ row }) => (row.original.lastLoginAt ? formatDate(row.original.lastLoginAt) : 'Sem acesso ainda'),
      },
      {
        id: 'actions',
        header: 'Ações',
        cell: ({ row }) => (
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
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setPermissionsMember(row.original);
                setPermissionDraft(row.original.permissions);
              }}
              disabled={!row.original.userId}
            >
              <Settings2 className="h-4 w-4" />
              Permissões
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(event) => event.stopPropagation()}
                >
                  Desativar
                </Button>
              }
              title="Desativar membro"
              description="O membro deixará de acessar a empresa até ser reativado."
              actionLabel="Desativar"
              onConfirm={() => deactivateMutation.mutate(row.original.id)}
            />
          </div>
        ),
      },
    ],
    [deactivateMutation],
  );

  const members = teamQuery.data ?? [];
  const selectedMemberDefaultValues: TeamMemberFormValues = selectedMember
    ? {
        name: selectedMember.name,
        email: selectedMember.email,
        title: selectedMember.title ?? '',
        role: selectedMember.normalizedRole,
        status:
          selectedMember.status === 'ACTIVE' || selectedMember.status === 'INACTIVE'
            ? selectedMember.status
            : 'PENDING',
          password: '',
          confirmPassword: '',
      }
    : {
        name: '',
        email: '',
        title: '',
        role: 'SELLER',
        status: 'PENDING',
          password: '',
          confirmPassword: '',
      };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipe"
        description="Gerencie papel, status e permissões granulares de cada usuário da empresa."
        action={
          <EntityFormDialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) {
                setSelectedMember(null);
              }
            }}
            title={selectedMember ? 'Editar membro' : 'Adicionar membro'}
            description="Convites pendentes ficam sem permissões até a conta ser ativada."
            schema={teamMemberSchema}
            defaultValues={selectedMemberDefaultValues}
            submitLabel={selectedMember ? 'Salvar alterações' : 'Criar membro'}
            onSubmit={async (values) => saveMemberMutation.mutateAsync(values)}
            fields={[
              { name: 'name', label: 'Nome' },
              { name: 'email' as const, label: 'Email', type: 'email' as const },
              { name: 'title', label: 'Cargo' },
              {
                name: 'role',
                label: 'Papel',
                type: 'select',
                options: [
                  { label: 'Administrador', value: 'ADMIN' },
                  { label: 'Vendedor', value: 'SELLER' },
                ],
              },
              {
                name: 'status',
                label: 'Status',
                type: 'select',
                options: [
                  { label: 'Pendente', value: 'PENDING' },
                  { label: 'Ativo', value: 'ACTIVE' },
                  { label: 'Inativo', value: 'INACTIVE' },
                ],
              },
              {
                name: 'password' as const,
                label: selectedMember ? 'Nova senha (opcional)' : 'Senha (opcional)',
                type: 'password' as const,
              },
              {
                name: 'confirmPassword' as const,
                label: 'Confirmar senha',
                type: 'password' as const,
              },
            ]}
            trigger={
              <Button onClick={() => setSelectedMember(null)}>
                <UsersRound className="h-4 w-4" />
                Novo membro
              </Button>
            }
          />
        }
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
                description="Crie vendedores e administradores para distribuir o atendimento da empresa."
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
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">Total</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{members.length}</p>
              </div>
              <div className="rounded-[18px] border border-border bg-white/[0.03] px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">Admins</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{members.filter((member) => member.normalizedRole === 'ADMIN').length}</p>
              </div>
              <div className="rounded-[18px] border border-border bg-white/[0.03] px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">Ativos</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{members.filter((member) => member.status === 'ACTIVE').length}</p>
              </div>
            </div>
            <div className="rounded-[22px] border border-border bg-white/[0.03] p-4">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Administradores
              </div>
              <p>Vêem todas as conversas da empresa, podem gerenciar usuários, permissões e configurações.</p>
            </div>
            <div className="rounded-[22px] border border-border bg-white/[0.03] p-4">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <UserCog className="h-4 w-4 text-primary" />
                Vendedores
              </div>
              <p>Visualizam apenas as telas liberadas e só acessam conversas próprias ou disponíveis em novo/aguardando.</p>
            </div>
            <div className="rounded-[22px] border border-border bg-white/[0.03] p-4">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <LockKeyhole className="h-4 w-4 text-primary" />
                Permissões granulares
              </div>
              <p>Use a ação de permissões para liberar módulos e ações específicas por usuário de forma independente.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(permissionsMember)} onOpenChange={(open) => !open && setPermissionsMember(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Permissões do usuário</DialogTitle>
            <DialogDescription>
              {permissionsMember?.name
                ? `Defina quais telas e ações ${permissionsMember.name} pode acessar.`
                : 'Gerencie permissões granulares.'}
            </DialogDescription>
          </DialogHeader>
          {permissionsMember ? (
            <div className="space-y-5">
              {permissionsMember.normalizedRole === 'ADMIN' ? (
                <div className="rounded-[22px] border border-primary/20 bg-primary/10 p-4 text-sm text-foreground">
                  Administradores recebem acesso completo automaticamente. As permissões abaixo ficam travadas enquanto o usuário for admin.
                </div>
              ) : null}

              <div className="max-h-[80vh] space-y-4 overflow-y-auto pr-2">
                {Object.entries(groupedPermissions).map(([category, permissions]) => (
                  <Card key={category} className="p-0">
                    <CardHeader className="p-5 pb-3">
                      <CardTitle className="text-base">{category}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 p-5 pt-0 md:grid-cols-2">
                      {permissions.map((permission) => (
                        <label
                          key={permission.key}
                          className="flex items-start gap-3 rounded-2xl border border-border bg-white/[0.03] p-3"
                        >
                          <Checkbox
                            checked={Boolean(permissionDraft[permission.key])}
                            disabled={permissionsMember.normalizedRole === 'ADMIN'}
                            onCheckedChange={(checked) =>
                              setPermissionDraft((current) => ({
                                ...current,
                                [permission.key]: Boolean(checked),
                              }))
                            }
                          />
                          <div>
                            <p className="text-sm font-medium text-foreground">{permission.label}</p>
                            <p className="text-xs text-muted-foreground">{permission.description}</p>
                          </div>
                        </label>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex flex-col-reverse gap-2.5 border-t border-border pt-4 sm:flex-row sm:justify-end sm:gap-3">
                <Button variant="secondary" onClick={() => setPermissionsMember(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => savePermissionsMutation.mutate()}
                  disabled={savePermissionsMutation.isPending || permissionsMember.normalizedRole === 'ADMIN'}
                >
                  Salvar permissões
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
