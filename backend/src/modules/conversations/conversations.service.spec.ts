import { ConversationStatus } from '@prisma/client';
import { ConversationsService } from './conversations.service';

describe('ConversationsService summary', () => {
  function createService() {
    const prisma = {
      conversation: {
        groupBy: jest.fn(),
      },
    };

    const workflow = {
      buildVisibilityWhere: jest.fn().mockReturnValue({
        workspaceId: 'ws-1',
        deletedAt: null,
      }),
    };

    const service = new ConversationsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      workflow as never,
      {} as never,
    );

    return {
      service,
      prisma,
      workflow,
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('aggregates visible conversations into normalized status buckets', async () => {
    const { service, prisma, workflow } = createService();

    prisma.conversation.groupBy.mockResolvedValue([
      {
        status: ConversationStatus.OPEN,
        assignedUserId: null,
        _count: { _all: 3 },
      },
      {
        status: ConversationStatus.OPEN,
        assignedUserId: 'seller-1',
        _count: { _all: 4 },
      },
      {
        status: ConversationStatus.PENDING,
        assignedUserId: 'seller-2',
        _count: { _all: 2 },
      },
      {
        status: ConversationStatus.RESOLVED,
        assignedUserId: 'seller-3',
        _count: { _all: 5 },
      },
      {
        status: ConversationStatus.CLOSED,
        assignedUserId: 'seller-3',
        _count: { _all: 1 },
      },
    ]);

    const result = await service.summary(
      {
        sub: 'seller-1',
        workspaceId: 'ws-1',
        role: 'SELLER',
      } as never,
      {
        search: 'maria',
      },
    );

    expect(workflow.buildVisibilityWhere).toHaveBeenCalled();
    const groupByMock = prisma.conversation.groupBy;
    const mockCalls = groupByMock.mock.calls as Array<
      [
        {
          by: string[];
          where: {
            AND?: Array<Record<string, unknown>>;
          };
        },
      ]
    >;
    const firstCall = mockCalls[0]?.[0];

    expect(firstCall).toBeDefined();
    expect(firstCall).toEqual(
      expect.objectContaining({
        by: ['status', 'assignedUserId'],
      }),
    );
    expect(firstCall?.where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: 'ws-1',
          deletedAt: null,
        }),
        expect.objectContaining({
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
      ]),
    );
    expect(result).toEqual({
      ALL: 15,
      NEW: 3,
      IN_PROGRESS: 4,
      WAITING: 2,
      RESOLVED: 5,
      CLOSED: 1,
    });
  });

  it('applies instance filters when summarizing conversations', async () => {
    const { service, prisma } = createService();

    prisma.conversation.groupBy.mockResolvedValue([]);

    await service.summary(
      {
        sub: 'seller-1',
        workspaceId: 'ws-1',
        role: 'SELLER',
      } as never,
      {
        instanceId: 'instance-qr-1',
      },
    );

    expect(prisma.conversation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              instanceId: 'instance-qr-1',
            }),
          ]),
        }),
      }),
    );
  });
});

describe('ConversationsService list', () => {
  function createService() {
    const prisma = {
      conversation: {
        findMany: jest.fn(),
        groupBy: jest.fn(),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };

    const workflow = {
      buildVisibilityWhere: jest.fn().mockReturnValue({
        workspaceId: 'ws-1',
        deletedAt: null,
      }),
    };

    const service = new ConversationsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      workflow as never,
      {} as never,
    );

    return {
      service,
      prisma,
      workflow,
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('keeps conversations split by contact and instance in the inbox list', async () => {
    const { service, prisma, workflow } = createService();

    prisma.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-1',
        status: ConversationStatus.NEW,
        closeReason: null,
        ownership: 'UNASSIGNED',
        unreadCount: 1,
        createdAt: new Date('2026-03-26T10:00:00.000Z'),
        updatedAt: new Date('2026-03-26T10:00:00.000Z'),
        lastMessageAt: new Date('2026-03-26T10:00:00.000Z'),
        lastMessagePreview: 'Oi pela instancia 1',
        contact: {
          id: 'contact-1',
          name: 'Maria',
          phone: '5511999999999',
        },
        instance: {
          id: 'instance-1',
          name: 'WhatsApp Comercial',
          status: 'CONNECTED',
          provider: 'WHATSAPP_WEB',
          mode: 'LIVE',
          phoneNumber: '5511888888888',
        },
        assignedUser: null,
        tags: [],
      },
      {
        id: 'conv-2',
        status: ConversationStatus.NEW,
        closeReason: null,
        ownership: 'UNASSIGNED',
        unreadCount: 2,
        createdAt: new Date('2026-03-26T11:00:00.000Z'),
        updatedAt: new Date('2026-03-26T11:00:00.000Z'),
        lastMessageAt: new Date('2026-03-26T11:00:00.000Z'),
        lastMessagePreview: 'Oi pela instancia 2',
        contact: {
          id: 'contact-1',
          name: 'Maria',
          phone: '5511999999999',
        },
        instance: {
          id: 'instance-2',
          name: 'WhatsApp Suporte',
          status: 'CONNECTED',
          provider: 'WHATSAPP_WEB',
          mode: 'LIVE',
          phoneNumber: '5511777777777',
        },
        assignedUser: null,
        tags: [],
      },
    ]);

    prisma.conversation.groupBy.mockResolvedValue([
      {
        contactId: 'contact-1',
        instanceId: 'instance-1',
      },
      {
        contactId: 'contact-1',
        instanceId: 'instance-2',
      },
    ]);

    const result = await service.list(
      {
        sub: 'seller-1',
        workspaceId: 'ws-1',
        role: 'SELLER',
      } as never,
      {
        page: 1,
        limit: 50,
      },
    );

    expect(workflow.buildVisibilityWhere).toHaveBeenCalled();
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        distinct: ['contactId'],
        include: expect.objectContaining({
          instance: expect.any(Object),
        }),
      }),
    );
    expect(prisma.conversation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['contactId'],
      }),
    );
    expect(result.meta.total).toBe(2);
    expect(
      result.data.map((conversation) => conversation.instance?.name),
    ).toEqual(['WhatsApp Comercial', 'WhatsApp Suporte']);
  });

  it('applies instance filters when listing conversations', async () => {
    const { service, prisma } = createService();

    prisma.conversation.findMany.mockResolvedValue([]);
    prisma.conversation.groupBy.mockResolvedValue([]);

    await service.list(
      {
        sub: 'seller-1',
        workspaceId: 'ws-1',
        role: 'SELLER',
      } as never,
      {
        page: 1,
        limit: 50,
        instanceId: 'instance-qr-1',
      },
    );

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              instanceId: 'instance-qr-1',
            }),
            expect.objectContaining({
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
          ]),
        }),
      }),
    );
  });

  it('filters legacy non-private whatsapp threads from inbox queries', () => {
    const { service } = createService();
    const serviceWithPrivateFilter = service as unknown as {
      buildPrivateConversationOnlyWhere: () => unknown;
    };

    const where = serviceWithPrivateFilter.buildPrivateConversationOnlyWhere();

    expect(where).toEqual(
      expect.objectContaining({
        messages: {
          none: {
            OR: expect.arrayContaining([
              {
                metadata: {
                  path: ['providerMessageContext', 'isPrivateChat'],
                  equals: false,
                },
              },
              {
                externalMessageId: {
                  contains: '@g.us',
                },
              },
              {
                externalMessageId: {
                  contains: '@newsletter',
                },
              },
            ]),
          },
        },
      }),
    );
  });
});

describe('ConversationsService listInboxInstances', () => {
  function createService() {
    const prisma = {
      instance: {
        findMany: jest.fn(),
      },
      conversation: {
        groupBy: jest.fn(),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };

    const workflow = {
      buildVisibilityWhere: jest.fn().mockReturnValue({
        workspaceId: 'ws-1',
        deletedAt: null,
      }),
    };

    const service = new ConversationsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      workflow as never,
      {} as never,
    );

    return {
      service,
      prisma,
      workflow,
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('returns inbox instances with new activity indicators', async () => {
    const { service, prisma, workflow } = createService();

    prisma.instance.findMany.mockResolvedValue([
      {
        id: 'instance-1',
        name: 'Comercial',
        status: 'CONNECTED',
        provider: 'WHATSAPP_WEB',
        mode: 'LIVE',
        phoneNumber: '5511888888888',
      },
      {
        id: 'instance-2',
        name: 'Suporte',
        status: 'CONNECTED',
        provider: 'WHATSAPP_WEB',
        mode: 'LIVE',
        phoneNumber: '5511777777777',
      },
    ]);
    prisma.conversation.groupBy.mockResolvedValue([
      {
        instanceId: 'instance-1',
        status: ConversationStatus.NEW,
        assignedUserId: null,
        _count: { _all: 2 },
        _sum: { unreadCount: 4 },
      },
      {
        instanceId: 'instance-1',
        status: ConversationStatus.OPEN,
        assignedUserId: 'seller-1',
        _count: { _all: 1 },
        _sum: { unreadCount: 0 },
      },
      {
        instanceId: 'instance-2',
        status: ConversationStatus.CLOSED,
        assignedUserId: 'seller-2',
        _count: { _all: 3 },
        _sum: { unreadCount: 0 },
      },
    ]);

    const result = await service.listInboxInstances({
      sub: 'seller-1',
      workspaceId: 'ws-1',
      role: 'SELLER',
    } as never);

    expect(workflow.buildVisibilityWhere).toHaveBeenCalled();
    expect(prisma.instance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'ws-1',
          deletedAt: null,
        },
      }),
    );
    expect(prisma.conversation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['instanceId', 'status', 'assignedUserId'],
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              workspaceId: 'ws-1',
              deletedAt: null,
            }),
            expect.objectContaining({
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
          ]),
        }),
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'instance-1',
        visibleConversationsCount: 3,
        unreadMessagesCount: 4,
        newConversationsCount: 2,
        hasNewMessages: true,
      }),
      expect.objectContaining({
        id: 'instance-2',
        visibleConversationsCount: 3,
        unreadMessagesCount: 0,
        newConversationsCount: 0,
        hasNewMessages: false,
      }),
    ]);
  });
});

describe('ConversationsService findOne', () => {
  function createService() {
    const prisma = {
      conversation: {
        findFirst: jest.fn(),
      },
    };

    const workflow = {
      assertConversationAccess: jest.fn(),
    };

    const service = new ConversationsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      workflow as never,
      {} as never,
    );

    return {
      service,
      prisma,
      workflow,
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('resolves qr contact avatar in conversation details without loading full messages', async () => {
    const { service, prisma } = createService();

    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      status: ConversationStatus.NEW,
      closeReason: null,
      ownership: 'UNASSIGNED',
      unreadCount: 1,
      createdAt: new Date('2026-03-26T10:00:00.000Z'),
      updatedAt: new Date('2026-03-26T10:00:00.000Z'),
      lastMessageAt: new Date('2026-03-26T10:00:00.000Z'),
      lastMessagePreview: 'Oi',
      contact: {
        id: 'contact-1',
        name: 'Rafael',
        phone: '5542999792797',
        email: null,
      },
      instance: {
        id: 'instance-1',
        name: 'teste',
        status: 'CONNECTED',
        provider: 'WHATSAPP_WEB',
        mode: 'PRODUCTION',
        phoneNumber: null,
        profilePictureUrl: null,
        profilePictureUpdatedAt: null,
      },
      assignedUser: null,
      tags: [],
      messages: [
        {
          metadata: {
            contact: {
              profilePictureUrl: 'https://example.com/avatar.jpg',
            },
          },
        },
      ],
      notes: false,
      reminders: false,
      events: [],
    });

    const result = await service.findOne(
      'conv-1',
      {
        sub: 'seller-1',
        workspaceId: 'ws-1',
        role: 'SELLER',
      } as never,
      'details,events',
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
        include: expect.objectContaining({
          messages: expect.objectContaining({
            take: 25,
            select: {
              metadata: true,
            },
          }),
        }),
      }),
    );
    expect(result.contactAvatarUrl).toBe('https://example.com/avatar.jpg');
    expect(result.messages).toBeUndefined();
  });
});

describe('ConversationsService markAsRead', () => {
  function createService() {
    const prisma = {
      conversation: {
        updateMany: jest.fn(),
      },
    };

    const workflow = {
      assertConversationAccess: jest.fn(),
      emitConversationRealtimeEvent: jest.fn(),
    };

    const service = new ConversationsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      workflow as never,
      {} as never,
    );

    return {
      service,
      prisma,
      workflow,
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('clears unread count and emits an inbox update when the conversation had unread messages', async () => {
    const { service, prisma, workflow } = createService();

    prisma.conversation.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.markAsRead('conv-1', {
      sub: 'seller-1',
      workspaceId: 'ws-1',
      role: 'SELLER',
    } as never);

    expect(workflow.assertConversationAccess).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        sub: 'seller-1',
        workspaceId: 'ws-1',
      }),
      'marcar esta conversa como lida',
    );
    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'conv-1',
        workspaceId: 'ws-1',
        deletedAt: null,
        unreadCount: {
          gt: 0,
        },
      },
      data: {
        unreadCount: 0,
      },
    });
    expect(workflow.emitConversationRealtimeEvent).toHaveBeenCalledWith(
      'ws-1',
      'conv-1',
      'conversation.updated',
    );
    expect(result).toEqual({
      success: true,
      changed: true,
    });
  });

  it('does not emit an inbox update when the conversation was already read', async () => {
    const { service, prisma, workflow } = createService();

    prisma.conversation.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.markAsRead('conv-1', {
      sub: 'seller-1',
      workspaceId: 'ws-1',
      role: 'SELLER',
    } as never);

    expect(workflow.emitConversationRealtimeEvent).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      changed: false,
    });
  });
});
