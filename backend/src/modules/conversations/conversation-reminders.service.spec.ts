import {
  ConversationEventType,
  ConversationStatus,
  ReminderStatus,
  Role,
  UserStatus,
} from '@prisma/client';
import { ConversationRemindersService } from './conversation-reminders.service';

describe('ConversationRemindersService', () => {
  function createService() {
    const prisma = {
      conversation: {
        findFirst: jest.fn(),
      },
      conversationReminder: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const conversationWorkflowService = {
      assertConversationAccess: jest.fn(),
      emitConversationRealtimeEvent: jest.fn(),
    };

    const accessControlService = {
      getUserPermissions: jest.fn(),
    };

    const notificationsService = {
      createForUsers: jest.fn(),
    };

    const service = new ConversationRemindersService(
      prisma as never,
      conversationWorkflowService as never,
      accessControlService as never,
      notificationsService as never,
    );

    return {
      service,
      prisma,
      conversationWorkflowService,
      accessControlService,
      notificationsService,
    };
  }

  it('notifies only admins and users linked to the conversation when a reminder becomes due', async () => {
    const {
      service,
      prisma,
      accessControlService,
      notificationsService,
      conversationWorkflowService,
    } = createService();
    const tx = {
      conversationReminder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'rem-1',
          workspaceId: 'ws-1',
          conversationId: 'conv-1',
          remindAt: new Date('2026-03-13T12:00:00.000Z'),
          messageToSend: 'Enviar proposta atualizada',
          internalDescription: 'Retorno comercial',
          conversation: {
            id: 'conv-1',
            workspaceId: 'ws-1',
            status: ConversationStatus.WAITING,
            assignedUserId: null,
            resolvedById: null,
            closedById: null,
            contact: {
              id: 'contact-1',
              name: 'Mariana Costa',
            },
          },
        }),
      },
      conversationEvent: {
        create: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'admin-1',
        role: Role.ADMIN,
        status: UserStatus.ACTIVE,
      },
      {
        id: 'seller-1',
        role: Role.SELLER,
        status: UserStatus.ACTIVE,
      },
      {
        id: 'seller-2',
        role: Role.SELLER,
        status: UserStatus.ACTIVE,
      },
    ]);
    accessControlService.getUserPermissions.mockImplementation(
      (userId: string) =>
        Promise.resolve({
          permissionMap: {
            INBOX_VIEW: userId === 'seller-1',
          },
        }),
    );

    const result = await service.triggerReminderIfDue('rem-1', 'ws-1');
    const notifiedCalls = tx.conversationEvent.create.mock.calls as Array<
      [
        {
          data: {
            workspaceId: string;
            conversationId: string;
            type: ConversationEventType;
          };
        },
      ]
    >;
    const notifiedEvent = notifiedCalls[0]?.[0];

    expect(result).toBe(true);
    expect(notifiedEvent).toBeDefined();
    expect(notifiedEvent!.data.workspaceId).toBe('ws-1');
    expect(notifiedEvent!.data.conversationId).toBe('conv-1');
    expect(notifiedEvent!.data.type).toBe(
      ConversationEventType.REMINDER_NOTIFIED,
    );
    expect(notificationsService.createForUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        entityId: 'rem-1',
        linkHref: '/app/inbox?conversationId=conv-1',
        userIds: ['admin-1'],
      }),
    );
    expect(
      conversationWorkflowService.emitConversationRealtimeEvent,
    ).toHaveBeenCalledWith('ws-1', 'conv-1', 'conversation.updated');
  });

  it('prevents duplicate notifications when the reminder was already processed', async () => {
    const { service, prisma, notificationsService } = createService();
    const tx = {
      conversationReminder: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
      },
      conversationEvent: {
        create: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const result = await service.triggerReminderIfDue('rem-1', 'ws-1');

    expect(result).toBe(false);
    expect(notificationsService.createForUsers).not.toHaveBeenCalled();
    expect(tx.conversationEvent.create).not.toHaveBeenCalled();
  });

  it('marks a reminder as completed and emits a conversation refresh', async () => {
    const { service, prisma, conversationWorkflowService } = createService();

    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workspaceId: 'ws-1',
      status: ConversationStatus.IN_PROGRESS,
      assignedUserId: 'seller-1',
      resolvedById: null,
      closedById: null,
      contact: {
        id: 'contact-1',
        name: 'Mariana Costa',
      },
    });
    conversationWorkflowService.assertConversationAccess.mockResolvedValue(
      undefined,
    );
    prisma.conversationReminder.findFirst.mockResolvedValue({
      id: 'rem-1',
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      status: ReminderStatus.NOTIFIED,
      messageToSend: 'Enviar proposta atualizada',
      internalDescription: null,
      remindAt: new Date('2026-03-13T12:00:00.000Z'),
      createdAt: new Date('2026-03-12T12:00:00.000Z'),
      updatedAt: new Date('2026-03-12T12:00:00.000Z'),
      createdBy: { id: 'seller-1', name: 'Ana' },
      completedBy: null,
    });

    const tx = {
      conversationReminder: {
        update: jest.fn().mockResolvedValue({
          id: 'rem-1',
          status: ReminderStatus.COMPLETED,
          completedAt: new Date('2026-03-13T13:00:00.000Z'),
          completedBy: { id: 'seller-1', name: 'Ana' },
        }),
      },
      conversationEvent: {
        create: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const result = await service.complete('conv-1', 'rem-1', {
      sub: 'seller-1',
      workspaceId: 'ws-1',
      email: 'ana@autoszap.com',
      name: 'Ana',
      role: 'SELLER',
    });
    const completedCalls = tx.conversationEvent.create.mock.calls as Array<
      [
        {
          data: {
            type: ConversationEventType;
          };
        },
      ]
    >;
    const completedEvent = completedCalls[0]?.[0];

    expect(result).toMatchObject({
      id: 'rem-1',
      status: ReminderStatus.COMPLETED,
    });
    expect(completedEvent).toBeDefined();
    expect(completedEvent!.data.type).toBe(
      ConversationEventType.REMINDER_COMPLETED,
    );
    expect(
      conversationWorkflowService.emitConversationRealtimeEvent,
    ).toHaveBeenCalledWith('ws-1', 'conv-1', 'conversation.updated');
  });
});
