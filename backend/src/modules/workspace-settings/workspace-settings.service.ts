import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type BusinessHourInput = {
  weekday: number;
  isOpen: boolean;
  startTime?: string | null;
  endTime?: string | null;
};

type WorkspaceConversationSettingsWithHours =
  Prisma.WorkspaceConversationSettingsGetPayload<{
    include: {
      businessHours: true;
    };
  }>;

const DEFAULT_BUSINESS_HOURS: BusinessHourInput[] = [
  { weekday: 0, isOpen: false, startTime: null, endTime: null },
  { weekday: 1, isOpen: true, startTime: '08:00', endTime: '18:00' },
  { weekday: 2, isOpen: true, startTime: '08:00', endTime: '18:00' },
  { weekday: 3, isOpen: true, startTime: '08:00', endTime: '18:00' },
  { weekday: 4, isOpen: true, startTime: '08:00', endTime: '18:00' },
  { weekday: 5, isOpen: true, startTime: '08:00', endTime: '18:00' },
  { weekday: 6, isOpen: false, startTime: null, endTime: null },
];

const DEFAULT_WINDOW_CLOSED_TEMPLATE_NAME = 'retomada_atendimento_autozap';
const DEFAULT_WINDOW_CLOSED_TEMPLATE_LANGUAGE_CODE = 'pt_BR';

const WEEKDAY_LOOKUP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

@Injectable()
export class WorkspaceSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getConversationSettings(workspaceId: string) {
    return this.ensureConversationSettings(workspaceId);
  }

  async updateConversationSettings(
    workspaceId: string,
    payload: {
      inactivityTimeoutMinutes?: number;
      waitingAutoCloseTimeoutMinutes?: number | null;
      timezone?: string;
      sendBusinessHoursAutoReply?: boolean;
      businessHoursAutoReply?: string | null;
      sendOutOfHoursAutoReply?: boolean;
      outOfHoursAutoReply?: string | null;
      sendWindowClosedTemplateReply?: boolean;
      windowClosedTemplateName?: string | null;
      windowClosedTemplateLanguageCode?: string | null;
      businessHours?: BusinessHourInput[];
    },
  ) {
    const currentSettings = await this.ensureConversationSettings(workspaceId);

    if (
      payload.inactivityTimeoutMinutes !== undefined &&
      (payload.inactivityTimeoutMinutes < 1 ||
        payload.inactivityTimeoutMinutes > 1440)
    ) {
      throw new BadRequestException(
        'Defina um tempo de inatividade entre 1 e 1440 minutos.',
      );
    }

    if (
      payload.waitingAutoCloseTimeoutMinutes !== undefined &&
      payload.waitingAutoCloseTimeoutMinutes !== null &&
      (payload.waitingAutoCloseTimeoutMinutes < 1 ||
        payload.waitingAutoCloseTimeoutMinutes > 10080)
    ) {
      throw new BadRequestException(
        'Defina um tempo de encerramento automatico do aguardando entre 1 e 10080 minutos.',
      );
    }

    if (payload.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', {
          timeZone: payload.timezone,
        }).format(new Date());
      } catch {
        throw new BadRequestException(
          'Informe um timezone valido para a empresa.',
        );
      }
    }

    const sendBusinessHoursAutoReply =
      payload.sendBusinessHoursAutoReply ??
      currentSettings.sendBusinessHoursAutoReply;
    const businessHoursAutoReply =
      payload.businessHoursAutoReply ?? currentSettings.businessHoursAutoReply;
    const sendOutOfHoursAutoReply =
      payload.sendOutOfHoursAutoReply ??
      currentSettings.sendOutOfHoursAutoReply;
    const outOfHoursAutoReply =
      payload.outOfHoursAutoReply ?? currentSettings.outOfHoursAutoReply;
    const sendWindowClosedTemplateReply =
      payload.sendWindowClosedTemplateReply ??
      currentSettings.sendWindowClosedTemplateReply;
    const windowClosedTemplateName =
      payload.windowClosedTemplateName ??
      currentSettings.windowClosedTemplateName;
    const windowClosedTemplateLanguageCode =
      payload.windowClosedTemplateLanguageCode ??
      currentSettings.windowClosedTemplateLanguageCode;

    if (sendBusinessHoursAutoReply && !businessHoursAutoReply?.trim()) {
      throw new BadRequestException(
        'Informe a mensagem automatica para horario de atendimento.',
      );
    }

    if (sendOutOfHoursAutoReply && !outOfHoursAutoReply?.trim()) {
      throw new BadRequestException(
        'Informe a mensagem automatica para fora do horario de atendimento.',
      );
    }

    if (sendWindowClosedTemplateReply) {
      if (!windowClosedTemplateName?.trim()) {
        throw new BadRequestException(
          'Informe o nome do template aprovado para uso fora da janela de 24 horas.',
        );
      }

      if (!windowClosedTemplateLanguageCode?.trim()) {
        throw new BadRequestException(
          'Informe o idioma do template aprovado para uso fora da janela de 24 horas.',
        );
      }
    }

    const normalizedBusinessHours = payload.businessHours
      ? this.normalizeBusinessHours(payload.businessHours)
      : currentSettings.businessHours.map(
          (
            businessHour: WorkspaceConversationSettingsWithHours['businessHours'][number],
          ) => ({
            weekday: businessHour.weekday,
            isOpen: businessHour.isOpen,
            startTime: businessHour.startTime,
            endTime: businessHour.endTime,
          }),
        );

    return this.prisma.$transaction(async (tx) => {
      await tx.workspaceConversationSettings.update({
        where: {
          workspaceId,
        },
        data: {
          inactivityTimeoutMinutes:
            payload.inactivityTimeoutMinutes ??
            currentSettings.inactivityTimeoutMinutes,
          waitingAutoCloseTimeoutMinutes:
            payload.waitingAutoCloseTimeoutMinutes !== undefined
              ? payload.waitingAutoCloseTimeoutMinutes
              : currentSettings.waitingAutoCloseTimeoutMinutes,
          timezone: payload.timezone ?? currentSettings.timezone,
          sendBusinessHoursAutoReply,
          businessHoursAutoReply,
          sendOutOfHoursAutoReply,
          outOfHoursAutoReply,
          sendWindowClosedTemplateReply,
          windowClosedTemplateName: windowClosedTemplateName?.trim() || null,
          windowClosedTemplateLanguageCode:
            windowClosedTemplateLanguageCode?.trim() || null,
        },
      });

      await Promise.all(
        normalizedBusinessHours.map((businessHour) =>
          tx.workspaceBusinessHour.upsert({
            where: {
              settingsId_weekday: {
                settingsId: currentSettings.id,
                weekday: businessHour.weekday,
              },
            },
            update: {
              isOpen: businessHour.isOpen,
              startTime: businessHour.startTime,
              endTime: businessHour.endTime,
            },
            create: {
              settingsId: currentSettings.id,
              weekday: businessHour.weekday,
              isOpen: businessHour.isOpen,
              startTime: businessHour.startTime,
              endTime: businessHour.endTime,
            },
          }),
        ),
      );

      return this.ensureConversationSettings(workspaceId);
    });
  }

  async getBusinessHoursContext(workspaceId: string, at = new Date()) {
    const settings = await this.ensureConversationSettings(workspaceId);
    const timezone = settings.timezone;
    const localDate = this.getLocalTimeParts(at, timezone);
    const businessHour = settings.businessHours.find(
      (item: WorkspaceConversationSettingsWithHours['businessHours'][number]) =>
        item.weekday === localDate.weekday,
    );

    const minutes = localDate.hour * 60 + localDate.minute;
    const startMinutes = businessHour?.startTime
      ? this.parseTimeToMinutes(businessHour.startTime)
      : null;
    const endMinutes = businessHour?.endTime
      ? this.parseTimeToMinutes(businessHour.endTime)
      : null;

    const isOpen =
      Boolean(businessHour?.isOpen) &&
      startMinutes !== null &&
      endMinutes !== null &&
      minutes >= startMinutes &&
      minutes <= endMinutes;

    return {
      settings,
      timezone,
      localWeekday: localDate.weekday,
      localTime: `${String(localDate.hour).padStart(2, '0')}:${String(
        localDate.minute,
      ).padStart(2, '0')}`,
      isOpen,
    };
  }

  private async ensureConversationSettings(
    workspaceId: string,
  ): Promise<WorkspaceConversationSettingsWithHours> {
    const workspace = await this.prisma.workspace.findUnique({
      where: {
        id: workspaceId,
      },
      select: {
        id: true,
        settings: true,
        conversationSettings: {
          include: {
            businessHours: {
              orderBy: {
                weekday: 'asc',
              },
            },
          },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace nao encontrada.');
    }

    if (!workspace.conversationSettings) {
      const timezone = this.extractWorkspaceTimezone(workspace.settings);
      const defaultClosedWindowTemplate =
        this.getDefaultClosedWindowTemplateConfig();

      return this.prisma.workspaceConversationSettings.create({
        data: {
          workspaceId,
          timezone,
          sendWindowClosedTemplateReply:
            defaultClosedWindowTemplate.sendWindowClosedTemplateReply,
          windowClosedTemplateName:
            defaultClosedWindowTemplate.windowClosedTemplateName,
          windowClosedTemplateLanguageCode:
            defaultClosedWindowTemplate.windowClosedTemplateLanguageCode,
          businessHours: {
            create: DEFAULT_BUSINESS_HOURS,
          },
        },
        include: {
          businessHours: {
            orderBy: {
              weekday: 'asc',
            },
          },
        },
      });
    }

    const existingWeekdays = new Set(
      workspace.conversationSettings.businessHours.map(
        (
          item: WorkspaceConversationSettingsWithHours['businessHours'][number],
        ) => item.weekday,
      ),
    );

    const missingWeekdays = DEFAULT_BUSINESS_HOURS.filter(
      (businessHour) => !existingWeekdays.has(businessHour.weekday),
    );

    if (missingWeekdays.length) {
      await this.prisma.workspaceBusinessHour.createMany({
        data: missingWeekdays.map((businessHour) => ({
          settingsId: workspace.conversationSettings!.id,
          weekday: businessHour.weekday,
          isOpen: businessHour.isOpen,
          startTime: businessHour.startTime,
          endTime: businessHour.endTime,
        })),
        skipDuplicates: true,
      });

      return this.ensureConversationSettings(workspaceId);
    }

    const shouldBackfillClosedWindowTemplate =
      !workspace.conversationSettings.sendWindowClosedTemplateReply &&
      !workspace.conversationSettings.windowClosedTemplateName?.trim() &&
      !workspace.conversationSettings.windowClosedTemplateLanguageCode?.trim();

    if (shouldBackfillClosedWindowTemplate) {
      const defaultClosedWindowTemplate =
        this.getDefaultClosedWindowTemplateConfig();

      await this.prisma.workspaceConversationSettings.update({
        where: {
          workspaceId,
        },
        data: {
          sendWindowClosedTemplateReply:
            defaultClosedWindowTemplate.sendWindowClosedTemplateReply,
          windowClosedTemplateName:
            defaultClosedWindowTemplate.windowClosedTemplateName,
          windowClosedTemplateLanguageCode:
            defaultClosedWindowTemplate.windowClosedTemplateLanguageCode,
        },
      });

      return this.ensureConversationSettings(workspaceId);
    }

    return workspace.conversationSettings;
  }

  private getDefaultClosedWindowTemplateConfig() {
    const templateName =
      this.configService
        .get<string>('DEFAULT_WINDOW_CLOSED_TEMPLATE_NAME')
        ?.trim() || DEFAULT_WINDOW_CLOSED_TEMPLATE_NAME;
    const languageCode =
      this.configService
        .get<string>('DEFAULT_WINDOW_CLOSED_TEMPLATE_LANGUAGE_CODE')
        ?.trim() || DEFAULT_WINDOW_CLOSED_TEMPLATE_LANGUAGE_CODE;
    const sendTemplateReplyRaw = this.configService
      .get<string>('DEFAULT_SEND_WINDOW_CLOSED_TEMPLATE_REPLY')
      ?.trim()
      .toLowerCase();
    const sendWindowClosedTemplateReply =
      sendTemplateReplyRaw === undefined
        ? true
        : !['0', 'false', 'no', 'off'].includes(sendTemplateReplyRaw);

    return {
      sendWindowClosedTemplateReply,
      windowClosedTemplateName: templateName,
      windowClosedTemplateLanguageCode: languageCode,
    };
  }

  private normalizeBusinessHours(businessHours: BusinessHourInput[]) {
    if (businessHours.length !== 7) {
      throw new BadRequestException(
        'Informe exatamente sete configuracoes de horario, uma para cada dia da semana.',
      );
    }

    const weekdays = new Set<number>();

    return businessHours
      .map((businessHour) => {
        if (businessHour.weekday < 0 || businessHour.weekday > 6) {
          throw new BadRequestException(
            'Os dias de funcionamento devem usar valores entre 0 e 6.',
          );
        }

        if (weekdays.has(businessHour.weekday)) {
          throw new BadRequestException(
            'Nao repita configuracoes para o mesmo dia da semana.',
          );
        }

        weekdays.add(businessHour.weekday);

        const startTime = businessHour.startTime?.trim() || null;
        const endTime = businessHour.endTime?.trim() || null;

        if (businessHour.isOpen) {
          if (!startTime || !endTime) {
            throw new BadRequestException(
              'Dias abertos precisam informar horario inicial e final.',
            );
          }

          const startMinutes = this.parseTimeToMinutes(startTime);
          const endMinutes = this.parseTimeToMinutes(endTime);

          if (startMinutes >= endMinutes) {
            throw new BadRequestException(
              'O horario inicial deve ser anterior ao horario final.',
            );
          }
        }

        return {
          weekday: businessHour.weekday,
          isOpen: businessHour.isOpen,
          startTime: businessHour.isOpen ? startTime : null,
          endTime: businessHour.isOpen ? endTime : null,
        };
      })
      .sort((left, right) => left.weekday - right.weekday);
  }

  private parseTimeToMinutes(value: string) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);

    if (!match) {
      throw new BadRequestException(
        'Use o formato HH:mm para os horarios de funcionamento.',
      );
    }

    const [, hours, minutes] = match;
    return Number(hours) * 60 + Number(minutes);
  }

  private getLocalTimeParts(date: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const weekday = parts.find((part) => part.type === 'weekday')?.value;
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);

    if (!weekday || Number.isNaN(hour) || Number.isNaN(minute)) {
      throw new BadRequestException(
        'Nao foi possivel calcular o horario local da workspace.',
      );
    }

    return {
      weekday: WEEKDAY_LOOKUP[weekday] ?? 0,
      hour,
      minute,
    };
  }

  private extractWorkspaceTimezone(settings: Prisma.JsonValue | null) {
    if (
      settings &&
      typeof settings === 'object' &&
      !Array.isArray(settings) &&
      'timezone' in settings &&
      typeof settings.timezone === 'string' &&
      settings.timezone.trim()
    ) {
      return settings.timezone.trim();
    }

    return 'America/Fortaleza';
  }
}
