'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock3, MessageCircleReply, Save } from 'lucide-react';
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
  timezone: string;
  sendBusinessHoursAutoReply: boolean;
  businessHoursAutoReply?: string | null;
  sendOutOfHoursAutoReply: boolean;
  outOfHoursAutoReply?: string | null;
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
    timezone: settings.timezone,
    autoReplyCooldownMinutes: settings.autoReplyCooldownMinutes,
    sendBusinessHoursAutoReply: settings.sendBusinessHoursAutoReply,
    businessHoursAutoReply: settings.businessHoursAutoReply ?? null,
    sendOutOfHoursAutoReply: settings.sendOutOfHoursAutoReply,
    outOfHoursAutoReply: settings.outOfHoursAutoReply ?? null,
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
    timezone: settings.timezone,
    sendBusinessHoursAutoReply: settings.sendBusinessHoursAutoReply,
    businessHoursAutoReply: settings.businessHoursAutoReply ?? null,
    sendOutOfHoursAutoReply: settings.sendOutOfHoursAutoReply,
    outOfHoursAutoReply: settings.outOfHoursAutoReply ?? null,
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
    onSuccess: async (updatedSettings) => {
      setConversationSettingsDraft(
        sanitizeWorkspaceConversationSettings(updatedSettings),
      );
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
                    <Input
                      id="inactivity-timeout"
                      type="number"
                      min={1}
                      max={1440}
                      value={conversationSettings.inactivityTimeoutMinutes}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          inactivityTimeoutMinutes: Number(
                            event.target.value || 15,
                          ),
                        }))
                      }
                      disabled={!canEditRouting}
                    />
                    <p className="text-xs text-muted-foreground">
                      Após esse período sem resposta do responsável, a conversa
                      volta para <strong>AGUARDANDO</strong> e fica disponível
                      para outros vendedores.
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

                  <div className="rounded-[20px] border border-border bg-background-panel px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">
                          Template automatico fora da janela de 24 horas
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Quando a janela do WhatsApp estiver fechada, o sistema
                          usa um template aprovado para enviar a mensagem
                          digitada pelo vendedor como parametro do template.
                        </p>
                      </div>
                      <Switch
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
    <div className="flex items-center justify-between rounded-[20px] border border-border bg-background-panel px-4 py-3">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
