import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationEventsService } from '../../common/realtime/notification-events.service';
import { PushNotificationsService } from './push-notifications.service';

type CreateNotificationsInput = {
  workspaceId: string;
  userIds: string[];
  title: string;
  body: string;
  type?: NotificationType;
  entityType?: string;
  entityId?: string;
  linkHref?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEventsService: NotificationEventsService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  stream(user: CurrentAuthUser) {
    return this.notificationEventsService.stream(user);
  }

  async listForUser(
    user: CurrentAuthUser,
    query?: {
      limit?: number;
      unreadOnly?: boolean;
    },
  ) {
    const limit = Math.min(Math.max(query?.limit ?? 20, 1), 100);
    const where = {
      workspaceId: user.workspaceId,
      userId: user.sub,
      ...(query?.unreadOnly ? { readAt: null } : {}),
    } satisfies Prisma.NotificationWhereInput;

    const [items, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      }),
      this.prisma.notification.count({
        where: {
          workspaceId: user.workspaceId,
          userId: user.sub,
          readAt: null,
        },
      }),
    ]);

    return {
      items,
      unreadCount,
    };
  }

  async markRead(notificationId: string, user: CurrentAuthUser) {
    await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        workspaceId: user.workspaceId,
        userId: user.sub,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    const unreadCount = await this.prisma.notification.count({
      where: {
        workspaceId: user.workspaceId,
        userId: user.sub,
        readAt: null,
      },
    });

    this.notificationEventsService.emit({
      workspaceId: user.workspaceId,
      userId: user.sub,
      type: 'notification.read',
      notificationId,
      unreadCount,
    });

    return { success: true };
  }

  async markAllRead(user: CurrentAuthUser) {
    await this.prisma.notification.updateMany({
      where: {
        workspaceId: user.workspaceId,
        userId: user.sub,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    this.notificationEventsService.emit({
      workspaceId: user.workspaceId,
      userId: user.sub,
      type: 'notification.read-all',
      unreadCount: 0,
    });

    return { success: true };
  }

  async createForUsers(input: CreateNotificationsInput) {
    const userIds = [...new Set(input.userIds.filter(Boolean))];

    if (!userIds.length) {
      return { createdCount: 0 };
    }

    const createdItems = await this.prisma.$transaction(
      userIds.map((userId) =>
        this.prisma.notification.create({
          data: {
            workspaceId: input.workspaceId,
            userId,
            title: input.title,
            body: input.body,
            type: input.type ?? NotificationType.INFO,
            entityType: input.entityType,
            entityId: input.entityId,
            linkHref: input.linkHref,
            metadata: input.metadata as Prisma.InputJsonValue | undefined,
          },
        }),
      ),
    );

    const unreadCounts = await this.prisma.notification.groupBy({
      by: ['userId'],
      where: {
        workspaceId: input.workspaceId,
        userId: {
          in: userIds,
        },
        readAt: null,
      },
      _count: {
        _all: true,
      },
    });

    const unreadCountMap = Object.fromEntries(
      unreadCounts.map((item) => [item.userId, item._count._all]),
    );

    for (const item of createdItems) {
      this.notificationEventsService.emit({
        workspaceId: item.workspaceId,
        userId: item.userId,
        type: 'notification.created',
        notificationId: item.id,
        unreadCount: unreadCountMap[item.userId] ?? 0,
        payload: {
          title: item.title,
          body: item.body,
          type: item.type,
          linkHref: item.linkHref,
          metadata: item.metadata as Record<string, unknown> | null,
          createdAt: item.createdAt.toISOString(),
        },
      });
    }

    await this.pushNotificationsService.sendToUsers({
      workspaceId: input.workspaceId,
      userIds,
      title: input.title,
      body: input.body,
      linkHref: input.linkHref,
      metadata: input.metadata,
    });

    return {
      createdCount: userIds.length,
    };
  }
}
