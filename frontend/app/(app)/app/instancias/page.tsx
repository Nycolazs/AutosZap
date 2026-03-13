'use client';

import { useEffect, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Camera, Loader2, RadioTower, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CrudPage } from '@/components/shared/crud-page';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import {
  Instance,
  WhatsAppBusinessProfileOverview,
  WhatsAppInstanceDiagnostics,
  WhatsAppProfilePictureUpdateResult,
  WhatsAppTemplateSummary,
} from '@/lib/types';

const schema = z.object({
  name: z.string().min(2),
  provider: z.string().min(2),
  status: z.string().optional(),
  mode: z.string().optional(),
  appId: z.string().optional(),
  phoneNumber: z.string().optional(),
  businessAccountId: z.string().optional(),
  phoneNumberId: z.string().optional(),
  accessToken: z.string().optional(),
  webhookVerifyToken: z.string().optional(),
  appSecret: z.string().optional(),
});

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

const emptyBusinessProfileForm: BusinessProfileFormState = {
  about: '',
  description: '',
  email: '',
  website1: '',
  website2: '',
  address: '',
  vertical: 'UNDEFINED',
};

export default function InstancesPage() {
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

  async function syncInstance(instanceId: string) {
    return apiRequest<WhatsAppInstanceDiagnostics>(`instances/${instanceId}/sync`, {
      method: 'POST',
    });
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nao foi possivel carregar o perfil.');
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

  const columns: ColumnDef<Instance>[] = [
    { accessorKey: 'name', header: 'Instancia' },
    { accessorKey: 'provider', header: 'Provider' },
    { accessorKey: 'status', header: 'Status' },
    { accessorKey: 'mode', header: 'Modo' },
    {
      accessorKey: 'phoneNumber',
      header: 'Numero conectado',
    },
    {
      id: 'test',
      header: 'Integração',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={async (event) => {
              event.stopPropagation();
              const response = await apiRequest<{ detail: string; simulated: boolean }>(
                `instances/${row.original.id}/test`,
                { method: 'POST' },
              );
              toast.success(response.simulated ? 'Teste dev executado.' : response.detail);
            }}
          >
            Testar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async (event) => {
              event.stopPropagation();
              const response = await syncInstance(row.original.id);
              toast.success(
                response.simulated
                  ? 'Sync em modo dev.'
                  : `${response.phoneNumber?.displayPhoneNumber ?? 'Numero validado'} • ${response.templates.length} templates`,
              );
            }}
          >
            Sync Meta
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async (event) => {
              event.stopPropagation();
              const response = await apiRequest<{ detail: string; simulated: boolean }>(
                `instances/${row.original.id}/subscribe-app`,
                { method: 'POST' },
              );
              toast.success(response.simulated ? 'Subscribe simulado.' : response.detail);
            }}
          >
            Subscribe
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async (event) => {
              event.stopPropagation();
              const templates = await apiRequest<WhatsAppTemplateSummary[]>(
                `instances/${row.original.id}/templates`,
              );
              toast.success(
                templates.length
                  ? `${templates.length} templates carregados. Primeira: ${templates[0]?.name}`
                  : 'Nenhum template retornado pela WABA.',
              );
            }}
          >
            Templates
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={async (event) => {
              event.stopPropagation();
              await openProfileDialog(row.original);
            }}
          >
            <Camera className="h-4 w-4" />
            Perfil WhatsApp
          </Button>
        </div>
      ),
    },
  ];

  const effectivePreviewUrl =
    previewUrl ??
    businessProfileOverview?.businessProfile?.profilePictureUrl ??
    diagnostics?.businessProfile?.profilePictureUrl ??
    null;

  return (
    <>
      <CrudPage
        title="Instâncias"
        description="Configure canais oficiais da Meta com credenciais, webhook verify token, app secret, sync da WABA e testes reais da Cloud API."
        endpoint="instances"
        queryKey="instances"
        columns={columns}
        schema={schema}
        defaultValues={{
          name: '',
          provider: 'META_WHATSAPP',
          status: 'DISCONNECTED',
          mode: 'DEV',
          appId: '',
          phoneNumber: '',
          businessAccountId: '',
          phoneNumberId: '',
          accessToken: '',
          webhookVerifyToken: '',
          appSecret: '',
        }}
        fields={[
          { name: 'name', label: 'Nome' },
          {
            name: 'provider',
            label: 'Provider',
            type: 'select',
            options: [{ label: 'Meta WhatsApp', value: 'META_WHATSAPP' }],
          },
          {
            name: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { label: 'Conectada', value: 'CONNECTED' },
              { label: 'Desconectada', value: 'DISCONNECTED' },
              { label: 'Sincronizando', value: 'SYNCING' },
            ],
          },
          {
            name: 'mode',
            label: 'Modo',
            type: 'select',
            options: [
              { label: 'DEV', value: 'DEV' },
              { label: 'SANDBOX', value: 'SANDBOX' },
              { label: 'PRODUCTION', value: 'PRODUCTION' },
            ],
          },
          { name: 'appId', label: 'App ID da Meta' },
          { name: 'phoneNumber', label: 'Numero' },
          { name: 'businessAccountId', label: 'Business Account ID' },
          { name: 'phoneNumberId', label: 'Phone Number ID' },
          { name: 'accessToken', label: 'Access Token', type: 'password' },
          { name: 'webhookVerifyToken', label: 'Webhook Verify Token', type: 'password' },
          { name: 'appSecret', label: 'App Secret', type: 'password' },
        ]}
        icon={RadioTower}
        createLabel="Nova instancia"
        emptyDescription="Cadastre canais e credenciais para operar com Meta oficial ou fallback de desenvolvimento."
      />

      <Dialog
        open={profileDialogOpen}
        onOpenChange={(open) => {
          setProfileDialogOpen(open);
          if (!open) {
            setSelectedFile(null);
            setPreviewUrl(null);
            setDiagnostics(null);
            setBusinessProfileOverview(null);
            setProfileForm(emptyBusinessProfileForm);
            setSelectedInstance(null);
          }
        }}
      >
        <DialogContent className="w-[min(760px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>Perfil do WhatsApp Business</DialogTitle>
            <DialogDescription>
              Atualize foto, texto de perfil, links e categoria oficial do numero conectado.
            </DialogDescription>
          </DialogHeader>

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
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Instancia</p>
                  <p className="text-sm text-foreground">{selectedInstance?.name ?? '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Numero</p>
                  <p className="text-sm text-foreground">
                    {diagnostics?.phoneNumber?.displayPhoneNumber ?? selectedInstance?.phoneNumber ?? '-'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Nome verificado</p>
                  <p className="text-sm text-foreground">{diagnostics?.phoneNumber?.verifiedName ?? '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Qualidade</p>
                  <p className="text-sm text-foreground">{diagnostics?.phoneNumber?.qualityRating ?? '-'}</p>
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
                  Use PNG ou JPG quadrado para melhor resultado. O upload usa o App ID da instância ou o `META_APP_ID` do ambiente.
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
                  <Label htmlFor="profile-description">Descrição</Label>
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
                  <select
                    id="profile-vertical"
                    className="h-12 w-full rounded-2xl border border-border bg-background-panel px-4 text-sm text-foreground"
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
                  </select>
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

              <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (!selectedInstance) {
                      return;
                    }
                    await refreshProfileData(
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
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
