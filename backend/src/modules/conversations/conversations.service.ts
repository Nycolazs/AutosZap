import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
import { ConversationWorkflowService } from './conversation-workflow.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaWhatsAppService: MetaWhatsAppService,
    private readonly inboxEventsService: InboxEventsService,
    private readonly conversationWorkflowService: ConversationWorkflowService,
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
    const searchPhoneVariants = normalizeSearchPhone(query.search);
    const accessWhere =
      this.conversationWorkflowService.buildVisibilityWhere(user);

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

    const where: Prisma.ConversationWhereInput = {
      ...accessWhere,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.ownership ? { ownership: query.ownership as never } : {}),
      ...(query.assignedUserId ? { assignedUserId: query.assignedUserId } : {}),
      ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
      ...(searchFilters.length ? { OR: searchFilters } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
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
      this.prisma.conversation.count({ where }),
    ]);

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

  async findOne(id: string, user: CurrentAuthUser) {
    await this.conversationWorkflowService.assertConversationAccess(
      id,
      user,
      'visualizar esta conversa',
    );

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        workspaceId: user.workspaceId,
        deletedAt: null,
      },
      include: {
        contact: {
          include: {
            tagLinks: {
              include: {
                tag: true,
              },
            },
          },
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
            createdAt: 'asc',
          },
        },
        notes: {
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
        },
        reminders: {
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
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    return {
      ...conversation,
      tags: conversation.tags.map((item) => item.tag),
      contact: {
        ...conversation.contact,
        tags: conversation.contact.tagLinks.map((item) => item.tag),
      },
    };
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
    await this.conversationWorkflowService.resolveConversation(
      id,
      user.workspaceId,
      user.sub,
    );

    return this.findOne(id, user);
  }

  async closeConversation(id: string, user: CurrentAuthUser) {
    await this.conversationWorkflowService.closeConversation(
      id,
      user.workspaceId,
      user.sub,
    );

    return this.findOne(id, user);
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
}
