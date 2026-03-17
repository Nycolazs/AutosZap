import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConversationCloseReason,
  ConversationOwnership,
  ConversationStatus,
  ConversationEventType,
  PermissionKey,
  Prisma,
  Role,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import {
  formatManualMessageContent,
  normalizeConversationStatus,
} from './conversation-workflow.utils';
import { InboxEventsService } from '../../common/realtime/inbox-events.service';
import {
  NormalizedRole,
  normalizeRole,
} from '../access-control/permissions.constants';
import { AccessControlService } from '../access-control/access-control.service';
import { WorkspaceSettingsService } from '../workspace-settings/workspace-settings.service';

type ActorContext = {
  id: string;
  workspaceId: string;
  name: string;
  role: Role;
  normalizedRole: NormalizedRole;
};

type LockedConversationRecord = {
  id: string;
  workspaceId: string;
  assignedUserId: string | null;
  status: ConversationStatus;
  closeReason: ConversationCloseReason | null;
  ownership: ConversationOwnership;
  unreadCount: number;
  currentCycleStartedAt: Date;
  firstHumanResponseAt: Date | null;
  lastHumanReplyAt: Date | null;
  lastInboundAt: Date | null;
  waitingSince: Date | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  closedAt: Date | null;
  closedById: string | null;
  statusChangedAt: Date;
};

type FinalizeConversationResult = {
  status: ConversationStatus;
  changed: boolean;
};

@Injectable()
export class ConversationWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxEventsService: InboxEventsService,
    private readonly accessControlService: AccessControlService,
    private readonly workspaceSettingsService: WorkspaceSettingsService,
  ) {}

  buildVisibilityWhere(user: CurrentAuthUser): Prisma.ConversationWhereInput {
    const normalizedRole = normalizeRole(user.role as Role);

    if (normalizedRole === 'ADMIN') {
      return {
        workspaceId: user.workspaceId,
        deletedAt: null,
      };
    }

    return {
      workspaceId: user.workspaceId,
      deletedAt: null,
      OR: [
        {
          status: {
            in: [
              ConversationStatus.NEW,
              ConversationStatus.WAITING,
              ConversationStatus.PENDING,
            ],
          },
        },
        {
          status: ConversationStatus.OPEN,
          assignedUserId: null,
        },
        {
          status: {
            in: [ConversationStatus.OPEN, ConversationStatus.IN_PROGRESS],
          },
          assignedUserId: user.sub,
        },
        {
          status: {
            in: [ConversationStatus.RESOLVED, ConversationStatus.CLOSED],
          },
          OR: [
            { assignedUserId: user.sub },
            { resolvedById: user.sub },
            { closedById: user.sub },
          ],
        },
      ],
    };
  }

  async assertConversationAccess(
    conversationId: string,
    user: CurrentAuthUser,
    actionLabel = 'acessar esta conversa',
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: user.workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        assignedUserId: true,
        status: true,
        resolvedById: true,
        closedById: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    const normalizedRole = normalizeRole(user.role as Role);

    if (normalizedRole === 'ADMIN') {
      return conversation;
    }

    const status = normalizeConversationStatus(
      conversation.status,
      conversation.assignedUserId,
    );

    const canAccess =
      status === ConversationStatus.NEW ||
      status === ConversationStatus.WAITING ||
      (status === ConversationStatus.IN_PROGRESS &&
        conversation.assignedUserId === user.sub) ||
      ((status === ConversationStatus.RESOLVED ||
        status === ConversationStatus.CLOSED) &&
        (conversation.assignedUserId === user.sub ||
          conversation.resolvedById === user.sub ||
          conversation.closedById === user.sub));

    if (!canAccess) {
      throw new ForbiddenException(
        `Voce nao pode ${actionLabel} porque ela pertence a outro vendedor.`,
      );
    }

    return conversation;
  }

  async prepareManualReply(
    conversationId: string,
    workspaceId: string,
    senderUserId: string,
  ) {
    const actor = await this.getActorContext(senderUserId, workspaceId);
    const now = new Date();
    const emitAfterCommit: Array<{
      conversationId: string;
      type:
        | 'conversation.updated'
        | 'conversation.message.created'
        | 'conversation.message.status.updated'
        | 'conversation.note.created';
      direction?: 'INBOUND' | 'OUTBOUND';
    }> = [];

    const conversation = await this.prisma.$transaction(async (tx) => {
      const lockedConversation = await this.lockConversation(
        tx,
        conversationId,
        workspaceId,
      );
      const currentStatus = normalizeConversationStatus(
        lockedConversation.status,
        lockedConversation.assignedUserId,
      );

      if (
        currentStatus === ConversationStatus.RESOLVED ||
        currentStatus === ConversationStatus.CLOSED
      ) {
        throw new BadRequestException(
          'Conversa encerrada. Reabra o atendimento para enviar novas mensagens.',
        );
      }

      if (
        actor.normalizedRole !== 'ADMIN' &&
        currentStatus === ConversationStatus.IN_PROGRESS &&
        lockedConversation.assignedUserId &&
        lockedConversation.assignedUserId !== actor.id
      ) {
        throw new ForbiddenException(
          'Esta conversa esta em atendimento com outro vendedor.',
        );
      }

      const nextAssignmentId =
        actor.normalizedRole === 'ADMIN' &&
        currentStatus === ConversationStatus.IN_PROGRESS &&
        lockedConversation.assignedUserId
          ? lockedConversation.assignedUserId
          : actor.id;

      const shouldChangeAssignment =
        lockedConversation.assignedUserId !== nextAssignmentId;
      const shouldMoveToInProgress =
        currentStatus !== ConversationStatus.IN_PROGRESS ||
        shouldChangeAssignment;
      const firstResponseAt = lockedConversation.firstHumanResponseAt ?? now;

      await tx.conversation.update({
        where: {
          id: lockedConversation.id,
        },
        data: {
          assignedUserId: nextAssignmentId,
          status: ConversationStatus.IN_PROGRESS,
          ownership: ConversationOwnership.MINE,
          unreadCount: 0,
          waitingSince: null,
          firstHumanResponseAt: firstResponseAt,
          lastHumanReplyAt: now,
          statusChangedAt: shouldMoveToInProgress
            ? now
            : lockedConversation.statusChangedAt,
        },
      });

      if (shouldChangeAssignment) {
        await tx.conversationAssignment.create({
          data: {
            workspaceId,
            conversationId,
            assignedToId: nextAssignmentId,
            assignedById: actor.id,
          },
        });

        await this.recordConversationEvent(tx, {
          workspaceId,
          conversationId,
          actorUserId: actor.id,
          type:
            lockedConversation.assignedUserId &&
            lockedConversation.assignedUserId !== nextAssignmentId
              ? ConversationEventType.TRANSFERRED
              : ConversationEventType.ASSIGNED,
          fromStatus: currentStatus,
          toStatus: ConversationStatus.IN_PROGRESS,
          metadata: {
            fromAssignedUserId: lockedConversation.assignedUserId,
            toAssignedUserId: nextAssignmentId,
          },
        });
      }

      if (!lockedConversation.firstHumanResponseAt) {
        await this.recordConversationEvent(tx, {
          workspaceId,
          conversationId,
          actorUserId: actor.id,
          type: ConversationEventType.FIRST_RESPONSE,
          fromStatus: currentStatus,
          toStatus: ConversationStatus.IN_PROGRESS,
          metadata: {
            responseTimeMs:
              now.getTime() -
              lockedConversation.currentCycleStartedAt.getTime(),
          },
        });
      }

      if (shouldMoveToInProgress) {
        await this.recordConversationEvent(tx, {
          workspaceId,
          conversationId,
          actorUserId: actor.id,
          type: ConversationEventType.STATUS_CHANGED,
          fromStatus: currentStatus,
          toStatus: ConversationStatus.IN_PROGRESS,
          metadata: {
            triggeredBy: 'manual_reply',
          },
        });
      }

      emitAfterCommit.push({
        conversationId,
        type: 'conversation.updated',
      });

      return tx.conversation.findUnique({
        where: {
          id: conversationId,
        },
        select: {
          id: true,
          assignedUserId: true,
          status: true,
        },
      });
    });

    for (const event of emitAfterCommit) {
      await this.emitConversationRealtimeEvent(
        workspaceId,
        event.conversationId,
        event.type,
        event.direction,
      );
    }

    return {
      actor,
      conversation,
    };
  }

  async transferConversation(
    conversationId: string,
    workspaceId: string,
    actorId: string,
    assignedUserId: string,
  ) {
    const actor = await this.getActorContext(actorId, workspaceId);

    if (
      actor.normalizedRole !== 'ADMIN' &&
      !(await this.canUserPerformAction(
        actor.id,
        workspaceId,
        PermissionKey.TRANSFER_CONVERSATION,
      ))
    ) {
      throw new ForbiddenException(
        'Voce nao tem permissao para transferir conversas.',
      );
    }

    const targetUser = await this.prisma.user.findFirst({
      where: {
        id: assignedUserId,
        workspaceId,
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('Usuario de destino nao encontrado.');
    }

    await this.assertConversationAccess(
      conversationId,
      {
        sub: actor.id,
        email: '',
        name: actor.name,
        role: actor.role as CurrentAuthUser['role'],
        workspaceId,
      },
      'transferir esta conversa',
    );

    await this.prisma.$transaction(async (tx) => {
      const lockedConversation = await this.lockConversation(
        tx,
        conversationId,
        workspaceId,
      );
      const currentStatus = normalizeConversationStatus(
        lockedConversation.status,
        lockedConversation.assignedUserId,
      );

      if (
        currentStatus === ConversationStatus.RESOLVED ||
        currentStatus === ConversationStatus.CLOSED
      ) {
        throw new BadRequestException(
          'Conversa encerrada. Reabra o atendimento antes de transferir.',
        );
      }

      if (lockedConversation.assignedUserId === assignedUserId) {
        return;
      }

      await tx.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          assignedUserId,
          status: ConversationStatus.IN_PROGRESS,
          ownership: ConversationOwnership.MINE,
          waitingSince:
            lockedConversation.lastInboundAt &&
            (!lockedConversation.lastHumanReplyAt ||
              lockedConversation.lastInboundAt >
                lockedConversation.lastHumanReplyAt)
              ? (lockedConversation.waitingSince ??
                lockedConversation.lastInboundAt)
              : null,
          statusChangedAt: new Date(),
        },
      });

      await tx.conversationAssignment.create({
        data: {
          workspaceId,
          conversationId,
          assignedToId: assignedUserId,
          assignedById: actor.id,
        },
      });

      await this.recordConversationEvent(tx, {
        workspaceId,
        conversationId,
        actorUserId: actor.id,
        type: ConversationEventType.TRANSFERRED,
        fromStatus: currentStatus,
        toStatus: ConversationStatus.IN_PROGRESS,
        metadata: {
          fromAssignedUserId: lockedConversation.assignedUserId,
          toAssignedUserId: assignedUserId,
        },
      });
    });

    await this.emitConversationRealtimeEvent(
      workspaceId,
      conversationId,
      'conversation.updated',
    );
  }

  async resolveConversation(
    conversationId: string,
    workspaceId: string,
    actorId: string,
  ) {
    return this.finalizeConversation(
      conversationId,
      workspaceId,
      actorId,
      ConversationStatus.RESOLVED,
    );
  }

  async closeConversation(
    conversationId: string,
    workspaceId: string,
    actorId: string,
  ) {
    return this.finalizeConversation(
      conversationId,
      workspaceId,
      actorId,
      ConversationStatus.CLOSED,
    );
  }

  async reopenConversation(
    conversationId: string,
    workspaceId: string,
    actorId: string,
  ) {
    const actor = await this.getActorContext(actorId, workspaceId);

    if (
      actor.normalizedRole !== 'ADMIN' &&
      !(await this.canUserPerformAction(
        actor.id,
        workspaceId,
        PermissionKey.REOPEN_CONVERSATION,
      ))
    ) {
      throw new ForbiddenException(
        'Voce nao tem permissao para reabrir conversas.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const lockedConversation = await this.lockConversation(
        tx,
        conversationId,
        workspaceId,
      );
      const currentStatus = normalizeConversationStatus(
        lockedConversation.status,
        lockedConversation.assignedUserId,
      );

      if (
        currentStatus !== ConversationStatus.RESOLVED &&
        currentStatus !== ConversationStatus.CLOSED
      ) {
        return;
      }

      const now = new Date();

      await tx.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          status: ConversationStatus.WAITING,
          closeReason: null,
          ownership: ConversationOwnership.TEAM,
          currentCycleStartedAt: now,
          firstHumanResponseAt: null,
          lastHumanReplyAt: null,
          waitingSince: now,
          resolvedAt: null,
          resolvedById: null,
          closedAt: null,
          closedById: null,
          resolvedAutoMessageSentAt: null,
          resolvedAutoMessageLastError: null,
          resolvedAutoMessageDispatchToken: null,
          resolvedAutoMessageDispatchStartedAt: null,
          closedAutoMessageSentAt: null,
          closedAutoMessageLastError: null,
          closedAutoMessageDispatchToken: null,
          closedAutoMessageDispatchStartedAt: null,
          statusChangedAt: now,
        },
      });

      await this.recordConversationEvent(tx, {
        workspaceId,
        conversationId,
        actorUserId: actor.id,
        type: ConversationEventType.REOPENED,
        fromStatus: currentStatus,
        toStatus: ConversationStatus.WAITING,
        metadata: {
          triggeredBy: 'manual',
        },
      });
    });

    await this.emitConversationRealtimeEvent(
      workspaceId,
      conversationId,
      'conversation.updated',
    );
  }

  async registerInboundActivity(
    conversationId: string,
    workspaceId: string,
    options?: {
      reopenClosedConversation?: boolean;
    },
  ) {
    let nextStatus: ConversationStatus = ConversationStatus.NEW;

    await this.prisma.$transaction(async (tx) => {
      const lockedConversation = await this.lockConversation(
        tx,
        conversationId,
        workspaceId,
      );
      const currentStatus = normalizeConversationStatus(
        lockedConversation.status,
        lockedConversation.assignedUserId,
      );
      const now = new Date();

      const shouldReopenClosedConversation =
        options?.reopenClosedConversation !== false &&
        (currentStatus === ConversationStatus.RESOLVED ||
          currentStatus === ConversationStatus.CLOSED);

      if (shouldReopenClosedConversation) {
        nextStatus = ConversationStatus.WAITING;

        await tx.conversation.update({
          where: {
            id: conversationId,
          },
          data: {
            status: nextStatus,
            closeReason: null,
            ownership: ConversationOwnership.TEAM,
            currentCycleStartedAt: now,
            firstHumanResponseAt: null,
            lastHumanReplyAt: null,
            lastInboundAt: now,
            waitingSince: now,
            unreadCount: {
              increment: 1,
            },
            resolvedAt: null,
            resolvedById: null,
            closedAt: null,
            closedById: null,
            resolvedAutoMessageSentAt: null,
            resolvedAutoMessageLastError: null,
            resolvedAutoMessageDispatchToken: null,
            resolvedAutoMessageDispatchStartedAt: null,
            closedAutoMessageSentAt: null,
            closedAutoMessageLastError: null,
            closedAutoMessageDispatchToken: null,
            closedAutoMessageDispatchStartedAt: null,
            statusChangedAt: now,
          },
        });

        await this.recordConversationEvent(tx, {
          workspaceId,
          conversationId,
          actorUserId: null,
          type: ConversationEventType.REOPENED,
          fromStatus: currentStatus,
          toStatus: nextStatus,
          metadata: {
            triggeredBy: 'customer_message',
          },
        });

        return;
      }

      nextStatus =
        currentStatus === ConversationStatus.IN_PROGRESS
          ? ConversationStatus.IN_PROGRESS
          : currentStatus === ConversationStatus.WAITING
            ? ConversationStatus.WAITING
            : ConversationStatus.NEW;

      await tx.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          status: nextStatus,
          ownership:
            nextStatus === ConversationStatus.IN_PROGRESS
              ? ConversationOwnership.MINE
              : nextStatus === ConversationStatus.WAITING
                ? ConversationOwnership.TEAM
                : ConversationOwnership.UNASSIGNED,
          unreadCount: {
            increment: 1,
          },
          lastInboundAt: now,
          waitingSince:
            nextStatus === ConversationStatus.IN_PROGRESS &&
            lockedConversation.assignedUserId
              ? now
              : nextStatus === ConversationStatus.WAITING
                ? (lockedConversation.waitingSince ?? now)
                : null,
          statusChangedAt:
            nextStatus !== currentStatus
              ? now
              : lockedConversation.statusChangedAt,
        },
      });

      if (nextStatus !== currentStatus) {
        await this.recordConversationEvent(tx, {
          workspaceId,
          conversationId,
          actorUserId: null,
          type: ConversationEventType.STATUS_CHANGED,
          fromStatus: currentStatus,
          toStatus: nextStatus,
          metadata: {
            triggeredBy: 'customer_message',
          },
        });
      }
    });

    await this.emitConversationRealtimeEvent(
      workspaceId,
      conversationId,
      'conversation.updated',
    );

    return {
      status: nextStatus,
    };
  }

  async processWaitingTimeouts() {
    const workspaces = await this.prisma.workspace.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    let returnedToWaitingCount = 0;
    let autoClosedCount = 0;

    for (const workspace of workspaces) {
      const settings =
        await this.workspaceSettingsService.getConversationSettings(
          workspace.id,
        );
      const threshold = new Date(
        Date.now() - settings.inactivityTimeoutMinutes * 60_000,
      );
      const candidates = await this.prisma.conversation.findMany({
        where: {
          workspaceId: workspace.id,
          deletedAt: null,
          assignedUserId: {
            not: null,
          },
          OR: [
            {
              waitingSince: {
                lte: threshold,
              },
            },
            {
              waitingSince: null,
              statusChangedAt: {
                lte: threshold,
              },
            },
          ],
          status: {
            in: [ConversationStatus.IN_PROGRESS, ConversationStatus.OPEN],
          },
        },
        select: {
          id: true,
        },
        take: 200,
      });

      for (const candidate of candidates) {
        const changed = await this.prisma.$transaction(async (tx) => {
          const lockedConversation = await this.lockConversation(
            tx,
            candidate.id,
            workspace.id,
          );
          const currentStatus = normalizeConversationStatus(
            lockedConversation.status,
            lockedConversation.assignedUserId,
          );
          const timeoutAnchor =
            lockedConversation.waitingSince ??
            lockedConversation.statusChangedAt;

          if (
            currentStatus !== ConversationStatus.IN_PROGRESS ||
            timeoutAnchor > threshold
          ) {
            return false;
          }

          const now = new Date();

          await tx.conversation.update({
            where: {
              id: candidate.id,
            },
            data: {
              status: ConversationStatus.WAITING,
              ownership: ConversationOwnership.TEAM,
              waitingSince: now,
              statusChangedAt: now,
            },
          });

          await this.recordConversationEvent(tx, {
            workspaceId: workspace.id,
            conversationId: candidate.id,
            actorUserId: null,
            type: ConversationEventType.WAITING_TIMEOUT,
            fromStatus: currentStatus,
            toStatus: ConversationStatus.WAITING,
            metadata: {
              timeoutAnchor: timeoutAnchor.toISOString(),
              timeoutMinutes: settings.inactivityTimeoutMinutes,
              assignedUserId: lockedConversation.assignedUserId,
            },
          });

          return true;
        });

        if (changed) {
          returnedToWaitingCount += 1;
          await this.emitConversationRealtimeEvent(
            workspace.id,
            candidate.id,
            'conversation.updated',
          );
        }
      }

      if (!settings.waitingAutoCloseTimeoutMinutes) {
        continue;
      }

      const waitingAutoCloseThreshold = new Date(
        Date.now() - settings.waitingAutoCloseTimeoutMinutes * 60_000,
      );

      const waitingCandidates = await this.prisma.conversation.findMany({
        where: {
          workspaceId: workspace.id,
          deletedAt: null,
          OR: [
            {
              waitingSince: {
                lte: waitingAutoCloseThreshold,
              },
            },
            {
              waitingSince: null,
              statusChangedAt: {
                lte: waitingAutoCloseThreshold,
              },
            },
          ],
          status: ConversationStatus.WAITING,
        },
        select: {
          id: true,
        },
        take: 200,
      });

      for (const candidate of waitingCandidates) {
        const changed = await this.prisma.$transaction(async (tx) => {
          const lockedConversation = await this.lockConversation(
            tx,
            candidate.id,
            workspace.id,
          );
          const currentStatus = normalizeConversationStatus(
            lockedConversation.status,
            lockedConversation.assignedUserId,
          );
          const timeoutAnchor =
            lockedConversation.waitingSince ??
            lockedConversation.statusChangedAt;

          if (
            currentStatus !== ConversationStatus.WAITING ||
            timeoutAnchor > waitingAutoCloseThreshold
          ) {
            return false;
          }

          const now = new Date();

          await tx.conversation.update({
            where: {
              id: candidate.id,
            },
            data: {
              status: ConversationStatus.CLOSED,
              closeReason: ConversationCloseReason.UNANSWERED,
              ownership: ConversationOwnership.TEAM,
              waitingSince: null,
              unreadCount: 0,
              closedAt: now,
              closedById: null,
              statusChangedAt: now,
            },
          });

          await this.recordConversationEvent(tx, {
            workspaceId: workspace.id,
            conversationId: candidate.id,
            actorUserId: null,
            type: ConversationEventType.CLOSED,
            fromStatus: currentStatus,
            toStatus: ConversationStatus.CLOSED,
            metadata: {
              closeReason: 'UNANSWERED',
              triggeredBy: 'waiting_auto_close_timeout',
              timeoutAnchor: timeoutAnchor.toISOString(),
              timeoutMinutes: settings.waitingAutoCloseTimeoutMinutes,
            },
          });

          return true;
        });

        if (changed) {
          autoClosedCount += 1;
          await this.emitConversationRealtimeEvent(
            workspace.id,
            candidate.id,
            'conversation.updated',
          );
        }
      }
    }

    return {
      updatedCount: returnedToWaitingCount + autoClosedCount,
      returnedToWaitingCount,
      autoClosedCount,
    };
  }

  formatManualMessage(userName: string, content: string) {
    return formatManualMessageContent(userName, content);
  }

  async emitConversationRealtimeEvent(
    workspaceId: string,
    conversationId: string,
    type:
      | 'conversation.message.created'
      | 'conversation.message.status.updated'
      | 'conversation.updated'
      | 'conversation.note.created',
    direction?: 'INBOUND' | 'OUTBOUND',
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId,
      },
      select: {
        id: true,
        workspaceId: true,
        assignedUserId: true,
        status: true,
      },
    });

    if (!conversation) {
      return;
    }

    const currentStatus = normalizeConversationStatus(
      conversation.status,
      conversation.assignedUserId,
    );

    this.inboxEventsService.emit({
      workspaceId,
      conversationId,
      type,
      direction,
      assignedUserId: conversation.assignedUserId,
      audience:
        currentStatus === ConversationStatus.IN_PROGRESS ||
        currentStatus === ConversationStatus.RESOLVED ||
        currentStatus === ConversationStatus.CLOSED
          ? 'ADMINS_AND_ASSIGNEE'
          : 'SELLERS_AND_ADMINS',
    });
  }

  private async finalizeConversation(
    conversationId: string,
    workspaceId: string,
    actorId: string,
    finalStatus: 'RESOLVED' | 'CLOSED',
  ): Promise<FinalizeConversationResult> {
    const actor = await this.getActorContext(actorId, workspaceId);
    const requiredPermission =
      finalStatus === ConversationStatus.RESOLVED
        ? PermissionKey.RESOLVE_CONVERSATION
        : PermissionKey.CLOSE_CONVERSATION;

    if (
      actor.normalizedRole !== 'ADMIN' &&
      !(await this.canUserPerformAction(
        actor.id,
        workspaceId,
        requiredPermission,
      ))
    ) {
      throw new ForbiddenException(
        'Voce nao tem permissao para alterar o status desta conversa.',
      );
    }

    await this.assertConversationAccess(
      conversationId,
      {
        sub: actor.id,
        email: '',
        name: actor.name,
        role: actor.role as CurrentAuthUser['role'],
        workspaceId,
      },
      'finalizar esta conversa',
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const lockedConversation = await this.lockConversation(
        tx,
        conversationId,
        workspaceId,
      );
      const currentStatus = normalizeConversationStatus(
        lockedConversation.status,
        lockedConversation.assignedUserId,
      );

      if (
        currentStatus === ConversationStatus.RESOLVED ||
        currentStatus === ConversationStatus.CLOSED
      ) {
        return {
          status: currentStatus,
          changed: false,
        } satisfies FinalizeConversationResult;
      }

      if (
        actor.normalizedRole !== 'ADMIN' &&
        lockedConversation.assignedUserId !== actor.id
      ) {
        throw new ForbiddenException(
          'Somente o vendedor responsavel pode finalizar esta conversa.',
        );
      }

      const now = new Date();
      const ownerUserId =
        actor.normalizedRole === 'ADMIN' && lockedConversation.assignedUserId
          ? lockedConversation.assignedUserId
          : actor.id;

      await tx.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          assignedUserId: ownerUserId,
          status: finalStatus,
          closeReason:
            finalStatus === ConversationStatus.CLOSED
              ? ConversationCloseReason.MANUAL
              : null,
          ownership: ConversationOwnership.MINE,
          waitingSince: null,
          unreadCount: 0,
          resolvedAt: finalStatus === ConversationStatus.RESOLVED ? now : null,
          resolvedById:
            finalStatus === ConversationStatus.RESOLVED ? ownerUserId : null,
          closedAt: finalStatus === ConversationStatus.CLOSED ? now : null,
          closedById:
            finalStatus === ConversationStatus.CLOSED ? ownerUserId : null,
          statusChangedAt: now,
        },
      });

      await this.recordConversationEvent(tx, {
        workspaceId,
        conversationId,
        actorUserId: actor.id,
        type:
          finalStatus === ConversationStatus.RESOLVED
            ? ConversationEventType.RESOLVED
            : ConversationEventType.CLOSED,
        fromStatus: currentStatus,
        toStatus: finalStatus,
        metadata: {
          ownerUserId,
          responseTimeMs: lockedConversation.firstHumanResponseAt
            ? lockedConversation.firstHumanResponseAt.getTime() -
              lockedConversation.currentCycleStartedAt.getTime()
            : null,
          resolutionTimeMs:
            now.getTime() - lockedConversation.currentCycleStartedAt.getTime(),
        },
      });

      return {
        status: finalStatus,
        changed: true,
      } satisfies FinalizeConversationResult;
    });

    if (result.changed) {
      await this.emitConversationRealtimeEvent(
        workspaceId,
        conversationId,
        'conversation.updated',
      );
    }

    return result;
  }

  private async canUserPerformAction(
    userId: string,
    workspaceId: string,
    permission: PermissionKey,
  ) {
    try {
      const snapshot = await this.accessControlService.getUserPermissions(
        userId,
        workspaceId,
      );

      return snapshot.permissionMap[permission];
    } catch {
      return false;
    }
  }

  private async getActorContext(userId: string, workspaceId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        workspaceId,
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    return {
      ...user,
      normalizedRole: normalizeRole(user.role),
    } satisfies ActorContext;
  }

  private async lockConversation(
    tx: Prisma.TransactionClient,
    conversationId: string,
    workspaceId: string,
  ) {
    const rows = await tx.$queryRaw<LockedConversationRecord[]>`
      SELECT
        id,
        "workspaceId",
        "assignedUserId",
        status,
        "closeReason",
        ownership,
        "unreadCount",
        "currentCycleStartedAt",
        "firstHumanResponseAt",
        "lastHumanReplyAt",
        "lastInboundAt",
        "waitingSince",
        "resolvedAt",
        "resolvedById",
        "closedAt",
        "closedById",
        "statusChangedAt"
      FROM "Conversation"
      WHERE id = ${conversationId}
        AND "workspaceId" = ${workspaceId}
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;

    const conversation = rows[0];

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    return conversation;
  }

  private async recordConversationEvent(
    tx: Prisma.TransactionClient,
    payload: {
      workspaceId: string;
      conversationId: string;
      actorUserId: string | null;
      type: ConversationEventType;
      fromStatus?: ConversationStatus | null;
      toStatus?: ConversationStatus | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    await tx.conversationEvent.create({
      data: {
        workspaceId: payload.workspaceId,
        conversationId: payload.conversationId,
        actorUserId: payload.actorUserId ?? undefined,
        type: payload.type,
        fromStatus: payload.fromStatus ?? undefined,
        toStatus: payload.toStatus ?? undefined,
        metadata: payload.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
