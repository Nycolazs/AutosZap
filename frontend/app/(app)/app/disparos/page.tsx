'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ImageIcon,
  PlayCircle,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { MultiOptionSelector } from '@/components/shared/multi-option-selector';
import { PageHeader } from '@/components/shared/page-header';
import { WhatsAppFormattedText } from '@/components/shared/whatsapp-formatted-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { Campaign, Contact } from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';

type CampaignRecord = Campaign & {
  description?: string | null;
  audienceType: 'CUSTOM' | 'LIST' | 'TAG' | 'GROUP';
  instanceId?: string | null;
  targetConfig?: {
    listIds?: string[];
    tagIds?: string[];
    groupIds?: string[];
    contactIds?: string[];
  } | null;
};

type NamedOption = { id: string; name: string };

type CampaignFormState = {
  name: string;
  description: string;
  audienceType: CampaignRecord['audienceType'];
  targetIds: string[];
  instanceId: string;
  message: string;
  scheduledAt: string;
  status: 'DRAFT' | 'SCHEDULED' | 'SENT';
};

type CampaignFormErrors = Partial<Record<keyof CampaignFormState | 'image', string>>;

const AUDIENCE_OPTIONS = [
  { label: 'Contatos', value: 'CUSTOM' },
  { label: 'Lista', value: 'LIST' },
  { label: 'Tag', value: 'TAG' },
  { label: 'Grupo', value: 'GROUP' },
] as const;

const STATUS_OPTIONS = [
  { label: 'Rascunho', value: 'DRAFT' },
  { label: 'Agendada', value: 'SCHEDULED' },
  { label: 'Enviar agora', value: 'SENT' },
] as const;

const DEFAULT_FORM_STATE: CampaignFormState = {
  name: '',
  description: '',
  audienceType: 'CUSTOM',
  targetIds: [],
  instanceId: '',
  message: '',
  scheduledAt: '',
  status: 'DRAFT',
};

function buildTargetConfig(values: CampaignFormState) {
  if (values.audienceType === 'LIST') {
    return { listIds: values.targetIds };
  }

  if (values.audienceType === 'TAG') {
    return { tagIds: values.targetIds };
  }

  if (values.audienceType === 'GROUP') {
    return { groupIds: values.targetIds };
  }

  return { contactIds: values.targetIds };
}

function getTargetIdsFromCampaign(campaign: CampaignRecord) {
  if (campaign.audienceType === 'LIST') return campaign.targetConfig?.listIds ?? [];
  if (campaign.audienceType === 'TAG') return campaign.targetConfig?.tagIds ?? [];
  if (campaign.audienceType === 'GROUP') return campaign.targetConfig?.groupIds ?? [];
  return campaign.targetConfig?.contactIds ?? [];
}

function getStatusLabel(value: string) {
  return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function getAudienceLabel(value: CampaignRecord['audienceType']) {
  return AUDIENCE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function buildPreviewMessage(message: string) {
  return message
    .replace(/\{\{\s*nome\s*\}\}/gi, 'Mariana Costa')
    .replace(/\{\{\s*telefone\s*\}\}/gi, '+55 85 98811-2201');
}

function validateForm(values: CampaignFormState, imageFile?: File | null) {
  const errors: CampaignFormErrors = {};

  if (values.name.trim().length < 2) {
    errors.name = 'Informe um nome mais descritivo para a campanha.';
  }

  if (values.message.trim().length < 4) {
    errors.message = 'Escreva a mensagem que será enviada ao cliente.';
  }

  if (!values.instanceId) {
    errors.instanceId = 'Selecione a instância responsável pelo disparo.';
  }

  if (values.targetIds.length === 0) {
    errors.targetIds = 'Escolha ao menos um público-alvo.';
  }

  if (values.status === 'SCHEDULED' && !values.scheduledAt) {
    errors.scheduledAt = 'Defina quando a campanha deverá ser enviada.';
  }

  if (imageFile && !imageFile.type.startsWith('image/')) {
    errors.image = 'Envie uma imagem válida para a pré-visualização.';
  }

  return errors;
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<CampaignRecord | null>(null);
  const [formValues, setFormValues] = useState<CampaignFormState>(DEFAULT_FORM_STATE);
  const [formErrors, setFormErrors] = useState<CampaignFormErrors>({});
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [editorStep, setEditorStep] = useState<1 | 2 | 3>(1);

  const campaignsQuery = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiRequest<CampaignRecord[]>('campaigns'),
  });
  const listsQuery = useQuery({
    queryKey: ['lists-options'],
    queryFn: () => apiRequest<NamedOption[]>('lists'),
  });
  const tagsQuery = useQuery({
    queryKey: ['tags-options'],
    queryFn: () => apiRequest<NamedOption[]>('tags'),
  });
  const groupsQuery = useQuery({
    queryKey: ['groups-options'],
    queryFn: () => apiRequest<NamedOption[]>('groups'),
  });
  const contactsQuery = useQuery({
    queryKey: ['contacts-campaign-options'],
    queryFn: () => apiRequest<{ data: Contact[] }>('contacts?limit=100'),
  });
  const instancesQuery = useQuery({
    queryKey: ['instances-options'],
    queryFn: () => apiRequest<Array<{ id: string; name: string }>>('instances'),
  });

  const targetOptions = useMemo(
    () => ({
      CUSTOM: (contactsQuery.data?.data ?? []).map((item) => ({
        label: item.name,
        value: item.id,
      })),
      LIST: (listsQuery.data ?? []).map((item) => ({
        label: item.name,
        value: item.id,
      })),
      TAG: (tagsQuery.data ?? []).map((item) => ({
        label: item.name,
        value: item.id,
      })),
      GROUP: (groupsQuery.data ?? []).map((item) => ({
        label: item.name,
        value: item.id,
      })),
    }),
    [contactsQuery.data, groupsQuery.data, listsQuery.data, tagsQuery.data],
  );

  const selectedImagePreview = useMemo(() => {
    if (!selectedImageFile) {
      return null;
    }

    return URL.createObjectURL(selectedImageFile);
  }, [selectedImageFile]);

  useEffect(() => {
    return () => {
      if (selectedImagePreview) {
        URL.revokeObjectURL(selectedImagePreview);
      }
    };
  }, [selectedImagePreview]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const errors = validateForm(formValues, selectedImageFile);

      if (Object.keys(errors).length > 0) {
        setFormErrors(errors);
        throw new Error('Revise os campos destacados antes de salvar.');
      }

      const payload = {
        name: formValues.name.trim(),
        description: formValues.description.trim(),
        audienceType: formValues.audienceType,
        instanceId: formValues.instanceId,
        message: formValues.message,
        scheduledAt: formValues.scheduledAt ? new Date(formValues.scheduledAt).toISOString() : undefined,
        status: formValues.status,
        targetConfig: buildTargetConfig(formValues),
      };

      const campaign = editingCampaign
        ? await apiRequest<CampaignRecord>(`campaigns/${editingCampaign.id}`, {
            method: 'PATCH',
            body: payload,
          })
        : await apiRequest<CampaignRecord>('campaigns', {
            method: 'POST',
            body: payload,
          });

      if (selectedImageFile) {
        const formData = new FormData();
        formData.append('media', selectedImageFile);
        await apiRequest(`campaigns/${campaign.id}/media`, {
          method: 'POST',
          body: formData,
        });
      } else if (removeExistingImage && editingCampaign?.hasMedia) {
        await apiRequest(`campaigns/${campaign.id}/media`, {
          method: 'DELETE',
        });
      }

      return campaign;
    },
    onSuccess: async () => {
      toast.success(editingCampaign ? 'Campanha atualizada.' : 'Campanha criada.');
      clearEditor();
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendMutation = useMutation({
    mutationFn: (campaignId: string) =>
      apiRequest(`campaigns/${campaignId}/send`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success('Campanha enviada.');
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (campaignId: string) =>
      apiRequest(`campaigns/${campaignId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Campanha removida.');
      if (editingCampaign) {
        clearEditor();
      }
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const previewImageUrl =
    selectedImagePreview ||
    (!removeExistingImage && editingCampaign?.mediaUrl
      ? `/api/proxy/${editingCampaign.mediaUrl}`
      : null);

  function clearEditor() {
    setEditingCampaign(null);
    setFormValues(DEFAULT_FORM_STATE);
    setFormErrors({});
    setSelectedImageFile(null);
    setRemoveExistingImage(false);
    setEditorStep(1);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function loadCampaign(campaign: CampaignRecord) {
    setEditingCampaign(campaign);
    setFormValues({
      name: campaign.name,
      description: campaign.description ?? '',
      audienceType: campaign.audienceType,
      instanceId: campaign.instanceId ?? '',
      targetIds: getTargetIdsFromCampaign(campaign),
      message: campaign.message,
      scheduledAt: campaign.scheduledAt ? campaign.scheduledAt.slice(0, 16) : '',
      status: (campaign.status as CampaignFormState['status']) ?? 'DRAFT',
    });
    setEditorStep(1);
    setFormErrors({});
    setSelectedImageFile(null);
    setRemoveExistingImage(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disparos"
        description="Monte a mensagem, confira a prévia em tempo real e acompanhe campanhas já enviadas sem sair do padrão visual do AutoZap."
        action={
          <Button variant="secondary" onClick={clearEditor}>
            <Sparkles className="h-4 w-4" />
            Nova campanha
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.12fr_0.88fr]">
        <Card className="order-2 p-0 xl:order-1">
          <CardHeader className="p-4 pb-4 sm:p-6 sm:pb-4">
            <CardTitle>
              {editingCampaign ? 'Editar campanha' : 'Montar campanha'}
            </CardTitle>
            <CardDescription>
              Organize o conteúdo, público, agendamento e mídia da campanha em um único fluxo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="grid grid-cols-3 gap-2 rounded-[18px] border border-border bg-foreground/[0.03] p-2">
              <Button type="button" size="sm" variant={editorStep === 1 ? 'default' : 'secondary'} onClick={() => setEditorStep(1)}>
                1. Base
              </Button>
              <Button type="button" size="sm" variant={editorStep === 2 ? 'default' : 'secondary'} onClick={() => setEditorStep(2)}>
                2. Público
              </Button>
              <Button type="button" size="sm" variant={editorStep === 3 ? 'default' : 'secondary'} onClick={() => setEditorStep(3)}>
                3. Revisão
              </Button>
            </div>

            <div className={cn('space-y-5', editorStep !== 1 && 'hidden')}>
              <div className="grid gap-4 lg:grid-cols-2">
                <Field
                  label="Nome"
                  error={formErrors.name}
                  input={
                    <Input
                      value={formValues.name}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Ex.: Reativação de leads quentes"
                    />
                  }
                />

                <Field
                  label="Status"
                  input={
                    <NativeSelect
                      value={formValues.status}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          status: event.target.value as CampaignFormState['status'],
                        }))
                      }
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  }
                />
              </div>

              <Field
                label="Descrição"
                input={
                  <Textarea
                    value={formValues.description}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Contexto interno da campanha, objetivo e observações para a equipe."
                    className="min-h-24"
                  />
                }
              />

              <Field
                label="Mensagem"
                error={formErrors.message}
                helper="A prévia interpreta formatação do WhatsApp em tempo real, incluindo *negrito*, _itálico_, ~tachado~, blocos monoespaçados e placeholders como {{nome}}."
                input={
                  <Textarea
                    value={formValues.message}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        message: event.target.value,
                      }))
                    }
                    placeholder="Escreva aqui a mensagem da campanha..."
                    className="min-h-32"
                  />
                }
              />
            </div>

            <div className={cn('space-y-5', editorStep !== 2 && 'hidden')}>
              <div className="grid gap-4 lg:grid-cols-[0.62fr_0.38fr]">
                <Field
                  label="Público"
                  input={
                    <NativeSelect
                      value={formValues.audienceType}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          audienceType: event.target.value as CampaignFormState['audienceType'],
                          targetIds: [],
                        }))
                      }
                    >
                      {AUDIENCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  }
                />

                <Field
                  label="Instância"
                  error={formErrors.instanceId}
                  input={
                    <NativeSelect
                      value={formValues.instanceId}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          instanceId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione</option>
                      {(instancesQuery.data ?? []).map((instance) => (
                        <option key={instance.id} value={instance.id}>
                          {instance.name}
                        </option>
                      ))}
                    </NativeSelect>
                  }
                />
              </div>

              <Field
                label="Público-alvo"
                error={formErrors.targetIds}
                helper="Selecione contatos, listas, tags ou grupos com base no tipo de audiência acima."
                input={
                  <MultiOptionSelector
                    options={targetOptions[formValues.audienceType]}
                    value={formValues.targetIds}
                    onChange={(next) =>
                      setFormValues((current) => ({
                        ...current,
                        targetIds: next,
                      }))
                    }
                  />
                }
              />
            </div>

            <div className={cn('space-y-5', editorStep !== 3 && 'hidden')}>
              <div className="grid gap-4 lg:grid-cols-[0.52fr_0.48fr]">
                <Field
                  label="Agendamento"
                  error={formErrors.scheduledAt}
                  helper="Preencha apenas se a campanha for disparada em outro momento."
                  input={
                    <Input
                      type="datetime-local"
                      value={formValues.scheduledAt}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          scheduledAt: event.target.value,
                        }))
                      }
                    />
                  }
                />

                <Field
                  label="Imagem da campanha"
                  error={formErrors.image}
                  helper="A imagem aparece na prévia em tempo real e é reaproveitada quando a campanha for enviada."
                  input={
                    <div className="space-y-3 rounded-[22px] border border-border bg-foreground/[0.03] p-4">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          setSelectedImageFile(file);
                          setRemoveExistingImage(false);
                        }}
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <ImageIcon className="h-4 w-4" />
                          {selectedImageFile || editingCampaign?.hasMedia
                            ? 'Trocar imagem'
                            : 'Adicionar imagem'}
                        </Button>

                        {selectedImageFile || editingCampaign?.hasMedia ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setSelectedImageFile(null);
                              setRemoveExistingImage(true);
                              if (fileInputRef.current) {
                                fileInputRef.current.value = '';
                              }
                            }}
                          >
                            <X className="h-4 w-4" />
                            Remover
                          </Button>
                        ) : null}
                      </div>

                      {selectedImageFile ? (
                        <p className="text-sm text-muted-foreground">
                          {selectedImageFile.name}
                        </p>
                      ) : editingCampaign?.hasMedia && !removeExistingImage ? (
                        <p className="text-sm text-muted-foreground">
                          Imagem já vinculada a esta campanha.
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma imagem selecionada.
                        </p>
                      )}
                    </div>
                  }
                />
              </div>

              <div className="rounded-[20px] border border-border bg-background-panel/65 p-3.5 text-sm text-muted-foreground">
                <p><strong>Resumo</strong></p>
                <p className="mt-2">Público: {getAudienceLabel(formValues.audienceType)} ({formValues.targetIds.length})</p>
                <p>Instância: {formValues.instanceId ? 'Selecionada' : 'Pendente'}</p>
                <p>Status: {getStatusLabel(formValues.status)}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setEditorStep((current) => (current === 1 ? 1 : ((current - 1) as 1 | 2 | 3)))}
                      disabled={editorStep === 1}
                    >
                      Voltar etapa
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setEditorStep((current) => (current === 3 ? 3 : ((current + 1) as 1 | 2 | 3)))}
                      disabled={editorStep === 3}
                    >
                      Próxima etapa
                    </Button>
                  </div>
              {editingCampaign ? (
                <Button type="button" variant="ghost" onClick={clearEditor}>
                  Limpar edição
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                <Save className="h-4 w-4" />
                    {saveMutation.isPending
                      ? 'Salvando...'
                      : editingCampaign
                        ? 'Salvar alterações'
                        : 'Criar campanha'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="order-1 overflow-hidden p-0 xl:order-2">
          <CardHeader className="border-b border-border bg-foreground/[0.02] p-4 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Pré-visualização em tempo real</CardTitle>
            </div>
            <CardDescription>
              Veja como a mensagem ficará para o cliente antes de disparar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="rounded-[28px] border border-border bg-background-elevated p-3 shadow-[0_26px_60px_rgba(2,10,22,0.12)] sm:rounded-[32px] sm:p-4">
              <div className="rounded-[24px] border border-border bg-background-panel p-3 sm:rounded-[26px] sm:p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">Mariana Costa</p>
                    <p className="text-xs text-muted-foreground">
                      Cliente de demonstração
                    </p>
                  </div>
                  <Badge variant="secondary">Prévia</Badge>
                </div>

                <div className="space-y-3 rounded-[24px] bg-background-soft p-3">
                  {previewImageUrl ? (
                    <div className="overflow-hidden rounded-[20px] border border-border bg-foreground/10">
                      <Image
                        src={previewImageUrl}
                        alt="Prévia da campanha"
                        width={880}
                        height={880}
                        className="h-auto max-h-[360px] w-full object-cover"
                        unoptimized
                      />
                    </div>
                  ) : null}

                  <div className="max-w-[96%] rounded-[22px] bg-[#DCF8C6] px-4 py-3 text-[15px] leading-6 text-[#102012] shadow-[0_12px_24px_rgba(0,0,0,0.14)] sm:max-w-[92%]">
                    <WhatsAppFormattedText
                      content={
                        buildPreviewMessage(formValues.message) ||
                        'Sua mensagem aparecerá aqui conforme você digitar.'
                      }
                      tone="preview"
                      className="text-[15px] leading-6"
                    />
                    <p className="mt-3 text-right text-[11px] text-[#425141]">
                      10:24
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-border bg-foreground/[0.03] p-4 text-sm text-muted-foreground">
              Use a prévia para conferir quebras de linha, tom da mensagem, combinação com a imagem e clareza do texto antes de enviar.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="p-0">
        <CardHeader className="p-4 pb-4 sm:p-6 sm:pb-4">
          <CardTitle>Campanhas cadastradas</CardTitle>
          <CardDescription>
            Edite, envie ou acompanhe disparos já montados.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 pt-0 sm:p-6 sm:pt-0 md:grid-cols-2 xl:grid-cols-3">
          {campaignsQuery.data?.length ? (
            campaignsQuery.data.map((campaign) => (
              <div
                key={campaign.id}
                className="rounded-[24px] border border-border bg-foreground/[0.03] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{campaign.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {getAudienceLabel(campaign.audienceType)} • {getStatusLabel(campaign.status)}
                    </p>
                  </div>
                  {campaign.hasMedia ? <Badge variant="secondary">Com imagem</Badge> : null}
                </div>

                <p className="mt-3 line-clamp-3 text-sm text-foreground/80">
                  {campaign.message}
                </p>

                <div className="mt-4 grid gap-2 rounded-[20px] border border-border bg-background-panel/65 p-3 text-sm text-muted-foreground">
                  <span>Destinatários: {campaign.recipientCount}</span>
                  <span>Enviadas: {campaign.sentCount}</span>
                  <span>Falhas: {campaign.failedCount}</span>
                  <span>
                    {campaign.scheduledAt
                      ? `Agendada para ${formatDate(campaign.scheduledAt)}`
                      : 'Sem agendamento definido'}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => loadCampaign(campaign)}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => sendMutation.mutate(campaign.id)}
                    disabled={sendMutation.isPending}
                  >
                    <PlayCircle className="h-4 w-4" />
                    Enviar
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    }
                    title="Excluir campanha"
                    description="Essa ação remove a campanha e sua mídia associada."
                    actionLabel="Excluir"
                    onConfirm={() => deleteMutation.mutate(campaign.id)}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              Nenhuma campanha cadastrada ainda. Use o editor acima para criar o primeiro disparo.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  error,
  helper,
  input,
}: {
  label: string;
  error?: string;
  helper?: string;
  input: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {input}
      <p
        className={cn(
          'text-xs',
          error ? 'text-danger' : 'text-muted-foreground',
        )}
      >
        {error ?? helper}
      </p>
    </div>
  );
}
