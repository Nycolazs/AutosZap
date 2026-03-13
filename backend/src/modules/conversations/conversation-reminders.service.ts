import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConversationEventType,
  ConversationStatus,
  NotificationType,
  PermissionKey,
  Prisma,
  ReminderStatus,
  Role,
  UserStatus,
} from '@prisma/client';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { normalizeRole } from '../access-control/permissions.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversationWorkflowService } from './conversation-workflow.service';
import { normalizeConversationStatus } from './conversation-workflow.utils';

type ReminderPayload = {
  messageToSend: string;
  internalDescription?: string;
  remindAt: string;
};

type ReminderConversationSummary = {
  id: string;
  workspaceId: string;
  status: ConversationStatus;
  assignedUserId: string | null;
  resolvedById: string | null;
  closedById: string | null;
  contact: {
    id: string;
    name: string;
  };
};

@Injectable()
export class ConversationRemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationWorkflowService: ConversationWorkflowService,
    private readonly accessControlService: AccessControlService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(conversationId: string, user: CurrentAuthUser) {
    await this.ensureConversation(conversationId, user);

    return this.prisma.conversationReminder.findMany({
      where: {
        workspaceId: user.workspaceId,
        conversationId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        completedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ remindAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(
    conversationId: string,
    user: CurrentAuthUser,
    payload: ReminderPayload,
  ) {
    const conversation = await this.ensureConversation(conversationId, user);
    const remindAt = this.parseReminderDate(payload.remindAt);
    const now = new Date();

    const reminder = await this.prisma.$transaction(async (tx) => {
      const createdReminder = await tx.conversationReminder.create({
        data: {
          workspaceId: user.workspaceId,
          conversationId,
          createdById: user.sub,
          messageToSend: payload.messageToSend.trim(),
          internalDescription: payload.internalDescription?.trim() || null,
          remindAt,
          status: ReminderStatus.PENDING,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
          completedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      await tx.conversationEvent.create({
        data: {
          workspaceId: user.workspaceId,
          conversationId,
          actorUserId: user.sub,
          type: ConversationEventType.REMINDER_CREATED,
          fromStatus: normalizeConversationStatus(
            conversation.status,
            conversation.assignedUserId,
          ),
          toStatus: normalizeConversationStatus(
            conversation.status,
            conversation.assignedUserId,
          ),
          metadata: {
            reminderId: createdReminder.id,
            remindAt: createdReminder.remindAt.toISOString(),
            messageToSend: createdReminder.messageToSend,
            internalDescription: createdReminder.internalDescription,
          } satisfies Prisma.InputJsonValue,
        },
      });

      return createdReminder;
    });

    await this.conversationWorkflowService.emitConversationRealtimeEvent(
      user.workspaceId,
      conversationId,
      'conversation.updated',
    );

    if (remindAt <= now) {
      await this.triggerReminderIfDue(reminder.id, user.workspaceId);
    }

    return reminder;
  }

  async update(
    conversationId: string,
    reminderId: string,
    user: CurrentAuthUser,
    payload: ReminderPayload,
  ) {
    const conversation = await this.ensureConversation(conversationId, user);
    const remindAt = this.parseReminderDate(payload.remindAt);
    const reminder = await this.findReminderOrThrow(
      reminderId,
      conversationId,
      user.workspaceId,
    );

    if (
      reminder.status === ReminderStatus.COMPLETED ||
      reminder.status === ReminderStatus.CANCELED
    ) {
      throw new BadRequestException(
        'Esse lembrete nao pode mais ser editado porque ja foi finalizado.',
      );
    }

    const nextStatus =
      remindAt > new Date() ? ReminderStatus.PENDING : ReminderStatus.PENDING;

    const updatedReminder = await this.prisma.$transaction(async (tx) => {
      const nextReminder = await tx.conversationReminder.update({
        where: {
          id: reminderId,
        },
        data: {
          messageToSend: payload.messageToSend.trim(),
          internalDescription: payload.internalDescription?.trim() || null,
          remindAt,
          status: nextStatus,
          notifiedAt: null,
          completedAt: null,
          completedById: null,
          canceledAt: null,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
          completedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      await tx.conversationEvent.create({
        data: {
          workspaceId: user.workspaceId,
          conversationId,
          actorUserId: user.sub,
          type: ConversationEventType.REMINDER_UPDATED,
          fromStatus: normalizeConversationStatus(
            conversation.status,
            conversation.assignedUserId,
          ),
          toStatus: normalizeConversationStatus(
            conversation.status,
            conversation.assignedUserId,
          ),
          metadata: {
            reminderId: nextReminder.id,
            remindAt: nextReminder.remindAt.toISOString(),
            messageToSend: nextReminder.messageToSend,
            internalDescription: nextReminder.internalDescription,
          } satisfies Prisma.InputJsonValue,
        },
      });

      return nextReminder;
    });

    await this.conversationWorkflowService.emitConversationRealtimeEvent(
      user.workspaceId,
      conversationId,
      'conversation.updated',
    );

    await this.triggerReminderIfDue(updatedReminder.id, user.workspaceId);
    return updatedReminder;
  }

  async complete(
    conversationId: string,
    reminderId: string,
    user: CurrentAuthUser,
  ) {
    const conversation = await this.ensureConversation(conversationId, user);
    const reminder = await this.findReminderOrThrow(
      reminderId,
      conversationId,
      user.workspaceId,
    );

    if (
      reminder.status === ReminderStatus.COMPLETED ||
      reminder.status === ReminderStatus.CANCELED
    ) {
      return reminder;
    }

    const updatedReminder = await this.prisma.$transaction(async (tx) => {
      const completedReminder = await tx.conversationReminder.update({
        where: {
          id: reminderId,
        },
        data: {
          status: ReminderStatus.COMPLETED,
          completedAt: new Date(),
          completedById: user.sub,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
          completedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      await tx.conversationEvent.create({
        data: {
          workspaceId: user.workspaceId,
          conversationId,
          actorUserId: user.sub,
          type: ConversationEventType.REMINDER_COMPLETED,
          fromStatus: normalizeConversationStatus(
            conversation.status,
            conversation.assignedUserId,
          ),
          toStatus: normalizeConversationStatus(
            conversation.status,
            conversation.assignedUserId,
          ),
          metadata: {
            reminderId: completedReminder.id,
          } satisfies Prisma.InputJsonValue,
        },
      });

      return completedReminder;
    });

    await this.conversationWorkflowService.emitConversationRealtimeEvent(
      user.workspaceId,
      conversationId,
      'conversation.updated',
    );

    return updatedReminder;
  }

  async cancel(
    conversationId: string,
    reminderId: string,
    user: CurrentAuthUser,
  ) {
    const conversation = await this.ensureConversation(conversationId, user);
    const reminder = await this.findReminderOrThrow(
      reminderId,
      conversationId,
      user.workspaceId,
    );

    if (
      reminder.status === ReminderStatus.COMPLETED ||
      reminder.status === ReminderStatus.CANCELED
    ) {
      return reminder;
    }

    const updatedReminder = await this.prisma.$transaction(async (tx) => {
      const canceledReminder = await tx.conversationReminder.update({
        where: {
          id: reminderId,
        },
        data: {
          status: ReminderStatus.CANCELED,
          canceledAt: new Date(),
        },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
          completedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      await tx.conversationEvent.create({
        data: {
          workspaceId: user.workspaceId,
          conversationId,
          actorUserId: user.sub,
          type: ConversationEventType.REMINDER_CANCELED,
          fromStatus: normalizeConversationStatus(
            conversation.status,
            conversation.assignedUserId,
          ),
          toStatus: normalizeConversationStatus(
            conversation.status,
            conversation.assignedUserId,
          ),
          metadata: {
            reminderId: canceledReminder.id,
          } satisfies Prisma.InputJsonValue,
        },
      });

      return canceledReminder;
    });

    await this.conversationWorkflowService.emitConversationRealtimeEvent(
      user.workspaceId,
      conversationId,
      'conversation.updated',
    );

    return updatedReminder;
  }

  async processDueReminders() {
    const dueReminders = await this.prisma.conversationReminder.findMany({
      where: {
        status: ReminderStatus.PENDING,
        remindAt: {
          lte: new Date(),
        },
      },
      select: {
        id: true,
        workspaceId: true,
      },
      orderBy: {
        remindAt: 'asc',
      },
      take: 200,
    });

    let processedCount = 0;

    for (const reminder of dueReminders) {
      const notified = await this.triggerReminderIfDue(
        reminder.id,
        reminder.workspaceId,
      );

      if (notified) {
        processedCount += 1;
      }
    }

    return {
      processedCount,
    };
  }

  async triggerReminderIfDue(reminderId: string, workspaceId: string) {
    const now = new Date();
    const reminder = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.conversationReminder.updateMany({
        where: {
          id: reminderId,
          workspaceId,
          status: ReminderStatus.PENDING,
          remindAt: {
            lte: now,
          },
        },
        data: {
          status: ReminderStatus.NOTIFIED,
          notifiedAt: now,
        },
      });

      if (updateResult.count === 0) {
        return null;
      }

      const notifiedReminder = await tx.conversationReminder.findUnique({
        where: {
          id: reminderId,
        },
        include: {
          conversation: {
            select: {
              id: true,
              workspaceId: true,
              status: true,
              assignedUserId: true,
              resolvedById: true,
              closedById: true,
              contact: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!notifiedReminder) {
        return null;
      }

      await tx.conversationEvent.create({
        data: {
          workspaceId,
          conversationId: notifiedReminder.conversationId,
          actorUserId: null,
          type: ConversationEventType.REMINDER_NOTIFIED,
          fromStatus: normalizeConversationStatus(
            notifiedReminder.conversation.status,
            notifiedReminder.conversation.assignedUserId,
          ),
          toStatus: normalizeConversationStatus(
            notifiedReminder.conversation.status,
            notifiedReminder.conversation.assignedUserId,
          ),
          metadata: {
            reminderId: notifiedReminder.id,
            remindAt: notifiedReminder.remindAt.toISOString(),
          } satisfies Prisma.InputJsonValue,
        },
      });

      return notifiedReminder;
    });

    if (!reminder) {
      return false;
    }

    const recipientIds = await this.resolveNotificationRecipients(
      reminder.workspaceId,
      reminder.conversation,
    );

    await this.notificationsService.createForUsers({
      workspaceId: reminder.workspaceId,
      userIds: recipientIds,
      title: `Lembrete vencido: ${reminder.conversation.contact.name}`,
      body: reminder.internalDescription?.trim()
        ? `${reminder.internalDescription.trim()} • Mensagem prevista: ${reminder.messageToSend}`
        : `Mensagem prevista: ${reminder.messageToSend}`,
      type: NotificationType.WARNING,
      entityType: 'conversation_reminder',
      entityId: reminder.id,
      linkHref: `/app/inbox?conversationId=${reminder.conversationId}`,
      metadata: {
        conversationId: reminder.conversationId,
        contactName: reminder.conversation.contact.name,
        remindAt: reminder.remindAt.toISOString(),
        messageToSend: reminder.messageToSend,
        internalDescription: reminder.internalDescription,
      },
    });

    await this.conversationWorkflowService.emitConversationRealtimeEvent(
      reminder.workspaceId,
      reminder.conversationId,
      'conversation.updated',
    );

    return true;
  }

  private async ensureConversation(
    conversationId: string,
    user: CurrentAuthUser,
  ): Promise<ReminderConversationSummary> {
    await this.conversationWorkflowService.assertConversationAccess(
      conversationId,
      user,
      'acessar os lembretes desta conversa',
    );

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: user.workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        assignedUserId: true,
        resolvedById: true,
        closedById: true,
        contact: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    return conversation;
  }

  private async findReminderOrThrow(
    reminderId: string,
    conversationId: string,
    workspaceId: string,
  ) {
    const reminder = await this.prisma.conversationReminder.findFirst({
      where: {
        id: reminderId,
        conversationId,
        workspaceId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        completedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!reminder) {
      throw new NotFoundException('Lembrete nao encontrado.');
    }

    return reminder;
  }

  private parseReminderDate(value: string) {
    const remindAt = new Date(value);

    if (Number.isNaN(remindAt.getTime())) {
      throw new BadRequestException('Informe uma data e hora validas.');
    }

    return remindAt;
  }

  private async resolveNotificationRecipients(
    workspaceId: string,
    conversation: ReminderConversationSummary,
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        role: true,
      },
    });

    const normalizedStatus = normalizeConversationStatus(
      conversation.status,
      conversation.assignedUserId,
    );
    const recipientIds: string[] = [];

    for (const user of users) {
      if (normalizeRole(user.role) === Role.ADMIN) {
        recipientIds.push(user.id);
        continue;
      }

      const permissionSnapshot =
        await this.accessControlService.getUserPermissions(
          user.id,
          workspaceId,
        );

      if (!permissionSnapshot.permissionMap[PermissionKey.INBOX_VIEW]) {
        continue;
      }

      if (
        normalizedStatus === ConversationStatus.NEW ||
        normalizedStatus === ConversationStatus.WAITING
      ) {
        recipientIds.push(user.id);
        continue;
      }

      if (
        normalizedStatus === ConversationStatus.IN_PROGRESS &&
        conversation.assignedUserId === user.id
      ) {
        recipientIds.push(user.id);
        continue;
      }

      if (
        (normalizedStatus === ConversationStatus.RESOLVED ||
          normalizedStatus === ConversationStatus.CLOSED) &&
        [
          conversation.assignedUserId,
          conversation.resolvedById,
          conversation.closedById,
        ].includes(user.id)
      ) {
        recipientIds.push(user.id);
      }
    }

    return recipientIds;
  }
}
