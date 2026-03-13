import { ForbiddenException } from '@nestjs/common';
import {
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
});
