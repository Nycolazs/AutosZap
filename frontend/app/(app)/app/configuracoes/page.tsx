'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Clock3, Code2, RadioTower } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api-client';
import { AuthMeResponse } from '@/lib/types';
import { isLocalDevelopment } from '@/lib/environment';

type WorkspaceResponse = {
  id: string;
  name: string;
  companyName: string;
  settings?: Record<string, unknown>;
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiRequest<AuthMeResponse>('auth/me'),
  });
  const workspaceQuery = useQuery({
    queryKey: ['workspace'],
    queryFn: () => apiRequest<WorkspaceResponse>('users/workspace'),
  });

  const [profileValues, setProfileValues] = useState({
    name: undefined as string | undefined,
    email: undefined as string | undefined,
    title: undefined as string | undefined,
  });
  const [workspaceValues, setWorkspaceValues] = useState({
    name: undefined as string | undefined,
    companyName: undefined as string | undefined,
  });
  const [passwordValues, setPasswordValues] = useState({
    currentPassword: '',
    newPassword: '',
  });

  const resolvedProfileValues = useMemo(
    () => ({
      name: profileValues.name ?? meQuery.data?.name ?? '',
      email: profileValues.email ?? meQuery.data?.email ?? '',
      title: profileValues.title ?? meQuery.data?.title ?? '',
    }),
    [meQuery.data?.email, meQuery.data?.name, meQuery.data?.title, profileValues.email, profileValues.name, profileValues.title],
  );
  const resolvedWorkspaceValues = useMemo(
    () => ({
      name: workspaceValues.name ?? workspaceQuery.data?.name ?? '',
      companyName: workspaceValues.companyName ?? workspaceQuery.data?.companyName ?? '',
    }),
    [workspaceQuery.data?.companyName, workspaceQuery.data?.name, workspaceValues.companyName, workspaceValues.name],
  );

  const updateProfileMutation = useMutation({
    mutationFn: () =>
      apiRequest('users/profile', { method: 'PATCH', body: resolvedProfileValues }),
    onSuccess: async () => {
      toast.success('Perfil atualizado.');
      await queryClient.invalidateQueries({ queryKey: ['auth-me'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: () =>
      apiRequest('users/workspace', {
        method: 'PATCH',
        body: {
          ...resolvedWorkspaceValues,
          settings: {
            theme: 'dark-blue',
          },
        },
      }),
    onSuccess: async () => {
      toast.success('Workspace atualizada.');
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () =>
      apiRequest('users/change-password', {
        method: 'PATCH',
        body: passwordValues,
      }),
    onSuccess: () => {
      toast.success('Senha alterada.');
      setPasswordValues({
        currentPassword: '',
        newPassword: '',
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Atualize perfil, dados da empresa, horários de funcionamento e ajustes gerais da operação."
        action={
          <Button asChild variant="secondary">
            <Link href="/app/instancias">
              <Camera className="h-4 w-4" />
              Perfil do WhatsApp
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <SettingsFormCard
          title="Perfil"
          description="Dados do usuário autenticado."
          onSubmit={() => updateProfileMutation.mutate()}
          disabled={updateProfileMutation.isPending}
        >
          <Field label="Nome" value={resolvedProfileValues.name} onChange={(value) => setProfileValues((current) => ({ ...current, name: value }))} />
          <Field label="Email" value={resolvedProfileValues.email} onChange={(value) => setProfileValues((current) => ({ ...current, email: value }))} />
          <Field label="Cargo" value={resolvedProfileValues.title} onChange={(value) => setProfileValues((current) => ({ ...current, title: value }))} />
        </SettingsFormCard>

        <SettingsFormCard
          title="Workspace"
          description="Dados principais da empresa."
          onSubmit={() => updateWorkspaceMutation.mutate()}
          disabled={updateWorkspaceMutation.isPending}
        >
          <Field label="Nome da workspace" value={resolvedWorkspaceValues.name} onChange={(value) => setWorkspaceValues((current) => ({ ...current, name: value }))} />
          <Field label="Empresa / razão social" value={resolvedWorkspaceValues.companyName} onChange={(value) => setWorkspaceValues((current) => ({ ...current, companyName: value }))} />
        </SettingsFormCard>

        <SettingsFormCard
          title="Segurança"
          description="Altere sua senha atual."
          onSubmit={() => changePasswordMutation.mutate()}
          disabled={changePasswordMutation.isPending}
        >
          <Field
            label="Senha atual"
            type="password"
            value={passwordValues.currentPassword}
            onChange={(value) => setPasswordValues((current) => ({ ...current, currentPassword: value }))}
          />
          <Field
            label="Nova senha"
            type="password"
            value={passwordValues.newPassword}
            onChange={(value) => setPasswordValues((current) => ({ ...current, newPassword: value }))}
          />
        </SettingsFormCard>

        <Card>
          <CardHeader>
            <CardTitle>Perfil do WhatsApp</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[24px] border border-border bg-white/[0.03] p-4 text-sm text-muted-foreground">
              Essa configuração fica vinculada a cada instância conectada. Abra a instância desejada para editar foto, sobre, descrição e demais dados oficiais do número.
            </div>
            <div className="flex">
              <Button asChild className="w-full sm:w-auto">
                <Link href="/app/instancias">
                  <RadioTower className="h-4 w-4" />
                  Abrir instâncias
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-primary" />
              <CardTitle>Horários de Funcionamento</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[24px] border border-border bg-white/[0.03] p-4 text-sm text-muted-foreground">
              Timeout de inatividade, dias de funcionamento e mensagens automáticas agora ficam em uma tela dedicada para facilitar a operação do atendimento.
            </div>
            <div className="flex">
              <Button asChild className="w-full sm:w-auto">
                <Link href="/app/horarios-de-funcionamento">
                  <Clock3 className="h-4 w-4" />
                  Abrir horários de funcionamento
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLocalDevelopment ? (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Desenvolvimento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[24px] border border-border bg-white/[0.03] p-4 text-sm text-muted-foreground">
                Use esta área para apontar temporariamente o WhatsApp para seu localhost e depois devolver o callback para produção.
              </div>
              <div className="flex">
                <Button asChild variant="secondary" className="w-full sm:w-auto">
                  <Link href="/app/desenvolvimento">
                    <Code2 className="h-4 w-4" />
                    Abrir desenvolvimento
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function SettingsFormCard({
  title,
  description,
  disabled,
  onSubmit,
  children,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
      <Card className="p-0">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4 pt-0 sm:px-5 sm:pb-5">
        {children}
        <div className="flex">
          <Button onClick={onSubmit} disabled={disabled} className="w-full sm:w-auto">
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
