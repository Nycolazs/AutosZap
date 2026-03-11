'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Code2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { apiRequest } from '@/lib/api-client';

type MeResponse = {
  id: string;
  name: string;
  email: string;
  role: string;
  title?: string | null;
  workspace: {
    id: string;
    name: string;
    companyName: string;
    settings?: Record<string, unknown>;
  };
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiRequest<MeResponse>('auth/me'),
  });
  const workspaceQuery = useQuery({
    queryKey: ['workspace'],
    queryFn: () => apiRequest<MeResponse['workspace']>('users/workspace'),
  });

  const updateProfileMutation = useMutation({
    mutationFn: (payload: { name?: string; title?: string; email?: string }) =>
      apiRequest('users/profile', { method: 'PATCH', body: payload }),
    onSuccess: async () => {
      toast.success('Perfil atualizado.');
      await queryClient.invalidateQueries({ queryKey: ['auth-me'] });
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: (payload: { name?: string; companyName?: string; settings?: Record<string, unknown> }) =>
      apiRequest('users/workspace', { method: 'PATCH', body: payload }),
    onSuccess: async () => {
      toast.success('Workspace atualizada.');
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      apiRequest('users/change-password', { method: 'PATCH', body: payload }),
    onSuccess: () => toast.success('Senha alterada.'),
  });

  const me = meQuery.data;
  const workspace = workspaceQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuracoes"
        description="Atualize perfil, dados da empresa, preferências simples e seguranca da conta."
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <SettingsFormCard
          key={`profile-${me?.id ?? 'loading'}-${me?.email ?? ''}`}
          title="Perfil"
          description="Dados do usuario autenticado."
          defaultValues={{
            name: me?.name ?? '',
            email: me?.email ?? '',
            title: me?.title ?? '',
          }}
          onSubmit={updateProfileMutation.mutate}
          fields={[
            { name: 'name', label: 'Nome' },
            { name: 'email', label: 'Email' },
            { name: 'title', label: 'Cargo' },
          ]}
        />

        <SettingsFormCard
          key={`workspace-${workspace?.id ?? 'loading'}-${workspace?.companyName ?? ''}`}
          title="Workspace"
          description="Dados principais da empresa e preferencias."
          defaultValues={{
            name: workspace?.name ?? '',
            companyName: workspace?.companyName ?? '',
          }}
          onSubmit={(values) =>
            updateWorkspaceMutation.mutate({
              ...values,
              settings: {
                theme: 'dark-blue',
              },
            })
          }
          fields={[
            { name: 'name', label: 'Nome da workspace' },
            { name: 'companyName', label: 'Razao social / empresa' },
          ]}
        />

        <SettingsFormCard
          key="password-card"
          title="Seguranca"
          description="Altere sua senha atual."
          defaultValues={{
            currentPassword: '',
            newPassword: '',
          }}
          onSubmit={(values) =>
            changePasswordMutation.mutate({
              currentPassword: values.currentPassword,
              newPassword: values.newPassword,
            })
          }
          fields={[
            { name: 'currentPassword', label: 'Senha atual', type: 'password' },
            { name: 'newPassword', label: 'Nova senha', type: 'password' },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle>Preferencias visuais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-[24px] border border-border bg-white/[0.03] p-4">
              <div>
                <p className="font-medium">Tema dark blue premium</p>
                <p className="text-sm text-muted-foreground">Mantem a direcao visual da workspace em tons de azul.</p>
              </div>
              <Switch checked />
            </div>
            <div className="flex items-center justify-between rounded-[24px] border border-border bg-white/[0.03] p-4">
              <div>
                <p className="font-medium">Atalhos na dashboard</p>
                <p className="text-sm text-muted-foreground">Exibir cards de acesso rapido no painel inicial.</p>
              </div>
              <Switch checked />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Desenvolvimento</CardTitle>
              <p className="text-sm text-muted-foreground">
                Gerencie frontend local, backend local, túnel público e o roteamento do webhook oficial da Meta.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[24px] border border-border bg-white/[0.03] p-4 text-sm text-muted-foreground">
              Use esta área para apontar temporariamente o WhatsApp para seu localhost e depois devolver o callback para produção.
            </div>
            <div className="flex justify-end">
              <Button asChild variant="secondary">
                <Link href="/app/desenvolvimento">
                  <Code2 className="h-4 w-4" />
                  Abrir desenvolvimento
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SettingsFormCard({
  title,
  description,
  defaultValues,
  onSubmit,
  fields,
}: {
  title: string;
  description: string;
  defaultValues: Record<string, string>;
  onSubmit: (values: Record<string, string>) => void;
  fields: Array<{ name: string; label: string; type?: string }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const values = Object.fromEntries(formData.entries()) as Record<string, string>;
            onSubmit(values);
          }}
        >
          {fields.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label>{field.label}</Label>
              <Input name={field.name} type={field.type ?? 'text'} defaultValue={defaultValues[field.name] ?? ''} />
            </div>
          ))}
          <div className="flex justify-end">
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
