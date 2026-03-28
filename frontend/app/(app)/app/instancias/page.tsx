'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  Camera,
  CheckCircle2,
  Copy,
  Inbox,
  Loader2,
  LogOut,
  MessageSquareText,
  Plus,
  RadioTower,
  RefreshCw,
  QrCode,
  ShieldCheck,
  Smartphone,
  Trash2,
  Waypoints,
  Wifi,
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
  InstanceConnectionState,
  Instance,
  InstanceProvider,
  InstanceQrState,
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

type CreateQrInstanceForm = {
  name: string;
};

type InstanceHistorySyncJob = {
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED';
  startedAt?: string | null;
  finishedAt?: string | null;
  trigger?: string | null;
  detail?: string | null;
};

const DEFAULT_PROVIDER_CAPABILITIES: Record<
  InstanceProvider,
  {
    embeddedSignup: boolean;
    qrLogin: boolean;
    templates: boolean;
    businessProfile: boolean;
    webhookSubscribe: boolean;
    freeformText: boolean;
    freeformMedia: boolean;
    sessionReconnect: boolean;
    sessionLogout: boolean;
    sessionDisconnect: boolean;
  }
> = {
  META_WHATSAPP: {
    embeddedSignup: true,
    qrLogin: false,
    templates: true,
    businessProfile: true,
    webhookSubscribe: true,
    freeformText: true,
    freeformMedia: true,
    sessionReconnect: false,
    sessionLogout: false,
    sessionDisconnect: true,
  },
  WHATSAPP_WEB: {
    embeddedSignup: false,
    qrLogin: true,
    templates: false,
    businessProfile: false,
    webhookSubscribe: false,
    freeformText: true,
    freeformMedia: true,
    sessionReconnect: true,
    sessionLogout: true,
    sessionDisconnect: true,
  },
};

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

function getProviderLabel(provider: string) {
  switch (provider) {
    case 'META_WHATSAPP':
      return 'Meta oficial';
    case 'WHATSAPP_WEB':
      return 'WhatsApp Web QR';
    default:
      return provider;
  }
}

function getProviderVariant(provider: string): BadgeVariant {
  switch (provider) {
    case 'META_WHATSAPP':
      return 'success';
    case 'WHATSAPP_WEB':
      return 'default';
    default:
      return 'secondary';
  }
}

function getConnectionPhaseLabel(phase?: string | null) {
  switch (phase) {
    case 'CONNECTED':
      return 'Conectada';
    case 'CONNECTING':
      return 'Conectando';
    case 'QR_PENDING':
      return 'Aguardando QR';
    case 'QR_SCANNED':
      return 'QR escaneado';
    case 'AUTHENTICATING':
      return 'Autenticando';
    case 'RECONNECTING':
      return 'Reconectando';
    case 'LOGGED_OUT':
      return 'Deslogada';
    case 'DISCONNECTED':
      return 'Desconectada';
    case 'ERROR':
      return 'Erro';
    default:
      return phase ?? 'Desconhecido';
  }
}

function buildPendingQrConnectionState(
  detail = 'Iniciando sessao QR.',
): InstanceConnectionState {
  return {
    phase: 'CONNECTING',
    healthy: false,
    detail,
    connectedAt: null,
    lastSeenAt: null,
    qrCode: null,
    qrCodeExpiresAt: null,
    sessionId: null,
    transport: 'WHATSAPP_WEB_GATEWAY',
    raw: null,
  };
}

function buildQrDraftInstanceName() {
  return `__qr_draft__${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getInstanceHistorySyncJob(instance: Instance): InstanceHistorySyncJob | null {
  const providerMetadata = toRecord(instance.providerMetadata);
  const historySyncJob = toRecord(providerMetadata?.historySyncJob);

  if (!historySyncJob) {
    return null;
  }

  const status =
    typeof historySyncJob.status === 'string' ? historySyncJob.status : null;

  if (
    status !== 'RUNNING' &&
    status !== 'COMPLETED' &&
    status !== 'FAILED' &&
    status !== 'CANCELED'
  ) {
    return null;
  }

  return {
    status,
    startedAt:
      typeof historySyncJob.startedAt === 'string' ? historySyncJob.startedAt : null,
    finishedAt:
      typeof historySyncJob.finishedAt === 'string'
        ? historySyncJob.finishedAt
        : null,
    trigger:
      typeof historySyncJob.trigger === 'string' ? historySyncJob.trigger : null,
    detail:
      typeof historySyncJob.detail === 'string' ? historySyncJob.detail : null,
  };
}

function buildRunningHistorySyncJob(detail: string): InstanceHistorySyncJob {
  return {
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    detail,
  };
}

function isWhatsAppWebGatewayTimeoutError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  return (
    normalizedMessage.includes('gateway whatsapp web') &&
    (normalizedMessage.includes('timeout') ||
      normalizedMessage.includes('demorou mais que o esperado'))
  );
}

function isWhatsAppWebGatewaySyncCanceledError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.toLowerCase().includes('sincronizacao do historico qr') &&
    error.message.toLowerCase().includes('cancelada');
}

function buildConnectionStateFromQr(
  qrState?: InstanceQrState | null,
): InstanceConnectionState | null {
  if (!qrState) {
    return null;
  }

  const baseState = {
    healthy: false,
    connectedAt: null,
    lastSeenAt: null,
    qrCode: qrState.qrCode ?? null,
    qrCodeExpiresAt: qrState.qrCodeExpiresAt ?? null,
    sessionId: null,
    transport: 'WHATSAPP_WEB_GATEWAY',
    raw: qrState.raw ?? null,
  };

  switch (qrState.status) {
    case 'READY':
      return {
        ...baseState,
        phase: 'QR_PENDING',
        detail: 'QR disponivel para leitura.',
      };
    case 'EXPIRED':
      return {
        ...baseState,
        phase: 'QR_PENDING',
        detail: 'QR expirado. Atualize para gerar um novo codigo.',
      };
    case 'SCANNED':
      return {
        ...baseState,
        phase: 'QR_SCANNED',
        detail: 'QR lido. Finalizando autenticacao.',
      };
    case 'PENDING':
      return {
        ...baseState,
        phase: 'CONNECTING',
        detail: 'Gerando QR code.',
      };
    case 'ERROR':
      return {
        ...baseState,
        phase: 'ERROR',
        detail: 'Falha ao gerar o QR code.',
      };
    default:
      return null;
  }
}

function getProviderCapabilities(instance: Instance) {
  const provider = instance.provider === 'WHATSAPP_WEB' ? 'WHATSAPP_WEB' : 'META_WHATSAPP';

  return instance.providerCapabilities ?? DEFAULT_PROVIDER_CAPABILITIES[provider];
}

function supportsQrSession(instance: Instance) {
  return Boolean(getProviderCapabilities(instance).qrLogin);
}

function supportsMetaProfile(instance: Instance) {
  return Boolean(getProviderCapabilities(instance).businessProfile);
}

function supportsMetaTemplates(instance: Instance) {
  return Boolean(getProviderCapabilities(instance).templates);
}

function getLastSyncLabel(value?: string | null) {
  return value ? formatDate(value) : 'Aguardando primeira sincronizacao';
}

function formatSyncDuration(durationMs?: number | null) {
  if (!durationMs || durationMs < 1000) {
    return 'alguns segundos';
  }

  const totalSeconds = Math.round(durationMs / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (!seconds) {
    return `${minutes}min`;
  }

  return `${minutes}min ${seconds}s`;
}

function getSyncLoadingMessage(instance: Instance) {
  if (instance.provider === 'WHATSAPP_WEB') {
    return 'Sincronizando mensagens antigas recebidas e enviadas do WhatsApp...';
  }

  return 'Atualizando dados oficiais da Meta...';
}

function getSyncSuccessMessage(
  instance: Instance,
  response: WhatsAppInstanceDiagnostics,
) {
  if (instance.provider === 'WHATSAPP_WEB') {
    if (!response.historySync) {
      return response.detail;
    }

    return (
      `${response.historySync.detail} ` +
      `Tempo: ${formatSyncDuration(response.historySync.durationMs)}.`
    );
  }

  return response.simulated
    ? 'Sync executado em modo dev.'
    : `${response.phoneNumber?.displayPhoneNumber ?? 'Numero validado'} - ${response.templates.length} templates`;
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
  const [createQrDialogOpen, setCreateQrDialogOpen] = useState(false);
  const [createQrForm, setCreateQrForm] = useState<CreateQrInstanceForm>({
    name: '',
  });
  const [createQrPreviewInstance, setCreateQrPreviewInstance] =
    useState<Instance | null>(null);
  const [qrDialogSyncPhase, setQrDialogSyncPhase] = useState<
    'idle' | 'syncing' | 'done' | 'failed'
  >('idle');
  const [qrDialogSyncDetail, setQrDialogSyncDetail] = useState<string | null>(null);
  const [pendingQrDraftInstanceId, setPendingQrDraftInstanceId] =
    useState<string | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [selectedConnectionInstance, setSelectedConnectionInstance] =
    useState<Instance | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<WhatsAppInstanceDiagnostics | null>(null);
  const [connectionState, setConnectionState] =
    useState<InstanceConnectionState | null>(null);
  const [qrState, setQrState] = useState<InstanceQrState | null>(null);
  const [businessProfileOverview, setBusinessProfileOverview] =
    useState<WhatsAppBusinessProfileOverview | null>(null);
  const [profileForm, setProfileForm] = useState<BusinessProfileFormState>(
    emptyBusinessProfileForm,
  );
  const [syncingProfile, setSyncingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const finalizingConnectedQrInstanceIdRef = useRef<string | null>(null);
  const createQrDialogOpenRef = useRef(false);
  const activeQrConnectionInstance = useMemo(() => {
    if (connectionDialogOpen) {
      return selectedConnectionInstance;
    }

    return createQrDialogOpen ? createQrPreviewInstance : null;
  }, [
    connectionDialogOpen,
    createQrDialogOpen,
    createQrPreviewInstance,
    selectedConnectionInstance,
  ]);

  const instancesQuery = useQuery({
    queryKey: ['instances'],
    queryFn: () => apiRequest<Instance[]>('instances'),
  });

  const instances = useMemo(() => {
    const nextInstances = instancesQuery.data ?? [];

    if (!pendingQrDraftInstanceId) {
      return nextInstances;
    }

    return nextInstances.filter(
      (instance) => instance.id !== pendingQrDraftInstanceId,
    );
  }, [instancesQuery.data, pendingQrDraftInstanceId]);
  const metaInstances = useMemo(
    () => instances.filter((instance) => instance.provider === 'META_WHATSAPP'),
    [instances],
  );
  const qrInstances = useMemo(
    () => instances.filter((instance) => instance.provider === 'WHATSAPP_WEB'),
    [instances],
  );
  const qrSyncingInstanceIds = useMemo(
    () =>
      qrInstances
        .filter((instance) => getInstanceHistorySyncJob(instance)?.status === 'RUNNING')
        .map((instance) => instance.id),
    [qrInstances],
  );
  const connectedInstances = useMemo(
    () => instances.filter((instance) => instance.status === 'CONNECTED'),
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
    if (!qrSyncingInstanceIds.length) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void instancesQuery.refetch();
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [instancesQuery, qrSyncingInstanceIds]);

  const loadConnectionState = useCallback((instanceId: string) => {
    return apiRequest<InstanceConnectionState>(
      `instances/${instanceId}/connection-state`,
    );
  }, []);

  const loadQrState = useCallback((instanceId: string) => {
    return apiRequest<InstanceQrState>(`instances/${instanceId}/qr`);
  }, []);

  const hydrateQrConnectionState = useCallback(async (instanceId: string) => {
    const [stateResult, qrResult] = await Promise.allSettled([
      loadConnectionState(instanceId),
      loadQrState(instanceId),
    ]);

    const state = stateResult.status === 'fulfilled' ? stateResult.value : null;
    const qr = qrResult.status === 'fulfilled' ? qrResult.value : null;

    if (state) {
      setConnectionState(state);
    } else if (qr) {
      setConnectionState((current) => current ?? buildConnectionStateFromQr(qr));
    }

    if (qr) {
      setQrState(qr);
    }

    if (!state && !qr) {
      const reason =
        stateResult.status === 'rejected'
          ? stateResult.reason
          : qrResult.status === 'rejected'
            ? qrResult.reason
            : new Error('Nao foi possivel carregar o estado da conexao.');

      throw reason instanceof Error
        ? reason
        : new Error('Nao foi possivel carregar o estado da conexao.');
    }

    return {
      state,
      qr,
    };
  }, [loadConnectionState, loadQrState]);

  useEffect(() => {
    createQrDialogOpenRef.current = createQrDialogOpen;
  }, [createQrDialogOpen]);

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

  useEffect(() => {
    if (
      !activeQrConnectionInstance ||
      activeQrConnectionInstance.provider !== 'WHATSAPP_WEB'
    ) {
      return;
    }

    let cancelled = false;
    let polling = false;

    const pollConnectionDialog = async () => {
      if (polling) {
        return;
      }

      polling = true;

      try {
        const instanceId = activeQrConnectionInstance.id;
        const { state: nextConnectionState, qr: nextQrState } =
          await hydrateQrConnectionState(instanceId);

        if (cancelled) {
          return;
        }

        if (
          (nextConnectionState &&
            (nextConnectionState.phase !== connectionState?.phase ||
              nextConnectionState.connectedAt !== connectionState?.connectedAt ||
              nextConnectionState.lastSeenAt !== connectionState?.lastSeenAt ||
              nextConnectionState.qrCode !== connectionState?.qrCode)) ||
          (nextQrState &&
            (nextQrState.status !== qrState?.status ||
              nextQrState.qrCode !== qrState?.qrCode ||
              nextQrState.qrCodeExpiresAt !== qrState?.qrCodeExpiresAt))
        ) {
          void queryClient.invalidateQueries({ queryKey: ['instances'] });
        }
      } catch {
        // Keep polling silently while the dialog is open.
      } finally {
        polling = false;
      }
    };

    void pollConnectionDialog();

    const intervalId = window.setInterval(() => {
      void pollConnectionDialog();
    }, createQrDialogOpen ? 1200 : 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    activeQrConnectionInstance,
    connectionState?.connectedAt,
    connectionState?.lastSeenAt,
    connectionState?.phase,
    connectionState?.qrCode,
    createQrDialogOpen,
    connectionDialogOpen,
    hydrateQrConnectionState,
    qrState?.qrCode,
    qrState?.qrCodeExpiresAt,
    qrState?.status,
    queryClient,
  ]);

  const resetCreateQrDialogState = useCallback(() => {
    setCreateQrForm({ name: '' });
    setCreateQrPreviewInstance(null);
    setConnectionState(null);
    setQrState(null);
    setQrDialogSyncPhase('idle');
    setQrDialogSyncDetail(null);
    finalizingConnectedQrInstanceIdRef.current = null;
  }, []);

  function resetProfileDialogState() {
    setSelectedFile(null);
    setPreviewUrl(null);
    setDiagnostics(null);
    setBusinessProfileOverview(null);
    setProfileForm(emptyBusinessProfileForm);
    setSelectedInstance(null);
  }

  function resetConnectionDialogState() {
    setSelectedConnectionInstance(null);
    setConnectionState(null);
    setQrState(null);
  }

  const syncInstance = useCallback((instanceId: string) => {
    return apiRequest<WhatsAppInstanceDiagnostics>(`instances/${instanceId}/sync`, {
      method: 'POST',
    });
  }, []);

  const clearConversationCaches = useCallback(() => {
    return Promise.all([
      queryClient.removeQueries({ queryKey: ['conversations'] }),
      queryClient.removeQueries({ queryKey: ['conversations-summary'] }),
      queryClient.removeQueries({ queryKey: ['conversations-instances'] }),
      queryClient.removeQueries({ queryKey: ['conversation'] }),
    ]);
  }, [queryClient]);

  const setInstanceHistorySyncJobInCache = useCallback(
    (instanceId: string, historySyncJob: InstanceHistorySyncJob) => {
      queryClient.setQueryData<Instance[]>(['instances'], (current) =>
        current?.map((instance) =>
          instance.id === instanceId
            ? {
                ...instance,
                providerMetadata: {
                  ...(instance.providerMetadata ?? {}),
                  historySyncJob,
                },
              }
            : instance,
        ) ?? current,
      );
    },
    [queryClient],
  );

  const removeInstanceFromCache = useCallback(
    (instanceId: string) => {
      queryClient.setQueryData<Instance[]>(['instances'], (current) =>
        current?.filter((instance) => instance.id !== instanceId) ?? current,
      );
    },
    [queryClient],
  );

  const triggerInitialQrHistorySync = useCallback((instanceId: string) => {
    void (async () => {
      try {
        setInstanceHistorySyncJobInCache(
          instanceId,
          buildRunningHistorySyncJob(
            'Sincronizando conversas privadas e midias antigas do WhatsApp Web.',
          ),
        );
        await syncInstance(instanceId);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['instances'] }),
          clearConversationCaches(),
        ]);
      } catch (error) {
        if (isWhatsAppWebGatewayTimeoutError(error)) {
          await queryClient.invalidateQueries({ queryKey: ['instances'] });
          return;
        }

        if (isWhatsAppWebGatewaySyncCanceledError(error)) {
          await queryClient.invalidateQueries({ queryKey: ['instances'] });
          return;
        }

        toast.error(
          error instanceof Error
            ? error.message
            : 'Instancia salva, mas nao foi possivel concluir a sincronizacao inicial.',
        );
      }
    })();
  }, [
    clearConversationCaches,
    queryClient,
    setInstanceHistorySyncJobInCache,
    syncInstance,
  ]);

  async function runSyncAction(
    instance: Instance,
    options?: {
      refreshConnectionDialog?: boolean;
    },
  ) {
    const actionKey = `sync:${instance.id}`;
    const loadingToastId = toast.loading(getSyncLoadingMessage(instance), {
      duration: Number.POSITIVE_INFINITY,
      description:
        instance.provider === 'WHATSAPP_WEB'
          ? 'O gateway vai processar o historico privado e as conversas vao aparecendo aos poucos.'
          : undefined,
    });

    setInstanceActionKey(actionKey);

    try {
      if (instance.provider === 'WHATSAPP_WEB') {
        setInstanceHistorySyncJobInCache(
          instance.id,
          buildRunningHistorySyncJob(
            'Sincronizando conversas privadas e midias antigas do WhatsApp Web.',
          ),
        );
      }

      const response = await syncInstance(instance.id);
      await queryClient.invalidateQueries({ queryKey: ['instances'] });

      if (options?.refreshConnectionDialog && instance.provider === 'WHATSAPP_WEB') {
        await hydrateQrConnectionState(instance.id);
      }

      toast.success(getSyncSuccessMessage(instance, response), {
        id: loadingToastId,
      });

      return response;
    } catch (error) {
      if (
        instance.provider === 'WHATSAPP_WEB' &&
        isWhatsAppWebGatewayTimeoutError(error)
      ) {
        toast.message('Sincronizacao iniciada em segundo plano.', {
          id: loadingToastId,
          description:
            'O gateway continua processando o historico. Atualize a lista em alguns instantes.',
        });
        return null;
      }

      if (
        instance.provider === 'WHATSAPP_WEB' &&
        isWhatsAppWebGatewaySyncCanceledError(error)
      ) {
        await queryClient.invalidateQueries({ queryKey: ['instances'] });
        toast.dismiss(loadingToastId);
        return null;
      }

      toast.error(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel sincronizar a instancia.',
        {
          id: loadingToastId,
        },
      );
      return null;
    } finally {
      setInstanceActionKey((current) => (current === actionKey ? null : current));
    }
  }

  const waitForQrAvailability = useCallback(async (instanceId: string) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        const { state, qr } = await hydrateQrConnectionState(instanceId);

        if (state?.phase === 'CONNECTED' || qr?.qrCode || state?.qrCode) {
          return;
        }
      } catch {
        // Keep retrying while the preview dialog is open.
      }

      if (attempt === 1 || attempt === 4) {
        try {
          await apiRequest(`instances/${instanceId}/qr/refresh`, {
            method: 'POST',
          });
        } catch {
          // Keep polling silently; the regular loop continues below.
        }
      }

      await new Promise((resolve) => window.setTimeout(resolve, 800));
    }
  }, [hydrateQrConnectionState]);

  const finalizeConnectedQrInstance = useCallback(
    async (instance: Instance) => {
      const name = createQrForm.name.trim();

      if (!name) {
        toast.error('Informe um nome para finalizar a instancia.');
        return;
      }

      if (finalizingConnectedQrInstanceIdRef.current === instance.id) {
        return;
      }

      finalizingConnectedQrInstanceIdRef.current = instance.id;
      const actionKey = `finalize-qr:${instance.id}`;
      setInstanceActionKey(actionKey);

      try {
        await apiRequest<Instance>(`instances/${instance.id}`, {
          method: 'PATCH',
          body: { name },
        });

        setPendingQrDraftInstanceId((current) =>
          current === instance.id ? null : current,
        );

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['instances'] }),
          clearConversationCaches(),
        ]);

        setQrDialogSyncPhase('syncing');
        setQrDialogSyncDetail(null);

        try {
          setInstanceHistorySyncJobInCache(
            instance.id,
            buildRunningHistorySyncJob(
              'Sincronizando conversas privadas e midias antigas do WhatsApp Web.',
            ),
          );
          await syncInstance(instance.id);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['instances'] }),
            clearConversationCaches(),
          ]);
          setQrDialogSyncPhase('done');
          setQrDialogSyncDetail('Historico sincronizado com sucesso.');
        } catch (syncError) {
          if (
            isWhatsAppWebGatewayTimeoutError(syncError) ||
            isWhatsAppWebGatewaySyncCanceledError(syncError)
          ) {
            await queryClient.invalidateQueries({ queryKey: ['instances'] });
            setQrDialogSyncPhase('done');
            setQrDialogSyncDetail(
              'Sincronizacao continua em segundo plano. As conversas apareceram em breve.',
            );
          } else {
            setQrDialogSyncPhase('failed');
            setQrDialogSyncDetail(
              syncError instanceof Error
                ? syncError.message
                : 'Nao foi possivel concluir a sincronizacao.',
            );
          }
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Nao foi possivel finalizar a instancia QR.',
        );
      } finally {
        if (finalizingConnectedQrInstanceIdRef.current === instance.id) {
          finalizingConnectedQrInstanceIdRef.current = null;
        }
        setInstanceActionKey((current) => (current === actionKey ? null : current));
      }
    },
    [
      clearConversationCaches,
      createQrForm.name,
      queryClient,
      setInstanceHistorySyncJobInCache,
      syncInstance,
    ],
  );

  const discardPendingQrDraftInstance = useCallback(async (
    instanceId: string,
    options?: { silent?: boolean },
  ) => {
    try {
      await apiRequest(`instances/${instanceId}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: ['instances'] });

      if (!options?.silent) {
        toast.success('Sessao QR descartada.');
      }

      return true;
    } catch (error) {
      if (!options?.silent) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Nao foi possivel descartar a sessao QR.',
        );
      }

      await queryClient.invalidateQueries({ queryKey: ['instances'] });
      return false;
    } finally {
      setPendingQrDraftInstanceId((current) =>
        current === instanceId ? null : current,
      );
    }
  }, [queryClient]);

  const closeCreateQrDialog = useCallback(() => {
    const previewInstanceId = createQrPreviewInstance?.id ?? null;

    setCreateQrDialogOpen(false);
    resetCreateQrDialogState();

    if (
      previewInstanceId &&
      pendingQrDraftInstanceId === previewInstanceId
    ) {
      void discardPendingQrDraftInstance(previewInstanceId, {
        silent: true,
      });
    }
  }, [
    createQrPreviewInstance?.id,
    discardPendingQrDraftInstance,
    pendingQrDraftInstanceId,
    resetCreateQrDialogState,
  ]);

  async function openConnectionDialog(instance: Instance) {
    setSelectedConnectionInstance(instance);
    setConnectionDialogOpen(true);
    setConnectionState(null);
    setQrState(null);

    try {
      await hydrateQrConnectionState(instance.id);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel carregar o estado da conexao.',
      );
    }
  }

  function primeConnectionDialog(instance: Instance) {
    setSelectedConnectionInstance(instance);
    setConnectionDialogOpen(true);
    setConnectionState(null);
    setQrState(null);
  }

  const startQrDraftSession = useCallback(async () => {
    if (
      createQrPreviewInstance ||
      instanceActionKey === 'create-qr-draft'
    ) {
      return;
    }

    const draftName = buildQrDraftInstanceName();
    const actionKey = 'create-qr-draft';

    setInstanceActionKey(actionKey);
    setConnectionState(buildPendingQrConnectionState());
    setQrState(null);
    let createdInstance: Instance | null = null;

    try {
      createdInstance = await apiRequest<Instance>('instances', {
        method: 'POST',
        body: {
          name: draftName,
          provider: 'WHATSAPP_WEB',
        },
      });

      if (!createQrDialogOpenRef.current) {
        await discardPendingQrDraftInstance(createdInstance.id, { silent: true });
        return;
      }

      setCreateQrPreviewInstance(createdInstance);
      setPendingQrDraftInstanceId(createdInstance.id);
      setConnectionState(
        createdInstance.connectionState ??
          buildConnectionStateFromQr(createdInstance.qr) ??
          buildPendingQrConnectionState(),
      );
      setQrState(createdInstance.qr ?? null);
      const connectedInstance = await apiRequest<Instance>(
        `instances/${createdInstance.id}/connect`,
        {
          method: 'POST',
        },
      );

      if (!createQrDialogOpenRef.current) {
        await discardPendingQrDraftInstance(createdInstance.id, { silent: true });
        return;
      }

      setCreateQrPreviewInstance(connectedInstance);
      setConnectionState(
        connectedInstance.connectionState ??
          buildConnectionStateFromQr(connectedInstance.qr) ??
          buildPendingQrConnectionState('Gerando QR code.'),
      );
      setQrState(connectedInstance.qr ?? null);
      void waitForQrAvailability(createdInstance.id);
      toast.success(
        'Sessao QR iniciada. Escaneie o codigo para concluir a conexao.',
      );
    } catch (error) {
      if (createdInstance) {
        await discardPendingQrDraftInstance(createdInstance.id, { silent: true });
      }

      setCreateQrPreviewInstance(null);
      setPendingQrDraftInstanceId(null);
      setConnectionState(null);
      setQrState(null);

      toast.error(
        error instanceof Error ? error.message : 'Nao foi possivel criar a instancia QR.',
      );
    } finally {
      setInstanceActionKey((current) =>
        current === actionKey ? null : current,
      );
    }
  }, [
    createQrPreviewInstance,
    discardPendingQrDraftInstance,
    instanceActionKey,
    waitForQrAvailability,
  ]);

  useEffect(() => {
    if (
      !createQrDialogOpen ||
      createQrPreviewInstance ||
      pendingQrDraftInstanceId ||
      instanceActionKey === 'create-qr-draft'
    ) {
      return;
    }

    void startQrDraftSession();
  }, [
    createQrDialogOpen,
    createQrPreviewInstance,
    instanceActionKey,
    pendingQrDraftInstanceId,
    startQrDraftSession,
  ]);

  async function runQrAction(
    actionKey: string,
    instanceId: string,
    actionPath: string,
    method: 'POST' | 'GET' = 'POST',
  ) {
    await runInstanceAction(
      actionKey,
      async () => {
        await apiRequest(`instances/${instanceId}/${actionPath}`, {
          method,
        });
        await hydrateQrConnectionState(instanceId);
      },
      { refreshList: true },
    );
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
      removeInstanceFromCache(instance.id);
      if (selectedInstance?.id === instance.id) {
        setProfileDialogOpen(false);
        resetProfileDialogState();
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['instances'] }),
        queryClient.removeQueries({ queryKey: ['conversations'] }),
        queryClient.removeQueries({ queryKey: ['conversations-summary'] }),
        queryClient.removeQueries({ queryKey: ['conversations-instances'] }),
        queryClient.removeQueries({ queryKey: ['conversation'] }),
      ]);
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
          description="Gerencie instancias oficiais da Meta e instancias QR do WhatsApp Web no mesmo workspace."
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
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => setCreateQrDialogOpen(true)}
              >
                <QrCode className="h-4 w-4" />
                Conectar via QR
              </Button>
            </div>
          }
        />

        <Card className="p-0">
          <CardContent className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="w-fit">
                  Embedded Signup oficial
                </Badge>
                <Badge variant="default" className="w-fit">
                  QR self-hosted
                </Badge>
              </div>
              <div className="space-y-2">
                <p className="text-base font-medium text-foreground">
                  Um unico painel para dois fluxos de WhatsApp com politicas diferentes.
                </p>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  A integracao oficial da Meta continua via Embedded Signup, enquanto
                  a nova via QR cria uma sessao local do WhatsApp Web gerenciada
                  pelo gateway interno do projeto.
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
                <span className="rounded-full border border-border/70 px-3 py-1.5">
                  4. Ou criar um QR e escanear pelo WhatsApp
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Instancias conectadas"
            value={connectedInstances.length}
            helper="Numeros ativos e prontos para operar."
            icon={RadioTower}
          />
          <StatCard
            title="Instancias Meta"
            value={metaInstances.length}
            helper="Fluxo oficial com Embedded Signup."
            icon={ShieldCheck}
          />
          <StatCard
            title="Instancias QR"
            value={qrInstances.length}
            helper="Sessoes self-hosted com login por QR."
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
              description="Use o Embedded Signup para conectar o primeiro numero oficial ou crie uma instancia QR para logar via WhatsApp Web."
              action={
                <div className="flex flex-col gap-2 sm:flex-row">
                  <EmbeddedSignupAction
                    label="Conectar primeiro numero"
                    variant="default"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setCreateQrDialogOpen(true)}
                  >
                    <QrCode className="h-4 w-4" />
                    Conectar via QR
                  </Button>
                </div>
              }
            />
          ) : null}

          {!instancesQuery.isError && instances.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {instances.map((instance) => {
                const provider = instance.provider as InstanceProvider;
                const providerCapabilities = getProviderCapabilities(instance);
                const isMetaInstance = provider === 'META_WHATSAPP';
                const isQrInstance = provider === 'WHATSAPP_WEB';
                const testActionKey = `test:${instance.id}`;
                const syncActionKey = `sync:${instance.id}`;
                const subscribeActionKey = `subscribe:${instance.id}`;
                const templatesActionKey = `templates:${instance.id}`;
                const profileActionKey = `profile:${instance.id}`;
                const connectionActionKey = `connection:${instance.id}`;
                const connectActionKey = `connect:${instance.id}`;
                const reconnectActionKey = `reconnect:${instance.id}`;
                const refreshQrActionKey = `refresh-qr:${instance.id}`;
                const logoutActionKey = `logout:${instance.id}`;
                const disconnectActionKey = `disconnect:${instance.id}`;
                const removeActionKey = `remove:${instance.id}`;
                const historySyncJob = isQrInstance
                  ? getInstanceHistorySyncJob(instance)
                  : null;
                const isHistorySyncRunning = historySyncJob?.status === 'RUNNING';
                const isBusy = instanceActionKey !== null;
                const isRemovingThisInstance = instanceActionKey === removeActionKey;
                const isSyncingThisInstance = instanceActionKey === syncActionKey;
                const hasBlockingInstanceAction =
                  Boolean(instanceActionKey?.endsWith(`:${instance.id}`)) &&
                  !isSyncingThisInstance;

                return (
                  <Card key={instance.id} className="overflow-hidden p-0">
                    <div className="border-b border-border/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={getProviderVariant(provider)}>
                              {getProviderLabel(provider)}
                            </Badge>
                            <Badge variant={getStatusVariant(instance.status)}>
                              {getStatusLabel(instance.status)}
                            </Badge>
                            <Badge variant={getModeVariant(instance.mode)}>
                              {getModeLabel(instance.mode)}
                            </Badge>
                            {isHistorySyncRunning ? (
                              <Badge
                                variant="default"
                                className="inline-flex items-center gap-1.5"
                              >
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Sincronizando historico
                              </Badge>
                            ) : null}
                          </div>
                          <div>
                            <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                              {instance.name}
                            </h3>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              {isMetaInstance
                                ? 'Conexao oficial com a Meta WhatsApp Cloud API gerenciada pelo workspace.'
                                : 'Sessao WhatsApp Web self-hosted, gerenciada por QR e persistencia local.'}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-[20px] border border-border/70 bg-background-panel/65 px-3.5 py-3 text-sm sm:min-w-[210px]">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                            {isQrInstance ? 'Estado da sessao' : 'Ultima sincronizacao'}
                          </p>
                          <p className="mt-2 font-medium text-foreground">
                            {isQrInstance
                              ? getConnectionPhaseLabel(
                                  instance.connectionState?.phase ??
                                    instance.status,
                                )
                              : getLastSyncLabel(instance.lastSyncAt)}
                          </p>
                          {instance.connectionState?.detail ? (
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {instance.connectionState.detail}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                      <CardContent className="space-y-5 p-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                        <InstanceFact
                          label="Numero conectado"
                          value={
                            instance.phoneNumber ??
                            (isQrInstance ? 'Aguardando login por QR' : 'Aguardando retorno da Meta')
                          }
                          helper={
                            isQrInstance
                              ? 'Numero e estado retornados pela sessao local.'
                              : 'Numero devolvido pela Meta para esta instancia.'
                          }
                        />
                        <InstanceFact
                          label="Identificador externo"
                          value={
                            instance.externalInstanceId ??
                            (isMetaInstance
                              ? instance.businessAccountId ?? 'Nao informado'
                              : 'Nao informado')
                          }
                          helper={
                            isQrInstance
                              ? 'Sessao/conta externa gerenciada pelo gateway.'
                              : 'WABA associada ao numero conectado.'
                          }
                        />
                        <InstanceFact
                          label="Estado da conexao"
                          value={getConnectionPhaseLabel(
                            instance.connectionState?.phase ?? instance.status,
                          )}
                          helper={
                            instance.connectionState?.detail ??
                            'Estado padrao retornado pela API.'
                          }
                        />
                        <InstanceFact
                          label="Capacidades"
                          value={
                            [
                              providerCapabilities.embeddedSignup
                                ? 'Embedded Signup'
                                : null,
                              providerCapabilities.qrLogin ? 'QR login' : null,
                              providerCapabilities.templates ? 'Templates' : null,
                              providerCapabilities.businessProfile
                                ? 'Perfil Business'
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' • ') || 'Sem capacidades informadas'
                          }
                          helper="A interface adapta as acoes ao provedor da instancia."
                          />
                        </div>

                        {isHistorySyncRunning ? (
                          <div className="rounded-[20px] border border-primary/20 bg-primary/10 px-4 py-3">
                            <div className="flex items-start gap-3">
                              <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  Sincronizando conversas e midias antigas
                                </p>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                  {historySyncJob?.detail ??
                                    'As conversas vao aparecendo aos poucos enquanto o gateway processa o historico privado.'}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isBusy}
                          onClick={() => {
                            void runInstanceAction(connectionActionKey, async () => {
                              await openConnectionDialog(instance);
                            });
                          }}
                        >
                          {instanceActionKey === connectionActionKey ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wifi className="h-4 w-4" />
                          )}
                          Ver conexao
                        </Button>

                        <Button asChild variant="secondary">
                          <Link href={`/app/inbox/instancias/${instance.id}`}>
                            <MessageSquareText className="h-4 w-4" />
                            Abrir inbox separado
                          </Link>
                        </Button>

                        {isMetaInstance ? (
                          <>
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
                                void runSyncAction(instance);
                              }}
                            >
                              {instanceActionKey === syncActionKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                              Atualizar dados Meta
                            </Button>

                            {supportsMetaProfile(instance) ? (
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
                            ) : null}

                            {supportsMetaTemplates(instance) ? (
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={isBusy}
                                onClick={() => {
                                  void runInstanceAction(
                                    templatesActionKey,
                                    async () => {
                                      const templates = await apiRequest<
                                        WhatsAppTemplateSummary[]
                                      >(`instances/${instance.id}/templates`);
                                      toast.success(
                                        templates.length
                                          ? `${templates.length} templates carregados. Primeira: ${templates[0]?.name}`
                                          : 'Nenhum template retornado pela WABA.',
                                      );
                                    },
                                  );
                                }}
                              >
                                {instanceActionKey === templatesActionKey ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RadioTower className="h-4 w-4" />
                                )}
                                Ver templates
                              </Button>
                            ) : null}

                            <Button
                              type="button"
                              variant="secondary"
                              disabled={isBusy}
                              onClick={() => {
                                void runInstanceAction(
                                  subscribeActionKey,
                                  async () => {
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
                                  },
                                );
                              }}
                            >
                              {instanceActionKey === subscribeActionKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Waypoints className="h-4 w-4" />
                              )}
                              Reinscrever webhook
                            </Button>
                          </>
                        ) : null}

                        {isQrInstance ? (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={isBusy || !supportsQrSession(instance)}
                              onClick={() => {
                                primeConnectionDialog(instance);
                                void runQrAction(
                                  connectActionKey,
                                  instance.id,
                                  'connect',
                                );
                              }}
                            >
                              {instanceActionKey === connectActionKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <QrCode className="h-4 w-4" />
                              )}
                              Iniciar QR
                            </Button>

                            <Button
                              type="button"
                              variant="secondary"
                              disabled={isBusy || !supportsQrSession(instance)}
                              onClick={() => {
                                primeConnectionDialog(instance);
                                void runQrAction(
                                  refreshQrActionKey,
                                  instance.id,
                                  'qr/refresh',
                                );
                              }}
                            >
                              {instanceActionKey === refreshQrActionKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                              Atualizar QR
                            </Button>

                            <Button
                              type="button"
                              variant="secondary"
                              disabled={isBusy || !supportsQrSession(instance)}
                              onClick={() => {
                                void runSyncAction(instance, {
                                  refreshConnectionDialog:
                                    selectedConnectionInstance?.id === instance.id,
                                });
                              }}
                            >
                              {instanceActionKey === syncActionKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                              Sincronizar historico
                            </Button>

                            <Button
                              type="button"
                              variant="secondary"
                              disabled={isBusy || !providerCapabilities.sessionReconnect}
                              onClick={() => {
                                primeConnectionDialog(instance);
                                void runQrAction(
                                  reconnectActionKey,
                                  instance.id,
                                  'reconnect',
                                );
                              }}
                            >
                              {instanceActionKey === reconnectActionKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                              Reconectar
                            </Button>

                            <Button
                              type="button"
                              variant="secondary"
                              disabled={isBusy || !providerCapabilities.sessionLogout}
                              onClick={() => {
                                primeConnectionDialog(instance);
                                void runQrAction(
                                  logoutActionKey,
                                  instance.id,
                                  'logout',
                                );
                              }}
                            >
                              {instanceActionKey === logoutActionKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <LogOut className="h-4 w-4" />
                              )}
                              Logout
                            </Button>

                            <Button
                              type="button"
                              variant="secondary"
                              disabled={isBusy || !providerCapabilities.sessionDisconnect}
                              onClick={() => {
                                primeConnectionDialog(instance);
                                void runQrAction(
                                  disconnectActionKey,
                                  instance.id,
                                  'disconnect',
                                );
                              }}
                            >
                              {instanceActionKey === disconnectActionKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Wifi className="h-4 w-4" />
                              )}
                              Desconectar
                            </Button>
                          </>
                        ) : null}

                        <ConfirmDialog
                          trigger={
                            <Button
                              type="button"
                              variant="ghost"
                              className="justify-start text-danger hover:text-danger"
                              disabled={isRemovingThisInstance || hasBlockingInstanceAction}
                            >
                              {instanceActionKey === removeActionKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              Remover instancia
                            </Button>
                          }
                          title={
                            isMetaInstance
                              ? 'Remover instancia oficial'
                              : 'Remover instancia QR'
                          }
                          description={
                            isMetaInstance
                              ? 'A instancia sera removida do workspace. Se precisar usar o numero novamente, conecte-o outra vez pelo Embedded Signup.'
                              : 'A instancia QR sera removida do workspace. Se precisar usar o numero novamente, crie uma nova sessao QR.'
                          }
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
        open={createQrDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            resetCreateQrDialogState();
            setCreateQrDialogOpen(true);
            return;
          }

          closeCreateQrDialog();
        }}
      >
        <DialogContent
          className={
            createQrPreviewInstance
              ? 'sm:max-w-lg sm:h-[min(86dvh,760px)] sm:max-h-[min(86dvh,760px)] sm:overflow-hidden'
              : 'sm:max-w-lg'
          }
        >
          <DialogHeader className={createQrPreviewInstance ? 'shrink-0' : undefined}>
            <DialogTitle>
              {qrDialogSyncPhase === 'syncing'
                ? 'Sincronizando historico'
                : qrDialogSyncPhase === 'done'
                  ? 'Instancia pronta'
                  : qrDialogSyncPhase === 'failed'
                    ? 'Sincronizacao com falha'
                    : connectionState?.phase === 'CONNECTED'
                      ? 'Defina o nome da instancia'
                      : 'Conectar numero por QR'}
            </DialogTitle>
            <DialogDescription>
              {qrDialogSyncPhase === 'syncing'
                ? 'Buscando conversas privadas do WhatsApp Web. Isso pode levar alguns minutos.'
                : qrDialogSyncPhase === 'done'
                  ? 'A instancia foi salva e o historico foi sincronizado com sucesso.'
                  : qrDialogSyncPhase === 'failed'
                    ? 'A instancia foi salva, mas a sincronizacao encontrou um problema.'
                    : connectionState?.phase === 'CONNECTED'
                      ? 'O numero ja conectou. Agora informe o nome final para salvar a instancia no workspace.'
                      : 'A sessao QR e iniciada imediatamente. O QR aparece assim que o gateway terminar de preparar a conexao.'}
            </DialogDescription>
          </DialogHeader>

          {createQrPreviewInstance ? (
            <div className="space-y-4 sm:flex sm:min-h-0 sm:flex-1 sm:flex-col sm:space-y-0 sm:gap-4">
              {qrDialogSyncPhase === 'idle' ? (
                <div className="rounded-[24px] border border-border/70 bg-background-panel/55 p-4 sm:shrink-0">
                  <p className="text-sm font-medium text-foreground">
                    {connectionState?.phase === 'CONNECTED'
                      ? 'Sessao conectada'
                      : 'Sessao QR temporaria'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Status: {getConnectionPhaseLabel(connectionState?.phase)}
                  </p>
                </div>
              ) : null}

              {qrDialogSyncPhase === 'syncing' ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center gap-5 rounded-2xl border border-border/70 bg-background-panel/35 px-6 py-8 text-center sm:min-h-0 sm:flex-1">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <div className="w-full space-y-3">
                    <p className="text-sm font-medium text-foreground">
                      Sincronizando conversas...
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Buscando historico de mensagens privadas do WhatsApp Web.
                      Isso pode levar alguns minutos.
                    </p>
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-border">
                      <div className="animate-sync-progress absolute inset-y-0 w-1/3 rounded-full bg-primary" />
                    </div>
                  </div>
                </div>
              ) : qrDialogSyncPhase === 'done' ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-6 py-8 text-center sm:min-h-0 sm:flex-1">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Historico sincronizado
                    </p>
                    {qrDialogSyncDetail ? (
                      <p className="text-xs leading-5 text-muted-foreground">
                        {qrDialogSyncDetail}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : qrDialogSyncPhase === 'failed' ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] px-6 py-8 text-center sm:min-h-0 sm:flex-1">
                  <AlertCircle className="h-10 w-10 text-amber-500" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Instancia salva com aviso
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {qrDialogSyncDetail ?? 'A sincronizacao inicial encontrou um problema. Tente sincronizar manualmente depois.'}
                    </p>
                  </div>
                </div>
              ) : connectionState?.phase === 'CONNECTED' ? (
                <div className="space-y-4 rounded-2xl border border-border/70 bg-background-panel/35 px-6 py-5 sm:min-h-0 sm:flex-1">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <QrCode className="h-10 w-10 text-primary" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        Numero conectado com sucesso
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Agora informe o nome final da instancia para salvar e iniciar a sincronizacao.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="qr-instance-name">Nome da instancia</Label>
                    <Input
                      id="qr-instance-name"
                      value={createQrForm.name}
                      onChange={(event) =>
                        setCreateQrForm({ name: event.target.value })
                      }
                      placeholder="Ex.: Atendimento Comercial"
                    />
                  </div>
                </div>
              ) : qrState?.qrCode ?? connectionState?.qrCode ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={
                    (qrState?.qrCode ?? connectionState?.qrCode)?.startsWith('data:')
                      ? (qrState?.qrCode ?? connectionState?.qrCode) ?? ''
                      : `data:image/png;base64,${
                          qrState?.qrCode ?? connectionState?.qrCode ?? ''
                        }`
                  }
                  alt="QR code da instancia"
                  className="mx-auto max-w-[320px] sm:max-h-[min(44dvh,380px)] sm:w-full rounded-2xl border border-border bg-white p-4 object-contain"
                />
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-background-panel/35 px-6 text-center sm:min-h-0 sm:flex-1">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Gerando QR code
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      A instancia esta sendo iniciada. Isso pode levar alguns minutos. O QR aparece aqui automaticamente quando estiver pronto.
                    </p>
                  </div>
                </div>
              )}

              {qrDialogSyncPhase === 'idle' ? (
                <p className="text-xs text-muted-foreground sm:shrink-0">
                  {connectionState?.phase === 'CONNECTED'
                    ? 'A instancia so sera exibida na lista depois que voce salvar o nome.'
                    : `Expira em: ${
                        qrState?.qrCodeExpiresAt ??
                        connectionState?.qrCodeExpiresAt ??
                        'nao informado'
                      }`}
                </p>
              ) : null}

              <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row">
                {qrDialogSyncPhase === 'syncing' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setQrDialogSyncPhase('done');
                      setQrDialogSyncDetail('Sincronizacao continua em segundo plano.');
                    }}
                  >
                    Minimizar
                  </Button>
                ) : qrDialogSyncPhase === 'done' || qrDialogSyncPhase === 'failed' ? (
                  <Link href="/app/inbox">
                    <Button type="button">
                      <Inbox className="h-4 w-4" />
                      Ir para o Inbox
                    </Button>
                  </Link>
                ) : connectionState?.phase === 'CONNECTED' ? (
                  <Button
                    type="button"
                    onClick={() => void finalizeConnectedQrInstance(createQrPreviewInstance)}
                    disabled={instanceActionKey === `finalize-qr:${createQrPreviewInstance.id}` || !createQrForm.name.trim()}
                  >
                    {instanceActionKey === `finalize-qr:${createQrPreviewInstance.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Salvar instancia
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      createQrPreviewInstance
                        ? void runQrAction(
                            `refresh-qr:${createQrPreviewInstance.id}`,
                            createQrPreviewInstance.id,
                            'qr/refresh',
                          )
                        : undefined
                    }
                  >
                    <RefreshCw className="h-4 w-4" />
                    Atualizar QR
                  </Button>
                )}
                {qrDialogSyncPhase === 'idle' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={closeCreateQrDialog}
                  >
                    Cancelar
                  </Button>
                ) : qrDialogSyncPhase === 'done' || qrDialogSyncPhase === 'failed' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      resetCreateQrDialogState();
                      setCreateQrDialogOpen(false);
                    }}
                  >
                    Fechar
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-background-panel/35 px-6 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Iniciando sessao QR
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Estamos criando uma sessao temporaria para gerar o QR o mais rapido possivel.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={connectionDialogOpen}
        onOpenChange={(open) => {
          setConnectionDialogOpen(open);
          if (!open) {
            resetConnectionDialogState();
          }
        }}
      >
        <DialogContent className="w-[min(900px,calc(100vw-2rem))] sm:max-h-[calc(100dvh-1.5rem)]">
          <DialogHeader>
            <DialogTitle>
              Conexao {selectedConnectionInstance?.name ?? 'da instancia'}
            </DialogTitle>
            <DialogDescription>
              {selectedConnectionInstance?.provider === 'WHATSAPP_WEB'
                ? 'Acompanhe o QR, o estado da sessao e as acoes de controle da instancia self-hosted.'
                : 'Acompanhe o estado resumido da instancia oficial e os metadados retornados pela API.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <InstanceFact
                  label="Provedor"
                  value={
                    selectedConnectionInstance
                      ? getProviderLabel(selectedConnectionInstance.provider)
                      : '-'
                  }
                  helper="Acoes e capacidades sao derivadas deste provedor."
                />
                <InstanceFact
                  label="Fase"
                  value={getConnectionPhaseLabel(connectionState?.phase)}
                  helper={connectionState?.detail ?? 'Sem detalhe adicional.'}
                />
                <InstanceFact
                  label="Conectada em"
                  value={connectionState?.connectedAt ?? 'Nao informado'}
                  helper="Preenchido quando o gateway confirma a sessao."
                />
                <InstanceFact
                  label="Ultima atividade"
                  value={connectionState?.lastSeenAt ?? 'Nao informado'}
                  helper="Atualizado por eventos da sessao ou mensagens."
                />
              </div>

              {selectedConnectionInstance?.provider === 'WHATSAPP_WEB' ? (
                <div className="space-y-3 rounded-[24px] border border-border/70 bg-background-panel/55 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">QR atual</p>
                      <p className="text-xs text-muted-foreground">
                        Atualize o QR se ele expirar antes do scan.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const qrCode = qrState?.qrCode ?? connectionState?.qrCode;
                          if (!qrCode) {
                            toast.error('Nao ha QR disponivel para copiar.');
                            return;
                          }
                          void navigator.clipboard
                            .writeText(qrCode)
                            .then(() => toast.success('QR copiado para a area de transferencia.'));
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        Copiar
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          selectedConnectionInstance
                            ? void runQrAction(
                                `refresh-qr:${selectedConnectionInstance.id}`,
                                selectedConnectionInstance.id,
                                'qr/refresh',
                              )
                            : undefined
                        }
                      >
                        <RefreshCw className="h-4 w-4" />
                        Atualizar
                      </Button>
                    </div>
                  </div>

                  {qrState?.qrCode ?? connectionState?.qrCode ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        (qrState?.qrCode ?? connectionState?.qrCode)?.startsWith(
                          'data:',
                        )
                          ? (qrState?.qrCode ?? connectionState?.qrCode) ?? ''
                          : `data:image/png;base64,${
                              qrState?.qrCode ?? connectionState?.qrCode ?? ''
                            }`
                      }
                      alt="QR code da instancia"
                      className="mx-auto max-w-[320px] rounded-2xl border border-border bg-white p-4"
                    />
                  ) : (
                    <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-border/70 text-sm text-muted-foreground">
                      QR indisponivel no momento.
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Expira em:{' '}
                    {qrState?.qrCodeExpiresAt ?? connectionState?.qrCodeExpiresAt ?? 'nao informado'}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="rounded-[24px] border border-border/70 bg-background-panel/55 p-4">
                <p className="text-sm font-medium text-foreground">Acoes</p>
                {selectedConnectionInstance?.provider === 'WHATSAPP_WEB' &&
                instanceActionKey === `sync:${selectedConnectionInstance.id}` ? (
                  <div className="mt-3 flex items-start gap-2 rounded-2xl border border-border/70 bg-background-panel/65 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                    <span>
                      Sincronizando mensagens antigas recebidas e enviadas desta sessão.
                      Isso pode levar alguns minutos em históricos grandes.
                    </span>
                  </div>
                ) : null}
                <div className="mt-3 grid gap-2">
                  {selectedConnectionInstance?.provider === 'WHATSAPP_WEB' ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          selectedConnectionInstance
                            ? void runQrAction(
                                `connect:${selectedConnectionInstance.id}`,
                                selectedConnectionInstance.id,
                                'connect',
                              )
                            : undefined
                        }
                      >
                        <QrCode className="h-4 w-4" />
                        Iniciar QR
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          selectedConnectionInstance
                            ? void runQrAction(
                                `reconnect:${selectedConnectionInstance.id}`,
                                selectedConnectionInstance.id,
                                'reconnect',
                              )
                            : undefined
                        }
                      >
                        <RefreshCw className="h-4 w-4" />
                        Reconectar
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          selectedConnectionInstance
                            ? void runSyncAction(selectedConnectionInstance, {
                                refreshConnectionDialog: true,
                              })
                            : undefined
                        }
                      >
                        {instanceActionKey ===
                        `sync:${selectedConnectionInstance?.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Sincronizar historico
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          selectedConnectionInstance
                            ? void runQrAction(
                                `logout:${selectedConnectionInstance.id}`,
                                selectedConnectionInstance.id,
                                'logout',
                              )
                            : undefined
                        }
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          selectedConnectionInstance
                            ? void runQrAction(
                                `disconnect:${selectedConnectionInstance.id}`,
                                selectedConnectionInstance.id,
                                'disconnect',
                              )
                            : undefined
                        }
                      >
                        <Wifi className="h-4 w-4" />
                        Desconectar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          if (!selectedConnectionInstance) {
                            return;
                          }
                          void openProfileDialog(selectedConnectionInstance);
                        }}
                      >
                        <Camera className="h-4 w-4" />
                        Perfil WhatsApp
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          if (!selectedConnectionInstance) {
                            return;
                          }
                          void runSyncAction(selectedConnectionInstance);
                        }}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Atualizar Meta
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-border/70 bg-background-panel/55 p-4 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Capacidades</p>
                <p className="mt-2 leading-5">
                  {selectedConnectionInstance
                    ? [
                        getProviderCapabilities(selectedConnectionInstance).embeddedSignup
                          ? 'Embedded Signup'
                          : null,
                        getProviderCapabilities(selectedConnectionInstance).qrLogin
                          ? 'QR login'
                          : null,
                        getProviderCapabilities(selectedConnectionInstance).templates
                          ? 'Templates'
                          : null,
                        getProviderCapabilities(selectedConnectionInstance)
                          .businessProfile
                          ? 'Perfil Business'
                          : null,
                        getProviderCapabilities(selectedConnectionInstance)
                          .sessionReconnect
                          ? 'Reconnect'
                          : null,
                        getProviderCapabilities(selectedConnectionInstance)
                          .sessionLogout
                          ? 'Logout'
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' • ') || 'Sem capacidades informadas'
                    : '-'}
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
