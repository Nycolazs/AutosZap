'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Camera,
  Loader2,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Waypoints,
} from 'lucide-react';
import { toast } from 'sonner';
import { EmbeddedSignupAction } from '@/components/instances/embedded-signup-action';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import {
  Instance,
  WhatsAppBusinessProfileOverview,
  WhatsAppInstanceDiagnostics,
  WhatsAppProfilePictureUpdateResult,
  WhatsAppTemplateSummary,
} from '@/lib/types';
import { formatDate } from '@/lib/utils';

const verticalOptions = [
  { label: 'Nao definido', value: 'UNDEFINED' },
  { label: 'Outro', value: 'OTHER' },
  { label: 'Automotivo', value: 'AUTO' },
  { label: 'Beleza', value: 'BEAUTY' },
  { label: 'Moda', value: 'APPAREL' },
  { label: 'Educacao', value: 'EDU' },
  { label: 'Entretenimento', value: 'ENTERTAIN' },
  { label: 'Eventos', value: 'EVENT_PLAN' },
  { label: 'Financeiro', value: 'FINANCE' },
  { label: 'Mercado', value: 'GROCERY' },
  { label: 'Governo', value: 'GOVT' },
  { label: 'Hotelaria', value: 'HOTEL' },
  { label: 'Saude', value: 'HEALTH' },
  { label: 'ONG', value: 'NONPROFIT' },
  { label: 'Servicos profissionais', value: 'PROF_SERVICES' },
  { label: 'Varejo', value: 'RETAIL' },
  { label: 'Turismo', value: 'TRAVEL' },
  { label: 'Restaurante', value: 'RESTAURANT' },
  { label: 'Uso pessoal', value: 'NOT_A_BIZ' },
] as const;

type BusinessProfileFormState = {
  about: string;
  description: string;
  email: string;
  website1: string;
  website2: string;
  address: string;
  vertical: string;
};

type BadgeVariant = 'default' | 'secondary' | 'success' | 'danger';

const emptyBusinessProfileForm: BusinessProfileFormState = {
  about: '',
  description: '',
  email: '',
  website1: '',
  website2: '',
  address: '',
  vertical: 'UNDEFINED',
};

function getStatusLabel(status: string) {
  switch (status) {
    case 'CONNECTED':
      return 'Conectada';
    case 'SYNCING':
      return 'Sincronizando';
    case 'DISCONNECTED':
      return 'Desconectada';
    default:
      return status;
  }
}

function getStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'CONNECTED':
      return 'success';
    case 'DISCONNECTED':
      return 'danger';
    case 'SYNCING':
      return 'default';
    default:
      return 'secondary';
  }
}

function getModeLabel(mode: string) {
  switch (mode) {
    case 'PRODUCTION':
      return 'Producao';
    case 'SANDBOX':
      return 'Sandbox';
    case 'DEV':
      return 'Desenvolvimento';
    default:
      return mode;
  }
}

function getModeVariant(mode: string): BadgeVariant {
  return mode === 'PRODUCTION' ? 'default' : 'secondary';
}

function getLastSyncLabel(value?: string | null) {
  return value ? formatDate(value) : 'Aguardando primeira sincronizacao';
}

function InstanceFact({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-[20px] border border-border/70 bg-background-panel/55 p-3.5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-medium text-foreground">
        {value}
      </p>
      {helper ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

export default function InstancesPage() {
  const queryClient = useQueryClient();
  const [instanceActionKey, setInstanceActionKey] = useState<string | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<WhatsAppInstanceDiagnostics | null>(null);
  const [businessProfileOverview, setBusinessProfileOverview] =
    useState<WhatsAppBusinessProfileOverview | null>(null);
  const [profileForm, setProfileForm] = useState<BusinessProfileFormState>(
    emptyBusinessProfileForm,
  );
  const [syncingProfile, setSyncingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingProfile, setUploadingProfile] = useState(false);

  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => apiRequest<Instance[]>('instances'),
  });

  const instances = useMemo(() => instancesQuery.data ?? [], [instancesQuery.data]);
  const connectedInstances = useMemo(
    () => instances.filter((instance) => instance.status === 'CONNECTED'),
    [instances],
  );
  const productionInstances = useMemo(
    () =>
      instances.filter(
        (instance) =>
          instance.status === 'CONNECTED' && instance.mode === 'PRODUCTION',
      ),
    [instances],
  );
  const latestSyncLabel = useMemo(() => {
    const latestSyncTime = instances.reduce<number | null>((latest, instance) => {
      if (!instance.lastSyncAt) {
        return latest;
      }

      const currentTime = new Date(instance.lastSyncAt).getTime();
      if (Number.isNaN(currentTime)) {
        return latest;
      }

      return latest === null || currentTime > latest ? currentTime : latest;
    }, null);

    if (latestSyncTime === null) {
      return 'Sem sincronizacao recente';
    }

    return formatDate(new Date(latestSyncTime));
  }, [instances]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  function resetProfileDialogState() {
    setSelectedFile(null);
    setPreviewUrl(null);
    setDiagnostics(null);
    setBusinessProfileOverview(null);
    setProfileForm(emptyBusinessProfileForm);
    setSelectedInstance(null);
  }

  async function syncInstance(instanceId: string) {
    return apiRequest<WhatsAppInstanceDiagnostics>(`instances/${instanceId}/sync`, {
      method: 'POST',
    });
  }

  async function refreshInstancesList(options?: { silent?: boolean }) {
    try {
      await instancesQuery.refetch();
      if (!options?.silent) {
        toast.success('Lista de instancias atualizada.');
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel atualizar a lista de instancias.',
      );
    }
  }

  async function runInstanceAction(
    actionKey: string,
    action: () => Promise<void>,
    options?: { refreshList?: boolean },
  ) {
    setInstanceActionKey(actionKey);

    try {
      await action();
      if (options?.refreshList) {
        await queryClient.invalidateQueries({ queryKey: ['instances'] });
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel executar a acao da instancia.',
      );
    } finally {
      setInstanceActionKey((current) => (current === actionKey ? null : current));
    }
  }

  async function removeInstance(instance: Instance) {
    const actionKey = `remove:${instance.id}`;
    setInstanceActionKey(actionKey);

    try {
      await apiRequest(`instances/${instance.id}`, { method: 'DELETE' });
      if (selectedInstance?.id === instance.id) {
        setProfileDialogOpen(false);
        resetProfileDialogState();
      }
      await queryClient.invalidateQueries({ queryKey: ['instances'] });
      toast.success('Instancia removida do workspace.');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel remover a instancia.',
      );
    } finally {
      setInstanceActionKey((current) => (current === actionKey ? null : current));
    }
  }

  async function loadBusinessProfile(instanceId: string) {
    return apiRequest<WhatsAppBusinessProfileOverview>(
      `instances/${instanceId}/business-profile`,
    );
  }

  function hydrateBusinessProfileForm(
    profileOverview: WhatsAppBusinessProfileOverview | null,
  ) {
    const websites = profileOverview?.businessProfile?.websites ?? [];
    setProfileForm({
      about: profileOverview?.businessProfile?.about ?? '',
      description: profileOverview?.businessProfile?.description ?? '',
      email: profileOverview?.businessProfile?.email ?? '',
      website1: websites[0] ?? '',
      website2: websites[1] ?? '',
      address: profileOverview?.businessProfile?.address ?? '',
      vertical: profileOverview?.businessProfile?.vertical ?? 'UNDEFINED',
    });
  }

  async function openProfileDialog(instance: Instance) {
    setSelectedInstance(instance);
    setSelectedFile(null);
    setDiagnostics(null);
    setBusinessProfileOverview(null);
    setProfileForm(emptyBusinessProfileForm);
    setProfileDialogOpen(true);
    setSyncingProfile(true);

    try {
      const [syncResponse, profileResponse] = await Promise.all([
        syncInstance(instance.id),
        loadBusinessProfile(instance.id),
      ]);
      setDiagnostics(syncResponse);
      setBusinessProfileOverview(profileResponse);
      hydrateBusinessProfileForm(profileResponse);
      await queryClient.invalidateQueries({ queryKey: ['instances'] });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel carregar o perfil.',
      );
    } finally {
      setSyncingProfile(false);
    }
  }

  async function refreshProfileData(instanceId: string, successMessage?: string) {
    setSyncingProfile(true);

    try {
      const [syncResponse, profileResponse] = await Promise.all([
        syncInstance(instanceId),
        loadBusinessProfile(instanceId),
      ]);

      setDiagnostics(syncResponse);
      setBusinessProfileOverview(profileResponse);
      hydrateBusinessProfileForm(profileResponse);
      await queryClient.invalidateQueries({ queryKey: ['instances'] });

      if (successMessage) {
        toast.success(successMessage);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel atualizar os dados do perfil.',
      );
    } finally {
      setSyncingProfile(false);
    }
  }

  async function updateBusinessProfile() {
    if (!selectedInstance) {
      return;
    }

    const websites = [profileForm.website1, profileForm.website2]
      .map((value) => value.trim())
      .filter(Boolean);

    if (
      profileForm.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileForm.email.trim())
    ) {
      toast.error('Informe um email valido para o perfil do WhatsApp.');
      return;
    }

    for (const website of websites) {
      try {
        const url = new URL(website);
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error();
        }
      } catch {
        toast.error('Use URLs completas com http:// ou https:// nos websites.');
        return;
      }
    }

    setSavingProfile(true);

    try {
      const response = await apiRequest<WhatsAppBusinessProfileOverview>(
        `instances/${selectedInstance.id}/business-profile`,
        {
          method: 'PATCH',
          body: {
            about: profileForm.about.trim() || undefined,
            description: profileForm.description.trim() || undefined,
            email: profileForm.email.trim() || undefined,
            websites: websites.length ? websites : undefined,
            address: profileForm.address.trim() || undefined,
            vertical: profileForm.vertical || undefined,
          },
        },
      );

      setBusinessProfileOverview(response);
      hydrateBusinessProfileForm(response);
      toast.success(response.detail);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel atualizar o perfil do WhatsApp.',
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadProfilePicture() {
    if (!selectedInstance) {
      return;
    }

    if (!selectedFile) {
      toast.error('Selecione uma imagem para atualizar a foto.');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    setUploadingProfile(true);

    try {
      const response = await apiRequest<WhatsAppProfilePictureUpdateResult>(
        `instances/${selectedInstance.id}/profile-picture`,
        {
          method: 'POST',
          body: formData,
        },
      );

      toast.success(response.detail);
      setSelectedFile(null);
      setBusinessProfileOverview(response);

      await refreshProfileData(
        selectedInstance.id,
        'Foto do perfil atualizada a partir da Meta.',
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel atualizar a foto do perfil.',
      );
    } finally {
      setUploadingProfile(false);
    }
  }

  const effectivePreviewUrl =
    previewUrl ??
    businessProfileOverview?.businessProfile?.profilePictureUrl ??
    diagnostics?.businessProfile?.profilePictureUrl ??
    null;

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="Instancias oficiais"
          description="Conecte numeros oficiais do WhatsApp Cloud API usando apenas o Embedded Signup da Meta."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void refreshInstancesList()}
                disabled={instancesQuery.isFetching}
              >
                {instancesQuery.isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Atualizar lista
              </Button>
              <EmbeddedSignupAction
                label="Conectar novo numero"
                variant="default"
                className="w-full sm:w-auto"
              />
            </div>
          }
        />

        <Card className="p-0">
          <CardContent className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Badge variant="secondary" className="w-fit">
                Embedded Signup oficial
              </Badge>
              <div className="space-y-2">
                <p className="text-base font-medium text-foreground">
                  Um unico fluxo para conectar novos numeros com seguranca.
                </p>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  O usuario entra na Meta, escolhe a conta Business correta e o
                  sistema salva a instancia no workspace. Sem token manual, sem
                  app secret na tela e com tentativa automatica de sync e webhook.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border/70 px-3 py-1.5">
                  1. Abrir a Meta
                </span>
                <span className="rounded-full border border-border/70 px-3 py-1.5">
                  2. Escolher WABA e numero
                </span>
                <span className="rounded-full border border-border/70 px-3 py-1.5">
                  3. Voltar com tudo conectado
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Instancias conectadas"
            value={connectedInstances.length}
            helper="Numeros ativos e prontos para operar na Meta."
            icon={RadioTower}
          />
          <StatCard
            title="Fluxo de cadastro"
            value="100% Meta"
            helper="Sem cadastro manual de token ou secret."
            icon={ShieldCheck}
          />
          <StatCard
            title="Prontas para producao"
            value={productionInstances.length}
            helper="Instancias conectadas no modo de producao."
            icon={Activity}
          />
          <StatCard
            title="Ultima sincronizacao"
            value={latestSyncLabel}
            helper="Horario mais recente salvo neste workspace."
            icon={RefreshCw}
          />
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-heading text-[22px] font-semibold tracking-tight text-foreground">
                Numeros conectados
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Acompanhe as instancias oficiais e execute as acoes operacionais
                sem sair desta tela.
              </p>
            </div>
            {instances.length ? (
              <Badge variant="secondary" className="w-fit">
                {instances.length} {instances.length === 1 ? 'instancia' : 'instancias'} no
                workspace
              </Badge>
            ) : null}
          </div>

          {instancesQuery.isError ? (
            <Card className="p-0">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    Nao foi possivel carregar as instancias
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {instancesQuery.error instanceof Error
                      ? instancesQuery.error.message
                      : 'Tivemos um erro ao consultar as instancias deste workspace.'}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => void refreshInstancesList({ silent: true })}
                >
                  <RefreshCw className="h-4 w-4" />
                  Tentar novamente
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {!instancesQuery.isError && instancesQuery.isLoading ? (
            <Card className="p-0">
              <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">Carregando instancias oficiais...</p>
              </CardContent>
            </Card>
          ) : null}

          {!instancesQuery.isError && !instancesQuery.isLoading && !instances.length ? (
            <EmptyState
              icon={Smartphone}
              title="Nenhum numero conectado ainda"
              description="Use o Embedded Signup para conectar o primeiro WhatsApp oficial do workspace. O usuario segue a jornada da Meta e o sistema salva a instancia com seguranca."
              action={
                <EmbeddedSignupAction
                  label="Conectar primeiro numero"
                  variant="default"
                />
              }
            />
          ) : null}

          {!instancesQuery.isError && instances.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {instances.map((instance) => {
                const testActionKey = `test:${instance.id}`;
                const syncActionKey = `sync:${instance.id}`;
                const subscribeActionKey = `subscribe:${instance.id}`;
                const templatesActionKey = `templates:${instance.id}`;
                const profileActionKey = `profile:${instance.id}`;
                const removeActionKey = `remove:${instance.id}`;
                const isBusy = instanceActionKey !== null;

                return (
                  <Card key={instance.id} className="overflow-hidden p-0">
                    <div className="border-b border-border/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={getStatusVariant(instance.status)}>
                              {getStatusLabel(instance.status)}
                            </Badge>
                            <Badge variant={getModeVariant(instance.mode)}>
                              {getModeLabel(instance.mode)}
                            </Badge>
                          </div>
                          <div>
                            <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                              {instance.name}
                            </h3>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              Conexao oficial com a Meta WhatsApp Cloud API
                              gerenciada pelo workspace.
                            </p>
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-border/70 bg-background-panel/65 px-3.5 py-3 text-sm sm:min-w-[210px]">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                            Ultima sincronizacao
                          </p>
                          <p className="mt-2 font-medium text-foreground">
                            {getLastSyncLabel(instance.lastSyncAt)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <CardContent className="space-y-5 p-5">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <InstanceFact
                          label="Numero conectado"
                          value={instance.phoneNumber ?? 'Aguardando retorno da Meta'}
                          helper="Numero devolvido pela Meta para esta instancia."
                        />
                        <InstanceFact
                          label="Business Account ID"
                          value={instance.businessAccountId ?? 'Nao informado'}
                          helper="WABA associada ao numero conectado."
                        />
                        <InstanceFact
                          label="Phone Number ID"
                          value={instance.phoneNumberId ?? 'Nao informado'}
                          helper="Identificador tecnico usado pela Cloud API."
                        />
                        <InstanceFact
                          label="Seguranca do cadastro"
                          value="Embedded Signup oficial"
                          helper="As credenciais sensiveis ficam no servidor e nao aparecem mais nesta tela."
                        />
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => {
                            void runInstanceAction(testActionKey, async () => {
                              const response = await apiRequest<{
                                detail: string;
                                simulated: boolean;
                              }>(`instances/${instance.id}/test`, {
                                method: 'POST',
                              });
                              toast.success(
                                response.simulated
                                  ? 'Validacao executada em modo dev.'
                                  : response.detail,
                              );
                            });
                          }}
                        >
                          {instanceActionKey === testActionKey ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Activity className="h-4 w-4" />
                          )}
                          Validar conexao
                        </Button>

                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => {
                            void runInstanceAction(
                              syncActionKey,
                              async () => {
                                const response = await syncInstance(instance.id);
                                toast.success(
                                  response.simulated
                                    ? 'Sync executado em modo dev.'
                                    : `${response.phoneNumber?.displayPhoneNumber ?? 'Numero validado'} - ${response.templates.length} templates`,
                                );
                              },
                              { refreshList: true },
                            );
                          }}
                        >
                          {instanceActionKey === syncActionKey ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Atualizar dados Meta
                        </Button>

                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => {
                            void runInstanceAction(profileActionKey, async () => {
                              await openProfileDialog(instance);
                            });
                          }}
                        >
                          {instanceActionKey === profileActionKey ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Camera className="h-4 w-4" />
                          )}
                          Perfil WhatsApp
                        </Button>

                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => {
                            void runInstanceAction(templatesActionKey, async () => {
                              const templates = await apiRequest<WhatsAppTemplateSummary[]>(
                                `instances/${instance.id}/templates`,
                              );
                              toast.success(
                                templates.length
                                  ? `${templates.length} templates carregados. Primeira: ${templates[0]?.name}`
                                  : 'Nenhum template retornado pela WABA.',
                              );
                            });
                          }}
                        >
                          {instanceActionKey === templatesActionKey ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RadioTower className="h-4 w-4" />
                          )}
                          Ver templates
                        </Button>

                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => {
                            void runInstanceAction(subscribeActionKey, async () => {
                              const response = await apiRequest<{
                                detail: string;
                                simulated: boolean;
                              }>(`instances/${instance.id}/subscribe-app`, {
                                method: 'POST',
                                body: {},
                              });
                              toast.success(
                                response.simulated
                                  ? 'Inscricao simulada em modo dev.'
                                  : response.detail,
                              );
                            });
                          }}
                        >
                          {instanceActionKey === subscribeActionKey ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Waypoints className="h-4 w-4" />
                          )}
                          Reinscrever webhook
                        </Button>

                        <ConfirmDialog
                          trigger={
                            <Button
                              type="button"
                              variant="ghost"
                              className="justify-start text-danger hover:text-danger"
                              disabled={isBusy}
                            >
                              {instanceActionKey === removeActionKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              Remover instancia
                            </Button>
                          }
                          title="Remover instancia oficial"
                          description="A instancia sera removida do workspace. Se precisar usar o numero novamente, conecte-o outra vez pelo Embedded Signup."
                          actionLabel="Remover"
                          onConfirm={() => {
                            void removeInstance(instance);
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>

      <Dialog
        open={profileDialogOpen}
        onOpenChange={(open) => {
          setProfileDialogOpen(open);
          if (!open) {
            resetProfileDialogState();
          }
        }}
      >
        <DialogContent className="w-[min(760px,calc(100vw-2rem))] sm:h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-1.5rem)]">
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle>Perfil do WhatsApp Business</DialogTitle>
            <DialogDescription>
              Atualize foto, texto de perfil, links e categoria oficial do numero
              conectado.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
              <div className="space-y-3">
                <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[24px] border border-border bg-background-panel">
                  {effectivePreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={effectivePreviewUrl}
                      alt="Foto atual do perfil"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                      <RadioTower className="h-10 w-10" />
                      <span className="text-sm">Sem foto carregada</span>
                    </div>
                  )}
                </div>

                {syncingProfile ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando perfil da Meta...
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Instancia
                    </p>
                    <p className="text-sm text-foreground">
                      {selectedInstance?.name ?? '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Numero
                    </p>
                    <p className="text-sm text-foreground">
                      {diagnostics?.phoneNumber?.displayPhoneNumber ??
                        selectedInstance?.phoneNumber ??
                        '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Nome verificado
                    </p>
                    <p className="text-sm text-foreground">
                      {diagnostics?.phoneNumber?.verifiedName ?? '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Qualidade
                    </p>
                    <p className="text-sm text-foreground">
                      {diagnostics?.phoneNumber?.qualityRating ?? '-'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profile-picture">Nova foto de perfil</Label>
                  <Input
                    id="profile-picture"
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(event) => {
                      setSelectedFile(event.target.files?.[0] ?? null);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use PNG ou JPG quadrado para melhor resultado. O upload usa o
                    App ID da instancia ou o `META_APP_ID` do ambiente.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="profile-about">Sobre</Label>
                    <Input
                      id="profile-about"
                      maxLength={139}
                      value={profileForm.about}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          about: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="profile-description">Descricao</Label>
                    <Textarea
                      id="profile-description"
                      rows={4}
                      maxLength={256}
                      value={profileForm.description}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-email">Email</Label>
                    <Input
                      id="profile-email"
                      type="email"
                      value={profileForm.email}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-vertical">Categoria / vertical</Label>
                    <NativeSelect
                      id="profile-vertical"
                      value={profileForm.vertical}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          vertical: event.target.value,
                        }))
                      }
                    >
                      {verticalOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="profile-address">Endereco</Label>
                    <Input
                      id="profile-address"
                      value={profileForm.address}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          address: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-website-1">Website 1</Label>
                    <Input
                      id="profile-website-1"
                      placeholder="https://seusite.com"
                      value={profileForm.website1}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          website1: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-website-2">Website 2</Label>
                    <Input
                      id="profile-website-2"
                      placeholder="https://suporte.seusite.com"
                      value={profileForm.website2}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          website2: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-3 border-t border-border pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                if (!selectedInstance) {
                  return;
                }
                void refreshProfileData(
                  selectedInstance.id,
                  'Perfil atualizado a partir da Meta.',
                );
              }}
              disabled={
                syncingProfile ||
                uploadingProfile ||
                savingProfile ||
                !selectedInstance
              }
            >
              {syncingProfile ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Recarregar perfil
            </Button>
            <Button
              variant="secondary"
              onClick={updateBusinessProfile}
              disabled={
                syncingProfile ||
                uploadingProfile ||
                savingProfile ||
                !selectedInstance
              }
            >
              {savingProfile ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Atualizar perfil do WhatsApp
            </Button>
            <Button
              onClick={uploadProfilePicture}
              disabled={
                !selectedFile ||
                uploadingProfile ||
                syncingProfile ||
                savingProfile
              }
            >
              {uploadingProfile ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              Atualizar foto do WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


