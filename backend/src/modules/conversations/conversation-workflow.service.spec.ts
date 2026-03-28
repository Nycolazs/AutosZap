import { ForbiddenException } from '@nestjs/common';
import {
  ConversationCloseReason,
  ConversationEventType,
  ConversationOwnership,
  ConversationStatus,
  Role,
  UserStatus,
} from '@prisma/client';
import { ConversationWorkflowService } from './conversation-workflow.service';

describe('ConversationWorkflowService', () => {
  const now = new Date('2026-03-12T18:00:00.000Z');

  type TransactionMock = {
    $queryRaw: jest.Mock;
    conversation: {
      update: jest.Mock;
      findUnique?: jest.Mock;
    };
    conversationAssignment?: {
      create: jest.Mock;
    };
    conversationEvent: {
      create: jest.Mock;
    };
  };

  function bindTransaction<T extends TransactionMock>(
    transactionMock: jest.Mock,
    tx: T,
  ) {
    transactionMock.mockImplementation(
      (callback: (client: T) => Promise<unknown>) => callback(tx),
    );
  }

  function createService() {
    const prisma = {
      user: {
        findFirst: jest.fn(),
      },
      conversation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      workspace: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const inboxEventsService = {
      emit: jest.fn(),
    };

    const accessControlService = {
      getUserPermissions: jest.fn(),
    };

    const workspaceSettingsService = {
      getConversationSettings: jest.fn(),
    };

    const service = new ConversationWorkflowService(
      prisma as never,
      inboxEventsService as never,
      accessControlService as never,
      workspaceSettingsService as never,
    );

    return {
      service,
      prisma,
      inboxEventsService,
      accessControlService,
      workspaceSettingsService,
    };
  }

  function createLockedConversation(
    overrides: Partial<{
      assignedUserId: string | null;
      status: ConversationStatus;
      closeReason: ConversationCloseReason | null;
      firstHumanResponseAt: Date | null;
      waitingSince: Date | null;
      statusChangedAt: Date;
    }> = {},
  ) {
    return {
      id: 'conv-1',
      workspaceId: 'ws-1',
      assignedUserId: null,
      status: ConversationStatus.OPEN,
      closeReason: null,
      ownership: ConversationOwnership.UNASSIGNED,
      unreadCount: 1,
      currentCycleStartedAt: new Date('2026-03-12T17:45:00.000Z'),
      firstHumanResponseAt: null,
      lastHumanReplyAt: null,
      lastInboundAt: new Date('2026-03-12T17:55:00.000Z'),
      waitingSince: null,
      resolvedAt: null,
      resolvedById: null,
      closedAt: null,
      closedById: null,
      statusChangedAt: new Date('2026-03-12T17:45:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('ignores conversations tied to deleted instances when checking access', async () => {
    const { service, prisma } = createService();

    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      assignedUserId: null,
      status: ConversationStatus.NEW,
      resolvedById: null,
      closedById: null,
    });

    await service.assertConversationAccess(
      'conv-1',
      {
        sub: 'admin-1',
        workspaceId: 'ws-1',
        role: 'ADMIN',
      } as never,
    );

    expect(prisma.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            {
              instanceId: null,
            },
            {
              instance: {
                is: {
                  deletedAt: null,
                },
              },
            },
          ],
        }),
      }),
    );
  });

  it('assigns the first seller who replies and emits a private inbox update', async () => {
    const { service, prisma, inboxEventsService } = createService();
    const tx: TransactionMock = {
      $queryRaw: jest.fn().mockResolvedValue([createLockedConversation()]),
      conversation: {
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: 'conv-1',
          assignedUserId: 'seller-1',
          status: ConversationStatus.IN_PROGRESS,
        }),
      },
      conversationAssignment: {
        create: jest.fn(),
      },
      conversationEvent: {
        create: jest.fn(),
      },
    };

    prisma.user.findFirst.mockResolvedValue({
      id: 'seller-1',
      workspaceId: 'ws-1',
      name: 'Ana',
      role: Role.SELLER,
      status: UserStatus.ACTIVE,
    });
    bindTransaction(prisma.$transaction, tx);
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workspaceId: 'ws-1',
      assignedUserId: 'seller-1',
      status: ConversationStatus.IN_PROGRESS,
    });

    const result = await service.prepareManualReply(
      'conv-1',
      'ws-1',
      'seller-1',
    );

    expect(result.actor).toMatchObject({
      id: 'seller-1',
      normalizedRole: 'SELLER',
    });
    expect(result.assignmentTransition).toMatchObject({
      changed: true,
      fromAssignedUserId: null,
      toAssignedUserId: 'seller-1',
      fromStatus: ConversationStatus.NEW,
      toStatus: ConversationStatus.IN_PROGRESS,
    });
    const updateCalls = tx.conversation.update.mock.calls as Array<
      [
        {
          where: { id: string };
          data: {
            assignedUserId: string | null;
            status: ConversationStatus;
            ownership: ConversationOwnership;
            unreadCount: number;
          };
        },
      ]
    >;
    const firstUpdateCall = updateCalls[0]?.[0];

    expect(firstUpdateCall).toBeDefined();
    expect(firstUpdateCall?.where.id).toBe('conv-1');
    expect(firstUpdateCall?.data.assignedUserId).toBe('seller-1');
    expect(firstUpdateCall?.data.status).toBe(ConversationStatus.IN_PROGRESS);
    expect(firstUpdateCall?.data.ownership).toBe(ConversationOwnership.MINE);
    expect(firstUpdateCall?.data.unreadCount).toBe(0);
    expect(tx.conversationAssignment).toBeDefined();
    expect(tx.conversationAssignment?.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-1',
        conversationId: 'conv-1',
        assignedToId: 'seller-1',
        assignedById: 'seller-1',
      },
    });
    expect(tx.conversationEvent.create).toHaveBeenCalledTimes(3);
    const eventCalls = tx.conversationEvent.create.mock.calls as Array<
      [
        {
          data: {
            type: ConversationEventType;
            toStatus?: ConversationStatus;
          };
        },
      ]
    >;
    const firstEventCall = eventCalls[0]?.[0];

    expect(firstEventCall?.data.type).toBe(ConversationEventType.ASSIGNED);
    expect(firstEventCall?.data.toStatus).toBe(ConversationStatus.IN_PROGRESS);
    expect(inboxEventsService.emit).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      type: 'conversation.updated',
      direction: undefined,
      assignedUserId: 'seller-1',
      audience: 'ADMINS_AND_ASSIGNEE',
    });
  });

  it('blocks a seller from replying to a conversation already owned by another seller', async () => {
    const { service, prisma, inboxEventsService } = createService();
    const tx: TransactionMock = {
      $queryRaw: jest.fn().mockResolvedValue([
        createLockedConversation({
          assignedUserId: 'seller-2',
          status: ConversationStatus.IN_PROGRESS,
          statusChangedAt: new Date('2026-03-12T17:50:00.000Z'),
        }),
      ]),
      conversation: {
        update: jest.fn(),
      },
      conversationAssignment: {
        create: jest.fn(),
      },
      conversationEvent: {
        create: jest.fn(),
      },
    };

    prisma.user.findFirst.mockResolvedValue({
      id: 'seller-1',
      workspaceId: 'ws-1',
      name: 'Ana',
      role: Role.SELLER,
      status: UserStatus.ACTIVE,
    });
    bindTransaction(prisma.$transaction, tx);

    await expect(
      service.prepareManualReply('conv-1', 'ws-1', 'seller-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(tx.conversation.update).not.toHaveBeenCalled();
    expect(inboxEventsService.emit).not.toHaveBeenCalled();
  });

  it('does not emit conversation.updated when transfer keeps the same assignee', async () => {
    const { service, prisma, inboxEventsService } = createService();
    const tx: TransactionMock = {
      $queryRaw: jest.fn().mockResolvedValue([
        createLockedConversation({
          assignedUserId: 'seller-1',
          status: ConversationStatus.IN_PROGRESS,
        }),
      ]),
      conversation: {
        update: jest.fn(),
      },
      conversationAssignment: {
        create: jest.fn(),
      },
      conversationEvent: {
        create: jest.fn(),
      },
    };

    prisma.user.findFirst
      .mockResolvedValueOnce({
        id: 'admin-1',
        workspaceId: 'ws-1',
        name: 'Admin',
        role: Role.ADMIN,
        status: UserStatus.ACTIVE,
      })
      .mockResolvedValueOnce({
        id: 'seller-1',
        workspaceId: 'ws-1',
        name: 'Vendedor',
        role: Role.SELLER,
        status: UserStatus.ACTIVE,
      });
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      assignedUserId: 'seller-1',
      status: ConversationStatus.IN_PROGRESS,
      resolvedById: null,
      closedById: null,
    });
    bindTransaction(prisma.$transaction, tx);

    const result = await service.transferConversation(
      'conv-1',
      'ws-1',
      'admin-1',
      'seller-1',
    );

    expect(result).toEqual({
      changed: false,
      fromAssignedUserId: 'seller-1',
      toAssignedUserId: 'seller-1',
      fromStatus: ConversationStatus.IN_PROGRESS,
      toStatus: ConversationStatus.IN_PROGRESS,
    });
    expect(tx.conversation.update).not.toHaveBeenCalled();
    expect(tx.conversationAssignment?.create).not.toHaveBeenCalled();
    expect(tx.conversationEvent.create).not.toHaveBeenCalled();
    expect(inboxEventsService.emit).not.toHaveBeenCalled();
  });

  it('returns stale in-progress conversations to WAITING after the configured timeout', async () => {
    const { service, prisma, inboxEventsService, workspaceSettingsService } =
      createService();
    const tx: TransactionMock = {
      $queryRaw: jest.fn().mockResolvedValue([
        createLockedConversation({
          assignedUserId: 'seller-1',
          status: ConversationStatus.IN_PROGRESS,
          waitingSince: new Date('2026-03-12T17:40:00.000Z'),
        }),
      ]),
      conversation: {
        update: jest.fn(),
      },
      conversationEvent: {
        create: jest.fn(),
      },
    };

    prisma.workspace.findMany.mockResolvedValue([{ id: 'ws-1' }]);
    workspaceSettingsService.getConversationSettings.mockResolvedValue({
      inactivityTimeoutMinutes: 5,
      waitingAutoCloseTimeoutMinutes: null,
    });
    prisma.conversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);
    bindTransaction(prisma.$transaction, tx);
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workspaceId: 'ws-1',
      assignedUserId: 'seller-1',
      status: ConversationStatus.WAITING,
    });

    const result = await service.processWaitingTimeouts();

    expect(result).toEqual({
      updatedCount: 1,
      returnedToWaitingCount: 1,
      autoClosedCount: 0,
    });
    const timeoutUpdateCalls = tx.conversation.update.mock.calls as Array<
      [
        {
          where: { id: string };
          data: {
            status: ConversationStatus;
            ownership: ConversationOwnership;
          };
        },
      ]
    >;
    const timeoutEventCalls = tx.conversationEvent.create.mock.calls as Array<
      [
        {
          data: {
            workspaceId: string;
            conversationId: string;
            type: ConversationEventType;
            toStatus?: ConversationStatus;
          };
        },
      ]
    >;
    const timeoutUpdateCall = timeoutUpdateCalls[0]?.[0];
    const timeoutEventCall = timeoutEventCalls[0]?.[0];

    expect(timeoutUpdateCall?.where.id).toBe('conv-1');
    expect(timeoutUpdateCall?.data.status).toBe(ConversationStatus.WAITING);
    expect(timeoutUpdateCall?.data.ownership).toBe(ConversationOwnership.TEAM);
    expect(timeoutEventCall?.data.workspaceId).toBe('ws-1');
    expect(timeoutEventCall?.data.conversationId).toBe('conv-1');
    expect(timeoutEventCall?.data.type).toBe(
      ConversationEventType.WAITING_TIMEOUT,
    );
    expect(timeoutEventCall?.data.toStatus).toBe(ConversationStatus.WAITING);
    expect(inboxEventsService.emit).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      type: 'conversation.updated',
      direction: undefined,
      assignedUserId: 'seller-1',
      audience: 'SELLERS_AND_ADMINS',
    });
  });

  it('auto-closes stale WAITING conversations as unanswered when waiting timeout is configured', async () => {
    const { service, prisma, inboxEventsService, workspaceSettingsService } =
      createService();
    const tx: TransactionMock = {
      $queryRaw: jest.fn().mockResolvedValue([
        createLockedConversation({
          assignedUserId: 'seller-1',
          status: ConversationStatus.WAITING,
          waitingSince: new Date('2026-03-12T17:40:00.000Z'),
        }),
      ]),
      conversation: {
        update: jest.fn(),
      },
      conversationEvent: {
        create: jest.fn(),
      },
    };

    prisma.workspace.findMany.mockResolvedValue([{ id: 'ws-1' }]);
    workspaceSettingsService.getConversationSettings.mockResolvedValue({
      inactivityTimeoutMinutes: 5,
      waitingAutoCloseTimeoutMinutes: 10,
    });
    prisma.conversation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'conv-1' }]);
    bindTransaction(prisma.$transaction, tx);
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workspaceId: 'ws-1',
      assignedUserId: 'seller-1',
      status: ConversationStatus.CLOSED,
    });

    const result = await service.processWaitingTimeouts();

    expect(result).toEqual({
      updatedCount: 1,
      returnedToWaitingCount: 0,
      autoClosedCount: 1,
    });

    const timeoutUpdateCalls = tx.conversation.update.mock.calls as Array<
      [
        {
          where: { id: string };
          data: {
            status: ConversationStatus;
            ownership: ConversationOwnership;
            closedById: string | null;
            closeReason: ConversationCloseReason | null;
          };
        },
      ]
    >;

    const timeoutEventCalls = tx.conversationEvent.create.mock.calls as Array<
      [
        {
          data: {
            workspaceId: string;
            conversationId: string;
            type: ConversationEventType;
            toStatus?: ConversationStatus;
            metadata?: Record<string, unknown>;
          };
        },
      ]
    >;

    const timeoutUpdateCall = timeoutUpdateCalls[0]?.[0];
    const timeoutEventCall = timeoutEventCalls[0]?.[0];

    expect(timeoutUpdateCall?.where.id).toBe('conv-1');
    expect(timeoutUpdateCall?.data.status).toBe(ConversationStatus.CLOSED);
    expect(timeoutUpdateCall?.data.ownership).toBe(ConversationOwnership.TEAM);
    expect(timeoutUpdateCall?.data.closedById).toBeNull();
    expect(timeoutUpdateCall?.data.closeReason).toBe(
      ConversationCloseReason.UNANSWERED,
    );
    expect(timeoutEventCall?.data.workspaceId).toBe('ws-1');
    expect(timeoutEventCall?.data.conversationId).toBe('conv-1');
    expect(timeoutEventCall?.data.type).toBe(ConversationEventType.CLOSED);
    expect(timeoutEventCall?.data.toStatus).toBe(ConversationStatus.CLOSED);
    expect(timeoutEventCall?.data.metadata).toMatchObject({
      closeReason: 'UNANSWERED',
      triggeredBy: 'waiting_auto_close_timeout',
      timeoutMinutes: 10,
    });

    expect(inboxEventsService.emit).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      type: 'conversation.updated',
      direction: undefined,
      assignedUserId: 'seller-1',
      audience: 'ADMINS_AND_ASSIGNEE',
    });
  });

  it('does not auto-close WAITING conversations before timeout threshold', async () => {
    const { service, prisma, workspaceSettingsService } = createService();

    prisma.workspace.findMany.mockResolvedValue([{ id: 'ws-1' }]);
    workspaceSettingsService.getConversationSettings.mockResolvedValue({
      inactivityTimeoutMinutes: 5,
      waitingAutoCloseTimeoutMinutes: 10,
    });
    prisma.conversation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.processWaitingTimeouts();

    expect(result).toEqual({
      updatedCount: 0,
      returnedToWaitingCount: 0,
      autoClosedCount: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('is idempotent when timeout processing runs multiple times', async () => {
    const { service, prisma, workspaceSettingsService } = createService();
    const tx: TransactionMock = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          createLockedConversation({
            assignedUserId: 'seller-1',
            status: ConversationStatus.WAITING,
            waitingSince: new Date('2026-03-12T17:40:00.000Z'),
          }),
        ])
        .mockResolvedValueOnce([
          createLockedConversation({
            assignedUserId: 'seller-1',
            status: ConversationStatus.CLOSED,
            closeReason: ConversationCloseReason.UNANSWERED,
            waitingSince: null,
          }),
        ]),
      conversation: {
        update: jest.fn(),
      },
      conversationEvent: {
        create: jest.fn(),
      },
    };

    prisma.workspace.findMany.mockResolvedValue([{ id: 'ws-1' }]);
    workspaceSettingsService.getConversationSettings.mockResolvedValue({
      inactivityTimeoutMinutes: 5,
      waitingAutoCloseTimeoutMinutes: 10,
    });
    prisma.conversation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'conv-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'conv-1' }]);
    bindTransaction(prisma.$transaction, tx);
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workspaceId: 'ws-1',
      assignedUserId: 'seller-1',
      status: ConversationStatus.CLOSED,
    });

    const firstRun = await service.processWaitingTimeouts();
    const secondRun = await service.processWaitingTimeouts();

    expect(firstRun).toEqual({
      updatedCount: 1,
      returnedToWaitingCount: 0,
      autoClosedCount: 1,
    });
    expect(secondRun).toEqual({
      updatedCount: 0,
      returnedToWaitingCount: 0,
      autoClosedCount: 0,
    });
    expect(tx.conversation.update).toHaveBeenCalledTimes(1);
    expect(tx.conversationEvent.create).toHaveBeenCalledTimes(1);
  });

  it('does not auto-close waiting conversations when timeout setting is disabled', async () => {
    const { service, prisma, workspaceSettingsService } = createService();

    prisma.workspace.findMany.mockResolvedValue([{ id: 'ws-1' }]);
    workspaceSettingsService.getConversationSettings.mockResolvedValue({
      inactivityTimeoutMinutes: 5,
      waitingAutoCloseTimeoutMinutes: null,
    });
    prisma.conversation.findMany.mockResolvedValue([]);

    const result = await service.processWaitingTimeouts();

    expect(result).toEqual({
      updatedCount: 0,
      returnedToWaitingCount: 0,
      autoClosedCount: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.conversation.findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps IN_PROGRESS on inbound activity and refreshes waitingSince for timeout tracking', async () => {
    const { service, prisma, inboxEventsService } = createService();
    const tx: TransactionMock = {
      $queryRaw: jest.fn().mockResolvedValue([
        createLockedConversation({
          assignedUserId: 'seller-1',
          status: ConversationStatus.IN_PROGRESS,
          waitingSince: new Date('2026-03-12T17:00:00.000Z'),
        }),
      ]),
      conversation: {
        update: jest.fn(),
      },
      conversationEvent: {
        create: jest.fn(),
      },
    };

    bindTransaction(prisma.$transaction, tx);
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workspaceId: 'ws-1',
      assignedUserId: 'seller-1',
      status: ConversationStatus.IN_PROGRESS,
    });

    const result = await service.registerInboundActivity('conv-1', 'ws-1');

    expect(result).toEqual({ status: ConversationStatus.IN_PROGRESS });
    const updateCall = tx.conversation.update.mock.calls[0]?.[0] as
      | {
          data: {
            status: ConversationStatus;
            ownership: ConversationOwnership;
            waitingSince: Date | null;
          };
        }
      | undefined;
    expect(updateCall?.data.status).toBe(ConversationStatus.IN_PROGRESS);
    expect(updateCall?.data.ownership).toBe(ConversationOwnership.MINE);
    expect(updateCall?.data.waitingSince).toBeInstanceOf(Date);
    expect(tx.conversationEvent.create).not.toHaveBeenCalled();
    expect(inboxEventsService.emit).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      type: 'conversation.updated',
      direction: undefined,
      assignedUserId: 'seller-1',
      audience: 'ADMINS_AND_ASSIGNEE',
    });
  });

  it('reopens CLOSED conversation to WAITING on new customer inbound activity', async () => {
    const { service, prisma, inboxEventsService } = createService();
    const tx: TransactionMock = {
      $queryRaw: jest.fn().mockResolvedValue([
        createLockedConversation({
          assignedUserId: 'seller-1',
          status: ConversationStatus.CLOSED,
          closeReason: ConversationCloseReason.UNANSWERED,
        }),
      ]),
      conversation: {
        update: jest.fn(),
      },
      conversationEvent: {
        create: jest.fn(),
      },
    };

    bindTransaction(prisma.$transaction, tx);
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workspaceId: 'ws-1',
      assignedUserId: 'seller-1',
      status: ConversationStatus.WAITING,
    });

    const result = await service.registerInboundActivity('conv-1', 'ws-1');

    expect(result).toEqual({ status: ConversationStatus.WAITING });
    const updateCall = tx.conversation.update.mock.calls[0]?.[0] as
      | {
          data: {
            status: ConversationStatus;
            closeReason: ConversationCloseReason | null;
            ownership: ConversationOwnership;
          };
        }
      | undefined;
    expect(updateCall?.data.status).toBe(ConversationStatus.WAITING);
    expect(updateCall?.data.closeReason).toBeNull();
    expect(updateCall?.data.ownership).toBe(ConversationOwnership.TEAM);
    expect(tx.conversationEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: ConversationEventType.REOPENED,
          toStatus: ConversationStatus.WAITING,
        }),
      }),
    );
    expect(inboxEventsService.emit).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      type: 'conversation.updated',
      direction: undefined,
      assignedUserId: 'seller-1',
      audience: 'SELLERS_AND_ADMINS',
    });
  });
});
