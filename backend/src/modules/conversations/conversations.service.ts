import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AutoMessageType,
  ConversationStatus,
  MessageDirection,
  Prisma,
} from '@prisma/client';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InboxEventsService } from '../../common/realtime/inbox-events.service';
import {
  getPagination,
  paginatedResponse,
} from '../../common/utils/pagination';
import { normalizeSearchPhone } from '../../common/utils/phone';
import { MetaWhatsAppService } from '../integrations/meta-whatsapp/meta-whatsapp.service';
import { WorkspaceSettingsService } from '../workspace-settings/workspace-settings.service';
import { ConversationWorkflowService } from './conversation-workflow.service';
import { normalizeConversationStatus } from './conversation-workflow.utils';

const INBOX_MESSAGES_PRELOAD_LIMIT = 120;

type ConversationIncludeToken =
  | 'messages'
  | 'notes'
  | 'reminders'
  | 'contactTags';

type FinalAutoMessageDeliveryResult = {
  attempted: boolean;
  sent: boolean;
  skippedReason?:
    | 'feature-disabled'
    | 'message-empty'
    | 'status-mismatch'
    | 'already-sent'
    | 'in-progress';
  error?: string;
};

type LockedFinalizationConversationRecord = {
  id: string;
  status: ConversationStatus;
  assignedUserId: string | null;
  resolvedAutoMessageSentAt: Date | null;
  resolvedAutoMessageDispatchToken: string | null;
  resolvedAutoMessageDispatchStartedAt: Date | null;
  closedAutoMessageSentAt: Date | null;
  closedAutoMessageDispatchToken: string | null;
  closedAutoMessageDispatchStartedAt: Date | null;
};

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaWhatsAppService: MetaWhatsAppService,
    private readonly inboxEventsService: InboxEventsService,
    private readonly conversationWorkflowService: ConversationWorkflowService,
    private readonly workspaceSettingsService: WorkspaceSettingsService,
  ) {}

  stream(user: CurrentAuthUser) {
    return this.inboxEventsService.stream(user);
  }

  async list(
    user: CurrentAuthUser,
    query: PaginationQueryDto & {
      status?: string;
      ownership?: string;
      assignedUserId?: string;
      tagId?: string;
    },
  ) {
    const { page, limit, skip, take } = getPagination(query.page, query.limit);
    const where = this.buildConversationWhere(user, query);

    const [data, groupedContacts] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        distinct: ['contactId'],
        include: {
          contact: true,
          assignedUser: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
          tags: {
            include: {
              tag: true,
            },
          },
        },
        orderBy: {
          lastMessageAt: 'desc',
        },
        skip,
        take,
      }),
      this.prisma.conversation.groupBy({
        where,
        by: ['contactId'],
        orderBy: {
          contactId: 'asc',
        },
      }),
    ]);

    const total = groupedContacts.length;

    return paginatedResponse(
      data.map((conversation) => ({
        ...conversation,
        tags: conversation.tags.map((item) => item.tag),
      })),
      total,
      page,
      limit,
    );
  }

  async summary(
    user: CurrentAuthUser,
    query: {
      search?: string;
      ownership?: string;
      assignedUserId?: string;
      tagId?: string;
    },
  ) {
    const where = this.buildConversationWhere(user, query, {
      includeStatus: false,
    });

    const groupedConversations = await this.prisma.conversation.groupBy({
      by: ['status', 'assignedUserId'],
      where,
      _count: {
        _all: true,
      },
    });

    const summary = {
      ALL: 0,
      NEW: 0,
      IN_PROGRESS: 0,
      WAITING: 0,
      RESOLVED: 0,
      CLOSED: 0,
    } satisfies Record<string, number>;

    for (const group of groupedConversations) {
      const normalizedStatus = normalizeConversationStatus(
        group.status,
        group.assignedUserId,
      );
      const count = group._count._all;

      summary.ALL += count;

      if (normalizedStatus in summary) {
        summary[normalizedStatus] += count;
      }
    }

    return summary;
  }

  async findOne(id: string, user: CurrentAuthUser, include?: string) {
    await this.conversationWorkflowService.assertConversationAccess(
      id,
      user,
      'visualizar esta conversa',
    );

    const includes = this.resolveConversationIncludes(include);

    const contactInclude = includes.has('contactTags')
      ? {
          include: {
            tagLinks: {
              include: {
                tag: true,
              },
            },
          },
        }
      : true;

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        workspaceId: user.workspaceId,
        deletedAt: null,
      },
      include: {
        contact: contactInclude,
        assignedUser: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
        messages: includes.has('messages')
          ? {
              orderBy: {
                createdAt: 'desc',
              },
              take: INBOX_MESSAGES_PRELOAD_LIMIT,
            }
          : false,
        notes: includes.has('notes')
          ? {
              include: {
                author: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
            }
          : false,
        reminders: includes.has('reminders')
          ? {
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
              orderBy: [
                {
                  remindAt: 'asc',
                },
                {
                  createdAt: 'desc',
                },
              ],
            }
          : false,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    return {
      ...conversation,
      messages: conversation.messages
        ? [...conversation.messages].reverse()
        : undefined,
      tags: conversation.tags.map((item) => item.tag),
      contact: {
        ...conversation.contact,
        tags: this.extractContactTags(conversation.contact),
      },
    };
  }

  private extractContactTags(contact: unknown) {
    if (!contact || typeof contact !== 'object' || !('tagLinks' in contact)) {
      return undefined;
    }

    const tagLinks = (contact as { tagLinks?: Array<{ tag: unknown }> })
      .tagLinks;

    return tagLinks?.map((item) => item.tag);
  }

  private resolveConversationIncludes(include?: string) {
    if (!include?.trim()) {
      return new Set<ConversationIncludeToken>([
        'messages',
        'notes',
        'reminders',
        'contactTags',
      ]);
    }

    const normalizedIncludes = include
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const includes = new Set<ConversationIncludeToken>();

    for (const value of normalizedIncludes) {
      if (value === 'messages') {
        includes.add('messages');
      }

      if (value === 'notes') {
        includes.add('notes');
      }

      if (value === 'reminders') {
        includes.add('reminders');
      }

      if (value === 'contactTags') {
        includes.add('contactTags');
      }

      if (value === 'sidebar' || value === 'details') {
        includes.add('notes');
        includes.add('reminders');
        includes.add('contactTags');
      }

      if (value === 'all') {
        includes.add('messages');
        includes.add('notes');
        includes.add('reminders');
        includes.add('contactTags');
      }
    }

    return includes.size
      ? includes
      : new Set<ConversationIncludeToken>(['messages']);
  }

  private buildConversationWhere(
    user: CurrentAuthUser,
    query: {
      search?: string;
      status?: string;
      ownership?: string;
      assignedUserId?: string;
      tagId?: string;
    },
    options?: {
      includeStatus?: boolean;
    },
  ): Prisma.ConversationWhereInput {
    const searchPhoneVariants = normalizeSearchPhone(query.search);
    const accessWhere =
      this.conversationWorkflowService.buildVisibilityWhere(user);
    const statusWhere =
      options?.includeStatus === false
        ? null
        : this.buildStatusWhere(query.status);

    const searchFilters: Prisma.ConversationWhereInput[] = query.search
      ? [
          {
            contact: {
              name: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            contact: {
              phone: { contains: query.search },
            },
          },
          ...searchPhoneVariants.map((phone) => ({
            contact: {
              phone: { contains: phone },
            },
          })),
          {
            lastMessagePreview: {
              contains: query.search,
              mode: 'insensitive',
            },
          },
        ]
      : [];

    const conditions: Prisma.ConversationWhereInput[] = [accessWhere];

    if (statusWhere) {
      conditions.push(statusWhere);
    }

    if (query.ownership) {
      conditions.push({
        ownership: query.ownership as never,
      });
    }

    if (query.assignedUserId) {
      conditions.push({
        assignedUserId: query.assignedUserId,
      });
    }

    if (query.tagId) {
      conditions.push({
        tags: {
          some: {
            tagId: query.tagId,
          },
        },
      });
    }

    if (searchFilters.length) {
      conditions.push({
        OR: searchFilters,
      });
    }

    if (conditions.length === 1) {
      return conditions[0]!;
    }

    return {
      AND: conditions,
    };
  }

  private buildStatusWhere(status?: string) {
    if (!status) {
      return null;
    }

    if (status === 'NEW') {
      return {
        OR: [
          { status: 'NEW' as never },
          { status: 'OPEN' as never, assignedUserId: null },
        ],
      } satisfies Prisma.ConversationWhereInput;
    }

    if (status === 'IN_PROGRESS') {
      return {
        OR: [
          { status: 'IN_PROGRESS' as never },
          {
            status: 'OPEN' as never,
            assignedUserId: {
              not: null,
            },
          },
        ],
      } satisfies Prisma.ConversationWhereInput;
    }

    if (status === 'WAITING') {
      return {
        status: {
          in: ['WAITING', 'PENDING'] as never,
        },
      } satisfies Prisma.ConversationWhereInput;
    }

    return {
      status: status as never,
    } satisfies Prisma.ConversationWhereInput;
  }

  async update(
    id: string,
    user: CurrentAuthUser,
    payload: {
      assignedUserId?: string | null;
      tagIds?: string[];
    },
  ) {
    await this.conversationWorkflowService.assertConversationAccess(
      id,
      user,
      'editar esta conversa',
    );

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        workspaceId: user.workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        assignedUserId: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    if (payload.assignedUserId) {
      await this.conversationWorkflowService.transferConversation(
        id,
        user.workspaceId,
        user.sub,
        payload.assignedUserId,
      );
    }

    if (payload.tagIds) {
      await this.prisma.conversationTag.deleteMany({
        where: {
          conversationId: id,
        },
      });

      if (payload.tagIds.length) {
        await this.prisma.conversationTag.createMany({
          data: payload.tagIds.map((tagId) => ({
            conversationId: id,
            tagId,
          })),
          skipDuplicates: true,
        });
      }

      await this.conversationWorkflowService.emitConversationRealtimeEvent(
        user.workspaceId,
        id,
        'conversation.updated',
      );
    }

    return this.findOne(id, user);
  }

  async addNote(
    conversationId: string,
    user: CurrentAuthUser,
    content: string,
  ) {
    await this.conversationWorkflowService.assertConversationAccess(
      conversationId,
      user,
      'registrar uma nota nesta conversa',
    );

    await this.prisma.conversationNote.create({
      data: {
        workspaceId: user.workspaceId,
        conversationId,
        authorId: user.sub,
        content,
      },
    });

    await this.conversationWorkflowService.emitConversationRealtimeEvent(
      user.workspaceId,
      conversationId,
      'conversation.note.created',
    );

    return this.findOne(conversationId, user);
  }

  async listMessages(conversationId: string, user: CurrentAuthUser) {
    await this.conversationWorkflowService.assertConversationAccess(
      conversationId,
      user,
      'visualizar as mensagens desta conversa',
    );

    return this.prisma.conversationMessage.findMany({
      where: {
        workspaceId: user.workspaceId,
        conversationId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async sendMessage(
    conversationId: string,
    user: CurrentAuthUser,
    content: string,
  ) {
    if (!content.trim()) {
      throw new BadRequestException('Digite uma mensagem para enviar.');
    }

    const preparedReply =
      await this.conversationWorkflowService.prepareManualReply(
        conversationId,
        user.workspaceId,
        user.sub,
      );
    const formattedContent =
      this.conversationWorkflowService.formatManualMessage(
        preparedReply.actor.name,
        content,
      );

    return this.metaWhatsAppService.sendConversationMessage(
      user.workspaceId,
      conversationId,
      user.sub,
      formattedContent,
    );
  }

  async sendMediaMessage(
    conversationId: string,
    user: CurrentAuthUser,
    payload: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      caption?: string;
      voice?: boolean;
    },
  ) {
    const preparedReply =
      await this.conversationWorkflowService.prepareManualReply(
        conversationId,
        user.workspaceId,
        user.sub,
      );

    const formattedCaption = payload.caption?.trim()
      ? this.conversationWorkflowService.formatManualMessage(
          preparedReply.actor.name,
          payload.caption,
        )
      : undefined;

    return this.metaWhatsAppService.sendConversationMediaMessage(
      user.workspaceId,
      conversationId,
      user.sub,
      {
        ...payload,
        caption: formattedCaption,
      },
    );
  }

  async resolveConversation(id: string, user: CurrentAuthUser) {
    const finalizeResult = await this.conversationWorkflowService.resolveConversation(
      id,
      user.workspaceId,
      user.sub,
    );

    const autoFinalMessage =
      await this.maybeSendFinalizationAutoMessage({
        conversationId: id,
        workspaceId: user.workspaceId,
        actorUserId: user.sub,
        targetStatus: ConversationStatus.RESOLVED,
        currentStatus: finalizeResult.status,
      });

    const conversation = await this.findOne(id, user);

    return {
      ...conversation,
      autoFinalMessage,
    };
  }

  async closeConversation(id: string, user: CurrentAuthUser) {
    const finalizeResult = await this.conversationWorkflowService.closeConversation(
      id,
      user.workspaceId,
      user.sub,
    );

    const autoFinalMessage =
      await this.maybeSendFinalizationAutoMessage({
        conversationId: id,
        workspaceId: user.workspaceId,
        actorUserId: user.sub,
        targetStatus: ConversationStatus.CLOSED,
        currentStatus: finalizeResult.status,
      });

    const conversation = await this.findOne(id, user);

    return {
      ...conversation,
      autoFinalMessage,
    };
  }

  async reopenConversation(id: string, user: CurrentAuthUser) {
    await this.conversationWorkflowService.reopenConversation(
      id,
      user.workspaceId,
      user.sub,
    );

    return this.findOne(id, user);
  }

  async reprocessWaitingTimeouts(_user: CurrentAuthUser) {
    void _user;
    return this.conversationWorkflowService.processWaitingTimeouts();
  }

  async getMessageMedia(messageId: string, user: CurrentAuthUser) {
    const message = await this.prisma.conversationMessage.findFirst({
      where: {
        id: messageId,
        workspaceId: user.workspaceId,
      },
      select: {
        conversationId: true,
      },
    });

    if (!message) {
      throw new NotFoundException('Mensagem nao encontrada.');
    }

    await this.conversationWorkflowService.assertConversationAccess(
      message.conversationId,
      user,
      'baixar a midia desta conversa',
    );

    return this.metaWhatsAppService.getMessageMedia(
      user.workspaceId,
      messageId,
    );
  }

  private async maybeSendFinalizationAutoMessage(payload: {
    conversationId: string;
    workspaceId: string;
    actorUserId: string;
    targetStatus: 'RESOLVED' | 'CLOSED';
    currentStatus: ConversationStatus;
  }): Promise<FinalAutoMessageDeliveryResult> {
    if (payload.currentStatus !== payload.targetStatus) {
      return {
        attempted: false,
        sent: false,
        skippedReason: 'status-mismatch',
      };
    }

    const settings = await this.workspaceSettingsService.getConversationSettings(
      payload.workspaceId,
    );
    const isResolvedTarget = payload.targetStatus === ConversationStatus.RESOLVED;
    const enabled = isResolvedTarget
      ? settings.sendResolvedAutoReply
      : settings.sendClosedAutoReply;
    const message = isResolvedTarget
      ? settings.resolvedAutoReplyMessage?.trim()
      : settings.closedAutoReplyMessage?.trim();

    if (!enabled) {
      return {
        attempted: false,
        sent: false,
        skippedReason: 'feature-disabled',
      };
    }

    if (!message) {
      return {
        attempted: false,
        sent: false,
        skippedReason: 'message-empty',
      };
    }

    const dispatchToken = `${payload.targetStatus}-${randomUUID()}`;
    const lockDecision = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedFinalizationConversationRecord[]>`
        SELECT
          id,
          status,
          "assignedUserId",
          "resolvedAutoMessageSentAt",
          "resolvedAutoMessageDispatchToken",
          "resolvedAutoMessageDispatchStartedAt",
          "closedAutoMessageSentAt",
          "closedAutoMessageDispatchToken",
          "closedAutoMessageDispatchStartedAt"
        FROM "Conversation"
        WHERE id = ${payload.conversationId}
          AND "workspaceId" = ${payload.workspaceId}
          AND "deletedAt" IS NULL
        FOR UPDATE
      `;

      const conversation = rows[0];

      if (!conversation) {
        throw new NotFoundException('Conversa nao encontrada.');
      }

      const currentStatus = normalizeConversationStatus(
        conversation.status,
        conversation.assignedUserId,
      );

      if (currentStatus !== payload.targetStatus) {
        return {
          shouldSend: false,
          skippedReason: 'status-mismatch' as const,
        };
      }

      const alreadySentAt = isResolvedTarget
        ? conversation.resolvedAutoMessageSentAt
        : conversation.closedAutoMessageSentAt;
      const currentDispatchToken = isResolvedTarget
        ? conversation.resolvedAutoMessageDispatchToken
        : conversation.closedAutoMessageDispatchToken;
      const currentDispatchStartedAt = isResolvedTarget
        ? conversation.resolvedAutoMessageDispatchStartedAt
        : conversation.closedAutoMessageDispatchStartedAt;

      if (alreadySentAt) {
        return {
          shouldSend: false,
          skippedReason: 'already-sent' as const,
        };
      }

      const dispatchInProgressCutoff = Date.now() - 2 * 60_000;
      const hasRecentInProgressDispatch =
        Boolean(currentDispatchToken) &&
        currentDispatchStartedAt !== null &&
        currentDispatchStartedAt.getTime() > dispatchInProgressCutoff;

      if (hasRecentInProgressDispatch) {
        return {
          shouldSend: false,
          skippedReason: 'in-progress' as const,
        };
      }

      await tx.conversation.update({
        where: {
          id: payload.conversationId,
        },
        data: isResolvedTarget
          ? {
              resolvedAutoMessageDispatchToken: dispatchToken,
              resolvedAutoMessageDispatchStartedAt: new Date(),
              resolvedAutoMessageLastError: null,
            }
          : {
              closedAutoMessageDispatchToken: dispatchToken,
              closedAutoMessageDispatchStartedAt: new Date(),
              closedAutoMessageLastError: null,
            },
      });

      return {
        shouldSend: true,
      };
    });

    if (!lockDecision.shouldSend) {
      return {
        attempted: false,
        sent: false,
        skippedReason: lockDecision.skippedReason,
      };
    }

    const autoMessageType = isResolvedTarget
      ? AutoMessageType.FINAL_RESOLVED
      : AutoMessageType.FINAL_CLOSED;

    try {
      const sentMessage = await this.metaWhatsAppService.sendConversationMessage(
        payload.workspaceId,
        payload.conversationId,
        payload.actorUserId,
        message,
        {
          direction: MessageDirection.SYSTEM,
          isAutomated: true,
          autoMessageType,
        },
      );

      await this.prisma.$transaction(async (tx) => {
        await tx.conversation.updateMany({
          where: {
            id: payload.conversationId,
            ...(isResolvedTarget
              ? { resolvedAutoMessageDispatchToken: dispatchToken }
              : { closedAutoMessageDispatchToken: dispatchToken }),
          },
          data: isResolvedTarget
            ? {
                resolvedAutoMessageSentAt: new Date(),
                resolvedAutoMessageLastError: null,
                resolvedAutoMessageDispatchToken: null,
                resolvedAutoMessageDispatchStartedAt: null,
              }
            : {
                closedAutoMessageSentAt: new Date(),
                closedAutoMessageLastError: null,
                closedAutoMessageDispatchToken: null,
                closedAutoMessageDispatchStartedAt: null,
              },
        });

        await tx.conversationEvent.create({
          data: {
            workspaceId: payload.workspaceId,
            conversationId: payload.conversationId,
            actorUserId: payload.actorUserId,
            type: 'AUTO_MESSAGE_SENT' as never,
            toStatus: payload.targetStatus,
            metadata: {
              result: 'SENT',
              autoMessageType,
              conversationStatus: payload.targetStatus,
              messageId: sentMessage.id,
            } as Prisma.InputJsonValue,
          },
        });
      });

      return {
        attempted: true,
        sent: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Falha desconhecida ao enviar mensagem automatica final.';

      await this.prisma.$transaction(async (tx) => {
        await tx.conversation.updateMany({
          where: {
            id: payload.conversationId,
            ...(isResolvedTarget
              ? { resolvedAutoMessageDispatchToken: dispatchToken }
              : { closedAutoMessageDispatchToken: dispatchToken }),
          },
          data: isResolvedTarget
            ? {
                resolvedAutoMessageLastError: errorMessage.slice(0, 500),
                resolvedAutoMessageDispatchToken: null,
                resolvedAutoMessageDispatchStartedAt: null,
              }
            : {
                closedAutoMessageLastError: errorMessage.slice(0, 500),
                closedAutoMessageDispatchToken: null,
                closedAutoMessageDispatchStartedAt: null,
              },
        });

        await tx.conversationEvent.create({
          data: {
            workspaceId: payload.workspaceId,
            conversationId: payload.conversationId,
            actorUserId: payload.actorUserId,
            type: 'AUTO_MESSAGE_SENT' as never,
            toStatus: payload.targetStatus,
            metadata: {
              result: 'FAILED',
              autoMessageType,
              conversationStatus: payload.targetStatus,
              error: errorMessage,
            } as Prisma.InputJsonValue,
          },
        });
      });

      this.logger.error(
        `Falha ao enviar mensagem automatica final para a conversa ${payload.conversationId}: ${errorMessage}`,
      );

      return {
        attempted: true,
        sent: false,
        error: errorMessage,
      };
    }
  }
}
