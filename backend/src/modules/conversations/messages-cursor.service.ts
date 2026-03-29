import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CursorPaginationQueryDto } from '../../common/dto/cursor-pagination.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildCompoundCursor,
  buildCompoundCursorWhere,
  cursorPaginatedResponse,
  type CursorPaginatedResult,
} from '../../common/utils/cursor-pagination';
import { ConversationWorkflowService } from './conversation-workflow.service';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 80;

const MESSAGE_SENDER_USER_SELECT = {
  id: true,
  globalUserId: true,
  name: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

const CURSOR_MESSAGE_INCLUDE = {
  senderUser: {
    select: MESSAGE_SENDER_USER_SELECT,
  },
} satisfies Prisma.ConversationMessageInclude;

type CursorMessageRecord = Prisma.ConversationMessageGetPayload<{
  include: typeof CURSOR_MESSAGE_INCLUDE;
}>;

@Injectable()
export class MessagesCursorService {
  private readonly logger = new Logger(MessagesCursorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationWorkflowService: ConversationWorkflowService,
  ) {}

  /**
   * Returns cursor-paginated messages for a conversation.
   *
   * When no cursor is provided, returns the most recent messages.
   * When cursor is provided with direction `before`, returns older messages.
   * When cursor is provided with direction `after`, returns newer messages.
   *
   * Uses a compound cursor (`createdAt::id`) for deterministic ordering
   * when timestamps collide.
   */
  async getMessages(
    conversationId: string,
    user: CurrentAuthUser,
    params: CursorPaginationQueryDto,
  ): Promise<CursorPaginatedResult<CursorMessageRecord>> {
    await this.conversationWorkflowService.assertConversationAccess(
      conversationId,
      user,
      'visualizar as mensagens desta conversa',
    );

    const limit = Math.min(
      Math.max(params.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const direction = params.direction ?? 'before';

    const cursorWhere = buildCompoundCursorWhere(
      params.cursor,
      direction,
      'createdAt',
      'id',
    );

    const orderDirection: Prisma.SortOrder =
      direction === 'before' ? 'desc' : 'asc';

    const messages = await this.prisma.conversationMessage.findMany({
      where: {
        workspaceId: user.workspaceId,
        conversationId,
        ...cursorWhere,
      },
      orderBy: [
        { createdAt: orderDirection },
        { id: orderDirection },
      ],
      take: limit + 1,
      include: CURSOR_MESSAGE_INCLUDE,
    });

    const result = cursorPaginatedResponse(messages, limit, (msg) =>
      buildCompoundCursor(msg.createdAt, msg.id),
    );

    // When fetching in the `after` direction the results come in ascending
    // order. We reverse them so the caller always receives messages in
    // descending order (most recent first).
    if (direction === 'after') {
      result.data.reverse();
    }

    return result;
  }

  /**
   * Convenience method that returns the N most recent messages for a
   * conversation. Useful for the initial load when no cursor exists yet.
   */
  async getLatestMessages(
    conversationId: string,
    user: CurrentAuthUser,
    limit = DEFAULT_LIMIT,
  ): Promise<CursorMessageRecord[]> {
    await this.conversationWorkflowService.assertConversationAccess(
      conversationId,
      user,
      'visualizar as mensagens desta conversa',
    );

    const safeLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);

    const messages = await this.prisma.conversationMessage.findMany({
      where: {
        workspaceId: user.workspaceId,
        conversationId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: safeLimit,
      include: CURSOR_MESSAGE_INCLUDE,
    });

    // Return in ascending order (oldest first) so the UI can append naturally.
    return messages.reverse();
  }
}
