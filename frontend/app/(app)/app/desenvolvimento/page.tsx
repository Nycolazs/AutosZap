'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  CheckCircle2,
  CircleDashed,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  PlugZap,
  Rocket,
  TestTube2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { DevelopmentOverview } from '@/lib/types';

type DevelopmentSettingsForm = {
  localFrontendUrl: string;
  localBackendUrl: string;
  localTunnelUrl: string;
  preferredInstanceId: string;
  notes: string;
};

export default function DevelopmentPage() {
  const overviewQuery = useQuery({
    queryKey: ['development-overview'],
    queryFn: () => apiRequest<DevelopmentOverview>('development/overview'),
  });

  const overview = overviewQuery.data;

  if (!overview) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Desenvolvimento"
          description="Carregando o diagnóstico do ambiente local e de produção."
        />
        <Card>
          <CardContent className="h-40 animate-pulse rounded-[24px] bg-white/[0.03]" />
        </Card>
      </div>
    );
  }

  return (
    <DevelopmentWorkspace
      key={[
        overview.local.frontendUrl,
        overview.local.backendUrl,
        overview.local.tunnelUrl ?? '',
        overview.selectedInstanceId ?? '',
        overview.local.notes ?? '',
      ].join('|')}
      overview={overview}
    />
  );
}

function DevelopmentWorkspace({ overview }: { overview: DevelopmentOverview }) {
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<DevelopmentSettingsForm>({
    localFrontendUrl: overview.local.frontendUrl,
    localBackendUrl: overview.local.backendUrl,
    localTunnelUrl: overview.local.tunnelUrl ?? '',
    preferredInstanceId: overview.selectedInstanceId ?? '',
    notes: overview.local.notes ?? '',
  });

  const saveSettingsMutation = useMutation({
    mutationFn: () =>
      apiRequest('development/settings', {
        method: 'PATCH',
        body: formValues,
      }),
    onSuccess: async () => {
      toast.success('Configurações de desenvolvimento salvas.');
      await queryClient.invalidateQueries({ queryKey: ['development-overview'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      path,
      method = 'POST',
      body,
      successMessage,
    }: {
      path: string;
      method?: 'GET' | 'POST';
      body?: unknown;
      successMessage: string;
    }) => {
      const response = await apiRequest(path, { method, body });
      return { response, successMessage };
    },
    onSuccess: async ({ successMessage }) => {
      toast.success(successMessage);
      await queryClient.invalidateQueries({ queryKey: ['development-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['instances'] });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedInstance =
    overview.instances.find((instance) => instance.id === formValues.preferredInstanceId) ??
    overview.instances[0] ??
    null;

  const localCallbackUrl = formValues.localTunnelUrl.trim()
    ? `${formValues.localTunnelUrl.trim().replace(/\/+$/, '')}${overview.webhook.callbackPath}`
    : null;
  const productionCallbackUrl = overview.environment.productionCallbackUrl ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Desenvolvimento"
        description="Controle o fluxo local da stack e alterne o webhook oficial da Meta entre ambiente local e produção sem perder o canal."
        action={
          <Button asChild variant="secondary">
            <Link href="/app/instancias">
              <Rocket className="h-4 w-4" />
              Abrir instâncias
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.9fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Ambiente local</CardTitle>
              <CardDescription>
                Defina as URLs do seu frontend, backend e túnel público para receber mensagens reais no localhost.
              </CardDescription>
            </div>
            <Badge variant={overview?.local.ready ? 'success' : 'secondary'}>
              {overview?.local.ready ? 'Webhook local pronto' : 'Configuração pendente'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Frontend local"
                value={formValues.localFrontendUrl}
                onChange={(value) => setFormValues((current) => ({ ...current, localFrontendUrl: value }))}
                placeholder="http://localhost:3000"
              />
              <Field
                label="Backend local"
                value={formValues.localBackendUrl}
                onChange={(value) => setFormValues((current) => ({ ...current, localBackendUrl: value }))}
                placeholder="http://localhost:4000"
              />
            </div>

            <Field
              label="URL pública do túnel"
              value={formValues.localTunnelUrl}
              onChange={(value) => setFormValues((current) => ({ ...current, localTunnelUrl: value }))}
              placeholder="https://seu-tunel.trycloudflare.com"
            />

            <div className="space-y-2">
              <Label>Instância padrão para desenvolvimento</Label>
              <Select
                value={formValues.preferredInstanceId}
                onValueChange={(value) =>
                  setFormValues((current) => ({ ...current, preferredInstanceId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma instância" />
                </SelectTrigger>
                <SelectContent>
                  {(overview?.instances ?? []).map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.name} • {instance.mode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Anotações do ambiente</Label>
              <Textarea
                value={formValues.notes}
                onChange={(event) => setFormValues((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Ex.: usar cloudflared, apontar produção de volta ao terminar os testes."
                className="min-h-24"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() =>
                  copyToClipboard(overview?.webhook.verifyToken ?? '', 'Verify token copiado.')
                }
                disabled={!overview?.webhook.verifyToken}
              >
                <Copy className="h-4 w-4" />
                Copiar token
              </Button>
              <Button
                onClick={() => saveSettingsMutation.mutate()}
                disabled={saveSettingsMutation.isPending}
              >
                Salvar ambiente
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Checklist de execução</CardTitle>
              <CardDescription>
                Para envio e recebimento reais no local, o webhook precisa apontar para o túnel e a Meta deve estar em modo real.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ChecklistItem label="Credenciais da Meta preenchidas no backend" ok={overview?.checklist.hasMetaCredentials} />
            <ChecklistItem label="Verify token disponível" ok={overview?.checklist.hasVerifyToken} />
            <ChecklistItem label="Instância cadastrada" ok={overview?.checklist.hasInstance} />
            <ChecklistItem label="URL pública de produção configurada" ok={overview?.checklist.hasProductionUrl} />
            <ChecklistItem label="URL pública local configurada" ok={overview?.checklist.hasTunnel} />
            <ChecklistItem
              label={`META_MODE=${overview?.environment.metaMode ?? 'DEV'}`}
              ok={overview?.environment.metaMode === 'PRODUCTION'}
            />
            <div className="rounded-2xl border border-primary/20 bg-primary/8 p-4 text-sm text-muted-foreground">
              Quando você apontar para o ambiente local, a produção deixa de receber webhooks até você reverter o callback.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Webhook Meta</CardTitle>
              <CardDescription>
                Use estes valores no painel da Meta ou troque o destino do webhook direto daqui.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <UrlBlock
              icon={Globe}
              label="Callback de produção"
              value={productionCallbackUrl}
              helper={overview?.environment.backendPublicUrl ? 'Ambiente principal publicado.' : 'Defina BACKEND_PUBLIC_URL no backend.'}
            />
            <UrlBlock
              icon={Code2}
              label="Callback local"
              value={localCallbackUrl}
              helper={localCallbackUrl ? 'Aponte a Meta para este túnel para testar localmente.' : 'Salve uma URL de túnel público para habilitar o callback local.'}
            />
            <UrlBlock
              icon={PlugZap}
              label="Verify token"
              value={overview?.webhook.verifyToken ?? null}
              helper="Copie exatamente este valor para o campo de verificação da Meta."
              monospace={false}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Instância ativa</CardTitle>
              <CardDescription>
                Teste a integração e alterne o webhook entre local e produção sem sair da plataforma.
              </CardDescription>
            </div>
            <Badge variant={selectedInstance?.mode === 'PRODUCTION' ? 'success' : 'secondary'}>
              {selectedInstance ? `${selectedInstance.mode} • ${selectedInstance.status}` : 'Sem instância'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedInstance ? (
              <>
                <div className="rounded-2xl border border-border bg-white/[0.03] p-4 text-sm">
                  <p className="font-medium text-foreground">{selectedInstance.name}</p>
                  <p className="mt-1 text-muted-foreground">
                    {selectedInstance.phoneNumber || 'Número ainda não sincronizado'}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Phone Number ID: {selectedInstance.phoneNumberId || 'não informado'}
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      actionMutation.mutate({
                        path: `instances/${selectedInstance.id}/test`,
                        successMessage: 'Teste da instância executado.',
                      })
                    }
                    disabled={actionMutation.isPending}
                  >
                    <TestTube2 className="h-4 w-4" />
                    Testar conexão
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      actionMutation.mutate({
                        path: `instances/${selectedInstance.id}/sync`,
                        successMessage: 'Sync da instância concluído.',
                      })
                    }
                    disabled={actionMutation.isPending}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    Sync Meta
                  </Button>
                </div>

                <div className="grid gap-3">
                  <Button
                    onClick={() =>
                      actionMutation.mutate({
                        path: `instances/${selectedInstance.id}/subscribe-app`,
                        body: {
                          overrideCallbackUri: localCallbackUrl,
                          verifyToken: overview?.webhook.verifyToken,
                        },
                        successMessage: 'Webhook apontado para o ambiente local.',
                      })
                    }
                    disabled={!selectedInstance || !localCallbackUrl || !overview?.webhook.verifyToken || actionMutation.isPending}
                  >
                    <Code2 className="h-4 w-4" />
                    Apontar Meta para local
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      actionMutation.mutate({
                        path: `instances/${selectedInstance.id}/subscribe-app`,
                        body: {
                          overrideCallbackUri: productionCallbackUrl,
                          verifyToken: overview?.webhook.verifyToken,
                        },
                        successMessage: 'Webhook apontado para produção.',
                      })
                    }
                    disabled={!selectedInstance || !productionCallbackUrl || !overview?.webhook.verifyToken || actionMutation.isPending}
                  >
                    <Rocket className="h-4 w-4" />
                    Apontar Meta para produção
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                Cadastre pelo menos uma instância em <Link href="/app/instancias" className="text-primary">Instâncias</Link> para testar o webhook real.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Comandos rápidos</CardTitle>
              <CardDescription>
                Fluxo mínimo para rodar localmente, receber mensagens reais e depois voltar para produção.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <CommandBlock title="1. Subir backend, Postgres e Redis" command={overview?.commands.startStack} />
            <CommandBlock title="2. Rodar seed" command={overview?.commands.seed} />
            <CommandBlock title="3. Subir frontend local" command={overview?.commands.startFrontend} />
            <CommandBlock title="4. Expor webhook local" command={overview?.commands.startTunnel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Publicação</CardTitle>
              <CardDescription>
                Depois de validar localmente, volte o webhook para produção e publique o frontend/backend.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
              <p className="font-medium text-foreground">Fluxo sugerido</p>
              <ol className="mt-3 space-y-2 list-decimal pl-5">
                <li>Suba o local e aponte a Meta para o callback local.</li>
                <li>Teste recebimento e respostas no localhost.</li>
                <li>Publique a alteração em produção.</li>
                <li>Reaponte a Meta para o callback de produção.</li>
              </ol>
            </div>
            <div className="flex flex-wrap gap-3">
              {overview?.environment.docsUrl ? (
                <Button asChild variant="secondary">
                  <a href={overview.environment.docsUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Swagger público
                  </a>
                </Button>
              ) : null}
              {overview?.environment.healthUrl ? (
                <Button asChild variant="secondary">
                  <a href={overview.environment.healthUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Health público
                  </a>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function UrlBlock({
  icon: Icon,
  label,
  value,
  helper,
  monospace = true,
}: {
  icon: typeof Globe;
  label: string;
  value: string | null;
  helper: string;
  monospace?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">{helper}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => copyToClipboard(value ?? '', `${label} copiado.`)}
          disabled={!value}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      <div
        className={`mt-3 rounded-xl border border-border bg-background-panel px-3 py-2 text-sm ${
          monospace ? 'font-mono' : ''
        }`}
      >
        {value || 'Não configurado'}
      </div>
    </div>
  );
}

function ChecklistItem({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-white/[0.03] px-4 py-3 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-success" />
      ) : (
        <CircleDashed className="h-4 w-4 text-muted-foreground" />
      )}
      <span>{label}</span>
    </div>
  );
}

function CommandBlock({ title, command }: { title: string; command?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
      <p className="mb-2 font-medium text-foreground">{title}</p>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background-panel px-3 py-2 font-mono text-xs">
        <span className="truncate">{command || '-'}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => copyToClipboard(command ?? '', 'Comando copiado.')}
          disabled={!command}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

async function copyToClipboard(value: string, message: string) {
  if (!value) {
    return;
  }

  await navigator.clipboard.writeText(value);
  toast.success(message);
}
