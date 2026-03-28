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
  MessageStatus,
  Prisma,
} from '@prisma/client';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InboxEventsService } from '../../common/realtime/inbox-events.service';
import {
  getPagination,
  paginatedResponse,
} from '../../common/utils/pagination';
import {
  normalizeContactPhone,
  normalizeSearchPhone,
} from '../../common/utils/phone';
import { WhatsAppMessagingService } from '../integrations/whatsapp/whatsapp-messaging.service';
import { WorkspaceSettingsService } from '../workspace-settings/workspace-settings.service';
import {
  ConversationAssignmentTransition,
  ConversationWorkflowService,
} from './conversation-workflow.service';
import { resolveConversationPlaceholders } from './conversation-placeholders.util';
import { normalizeConversationStatus } from './conversation-workflow.utils';
import { InstanceProvider } from '@prisma/client';

const INBOX_MESSAGES_PRELOAD_LIMIT = 120;
const MESSAGE_PAGE_DEFAULT_LIMIT = 40;
const MESSAGE_PAGE_MAX_LIMIT = 80;
const INBOX_INSTANCE_SELECT = {
  id: true,
  name: true,
  status: true,
  provider: true,
  mode: true,
  phoneNumber: true,
  profilePictureUrl: true,
  profilePictureUpdatedAt: true,
} satisfies Prisma.InstanceSelect;
const MESSAGE_SENDER_USER_SELECT = {
  id: true,
  globalUserId: true,
  name: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;
const INBOX_MESSAGE_INCLUDE = {
  senderUser: {
    select: MESSAGE_SENDER_USER_SELECT,
  },
} satisfies Prisma.ConversationMessageInclude;

type InboxInstanceActivitySummary = {
  visibleConversationsCount: number;
  unreadMessagesCount: number;
  newConversationsCount: number;
};

type ConversationIncludeToken =
  | 'messages'
  | 'notes'
  | 'reminders'
  | 'contactTags'
  | 'events';

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

type AssignmentAutoMessageDeliveryResult = {
  attempted: boolean;
  sent: boolean;
  skippedReason?:
    | 'feature-disabled'
    | 'message-empty'
    | 'no-assignment-change'
    | 'not-transfer-or-resume'
    | 'conversation-not-found'
    | 'target-missing';
  error?: string;
  messageId?: string;
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

type InboxMessageRecord = Prisma.ConversationMessageGetPayload<{
  include: typeof INBOX_MESSAGE_INCLUDE;
}>;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly controlPlanePrisma: ControlPlanePrismaService,
    private readonly whatsappMessagingService: WhatsAppMessagingService,
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
      instanceId?: string;
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
          instance: {
            select: INBOX_INSTANCE_SELECT,
          },
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
          messages: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 25,
            select: {
              metadata: true,
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
      data.map((conversation) => {
        const { messages, ...conversationData } = conversation;

        return {
          ...conversationData,
          tags: conversation.tags.map((item) => item.tag),
          contactAvatarUrl: this.resolveQrConversationContactAvatarUrl(
            conversation.instance?.provider,
            messages,
          ),
          contactDisplayPhone: this.resolveQrConversationContactPhone(
            conversation.instance?.provider,
            conversation.contact.phone,
            messages,
          ),
        };
      }),
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
      instanceId?: string;
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

  async listInboxInstances(user: CurrentAuthUser) {
    const where = this.buildConversationWhere(
      user,
      {},
      {
        includeStatus: false,
      },
    );

    const [instances, groupedConversations] = await this.prisma.$transaction([
      this.prisma.instance.findMany({
        where: {
          workspaceId: user.workspaceId,
          deletedAt: null,
        },
        select: INBOX_INSTANCE_SELECT,
        orderBy: [
          {
            updatedAt: 'desc',
          },
          {
            name: 'asc',
          },
        ],
      }),
      this.prisma.conversation.groupBy({
        by: ['instanceId', 'status', 'assignedUserId'],
        where,
        orderBy: [
          {
            instanceId: 'asc',
          },
          {
            status: 'asc',
          },
          {
            assignedUserId: 'asc',
          },
        ],
        _count: {
          _all: true,
        },
        _sum: {
          unreadCount: true,
        },
      }),
    ]);

    const activityByInstance = new Map<string, InboxInstanceActivitySummary>();

    for (const group of groupedConversations) {
      if (!group.instanceId) {
        continue;
      }

      const currentSummary = activityByInstance.get(group.instanceId) ?? {
        visibleConversationsCount: 0,
        unreadMessagesCount: 0,
        newConversationsCount: 0,
      };
      const normalizedStatus = normalizeConversationStatus(
        group.status,
        group.assignedUserId,
      );
      const visibleConversationsCount =
        typeof group._count === 'object' && group._count
          ? (group._count._all ?? 0)
          : 0;
      const unreadMessagesCount =
        group._sum && typeof group._sum === 'object'
          ? (group._sum.unreadCount ?? 0)
          : 0;

      currentSummary.visibleConversationsCount += visibleConversationsCount;
      currentSummary.unreadMessagesCount += unreadMessagesCount;

      if (normalizedStatus === 'NEW') {
        currentSummary.newConversationsCount += visibleConversationsCount;
      }

      activityByInstance.set(group.instanceId, currentSummary);
    }

    return instances.map((instance) => {
      const summary = activityByInstance.get(instance.id);
      const unreadMessagesCount = summary?.unreadMessagesCount ?? 0;
      const newConversationsCount = summary?.newConversationsCount ?? 0;

      return {
        ...instance,
        visibleConversationsCount: summary?.visibleConversationsCount ?? 0,
        unreadMessagesCount,
        newConversationsCount,
        hasNewMessages: unreadMessagesCount > 0 || newConversationsCount > 0,
      };
    });
  }

  async findOne(id: string, user: CurrentAuthUser, include?: string) {
    await this.conversationWorkflowService.assertConversationAccess(
      id,
      user,
      'visualizar esta conversa',
    );

    const includes = this.resolveConversationIncludes(include);
    const shouldIncludeFullMessages = includes.has('messages');

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
        ...this.buildActiveInboxInstanceWhere(),
        ...this.buildPrivateConversationOnlyWhere(),
      },
      include: {
        contact: contactInclude,
        instance: {
          select: INBOX_INSTANCE_SELECT,
        },
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
        messages: shouldIncludeFullMessages
          ? {
              orderBy: {
                createdAt: 'desc',
              },
              take: INBOX_MESSAGES_PRELOAD_LIMIT,
              include: INBOX_MESSAGE_INCLUDE,
            }
          : {
              orderBy: {
                createdAt: 'desc',
              },
              take: 25,
              select: {
                metadata: true,
              },
            },
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
        events: includes.has('events')
          ? {
              select: {
                id: true,
                type: true,
                fromStatus: true,
                toStatus: true,
                metadata: true,
                createdAt: true,
              },
              orderBy: {
                createdAt: 'asc',
              },
            }
          : false,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    const fullConversationMessages = shouldIncludeFullMessages
      ? (conversation.messages as InboxMessageRecord[])
      : undefined;
    const visibleConversationMessages = fullConversationMessages
      ? await this.decorateConversationMessages(
          this.sortConversationMessages(
            this.filterConversationMessagesForUser(fullConversationMessages),
          ),
        )
      : undefined;

    return {
      ...conversation,
      messages: visibleConversationMessages,
      tags: conversation.tags.map((item) => item.tag),
      contact: {
        ...conversation.contact,
        tags: this.extractContactTags(conversation.contact),
      },
      contactAvatarUrl: this.resolveQrConversationContactAvatarUrl(
        conversation.instance?.provider,
        conversation.messages,
      ),
      contactDisplayPhone: this.resolveQrConversationContactPhone(
        conversation.instance?.provider,
        conversation.contact.phone,
        conversation.messages,
      ),
    };
  }

  async markAsRead(id: string, user: CurrentAuthUser) {
    await this.conversationWorkflowService.assertConversationAccess(
      id,
      user,
      'marcar esta conversa como lida',
    );

    const result = await this.prisma.conversation.updateMany({
      where: {
        id,
        workspaceId: user.workspaceId,
        deletedAt: null,
        unreadCount: {
          gt: 0,
        },
      },
      data: {
        unreadCount: 0,
      },
    });

    if (result.count > 0) {
      await this.conversationWorkflowService.emitConversationRealtimeEvent(
        user.workspaceId,
        id,
        'conversation.updated',
      );
    }

    return {
      success: true,
      changed: result.count > 0,
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

  private toRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private pickString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private resolveQrConversationContactAvatarUrl(
    instanceProvider?: string | null,
    messages?: Array<{ metadata?: Prisma.JsonValue | null }>,
  ) {
    if (
      instanceProvider !== InstanceProvider.WHATSAPP_WEB ||
      !messages?.length
    ) {
      return null;
    }

    for (const message of messages) {
      const contactMetadata = this.toRecord(
        this.toRecord(message.metadata)?.contact,
      );
      const avatarUrl = this.pickString(
        contactMetadata?.profilePictureUrl,
        contactMetadata?.profile_picture_url,
      );

      if (avatarUrl) {
        return avatarUrl;
      }
    }

    return null;
  }

  private resolveQrConversationContactPhone(
    instanceProvider?: string | null,
    fallbackPhone?: string | null,
    messages?: Array<{ metadata?: Prisma.JsonValue | null }>,
  ) {
    if (
      instanceProvider !== InstanceProvider.WHATSAPP_WEB ||
      !messages?.length
    ) {
      return fallbackPhone ?? null;
    }

    let sawLegacyLidPeer = false;

    for (const message of messages) {
      const metadata = this.toRecord(message.metadata);
      const contactMetadata = this.toRecord(metadata?.contact);
      const metadataPhone = this.pickString(
        contactMetadata?.phone,
        contactMetadata?.contactPhone,
        metadata?.contactPhone,
      );

      if (metadataPhone) {
        const normalizedMetadataPhone =
          this.normalizeQrBrazilianDisplayPhone(metadataPhone);

        if (normalizedMetadataPhone) {
          return normalizedMetadataPhone;
        }
      }

      const providerMessageContext = this.toRecord(
        metadata?.providerMessageContext,
      );
      const peerJid = this.pickString(
        providerMessageContext?.remoteJid,
        providerMessageContext?.fromMe === true
          ? providerMessageContext?.toRaw
          : providerMessageContext?.fromRaw,
      );

      if (peerJid?.trim().endsWith('@lid')) {
        sawLegacyLidPeer = true;
      }

      const jidPhone = this.normalizeQrContactPhoneFromJid(peerJid);

      if (jidPhone) {
        return jidPhone;
      }
    }

    if (sawLegacyLidPeer) {
      return null;
    }

    return this.normalizeQrBrazilianDisplayPhone(fallbackPhone);
  }

  private normalizeQrContactPhoneFromJid(value?: string | null) {
    const normalizedValue = value?.trim();

    if (!normalizedValue || !normalizedValue.endsWith('@c.us')) {
      return null;
    }

    const [userPart] = normalizedValue.split('@', 1);

    if (!userPart) {
      return null;
    }

    return this.normalizeQrBrazilianDisplayPhone(userPart);
  }

  private normalizeQrBrazilianDisplayPhone(value?: string | null) {
    const normalizedPhone = normalizeContactPhone(value);

    return /^\+55\d{10,11}$/.test(normalizedPhone) ? normalizedPhone : null;
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

      if (value === 'events') {
        includes.add('events');
      }

      if (value === 'sidebar' || value === 'details') {
        includes.add('notes');
        includes.add('reminders');
        includes.add('contactTags');
        includes.add('events');
      }

      if (value === 'all') {
        includes.add('messages');
        includes.add('notes');
        includes.add('reminders');
        includes.add('contactTags');
        includes.add('events');
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
      instanceId?: string;
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
            instance: {
              is: {
                name: { contains: query.search, mode: 'insensitive' },
              },
            },
          },
          {
            contact: {
              phone: { contains: query.search },
            },
          },
          {
            instance: {
              is: {
                phoneNumber: { contains: query.search },
              },
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

    conditions.push(this.buildPrivateConversationOnlyWhere());
    conditions.push(this.buildActiveInboxInstanceWhere());

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

    if (query.instanceId) {
      conditions.push({
        instanceId: query.instanceId,
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

  private buildActiveInboxInstanceWhere(): Prisma.ConversationWhereInput {
    return {
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
    };
  }

  private buildPrivateConversationOnlyWhere(): Prisma.ConversationWhereInput {
    return {
      messages: {
        none: {
          OR: [
            {
              metadata: {
                path: ['providerMessageContext', 'isPrivateChat'],
                equals: false,
              },
            },
            {
              metadata: {
                path: ['providerMessageContext', 'isGroupMsg'],
                equals: true,
              },
            },
            {
              metadata: {
                path: ['providerMessageContext', 'remoteJid'],
                string_ends_with: '@g.us',
              },
            },
            {
              metadata: {
                path: ['providerMessageContext', 'fromRaw'],
                string_ends_with: '@g.us',
              },
            },
            {
              metadata: {
                path: ['providerMessageContext', 'toRaw'],
                string_ends_with: '@g.us',
              },
            },
            {
              metadata: {
                path: ['providerMessageContext', 'remoteJid'],
                string_ends_with: '@newsletter',
              },
            },
            {
              metadata: {
                path: ['providerMessageContext', 'fromRaw'],
                string_ends_with: '@newsletter',
              },
            },
            {
              metadata: {
                path: ['providerMessageContext', 'toRaw'],
                string_ends_with: '@newsletter',
              },
            },
            {
              metadata: {
                path: ['providerMessageContext', 'remoteJid'],
                string_ends_with: '@broadcast',
              },
            },
            {
              metadata: {
                path: ['providerMessageContext', 'fromRaw'],
                string_ends_with: '@broadcast',
              },
            },
            {
              metadata: {
                path: ['providerMessageContext', 'toRaw'],
                string_ends_with: '@broadcast',
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
            {
              externalMessageId: {
                contains: 'status@broadcast',
              },
            },
            {
              externalMessageId: {
                contains: '@broadcast',
              },
            },
          ],
        },
      },
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
      const transferTransition =
        await this.conversationWorkflowService.transferConversation(
          id,
          user.workspaceId,
          user.sub,
          payload.assignedUserId,
        );

      await this.maybeSendAssignmentAutoMessage({
        conversationId: id,
        workspaceId: user.workspaceId,
        actorUserId: user.sub,
        transition: transferTransition,
        trigger: 'transfer',
      });
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

  async sendInternalMessage(
    conversationId: string,
    user: CurrentAuthUser,
    content: string,
  ) {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      throw new BadRequestException(
        'Digite uma mensagem interna para registrar.',
      );
    }

    await this.conversationWorkflowService.assertConversationAccess(
      conversationId,
      user,
      'registrar uma mensagem interna nesta conversa',
    );

    const now = new Date();

    const message = await this.prisma.conversationMessage.create({
      data: {
        workspaceId: user.workspaceId,
        conversationId,
        senderUserId: user.sub,
        direction: MessageDirection.SYSTEM,
        messageType: 'internal_note',
        content: trimmedContent,
        status: MessageStatus.SENT,
        sentAt: now,
        metadata: {
          internalMessage: {
            scope: 'WORKSPACE',
            authorUserId: user.sub,
            authorName: user.name,
            label: 'Mensagem interna',
          },
        },
      },
    });

    await this.conversationWorkflowService.emitConversationRealtimeEvent(
      user.workspaceId,
      conversationId,
      'conversation.updated',
    );

    return this.loadDecoratedConversationMessage(message.id);
  }

  async listMessages(
    conversationId: string,
    user: CurrentAuthUser,
    query?: {
      cursor?: string;
      limit?: number;
    },
  ) {
    await this.conversationWorkflowService.assertConversationAccess(
      conversationId,
      user,
      'visualizar as mensagens desta conversa',
    );

    const limit = Math.min(
      Math.max(query?.limit ?? MESSAGE_PAGE_DEFAULT_LIMIT, 1),
      MESSAGE_PAGE_MAX_LIMIT,
    );
    const pageSize = limit + 1;
    const batchSize = Math.max(pageSize, Math.min(limit * 3, 200));
    let cursor = this.parseMessageCursor(query?.cursor);
    const visibleMessages: InboxMessageRecord[] = [];

    while (visibleMessages.length < pageSize) {
      const batch = await this.prisma.conversationMessage.findMany({
        where: {
          workspaceId: user.workspaceId,
          conversationId,
          ...(cursor
            ? {
                OR: [
                  {
                    createdAt: {
                      lt: cursor.createdAt,
                    },
                  },
                  {
                    AND: [
                      {
                        createdAt: cursor.createdAt,
                      },
                      {
                        id: {
                          lt: cursor.id,
                        },
                      },
                    ],
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: batchSize,
        include: INBOX_MESSAGE_INCLUDE,
      });

      if (!batch.length) {
        break;
      }

      visibleMessages.push(...this.filterConversationMessagesForUser(batch));

      if (batch.length < batchSize) {
        break;
      }

      const oldestBatchMessage = batch[batch.length - 1];

      if (!oldestBatchMessage) {
        break;
      }

      cursor = {
        id: oldestBatchMessage.id,
        createdAt: oldestBatchMessage.createdAt,
      };
    }

    const hasMore = visibleMessages.length > limit;
    const items = hasMore
      ? visibleMessages.slice(0, limit)
      : visibleMessages.slice(0, limit);
    const oldestMessage = items[items.length - 1];

    return {
      items: await this.decorateConversationMessages(
        this.sortConversationMessages(items),
      ),
      hasMore,
      nextCursor:
        hasMore && oldestMessage
          ? this.buildMessageCursor(oldestMessage)
          : null,
    };
  }

  private sortConversationMessages<
    T extends {
      sentAt?: Date | null;
      createdAt: Date;
    },
  >(messages: T[]) {
    return [...messages].sort(
      (left, right) =>
        this.getConversationMessageTimestamp(left).getTime() -
        this.getConversationMessageTimestamp(right).getTime(),
    );
  }

  private getConversationMessageTimestamp(message: {
    sentAt?: Date | null;
    createdAt: Date;
  }) {
    return message.sentAt ?? message.createdAt;
  }

  private buildMessageCursor(message: { id: string; createdAt: Date }) {
    return `${message.createdAt.toISOString()}::${message.id}`;
  }

  private parseMessageCursor(cursor?: string | null) {
    if (!cursor?.trim()) {
      return null;
    }

    const [createdAtValue, id] = cursor.split('::');
    const createdAt = createdAtValue ? new Date(createdAtValue) : null;

    if (!id || !createdAt || Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return {
      id,
      createdAt,
    };
  }

  private filterConversationMessagesForUser<
    T extends {
      metadata?: Prisma.JsonValue | null;
    },
  >(messages: T[]) {
    return messages.filter((message) =>
      this.isConversationMessageVisibleToUser(message),
    );
  }

  private isConversationMessageVisibleToUser(message: {
    metadata?: Prisma.JsonValue | null;
  }) {
    const metadata =
      message.metadata &&
      typeof message.metadata === 'object' &&
      !Array.isArray(message.metadata)
        ? (message.metadata as Record<string, unknown>)
        : null;
    const internalMessage =
      metadata?.internalMessage &&
      typeof metadata.internalMessage === 'object' &&
      !Array.isArray(metadata.internalMessage)
        ? (metadata.internalMessage as Record<string, unknown>)
        : null;

    if (!internalMessage) {
      return true;
    }

    return true;
  }

  private async decorateConversationMessages(messages: InboxMessageRecord[]) {
    if (!messages.length) {
      return [];
    }

    const globalUserIds = Array.from(
      new Set(
        messages
          .map((message) => message.senderUser?.globalUserId)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const globalUsers =
      globalUserIds.length > 0
        ? await this.controlPlanePrisma.globalUser.findMany({
            where: {
              id: {
                in: globalUserIds,
              },
            },
            select: {
              id: true,
              avatarStoragePath: true,
              avatarUrl: true,
              updatedAt: true,
            },
          })
        : [];
    const globalUserMap = new Map(
      globalUsers.map((globalUser) => [globalUser.id, globalUser]),
    );

    return messages.map((message) => {
      if (!message.senderUser) {
        return {
          ...message,
          senderUser: null,
        };
      }

      const globalUser = message.senderUser.globalUserId
        ? (globalUserMap.get(message.senderUser.globalUserId) ?? null)
        : null;

      return {
        ...message,
        senderUser: {
          id: message.senderUser.id,
          name: message.senderUser.name,
          avatarUrl: this.resolveInboxSenderAvatarUrl(
            message.senderUser.id,
            globalUser,
            message.senderUser.avatarUrl,
          ),
        },
      };
    });
  }

  private async loadDecoratedConversationMessage(messageId: string) {
    const message = await this.prisma.conversationMessage.findUnique({
      where: {
        id: messageId,
      },
      include: INBOX_MESSAGE_INCLUDE,
    });

    if (!message) {
      throw new NotFoundException('Mensagem nao encontrada.');
    }

    const [decoratedMessage] = await this.decorateConversationMessages([message]);

    return decoratedMessage ?? message;
  }

  private resolveInboxSenderAvatarUrl(
    userId: string,
    globalUser?: {
      avatarStoragePath: string | null;
      avatarUrl: string | null;
      updatedAt: Date;
    } | null,
    fallback?: string | null,
  ) {
    if (globalUser?.avatarStoragePath) {
      return this.buildWorkspaceUserAvatarUrl(userId, globalUser.updatedAt);
    }

    return globalUser?.avatarUrl ?? fallback ?? null;
  }

  private buildWorkspaceUserAvatarUrl(
    userId: string,
    cacheKey?: string | number | Date | null,
  ) {
    const normalizedCacheKey =
      cacheKey instanceof Date ? cacheKey.getTime() : cacheKey;

    if (!normalizedCacheKey) {
      return `/api/proxy/users/${userId}/avatar`;
    }

    return `/api/proxy/users/${userId}/avatar?v=${encodeURIComponent(
      String(normalizedCacheKey),
    )}`;
  }

  async sendMessage(
    conversationId: string,
    user: CurrentAuthUser,
    content: string,
    quotedMessageId?: string,
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

    const message = await this.whatsappMessagingService.sendConversationMessage(
      user.workspaceId,
      conversationId,
      user.sub,
      formattedContent,
      {
        quotedMessageId,
      },
    );

    if (preparedReply.assignmentTransition?.changed) {
      await this.maybeSendAssignmentAutoMessage({
        conversationId,
        workspaceId: user.workspaceId,
        actorUserId: user.sub,
        transition: preparedReply.assignmentTransition,
        trigger: 'manual_reply',
      });
    }

    return this.loadDecoratedConversationMessage(message.id);
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
      quotedMessageId?: string;
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

    const message =
      await this.whatsappMessagingService.sendConversationMediaMessage(
        user.workspaceId,
        conversationId,
        user.sub,
        {
          ...payload,
          caption: formattedCaption,
        },
      );

    if (preparedReply.assignmentTransition?.changed) {
      await this.maybeSendAssignmentAutoMessage({
        conversationId,
        workspaceId: user.workspaceId,
        actorUserId: user.sub,
        transition: preparedReply.assignmentTransition,
        trigger: 'manual_reply',
      });
    }

    return message;
  }

  async resolveConversation(id: string, user: CurrentAuthUser) {
    const finalizeResult =
      await this.conversationWorkflowService.resolveConversation(
        id,
        user.workspaceId,
        user.sub,
      );

    const autoFinalMessage = await this.maybeSendFinalizationAutoMessage({
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
    const finalizeResult =
      await this.conversationWorkflowService.closeConversation(
        id,
        user.workspaceId,
        user.sub,
      );

    const autoFinalMessage = await this.maybeSendFinalizationAutoMessage({
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

  private async maybeSendAssignmentAutoMessage(payload: {
    conversationId: string;
    workspaceId: string;
    actorUserId: string;
    transition: ConversationAssignmentTransition;
    trigger: 'transfer' | 'manual_reply';
  }): Promise<AssignmentAutoMessageDeliveryResult> {
    if (!payload.transition.changed || !payload.transition.toAssignedUserId) {
      return {
        attempted: false,
        sent: false,
        skippedReason: 'no-assignment-change',
      };
    }

    const isManualResume =
      payload.trigger === 'manual_reply' &&
      payload.transition.fromStatus === ConversationStatus.WAITING;
    const hasPreviousAssignee =
      Boolean(payload.transition.fromAssignedUserId) &&
      payload.transition.fromAssignedUserId !==
        payload.transition.toAssignedUserId;

    if (
      payload.trigger === 'manual_reply' &&
      !isManualResume &&
      !hasPreviousAssignee
    ) {
      return {
        attempted: false,
        sent: false,
        skippedReason: 'not-transfer-or-resume',
      };
    }

    const settings =
      await this.workspaceSettingsService.getConversationSettings(
        payload.workspaceId,
      );

    if (!settings.sendAssignmentAutoReply) {
      return {
        attempted: false,
        sent: false,
        skippedReason: 'feature-disabled',
      };
    }

    const template = settings.assignmentAutoReplyMessage?.trim();

    if (!template) {
      return {
        attempted: false,
        sent: false,
        skippedReason: 'message-empty',
      };
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: payload.conversationId,
        workspaceId: payload.workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        contact: {
          select: {
            name: true,
          },
        },
        workspace: {
          select: {
            name: true,
            companyName: true,
          },
        },
      },
    });

    if (!conversation) {
      return {
        attempted: false,
        sent: false,
        skippedReason: 'conversation-not-found',
      };
    }

    const userIds = Array.from(
      new Set(
        [
          payload.actorUserId,
          payload.transition.fromAssignedUserId,
          payload.transition.toAssignedUserId,
        ].filter((value): value is string => Boolean(value)),
      ),
    );

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: {
              in: userIds,
            },
            workspaceId: payload.workspaceId,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];

    const userNameById = new Map(
      users.map((currentUser) => [currentUser.id, currentUser.name.trim()]),
    );
    const previousSellerName = payload.transition.fromAssignedUserId
      ? (userNameById.get(payload.transition.fromAssignedUserId) ?? '')
      : '';
    const nextSellerName = payload.transition.toAssignedUserId
      ? (userNameById.get(payload.transition.toAssignedUserId) ?? '')
      : '';
    const actorName = userNameById.get(payload.actorUserId) ?? '';
    const companyName =
      conversation.workspace.companyName?.trim() ||
      conversation.workspace.name?.trim() ||
      'empresa';

    const resolvedMessage = resolveConversationPlaceholders(template, {
      nome: conversation.contact.name?.trim() || 'cliente',
      vendedor: previousSellerName || actorName || nextSellerName || 'Equipe',
      novo_vendedor: nextSellerName || actorName || 'Equipe',
      empresa: companyName,
    }).trim();

    if (!resolvedMessage) {
      return {
        attempted: false,
        sent: false,
        skippedReason: 'message-empty',
      };
    }

    try {
      const sentMessage =
        await this.whatsappMessagingService.sendConversationMessage(
          payload.workspaceId,
          payload.conversationId,
          payload.actorUserId,
          resolvedMessage,
          {
            direction: MessageDirection.SYSTEM,
            isAutomated: true,
          },
        );

      await this.prisma.conversationEvent.create({
        data: {
          workspaceId: payload.workspaceId,
          conversationId: payload.conversationId,
          actorUserId: payload.actorUserId,
          type: 'AUTO_MESSAGE_SENT' as never,
          toStatus: payload.transition.toStatus,
          metadata: {
            trigger: payload.trigger,
            fromAssignedUserId: payload.transition.fromAssignedUserId,
            toAssignedUserId: payload.transition.toAssignedUserId,
            messageId: sentMessage.id,
            kind: 'ASSIGNMENT_TRANSFER_NOTICE',
          } as Prisma.InputJsonValue,
        },
      });

      return {
        attempted: true,
        sent: true,
        messageId: sentMessage.id,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Falha desconhecida ao enviar mensagem automatica de transferencia.';
      this.logger.error(
        `Falha ao enviar mensagem automatica de transferencia para conversa ${payload.conversationId}: ${errorMessage}`,
      );

      return {
        attempted: true,
        sent: false,
        error: errorMessage,
      };
    }
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

    const settings =
      await this.workspaceSettingsService.getConversationSettings(
        payload.workspaceId,
      );
    const isResolvedTarget =
      payload.targetStatus === ConversationStatus.RESOLVED;
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
      const sentMessage =
        await this.whatsappMessagingService.sendConversationMessage(
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

    return this.whatsappMessagingService.getMessageMedia(
      user.workspaceId,
      messageId,
    );
  }
}
