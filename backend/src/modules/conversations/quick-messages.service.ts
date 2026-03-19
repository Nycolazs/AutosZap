import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { resolveConversationPlaceholders } from './conversation-placeholders.util';
import { ConversationWorkflowService } from './conversation-workflow.service';
import { ConversationsService } from './conversations.service';

@Injectable()
export class QuickMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationWorkflowService: ConversationWorkflowService,
    private readonly conversationsService: ConversationsService,
  ) {}

  async list(workspaceId: string) {
    return this.prisma.quickMessage.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      orderBy: [
        {
          updatedAt: 'desc',
        },
        {
          title: 'asc',
        },
      ],
    });
  }

  async create(
    user: CurrentAuthUser,
    payload: {
      title: string;
      content: string;
    },
  ) {
    const title = this.normalizeTitle(payload.title);
    const content = this.normalizeContent(payload.content);

    await this.assertUniqueTitle(user.workspaceId, title);

    return this.prisma.quickMessage.create({
      data: {
        workspaceId: user.workspaceId,
        title,
        content,
        createdById: user.sub,
        updatedById: user.sub,
      },
    });
  }

  async update(
    id: string,
    user: CurrentAuthUser,
    payload: {
      title?: string;
      content?: string;
    },
  ) {
    const quickMessage = await this.prisma.quickMessage.findFirst({
      where: {
        id,
        workspaceId: user.workspaceId,
        deletedAt: null,
      },
    });

    if (!quickMessage) {
      throw new NotFoundException('Mensagem rapida nao encontrada.');
    }

    const nextTitle =
      payload.title !== undefined
        ? this.normalizeTitle(payload.title)
        : quickMessage.title;
    const nextContent =
      payload.content !== undefined
        ? this.normalizeContent(payload.content)
        : quickMessage.content;

    if (nextTitle !== quickMessage.title) {
      await this.assertUniqueTitle(user.workspaceId, nextTitle, id);
    }

    return this.prisma.quickMessage.update({
      where: {
        id,
      },
      data: {
        title: nextTitle,
        content: nextContent,
        updatedById: user.sub,
      },
    });
  }

  async remove(id: string, user: CurrentAuthUser) {
    const quickMessage = await this.prisma.quickMessage.findFirst({
      where: {
        id,
        workspaceId: user.workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!quickMessage) {
      throw new NotFoundException('Mensagem rapida nao encontrada.');
    }

    await this.prisma.quickMessage.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
        updatedById: user.sub,
      },
    });

    return {
      success: true,
    };
  }

  async applyMessageToConversation(
    id: string,
    user: CurrentAuthUser,
    payload: {
      conversationId: string;
      action: 'SEND_NOW' | 'EDIT_IN_INPUT';
    },
  ) {
    const quickMessage = await this.prisma.quickMessage.findFirst({
      where: {
        id,
        workspaceId: user.workspaceId,
        deletedAt: null,
      },
    });

    if (!quickMessage) {
      throw new NotFoundException('Mensagem rapida nao encontrada.');
    }

    const resolvedContent = await this.resolveMessageContent({
      conversationId: payload.conversationId,
      workspaceId: user.workspaceId,
      actorUserId: user.sub,
      actorName: user.name,
      actorRole: user.role,
      template: quickMessage.content,
    });

    if (!resolvedContent.trim()) {
      throw new BadRequestException(
        'A mensagem rapida ficou vazia apos substituir as variaveis.',
      );
    }

    if (payload.action === 'SEND_NOW') {
      const message = await this.conversationsService.sendMessage(
        payload.conversationId,
        user,
        resolvedContent,
      );

      return {
        action: payload.action,
        content: resolvedContent,
        message,
      };
    }

    return {
      action: payload.action,
      content: resolvedContent,
    };
  }

  private async resolveMessageContent(payload: {
    conversationId: string;
    workspaceId: string;
    actorUserId: string;
    actorName: string;
    actorRole: CurrentAuthUser['role'];
    template: string;
  }) {
    await this.conversationWorkflowService.assertConversationAccess(
      payload.conversationId,
      {
        sub: payload.actorUserId,
        email: '',
        name: payload.actorName,
        role: payload.actorRole,
        workspaceId: payload.workspaceId,
      },
      'usar mensagens rapidas nesta conversa',
    );

    const [conversation, actor] = await Promise.all([
      this.prisma.conversation.findFirst({
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
          assignedUser: {
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
      }),
      this.prisma.user.findFirst({
        where: {
          id: payload.actorUserId,
          workspaceId: payload.workspaceId,
          deletedAt: null,
        },
        select: {
          name: true,
        },
      }),
    ]);

    if (!conversation) {
      throw new NotFoundException('Conversa nao encontrada.');
    }

    const actorName = actor?.name?.trim() || payload.actorName;
    const assignedName =
      conversation.assignedUser?.name?.trim() || actorName || 'Equipe';
    const companyName =
      conversation.workspace.companyName?.trim() ||
      conversation.workspace.name?.trim() ||
      'empresa';

    return resolveConversationPlaceholders(payload.template, {
      nome: conversation.contact.name?.trim() || 'cliente',
      vendedor: actorName || assignedName || 'Equipe',
      novo_vendedor: assignedName || actorName || 'Equipe',
      empresa: companyName,
    });
  }

  private normalizeTitle(value: string) {
    const title = value.trim();

    if (title.length < 2 || title.length > 120) {
      throw new BadRequestException(
        'Informe um titulo entre 2 e 120 caracteres.',
      );
    }

    return title;
  }

  private normalizeContent(value: string) {
    const content = value.trim();

    if (content.length < 2 || content.length > 4000) {
      throw new BadRequestException(
        'Informe um conteudo entre 2 e 4000 caracteres.',
      );
    }

    return content;
  }

  private async assertUniqueTitle(
    workspaceId: string,
    title: string,
    ignoreId?: string,
  ) {
    const duplicate = await this.prisma.quickMessage.findFirst({
      where: {
        workspaceId,
        deletedAt: null,
        title: {
          equals: title,
          mode: 'insensitive',
        },
        ...(ignoreId
          ? {
              NOT: {
                id: ignoreId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      throw new BadRequestException(
        'Ja existe uma mensagem rapida com este titulo.',
      );
    }
  }
}
