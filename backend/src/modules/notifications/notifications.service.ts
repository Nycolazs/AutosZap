import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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

    return { success: true };
  }

  async createForUsers(input: CreateNotificationsInput) {
    const userIds = [...new Set(input.userIds.filter(Boolean))];

    if (!userIds.length) {
      return { createdCount: 0 };
    }

    await this.prisma.notification.createMany({
      data: userIds.map(
        (userId) =>
          ({
            workspaceId: input.workspaceId,
            userId,
            title: input.title,
            body: input.body,
            type: input.type ?? NotificationType.INFO,
            entityType: input.entityType,
            entityId: input.entityId,
            linkHref: input.linkHref,
            metadata: input.metadata as Prisma.InputJsonValue | undefined,
          }) satisfies Prisma.NotificationCreateManyInput,
      ),
    });

    return {
      createdCount: userIds.length,
    };
  }
}
