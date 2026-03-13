'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Pencil,
  Plus,
  Sparkles,
} from 'lucide-react';
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
import type { ConversationReminder } from '@/lib/types';
import { cn } from '@/lib/utils';

export type ReminderFormState = {
  messageToSend: string;
  internalDescription: string;
  date: string;
  time: string;
};

export const DEFAULT_REMINDER_FORM: ReminderFormState = {
  messageToSend: '',
  internalDescription: '',
  date: '',
  time: '',
};

type ConversationRemindersPanelProps = {
  reminders: ConversationReminder[];
  reminderForm: ReminderFormState;
  onReminderFormChange: Dispatch<SetStateAction<ReminderFormState>>;
  editingReminderId: string | null;
  onEditReminder: (reminder: ConversationReminder) => void;
  onClearReminderEditor: () => void;
  onSaveReminder: () => Promise<unknown>;
  onCompleteReminder: (reminderId: string) => void;
  onCancelReminder: (reminderId: string) => void;
  remindersBusy: boolean;
};

type ReminderTone = 'neutral' | 'primary' | 'warning' | 'success' | 'danger';

type ReminderPresentation = {
  label: string;
  tone: ReminderTone;
  cardClassName: string;
  badgeClassName: string;
  dotClassName: string;
};

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function getReminderPresentation(reminder: ConversationReminder): ReminderPresentation {
  const remindAt = new Date(reminder.remindAt);
  const now = new Date();

  if (reminder.status === 'COMPLETED') {
    return {
      label: 'Concluído',
      tone: 'success',
      cardClassName:
        'border-emerald-400/12 bg-[linear-gradient(180deg,rgba(16,185,129,0.07),rgba(4,18,34,0.92))]',
      badgeClassName: 'border-emerald-300/18 bg-emerald-500/10 text-emerald-100',
      dotClassName: 'bg-emerald-300 shadow-[0_0_14px_rgba(52,211,153,0.34)]',
    };
  }

  if (reminder.status === 'CANCELED') {
    return {
      label: 'Cancelado',
      tone: 'danger',
      cardClassName:
        'border-rose-400/10 bg-[linear-gradient(180deg,rgba(244,63,94,0.06),rgba(4,18,34,0.92))]',
      badgeClassName: 'border-rose-300/18 bg-rose-500/10 text-rose-100',
      dotClassName: 'bg-rose-300 shadow-[0_0_14px_rgba(251,113,133,0.3)]',
    };
  }

  if (reminder.status === 'NOTIFIED' || remindAt.getTime() <= now.getTime()) {
    return {
      label: 'Atrasado',
      tone: 'warning',
      cardClassName:
        'border-amber-300/14 bg-[linear-gradient(180deg,rgba(245,158,11,0.08),rgba(4,18,34,0.92))]',
      badgeClassName: 'border-amber-300/18 bg-amber-400/10 text-amber-100',
      dotClassName: 'bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.36)]',
    };
  }

  if (isSameCalendarDay(remindAt, now)) {
    return {
      label: 'Hoje',
      tone: 'primary',
      cardClassName:
        'border-primary/16 bg-[linear-gradient(180deg,rgba(50,151,255,0.08),rgba(4,18,34,0.92))]',
      badgeClassName: 'border-primary/18 bg-primary/10 text-[#d2ebff]',
      dotClassName: 'bg-[#7fc1ff] shadow-[0_0_14px_rgba(127,193,255,0.38)]',
    };
  }

  return {
    label: 'Pendente',
    tone: 'neutral',
    cardClassName:
      'border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(4,18,34,0.92))]',
    badgeClassName: 'border-white/[0.08] bg-white/[0.05] text-white/78',
    dotClassName: 'bg-white/70 shadow-[0_0_12px_rgba(255,255,255,0.16)]',
  };
}

function formatReminderMoment(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const timeLabel = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  if (isSameCalendarDay(date, now)) {
    return `Hoje, ${timeLabel}`;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function pluralize(value: number, singular: string, plural?: string) {
  return `${value} ${value === 1 ? singular : plural ?? `${singular}s`}`;
}

function SummaryPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: ReminderTone;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-medium',
        tone === 'primary'
          ? 'border-primary/20 bg-primary/10 text-[#d7ecff]'
          : tone === 'warning'
            ? 'border-amber-300/18 bg-amber-400/10 text-amber-100'
            : tone === 'success'
              ? 'border-emerald-300/18 bg-emerald-500/10 text-emerald-100'
              : tone === 'danger'
                ? 'border-rose-300/18 bg-rose-500/10 text-rose-100'
                : 'border-white/[0.08] bg-white/[0.05] text-white/74',
      )}
    >
      {label}
    </span>
  );
}

function ReminderMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: ReminderTone;
}) {
  return (
    <div
      className={cn(
        'rounded-[16px] border px-3 py-2.5',
        tone === 'primary'
          ? 'border-primary/18 bg-primary/8'
          : tone === 'warning'
            ? 'border-amber-300/14 bg-amber-400/8'
            : tone === 'success'
              ? 'border-emerald-300/14 bg-emerald-500/8'
              : 'border-white/[0.06] bg-white/[0.03]',
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold text-white">{value}</p>
    </div>
  );
}

function ReminderStateBadge({
  reminder,
  compact = false,
}: {
  reminder: ConversationReminder;
  compact?: boolean;
}) {
  const presentation = getReminderPresentation(reminder);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium',
        presentation.badgeClassName,
        compact ? 'px-2.5 py-1 text-[10px]' : '',
      )}
    >
      <span className={cn('h-2.5 w-2.5 rounded-full', presentation.dotClassName)} />
      {presentation.label}
    </span>
  );
}

export function ConversationRemindersPanel({
  reminders,
  reminderForm,
  onReminderFormChange,
  editingReminderId,
  onEditReminder,
  onClearReminderEditor,
  onSaveReminder,
  onCompleteReminder,
  onCancelReminder,
  remindersBusy,
}: ConversationRemindersPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const activeDialogOpen = dialogOpen || Boolean(editingReminderId);

  const sortedReminders = useMemo(() => {
    return [...reminders].sort((left, right) => {
      const leftTerminal =
        left.status === 'COMPLETED' || left.status === 'CANCELED';
      const rightTerminal =
        right.status === 'COMPLETED' || right.status === 'CANCELED';

      if (leftTerminal !== rightTerminal) {
        return leftTerminal ? 1 : -1;
      }

      return (
        new Date(left.remindAt).getTime() - new Date(right.remindAt).getTime()
      );
    });
  }, [reminders]);

  const summary = useMemo(() => {
    const now = new Date();
    const active = reminders.filter(
      (reminder) =>
        reminder.status !== 'COMPLETED' && reminder.status !== 'CANCELED',
    );

    return {
      activeCount: active.length,
      overdueCount: active.filter((reminder) => {
        const remindAt = new Date(reminder.remindAt);
        return (
          reminder.status === 'NOTIFIED' || remindAt.getTime() <= now.getTime()
        );
      }).length,
      completedCount: reminders.filter(
        (reminder) => reminder.status === 'COMPLETED',
      ).length,
      nextReminder: sortedReminders.find(
        (reminder) =>
          reminder.status !== 'COMPLETED' && reminder.status !== 'CANCELED',
      ),
    };
  }, [reminders, sortedReminders]);

  const previewReminders = useMemo(
    () => sortedReminders.slice(0, 2),
    [sortedReminders],
  );

  const messageInvalid = showValidation && !reminderForm.messageToSend.trim();
  const dateInvalid = showValidation && !reminderForm.date;
  const timeInvalid = showValidation && !reminderForm.time;

  const updateField = (field: keyof ReminderFormState, value: string) => {
    onReminderFormChange((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);

    if (!open) {
      setComposerOpen(false);
      setShowValidation(false);
      onClearReminderEditor();
    }
  };

  const openPanel = () => {
    setDialogOpen(true);
    setShowValidation(false);
  };

  const openCreateDialog = () => {
    onClearReminderEditor();
    setShowValidation(false);
    setComposerOpen(true);
    setDialogOpen(true);
  };

  const openEditDialog = (reminder: ConversationReminder) => {
    setShowValidation(false);
    setComposerOpen(true);
    setDialogOpen(true);
    onEditReminder(reminder);
  };

  const handleSave = async () => {
    const invalid =
      !reminderForm.messageToSend.trim() ||
      !reminderForm.date ||
      !reminderForm.time;

    setShowValidation(true);

    if (invalid) {
      return;
    }

    try {
      await onSaveReminder();
      setComposerOpen(false);
      setShowValidation(false);
      onClearReminderEditor();
    } catch {
      // O toast de erro já é tratado pela tela pai.
    }
  };

  return (
    <>
      <section className="overflow-hidden rounded-[22px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(10,22,38,0.94),rgba(5,16,29,0.98))] shadow-[0_18px_32px_rgba(2,10,22,0.2)]">
        <div className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-primary/78">
                <Bell className="h-3.5 w-3.5" />
                Lembretes
              </div>
              <h3 className="mt-1.5 text-[17px] font-semibold leading-6 text-white">
                Lembrete de mensagem
              </h3>
              <p className="mt-1 max-w-[28ch] text-sm leading-5 text-muted-foreground">
                Organize retornos sem perder o contexto desta conversa.
              </p>
            </div>

            <Button
              size="sm"
              className="shrink-0 rounded-[14px] px-3.5"
              onClick={openCreateDialog}
            >
              <Plus className="h-4 w-4" />
              Novo
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <ReminderMetric label="Total" value={reminders.length} tone="primary" />
            <ReminderMetric label="Ativos" value={summary.activeCount} />
            <ReminderMetric label="Vencidos" value={summary.overdueCount} tone="warning" />
          </div>

          {previewReminders.length ? (
            <div className="space-y-2.5">
              {previewReminders.map((reminder) => (
                <button
                  key={reminder.id}
                  type="button"
                  onClick={() => openEditDialog(reminder)}
                  className="group w-full rounded-[18px] border border-white/[0.06] bg-white/[0.03] p-3.5 text-left transition-all duration-200 hover:border-primary/18 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-5 text-white transition group-hover:text-white">
                          {reminder.internalDescription?.trim() ||
                            'Retorno planejado para esta conversa'}
                        </p>
                      </div>
                      <ReminderStateBadge reminder={reminder} compact />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-[#07192a] px-2.5 py-1 text-white/74">
                        <CalendarDays className="h-3.5 w-3.5 text-primary" />
                        {formatReminderMoment(reminder.remindAt)}
                      </span>
                      <span className="truncate text-[11px] text-white/48">
                        Criado por {reminder.createdBy.name}
                      </span>
                    </div>

                    <p className="text-xs leading-5 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {reminder.messageToSend}
                    </p>
                  </div>
                </button>
              ))}

              <Button
                variant="ghost"
                className="w-full justify-between rounded-[16px] border border-white/[0.05] bg-white/[0.02] px-3.5"
                onClick={openPanel}
              >
                Ver central de lembretes
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-white/[0.08] bg-white/[0.02] p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.03] text-primary">
                  <Bell className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    Nenhum lembrete criado
                  </p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    Crie o primeiro retorno planejado para esta conversa.
                  </p>
                </div>
              </div>

              <Button
                className="mt-4 w-full rounded-[16px]"
                onClick={openCreateDialog}
              >
                <Plus className="h-4 w-4" />
                Criar primeiro lembrete
              </Button>
            </div>
          )}
        </div>
      </section>

      <Dialog open={activeDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="w-[min(760px,calc(100vw-1.5rem))] border-white/10 bg-[#04111f]/96 p-0">
          <div className="max-h-[88vh] overflow-y-auto p-6 sm:p-7">
            <DialogHeader className="pr-10">
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-primary/18 bg-primary/10 shadow-[0_12px_24px_rgba(50,151,255,0.18)]">
                  <Bell className="h-4.5 w-4.5 text-primary" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="text-[22px] text-white">
                    Lembrete de mensagem
                  </DialogTitle>
                  <DialogDescription className="mt-1 max-w-[58ch] text-sm leading-6 text-muted-foreground">
                    Centralize aqui os retornos planejados desta conversa. Crie,
                    edite e conclua lembretes sem apertar a lateral do inbox.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid gap-5">
              <div className="flex flex-col gap-4 rounded-[24px] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(8,23,42,0.88),rgba(4,16,30,0.98))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <SummaryPill
                        label={pluralize(reminders.length, 'lembrete')}
                        tone="primary"
                      />
                      <SummaryPill label={pluralize(summary.activeCount, 'ativo')} />
                      {summary.overdueCount ? (
                        <SummaryPill
                          label={pluralize(summary.overdueCount, 'atrasado')}
                          tone="warning"
                        />
                      ) : null}
                      {summary.completedCount ? (
                        <SummaryPill
                          label={pluralize(summary.completedCount, 'concluído')}
                          tone="success"
                        />
                      ) : null}
                    </div>

                    <p className="max-w-[56ch] text-sm leading-6 text-muted-foreground">
                      Use esse painel para organizar o próximo contato, manter o
                      histórico de lembretes visível para a equipe e preparar a
                      ação manual quando o alerta vencer.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    {composerOpen ? (
                      <Button
                        variant="ghost"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          setComposerOpen(false);
                          setShowValidation(false);
                          onClearReminderEditor();
                        }}
                      >
                        Cancelar edição
                      </Button>
                    ) : null}
                    <Button className="w-full sm:w-auto" onClick={openCreateDialog}>
                      <Plus className="h-4 w-4" />
                      Novo lembrete
                    </Button>
                  </div>
                </div>

                {summary.nextReminder ? (
                  <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] px-4 py-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/40">
                            Próximo alerta
                          </p>
                          <p className="mt-2 text-base font-semibold leading-7 text-white">
                            {summary.nextReminder.internalDescription?.trim() ||
                              'Retorno planejado para esta conversa'}
                          </p>
                        </div>
                        <ReminderStateBadge reminder={summary.nextReminder} />
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-[#071a2c] px-3 py-1.5 text-white/80">
                          <CalendarDays className="h-3.5 w-3.5 text-primary" />
                          {formatReminderMoment(summary.nextReminder.remindAt)}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-[#071a2c] px-3 py-1.5 text-white/70">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          Alerta interno para ação manual
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div
                  className={cn(
                    'grid overflow-hidden transition-all duration-200 ease-out',
                    composerOpen
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'grid-rows-[0fr] opacity-0',
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="grid gap-4 rounded-[22px] border border-primary/12 bg-[linear-gradient(180deg,rgba(4,17,31,0.96),rgba(3,13,24,0.98))] p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-base font-semibold text-white">
                            {editingReminderId
                              ? 'Editar lembrete'
                              : 'Criar novo lembrete'}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            Defina o contexto do retorno, a mensagem planejada e
                            o momento do alerta.
                          </p>
                        </div>
                        {editingReminderId ? (
                          <ReminderStateBadge
                            reminder={
                              reminders.find(
                                (reminder) => reminder.id === editingReminderId,
                              ) ?? summary.nextReminder ?? reminders[0]
                            }
                          />
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="reminder-internal-description"
                          className="text-[13px] font-medium text-white/92"
                        >
                          Descrição interna
                        </Label>
                        <Input
                          id="reminder-internal-description"
                          value={reminderForm.internalDescription}
                          onChange={(event) =>
                            updateField('internalDescription', event.target.value)
                          }
                          placeholder="Ex.: Retornar com proposta final e condições atualizadas"
                          className="h-11 rounded-[16px] border-white/[0.07] bg-[#061525]/80"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label
                            htmlFor="reminder-message-to-send"
                            className="text-[13px] font-medium text-white/92"
                          >
                            Mensagem prevista para o cliente
                          </Label>
                          <span className="text-[11px] text-muted-foreground">
                            Obrigatório
                          </span>
                        </div>
                        <Textarea
                          id="reminder-message-to-send"
                          value={reminderForm.messageToSend}
                          onChange={(event) =>
                            updateField('messageToSend', event.target.value)
                          }
                          aria-invalid={messageInvalid}
                          placeholder="Ex.: Oi! Passando para retomar nosso atendimento e te enviar a proposta atualizada."
                          className={cn(
                            'min-h-[148px] rounded-[18px] border-white/[0.07] bg-[#061525]/80 leading-6',
                            messageInvalid
                              ? 'border-rose-400/30 focus:border-rose-400/40 focus:ring-rose-500/20'
                              : '',
                          )}
                        />
                        {messageInvalid ? (
                          <p className="text-xs text-rose-200">
                            Informe a mensagem planejada para o cliente.
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Esse texto aparece no alerta interno para orientar o
                            próximo contato manual.
                          </p>
                        )}
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label
                            htmlFor="reminder-date"
                            className="text-[13px] font-medium text-white/92"
                          >
                            Data
                          </Label>
                          <div
                            className={cn(
                              'rounded-[18px] border border-white/[0.06] bg-[#061525]/80 p-2',
                              dateInvalid ? 'border-rose-400/30' : '',
                            )}
                          >
                            <div className="relative">
                              <Input
                                id="reminder-date"
                                type="date"
                                value={reminderForm.date}
                                onChange={(event) =>
                                  updateField('date', event.target.value)
                                }
                                aria-invalid={dateInvalid}
                                className="h-11 rounded-[14px] border-white/[0.04] bg-transparent pr-10 shadow-none"
                              />
                              <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            </div>
                          </div>
                          {dateInvalid ? (
                            <p className="text-xs text-rose-200">
                              Escolha a data do lembrete.
                            </p>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <Label
                            htmlFor="reminder-time"
                            className="text-[13px] font-medium text-white/92"
                          >
                            Hora
                          </Label>
                          <div
                            className={cn(
                              'rounded-[18px] border border-white/[0.06] bg-[#061525]/80 p-2',
                              timeInvalid ? 'border-rose-400/30' : '',
                            )}
                          >
                            <div className="relative">
                              <Input
                                id="reminder-time"
                                type="time"
                                value={reminderForm.time}
                                onChange={(event) =>
                                  updateField('time', event.target.value)
                                }
                                aria-invalid={timeInvalid}
                                className="h-11 rounded-[14px] border-white/[0.04] bg-transparent pr-10 shadow-none"
                              />
                              <Clock3 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            </div>
                          </div>
                          {timeInvalid ? (
                            <p className="text-xs text-rose-200">
                              Defina o horário do alerta.
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-[18px] border border-white/[0.05] bg-white/[0.03] px-4 py-3 text-xs leading-5 text-muted-foreground">
                        O sistema vai notificar a equipe quando esse horário
                        chegar. O envio ao cliente continua manual para manter
                        controle total do atendimento.
                      </div>

                      <div className="flex flex-col-reverse gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:justify-end">
                        <Button
                          variant="ghost"
                          className="w-full sm:w-auto"
                          onClick={() => {
                            setComposerOpen(false);
                            setShowValidation(false);
                            onClearReminderEditor();
                          }}
                        >
                          Cancelar
                        </Button>
                        <Button
                          className="w-full sm:w-auto"
                          onClick={() => void handleSave()}
                          disabled={remindersBusy}
                        >
                          {editingReminderId
                            ? 'Salvar lembrete'
                            : 'Criar lembrete'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {sortedReminders.length ? (
                <div className="space-y-3">
                  {sortedReminders.map((reminder) => {
                    const presentation = getReminderPresentation(reminder);
                    const canMutate =
                      reminder.status !== 'COMPLETED' &&
                      reminder.status !== 'CANCELED';

                    return (
                      <article
                        key={reminder.id}
                        className={cn(
                          'rounded-[20px] border p-4 transition-all duration-200 hover:border-primary/18',
                          presentation.cardClassName,
                        )}
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold leading-6 text-white">
                                {reminder.internalDescription?.trim() ||
                                  'Lembrete sem descrição'}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatReminderMoment(reminder.remindAt)}
                              </p>
                            </div>
                            <ReminderStateBadge reminder={reminder} />
                          </div>

                          <p className="overflow-hidden text-sm leading-6 text-foreground/82 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                            {reminder.messageToSend}
                          </p>

                          <div className="flex flex-col gap-3 border-t border-white/[0.05] pt-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-[11px] leading-5 text-muted-foreground">
                              Criado por {reminder.createdBy.name}
                              {reminder.completedBy
                                ? ` • concluído por ${reminder.completedBy.name}`
                                : ''}
                            </p>

                            {canMutate ? (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => openEditDialog(reminder)}
                                >
                                  <Pencil className="h-4 w-4" />
                                  Editar
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => onCompleteReminder(reminder.id)}
                                  disabled={remindersBusy}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  Concluir
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onCancelReminder(reminder.id)}
                                  disabled={remindersBusy}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[20px] border border-dashed border-white/[0.1] bg-white/[0.02] px-5 py-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[18px] border border-primary/18 bg-primary/10 shadow-[0_12px_28px_rgba(50,151,255,0.16)]">
                    <Bell className="h-5 w-5 text-primary" />
                  </div>
                  <h4 className="mt-4 text-base font-semibold text-white">
                    Nenhum lembrete criado
                  </h4>
                  <p className="mx-auto mt-2 max-w-[38ch] text-sm leading-6 text-muted-foreground">
                    Crie um lembrete para lembrar a equipe de retomar esse
                    cliente no melhor momento, sem perder o contexto da
                    conversa.
                  </p>
                  {!composerOpen ? (
                    <Button
                      className="mt-5 w-full sm:w-auto"
                      onClick={openCreateDialog}
                    >
                      <Plus className="h-4 w-4" />
                      Criar primeiro lembrete
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
