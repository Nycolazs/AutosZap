'use client';

// Version: 1.0.1 - Spinner UI with min/max controls (March 17, 2026 - Final)
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, MessageCircleReply, Minus, Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { canAccess } from '@/lib/permissions';
import { AuthMeResponse, WorkspaceConversationSettings } from '@/lib/types';

const weekdayLabels = [
  'Domingo',
  'Segunda',
  'Terca',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sabado',
];

type WorkspaceConversationSettingsPayload = {
  inactivityTimeoutMinutes: number;
  waitingAutoCloseTimeoutMinutes?: number | null;
  timezone: string;
  sendBusinessHoursAutoReply: boolean;
  businessHoursAutoReply?: string | null;
  sendOutOfHoursAutoReply: boolean;
  outOfHoursAutoReply?: string | null;
  sendResolvedAutoReply: boolean;
  resolvedAutoReplyMessage?: string | null;
  sendClosedAutoReply: boolean;
  closedAutoReplyMessage?: string | null;
  sendAssignmentAutoReply: boolean;
  assignmentAutoReplyMessage?: string | null;
  sendWindowClosedTemplateReply: boolean;
  windowClosedTemplateName?: string | null;
  windowClosedTemplateLanguageCode?: string | null;
  businessHours: Array<{
    weekday: number;
    isOpen: boolean;
    startTime?: string | null;
    endTime?: string | null;
  }>;
};

function sanitizeWorkspaceConversationSettings(
  settings: WorkspaceConversationSettings,
): WorkspaceConversationSettings {
  return {
    id: settings.id,
    workspaceId: settings.workspaceId,
    inactivityTimeoutMinutes: settings.inactivityTimeoutMinutes,
    waitingAutoCloseTimeoutMinutes:
      settings.waitingAutoCloseTimeoutMinutes ?? null,
    timezone: settings.timezone,
    autoReplyCooldownMinutes: settings.autoReplyCooldownMinutes,
    sendBusinessHoursAutoReply: settings.sendBusinessHoursAutoReply,
    businessHoursAutoReply: settings.businessHoursAutoReply ?? null,
    sendOutOfHoursAutoReply: settings.sendOutOfHoursAutoReply,
    outOfHoursAutoReply: settings.outOfHoursAutoReply ?? null,
    sendResolvedAutoReply: settings.sendResolvedAutoReply,
    resolvedAutoReplyMessage: settings.resolvedAutoReplyMessage ?? null,
    sendClosedAutoReply: settings.sendClosedAutoReply,
    closedAutoReplyMessage: settings.closedAutoReplyMessage ?? null,
    sendAssignmentAutoReply: settings.sendAssignmentAutoReply,
    assignmentAutoReplyMessage: settings.assignmentAutoReplyMessage ?? null,
    sendWindowClosedTemplateReply: settings.sendWindowClosedTemplateReply,
    windowClosedTemplateName: settings.windowClosedTemplateName ?? null,
    windowClosedTemplateLanguageCode:
      settings.windowClosedTemplateLanguageCode ?? null,
    businessHours: [...settings.businessHours]
      .sort((left, right) => left.weekday - right.weekday)
      .map((businessHour) => ({
        id: businessHour.id,
        weekday: businessHour.weekday,
        isOpen: businessHour.isOpen,
        startTime: businessHour.startTime ?? null,
        endTime: businessHour.endTime ?? null,
      })),
  };
}

function toWorkspaceConversationSettingsPayload(
  settings: WorkspaceConversationSettings,
): WorkspaceConversationSettingsPayload {
  return {
    inactivityTimeoutMinutes: settings.inactivityTimeoutMinutes,
    waitingAutoCloseTimeoutMinutes:
      settings.waitingAutoCloseTimeoutMinutes ?? null,
    timezone: settings.timezone,
    sendBusinessHoursAutoReply: settings.sendBusinessHoursAutoReply,
    businessHoursAutoReply: settings.businessHoursAutoReply ?? null,
    sendOutOfHoursAutoReply: settings.sendOutOfHoursAutoReply,
    outOfHoursAutoReply: settings.outOfHoursAutoReply ?? null,
    sendResolvedAutoReply: settings.sendResolvedAutoReply,
    resolvedAutoReplyMessage: settings.resolvedAutoReplyMessage ?? null,
    sendClosedAutoReply: settings.sendClosedAutoReply,
    closedAutoReplyMessage: settings.closedAutoReplyMessage ?? null,
    sendAssignmentAutoReply: settings.sendAssignmentAutoReply,
    assignmentAutoReplyMessage: settings.assignmentAutoReplyMessage ?? null,
    sendWindowClosedTemplateReply: settings.sendWindowClosedTemplateReply,
    windowClosedTemplateName: settings.windowClosedTemplateName ?? null,
    windowClosedTemplateLanguageCode:
      settings.windowClosedTemplateLanguageCode ?? null,
    businessHours: settings.businessHours.map((businessHour) => ({
      weekday: businessHour.weekday,
      isOpen: businessHour.isOpen,
      startTime: businessHour.isOpen
        ? businessHour.startTime ?? '08:00'
        : null,
      endTime: businessHour.isOpen ? businessHour.endTime ?? '18:00' : null,
    })),
  };
}

function clampInactivityTimeout(value: number) {
  return Math.min(1440, Math.max(1, value));
}

function clampWaitingAutoCloseTimeout(value: number) {
  return Math.min(10080, Math.max(1, value));
}

export default function ConversationFlowPage() {
  const queryClient = useQueryClient();
  const [conversationSettingsDraft, setConversationSettingsDraft] =
    useState<WorkspaceConversationSettings | null>(null);
  const meQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiRequest<AuthMeResponse>('auth/me'),
  });
  const conversationSettingsQuery = useQuery({
    queryKey: ['workspace-conversation-settings'],
    queryFn: () =>
      apiRequest<WorkspaceConversationSettings>('workspace-settings').then(
        sanitizeWorkspaceConversationSettings,
      ),
  });

  const conversationSettings =
    conversationSettingsDraft ?? conversationSettingsQuery.data ?? null;

  const updateDraft = (
    updater: (
      current: WorkspaceConversationSettings,
    ) => WorkspaceConversationSettings,
  ) => {
    setConversationSettingsDraft((current) => {
      const base = current ?? conversationSettingsQuery.data;
      return base ? updater(base) : current;
    });
  };

  const updateConversationSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!conversationSettings) {
        throw new Error('As configuracoes de atendimento ainda nao carregaram.');
      }

      return apiRequest<WorkspaceConversationSettings>('workspace-settings', {
        method: 'PATCH',
        body: toWorkspaceConversationSettingsPayload(conversationSettings),
      });
    },
    onSuccess: async () => {
      toast.success('Horários e automações salvos.');
      await queryClient.invalidateQueries({
        queryKey: ['workspace-conversation-settings'],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const permissionMap = meQuery.data?.permissionMap;
  const canEditRouting = canAccess(
    permissionMap,
    'CONFIGURE_CONVERSATION_ROUTING',
  );
  const canEditAutoMessages = canAccess(
    permissionMap,
    'CONFIGURE_AUTO_MESSAGES',
  );
  const canEditBusinessHours = canAccess(
    permissionMap,
    'CONFIGURE_BUSINESS_HOURS',
  );
  const canSave =
    Boolean(conversationSettings) &&
    (canEditRouting || canEditAutoMessages || canEditBusinessHours);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Horários de Funcionamento"
        description="Defina o tempo de liberação das conversas, os dias e horários de atendimento da empresa e as mensagens automáticas da operação."
        action={
          <Button
            onClick={() => updateConversationSettingsMutation.mutate()}
            disabled={!canSave || updateConversationSettingsMutation.isPending}
          >
            <Save className="h-4 w-4" />
            Salvar horários
          </Button>
        }
      />

      <div className="rounded-[28px] border border-border bg-background-elevated/70 p-4 lg:p-6">
        {!conversationSettings ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              Carregando as configuracoes do fluxo de atendimento...
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock3 className="h-5 w-5 text-primary" />
                  <CardTitle>Regras e mensagens do atendimento</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-4 rounded-[24px] border border-border bg-white/[0.03] p-4">
                  <div className="space-y-2">
                    <Label htmlFor="inactivity-timeout">
                      Tempo de inatividade do vendedor
                    </Label>
                    <MinutesStepperInput
                      id="inactivity-timeout"
                      value={conversationSettings.inactivityTimeoutMinutes}
                      min={1}
                      max={1440}
                      disabled={!canEditRouting}
                      onChange={(value) => {
                        if (value === null) {
                          return;
                        }

                        updateDraft((current) => ({
                          ...current,
                          inactivityTimeoutMinutes: clampInactivityTimeout(value),
                        }));
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Após esse período sem resposta do responsável, a conversa
                      volta para <strong>AGUARDANDO</strong> e fica disponível
                      para outros vendedores.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="waiting-auto-close-timeout">
                      Encerramento automático no AGUARDANDO
                    </Label>
                    <MinutesStepperInput
                      id="waiting-auto-close-timeout"
                      value={conversationSettings.waitingAutoCloseTimeoutMinutes ?? null}
                      min={1}
                      max={10080}
                      allowEmpty
                      onChange={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          waitingAutoCloseTimeoutMinutes:
                            value === null
                              ? null
                              : clampWaitingAutoCloseTimeout(value),
                        }))
                      }
                      placeholder="Desativado"
                      disabled={!canEditRouting}
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={
                          !canEditRouting ||
                          conversationSettings.waitingAutoCloseTimeoutMinutes ===
                            null
                        }
                        onClick={() =>
                          updateDraft((current) => ({
                            ...current,
                            waitingAutoCloseTimeoutMinutes: null,
                          }))
                        }
                      >
                        Desativar encerramento automático
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Defina em minutos para fechar automaticamente conversas em
                      <strong> AGUARDANDO</strong> como
                      {' '}
                      <strong>NAO RESPONDIDO</strong>.
                      {' '}
                      Deixe vazio para desativar.
                    </p>
                  </div>

                  {/* <div className="space-y-2">
                    <Label htmlFor="workspace-timezone">
                      Timezone da empresa
                    </Label>
                    <Input
                      id="workspace-timezone"
                      value={conversationSettings.timezone}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          timezone: event.target.value,
                        }))
                      }
                      disabled={!canEditBusinessHours}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use um timezone IANA, como
                      {' '}
                      <code>America/Fortaleza</code>
                      {' '}
                      ou
                      {' '}
                      <code>America/Sao_Paulo</code>.
                    </p>
                  </div> */}
                </div>

                <div className="space-y-4 rounded-[24px] border border-border bg-white/[0.03] p-4">
                  <div className="flex items-center gap-2">
                    <MessageCircleReply className="h-4 w-4 text-primary" />
                    <p className="font-medium">Mensagens automaticas</p>
                  </div>

                  <AutomationToggle
                    checked={Boolean(
                      conversationSettings.sendBusinessHoursAutoReply,
                    )}
                    disabled={!canEditAutoMessages}
                    label="Mensagem automatica dentro do horario"
                    description="Enviada quando a empresa estiver aberta."
                    onCheckedChange={(checked) =>
                      updateDraft((current) => ({
                        ...current,
                        sendBusinessHoursAutoReply: checked,
                      }))
                    }
                  />
                  <Textarea
                    value={conversationSettings.businessHoursAutoReply ?? ''}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        businessHoursAutoReply: event.target.value,
                      }))
                    }
                    placeholder="Ex.: Ola! Recebemos sua mensagem e ja vamos continuar o atendimento."
                    disabled={!canEditAutoMessages}
                    className="min-h-24"
                  />

                  <AutomationToggle
                    checked={Boolean(
                      conversationSettings.sendOutOfHoursAutoReply,
                    )}
                    disabled={!canEditAutoMessages}
                    label="Mensagem automatica fora do horario"
                    description="Enviada quando a empresa estiver fechada."
                    onCheckedChange={(checked) =>
                      updateDraft((current) => ({
                        ...current,
                        sendOutOfHoursAutoReply: checked,
                      }))
                    }
                  />
                  <Textarea
                    value={conversationSettings.outOfHoursAutoReply ?? ''}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        outOfHoursAutoReply: event.target.value,
                      }))
                    }
                    placeholder="Ex.: Estamos fora do horario agora, mas retornaremos assim que a operacao abrir."
                    disabled={!canEditAutoMessages}
                    className="min-h-24"
                  />

                  <AutomationToggle
                    checked={Boolean(
                      conversationSettings.sendResolvedAutoReply,
                    )}
                    disabled={!canEditAutoMessages}
                    label="Mensagem automatica ao resolver conversa"
                    description="Enviada automaticamente quando uma conversa for marcada como RESOLVIDA."
                    onCheckedChange={(checked) =>
                      updateDraft((current) => ({
                        ...current,
                        sendResolvedAutoReply: checked,
                      }))
                    }
                  />
                  <Textarea
                    value={conversationSettings.resolvedAutoReplyMessage ?? ''}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        resolvedAutoReplyMessage: event.target.value,
                      }))
                    }
                    placeholder="Ex.: Atendimento resolvido! Se precisar de algo mais, estamos a disposicao."
                    disabled={!canEditAutoMessages}
                    className="min-h-24"
                  />

                  <AutomationToggle
                    checked={Boolean(conversationSettings.sendClosedAutoReply)}
                    disabled={!canEditAutoMessages}
                    label="Mensagem automatica ao encerrar conversa"
                    description="Enviada automaticamente quando uma conversa for ENCERRADA manualmente."
                    onCheckedChange={(checked) =>
                      updateDraft((current) => ({
                        ...current,
                        sendClosedAutoReply: checked,
                      }))
                    }
                  />
                  <Textarea
                    value={conversationSettings.closedAutoReplyMessage ?? ''}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        closedAutoReplyMessage: event.target.value,
                      }))
                    }
                    placeholder="Ex.: Conversa encerrada. Obrigado pelo contato e ate a proxima!"
                    disabled={!canEditAutoMessages}
                    className="min-h-24"
                  />

                  <AutomationToggle
                    checked={Boolean(
                      conversationSettings.sendAssignmentAutoReply,
                    )}
                    disabled={!canEditAutoMessages}
                    label="Mensagem automatica ao transferir/assumir conversa"
                    description="Enviada quando a conversa muda de responsavel para outro vendedor ou quando outro colaborador assume o atendimento."
                    onCheckedChange={(checked) =>
                      updateDraft((current) => ({
                        ...current,
                        sendAssignmentAutoReply: checked,
                      }))
                    }
                  />
                  <Textarea
                    value={conversationSettings.assignmentAutoReplyMessage ?? ''}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        assignmentAutoReplyMessage: event.target.value,
                      }))
                    }
                    placeholder="Ex.: Ola {nome}, a partir de agora seu atendimento continuara com {novo_vendedor}."
                    disabled={!canEditAutoMessages}
                    className="min-h-24"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use variaveis como <code>{'{nome}'}</code>,{' '}
                    <code>{'{vendedor}'}</code>,{' '}
                    <code>{'{novo_vendedor}'}</code> e{' '}
                    <code>{'{empresa}'}</code> para personalizar a mensagem.
                  </p>

                  <div className="rounded-[20px] border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.015] px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium tracking-tight">
                          Template automatico fora da janela de 24 horas
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Quando a janela do WhatsApp estiver fechada, o sistema
                          usa um template aprovado para enviar a mensagem
                          digitada pelo vendedor como parametro do template.
                        </p>
                      </div>
                      <Switch
                        className="self-end sm:mt-1 sm:self-start"
                        checked={Boolean(
                          conversationSettings.sendWindowClosedTemplateReply,
                        )}
                        disabled={!canEditAutoMessages}
                        onCheckedChange={(checked) =>
                          updateDraft((current) => ({
                            ...current,
                            sendWindowClosedTemplateReply: checked,
                          }))
                        }
                      />
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="window-closed-template-name">
                          Nome do template aprovado
                        </Label>
                        <Input
                          id="window-closed-template-name"
                          value={
                            conversationSettings.windowClosedTemplateName ?? ''
                          }
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              windowClosedTemplateName: event.target.value,
                            }))
                          }
                          placeholder="ex.: retomada_atendimento_autozap"
                          disabled={!canEditAutoMessages}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="window-closed-template-language">
                          Idioma do template
                        </Label>
                        <Input
                          id="window-closed-template-language"
                          value={
                            conversationSettings.windowClosedTemplateLanguageCode ??
                            'pt_BR'
                          }
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              windowClosedTemplateLanguageCode:
                                event.target.value,
                            }))
                          }
                          placeholder="pt_BR"
                          disabled={!canEditAutoMessages}
                        />
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground">
                      Esse template precisa estar aprovado na Meta e conter uma
                      variavel no corpo, como
                      {' '}
                      <code>{'{{1}}'}</code>
                      , para receber a mensagem digitada pelo vendedor.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Horario de funcionamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {conversationSettings.businessHours.map((businessHour, index) => (
                  <div
                    key={businessHour.id}
                    className="grid gap-3 rounded-[22px] border border-border bg-white/[0.03] p-4 md:grid-cols-[0.9fr_0.5fr_0.5fr_0.5fr] md:items-center"
                  >
                    <div>
                      <p className="font-medium">{weekdayLabels[index]}</p>
                      <p className="text-xs text-muted-foreground">
                        Defina se a empresa atende neste dia e em qual
                        intervalo.
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background-panel px-4 py-3">
                      <span className="text-sm">Aberto</span>
                      <Switch
                        checked={businessHour.isOpen}
                        disabled={!canEditBusinessHours}
                        onCheckedChange={(checked) =>
                          updateDraft((current) => ({
                            ...current,
                            businessHours: current.businessHours.map((item) =>
                              item.weekday === businessHour.weekday
                                ? {
                                    ...item,
                                    isOpen: checked,
                                    startTime: checked
                                      ? item.startTime ?? '08:00'
                                      : null,
                                    endTime: checked
                                      ? item.endTime ?? '18:00'
                                      : null,
                                  }
                                : item,
                            ),
                          }))
                        }
                      />
                    </div>

                    <Input
                      type="time"
                      value={businessHour.startTime ?? '08:00'}
                      disabled={!businessHour.isOpen || !canEditBusinessHours}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          businessHours: current.businessHours.map((item) =>
                            item.weekday === businessHour.weekday
                              ? {
                                  ...item,
                                  startTime: event.target.value,
                                }
                              : item,
                          ),
                        }))
                      }
                    />

                    <Input
                      type="time"
                      value={businessHour.endTime ?? '18:00'}
                      disabled={!businessHour.isOpen || !canEditBusinessHours}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          businessHours: current.businessHours.map((item) =>
                            item.weekday === businessHour.weekday
                              ? {
                                  ...item,
                                  endTime: event.target.value,
                                }
                              : item,
                          ),
                        }))
                      }
                    />
                  </div>
                ))}

                {!canSave ? (
                  <div className="rounded-[20px] border border-border bg-white/[0.03] px-4 py-3 text-sm text-muted-foreground">
                    Voce tem acesso de visualizacao, mas nao pode alterar essas
                    configuracoes.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function AutomationToggle({
  checked,
  disabled,
  label,
  description,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-border/80 bg-gradient-to-b from-white/[0.04] to-white/[0.015] px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="font-medium tracking-tight">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        className="self-end sm:mt-1 sm:self-start"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function MinutesStepperInput({
  id,
  value,
  min,
  max,
  disabled,
  onChange,
  allowEmpty = false,
  placeholder,
}: {
  id: string;
  value: number | null;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number | null) => void;
  allowEmpty?: boolean;
  placeholder?: string;
}) {
  const hasValue = value !== null;

  const clamp = (nextValue: number) => Math.min(max, Math.max(min, nextValue));

  const handleInputChange = (rawValue: string) => {
    const trimmedValue = rawValue.trim();

    if (!trimmedValue) {
      if (allowEmpty) {
        onChange(null);
      }

      return;
    }

    const parsedValue = Number(trimmedValue);

    if (!Number.isFinite(parsedValue)) {
      return;
    }

    onChange(clamp(parsedValue));
  };

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-background-panel/70 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="h-9 w-9 rounded-xl"
        disabled={disabled || (allowEmpty && !hasValue)}
        onClick={() => onChange(clamp((value ?? min) - 1))}
        aria-label="Diminuir valor em minutos"
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>

      <div className="relative flex-1">
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value ?? ''}
          onChange={(event) => handleInputChange(event.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="h-10 rounded-xl border-white/10 bg-background/70 pl-4 pr-14 text-base font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
          min
        </span>
      </div>

      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="h-9 w-9 rounded-xl"
        disabled={disabled}
        onClick={() => onChange(clamp((value ?? min) + 1))}
        aria-label="Aumentar valor em minutos"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
