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
});
