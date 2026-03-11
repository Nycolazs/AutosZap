import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InboxEventsService } from '../../common/realtime/inbox-events.service';
import {
  getPagination,
  paginatedResponse,
} from '../../common/utils/pagination';
import { MetaWhatsAppService } from '../integrations/meta-whatsapp/meta-whatsapp.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaWhatsAppService: MetaWhatsAppService,
    private readonly inboxEventsService: InboxEventsService,
  ) {}

  stream(workspaceId: string) {
    return this.inboxEventsService.stream(workspaceId);
  }

  async list(
    workspaceId: string,
    query: PaginationQueryDto & {
      status?: string;
      ownership?: string;
      assignedUserId?: string;
      tagId?: string;
    },
  ) {
    const { page, limit, skip, take } = getPagination(query.page, query.limit);

    const where: Prisma.ConversationWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.ownership ? { ownership: query.ownership as never } : {}),
      ...(query.assignedUserId ? { assignedUserId: query.assignedUserId } : {}),
      ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
      ...(query.search
        ? {
            OR: [
              {
                contact: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                contact: {
                  phone: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                lastMessagePreview: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
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

  async findOne(id: string, workspaceId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        workspaceId,
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
    workspaceId: string,
    actorId: string,
    payload: {
      status?: string;
      assignedUserId?: string | null;
      tagIds?: string[];
    },
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    await this.prisma.conversation.update({
      where: { id },
      data: {
        status: (payload.status as never) ?? conversation.status,
        assignedUserId: payload.assignedUserId ?? conversation.assignedUserId,
      },
    });

    if (
      payload.assignedUserId &&
      payload.assignedUserId !== conversation.assignedUserId
    ) {
      await this.prisma.conversationAssignment.create({
        data: {
          workspaceId,
          conversationId: id,
          assignedToId: payload.assignedUserId,
          assignedById: actorId,
        },
      });
    }

    if (payload.tagIds) {
      await this.prisma.conversationTag.deleteMany({
        where: { conversationId: id },
      });

      if (payload.tagIds.length) {
        await this.prisma.conversationTag.createMany({
          data: payload.tagIds.map((tagId) => ({ conversationId: id, tagId })),
          skipDuplicates: true,
        });
      }
    }

    this.inboxEventsService.emit({
      workspaceId,
      conversationId: id,
      type: 'conversation.updated',
    });

    return this.findOne(id, workspaceId);
  }

  async addNote(
    conversationId: string,
    workspaceId: string,
    authorId: string,
    content: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId, deletedAt: null },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    await this.prisma.conversationNote.create({
      data: {
        workspaceId,
        conversationId,
        authorId,
        content,
      },
    });

    this.inboxEventsService.emit({
      workspaceId,
      conversationId,
      type: 'conversation.note.created',
    });

    return this.findOne(conversationId, workspaceId);
  }

  async listMessages(conversationId: string, workspaceId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId, deletedAt: null },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    return this.prisma.conversationMessage.findMany({
      where: {
        workspaceId,
        conversationId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async sendMessage(
    conversationId: string,
    workspaceId: string,
    senderUserId: string,
    content: string,
  ) {
    return this.metaWhatsAppService.sendConversationMessage(
      workspaceId,
      conversationId,
      senderUserId,
      content,
    );
  }

  async sendMediaMessage(
    conversationId: string,
    workspaceId: string,
    senderUserId: string,
    payload: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      caption?: string;
    },
  ) {
    return this.metaWhatsAppService.sendConversationMediaMessage(
      workspaceId,
      conversationId,
      senderUserId,
      payload,
    );
  }

  async getMessageMedia(messageId: string, workspaceId: string) {
    return this.metaWhatsAppService.getMessageMedia(workspaceId, messageId);
  }
}
