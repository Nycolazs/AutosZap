import { BadRequestException } from '@nestjs/common';
import { WorkspaceSettingsService } from './workspace-settings.service';

describe('WorkspaceSettingsService', () => {
  function createService() {
    const prisma = {
      $transaction: jest.fn(),
      workspaceConversationSettings: {
        update: jest.fn(),
      },
      workspaceBusinessHour: {
        upsert: jest.fn(),
      },
    };

    const configService = {
      get: jest.fn(),
    };

    const service = new WorkspaceSettingsService(
      prisma as never,
      configService as never,
    );

    return {
      service,
      prisma,
    };
  }

  function createCurrentSettings() {
    return {
      id: 'settings-1',
      workspaceId: 'ws-1',
      inactivityTimeoutMinutes: 15,
      waitingAutoCloseTimeoutMinutes: null,
      timezone: 'America/Sao_Paulo',
      autoReplyCooldownMinutes: 120,
      sendBusinessHoursAutoReply: false,
      businessHoursAutoReply: null,
      sendOutOfHoursAutoReply: false,
      outOfHoursAutoReply: null,
      sendResolvedAutoReply: false,
      resolvedAutoReplyMessage: null,
      sendClosedAutoReply: false,
      closedAutoReplyMessage: null,
      sendAssignmentAutoReply: false,
      assignmentAutoReplyMessage: null,
      sendWindowClosedTemplateReply: false,
      windowClosedTemplateName: null,
      windowClosedTemplateLanguageCode: null,
      businessHours: Array.from({ length: 7 }).map((_, weekday) => ({
        id: `bh-${weekday}`,
        settingsId: 'settings-1',
        weekday,
        isOpen: weekday > 0 && weekday < 6,
        startTime: weekday > 0 && weekday < 6 ? '08:00' : null,
        endTime: weekday > 0 && weekday < 6 ? '18:00' : null,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      })),
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('requires transfer message text when assignment auto-reply is enabled', async () => {
    const { service } = createService();
    const currentSettings = createCurrentSettings();

    jest
      .spyOn(service as any, 'ensureConversationSettings')
      .mockResolvedValue(currentSettings as never);

    await expect(
      service.updateConversationSettings('ws-1', {
        sendAssignmentAutoReply: true,
        assignmentAutoReplyMessage: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists assignment auto-reply configuration', async () => {
    const { service, prisma } = createService();
    const currentSettings = createCurrentSettings();
    const updatedSettings = {
      ...currentSettings,
      sendAssignmentAutoReply: true,
      assignmentAutoReplyMessage:
        'Ola {nome}, seu atendimento seguira com {novo_vendedor}.',
    };

    const ensureSpy = jest
      .spyOn(service as any, 'ensureConversationSettings')
      .mockResolvedValueOnce(currentSettings as never)
      .mockResolvedValueOnce(updatedSettings as never);

    prisma.$transaction.mockImplementation(
      (
        callback: (tx: {
          workspaceConversationSettings: {
            update: jest.Mock;
          };
          workspaceBusinessHour: {
            upsert: jest.Mock;
          };
        }) => unknown,
      ) =>
        callback({
          workspaceConversationSettings: prisma.workspaceConversationSettings,
          workspaceBusinessHour: prisma.workspaceBusinessHour,
        }),
    );
    prisma.workspaceBusinessHour.upsert.mockResolvedValue(undefined);
    prisma.workspaceConversationSettings.update.mockResolvedValue({
      id: 'settings-1',
    });

    const result = await service.updateConversationSettings('ws-1', {
      sendAssignmentAutoReply: true,
      assignmentAutoReplyMessage:
        'Ola {nome}, seu atendimento seguira com {novo_vendedor}.',
    });

    expect(prisma.workspaceConversationSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-1',
        },
        data: expect.objectContaining({
          sendAssignmentAutoReply: true,
          assignmentAutoReplyMessage:
            'Ola {nome}, seu atendimento seguira com {novo_vendedor}.',
        }),
      }),
    );
    expect(result).toMatchObject({
      sendAssignmentAutoReply: true,
    });
    expect(ensureSpy).toHaveBeenCalledTimes(2);
  });
});
