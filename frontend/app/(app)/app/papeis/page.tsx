'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Loader2,
  PencilLine,
  Plus,
  ShieldCheck,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api-client';
import { PermissionCatalogEntry, WorkspaceRole } from '@/lib/types';
import { formatDate } from '@/lib/utils';

type RoleDraft = {
  name: string;
  description: string;
  permissions: Record<string, boolean>;
};

function buildDraft(
  catalog: PermissionCatalogEntry[],
  role?: WorkspaceRole | null,
): RoleDraft {
  const selectedPermissions = new Set(role?.permissions ?? []);

  return {
    name: role?.name ?? '',
    description: role?.description ?? '',
    permissions: Object.fromEntries(
      catalog.map((permission) => [
        permission.key,
        selectedPermissions.has(permission.key),
      ]),
    ),
  };
}

export default function WorkspaceRolesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<WorkspaceRole | null>(null);
  const [draft, setDraft] = useState<RoleDraft>({
    name: '',
    description: '',
    permissions: {},
  });

  const rolesQuery = useQuery({
    queryKey: ['workspace-roles'],
    queryFn: () => apiRequest<WorkspaceRole[]>('workspace-roles'),
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

  const permissionLabelMap = useMemo(
    () =>
      Object.fromEntries(
        (permissionCatalogQuery.data ?? []).map((permission) => [
          permission.key,
          permission.label,
        ]),
      ) as Record<string, string>,
    [permissionCatalogQuery.data],
  );

  const saveRoleMutation = useMutation({
    mutationFn: async () => {
      const name = draft.name.trim();

      if (name.length < 2) {
        throw new Error('Informe ao menos 2 caracteres no nome do papel.');
      }

      const payload = {
        name,
        description: draft.description.trim() || undefined,
        permissions: Object.entries(draft.permissions)
          .filter(([, allowed]) => allowed)
          .map(([permission]) => permission),
      };

      if (selectedRole) {
        return apiRequest<WorkspaceRole>(`workspace-roles/${selectedRole.id}`, {
          method: 'PATCH',
          body: payload,
        });
      }

      return apiRequest<WorkspaceRole>('workspace-roles', {
        method: 'POST',
        body: payload,
      });
    },
    onSuccess: async () => {
      toast.success(selectedRole ? 'Papel atualizado.' : 'Papel criado.');
      setDialogOpen(false);
      setSelectedRole(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-roles'] }),
        queryClient.invalidateQueries({ queryKey: ['team'] }),
        queryClient.invalidateQueries({ queryKey: ['auth-me'] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`workspace-roles/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Papel removido.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-roles'] }),
        queryClient.invalidateQueries({ queryKey: ['team'] }),
        queryClient.invalidateQueries({ queryKey: ['auth-me'] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const roles = rolesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Papeis"
        description="Crie papeis do workspace e escolha exatamente quais modulos e acoes cada um pode acessar."
        action={
          <Button
            disabled={!permissionCatalogQuery.data}
            onClick={() => {
              setSelectedRole(null);
              setDraft(buildDraft(permissionCatalogQuery.data ?? [], null));
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Novo papel
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <Card className="p-0">
          <CardContent className="p-4">
            {rolesQuery.isLoading ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-[24px] border border-dashed border-border bg-white/[0.02]">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando papeis...
                </div>
              </div>
            ) : roles.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {roles.map((role) => (
                  <Card key={role.id} className="overflow-hidden border-border bg-white/[0.02] p-0">
                    <CardHeader className="space-y-4 p-5 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="truncate text-lg">{role.name}</CardTitle>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {role.description || 'Sem descricao. Use este papel para organizar acessos por time ou funcao.'}
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          {role.isSystem ? <Badge variant="secondary">Sistema</Badge> : null}
                          <Badge variant="secondary">{role.permissionCount} acessos</Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="gap-1">
                          <UsersRound className="h-3.5 w-3.5" />
                          {role.assignedMembersCount} membro(s)
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {role.activeMembersCount} ativo(s)
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 p-5 pt-0">
                      <div className="flex flex-wrap gap-2">
                        {role.permissions.length ? (
                          role.permissions.slice(0, 6).map((permission) => (
                            <Badge
                              key={permission}
                              variant="secondary"
                              className="border border-border/80 bg-transparent"
                            >
                              {permissionLabelMap[permission] ?? permission}
                            </Badge>
                          ))
                        ) : (
                          <Badge
                            variant="secondary"
                            className="border border-border/80 bg-transparent"
                          >
                            Sem acesso liberado
                          </Badge>
                        )}
                        {role.permissions.length > 6 ? (
                          <Badge
                            variant="secondary"
                            className="border border-border/80 bg-transparent"
                          >
                            +{role.permissions.length - 6} itens
                          </Badge>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
                        <span>Atualizado {formatDate(role.updatedAt)}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!permissionCatalogQuery.data || Boolean(role.isSystem)}
                            onClick={() => {
                              setSelectedRole(role);
                              setDraft(buildDraft(permissionCatalogQuery.data ?? [], role));
                              setDialogOpen(true);
                            }}
                          >
                            <PencilLine className="h-4 w-4" />
                            Editar
                          </Button>
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="sm" disabled={Boolean(role.isSystem)}>
                                <Trash2 className="h-4 w-4 text-danger" />
                              </Button>
                            }
                            title="Excluir papel"
                            description="Os membros precisam ser desvinculados antes da exclusao. Esta acao remove o papel do workspace."
                            actionLabel="Excluir"
                            onConfirm={() => deleteRoleMutation.mutate(role.id)}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="Nenhum papel criado"
                description="Crie papeis para padronizar o acesso as telas do workspace sem configurar usuario por usuario."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Como usar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-[22px] border border-border bg-white/[0.03] p-4">
              <p className="font-medium text-foreground">1. Monte o papel</p>
              <p className="mt-1">
                Selecione as telas e acoes que o papel pode acessar. Se deixar vazio, o papel nao libera nenhum modulo.
              </p>
            </div>
            <div className="rounded-[22px] border border-border bg-white/[0.03] p-4">
              <p className="font-medium text-foreground">2. Atribua na Equipe</p>
              <p className="mt-1">
                Depois de criar, o papel aparece no cadastro e edicao dos membros da equipe para aplicacao imediata.
              </p>
            </div>
            <div className="rounded-[22px] border border-border bg-white/[0.03] p-4">
              <p className="font-medium text-foreground">3. Ajuste fino quando precisar</p>
              <p className="mt-1">
                As permissoes individuais continuam existindo e entram como excecao por usuario, em cima do papel escolhido.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedRole(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl sm:h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-1.5rem)]">
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle>{selectedRole ? 'Editar papel' : 'Novo papel'}</DialogTitle>
            <DialogDescription>
              Defina o conjunto de acessos que este papel vai liberar dentro do workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role-name">Nome</Label>
                <Input
                  id="role-name"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Ex: SDR, Financeiro, Operacao"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-description">Descricao</Label>
                <Input
                  id="role-description"
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Resumo rapido de quando usar este papel"
                />
              </div>
            </div>

            <div className="rounded-[22px] border border-border bg-white/[0.03] p-4">
              <p className="text-sm font-medium text-foreground">Acessos liberados</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Marque os itens que este papel deve visualizar ou executar.
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
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
                          checked={Boolean(draft.permissions[permission.key])}
                          onCheckedChange={(checked) =>
                            setDraft((current) => ({
                              ...current,
                              permissions: {
                                ...current.permissions,
                                [permission.key]: Boolean(checked),
                              },
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
              <Button
                variant="secondary"
                onClick={() => setDialogOpen(false)}
                disabled={saveRoleMutation.isPending}
              >
                Cancelar
              </Button>
              <Button onClick={() => saveRoleMutation.mutate()} disabled={saveRoleMutation.isPending}>
                {saveRoleMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {selectedRole ? 'Salvar alteracoes' : 'Criar papel'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
