import { Controller, Get, Param, Query } from '@nestjs/common';
import { PermissionKey } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CursorPaginationQueryDto } from '../../common/dto/cursor-pagination.dto';
import { MessagesCursorService } from './messages-cursor.service';

@Controller('conversations')
@Permissions(PermissionKey.INBOX_VIEW)
export class MessagesCursorController {
  constructor(
    private readonly messagesCursorService: MessagesCursorService,
  ) {}

  /**
   * GET /conversations/:id/messages/cursor
   *
   * Returns cursor-paginated messages for a conversation.
   *
   * Query params:
   *   - cursor: compound cursor string (ISO-timestamp::id)
   *   - limit: page size (default 30, max 80)
   *   - direction: 'before' (older) or 'after' (newer), defaults to 'before'
   */
  @Get(':id/messages/cursor')
  getMessages(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') conversationId: string,
    @Query() query: CursorPaginationQueryDto,
  ) {
    return this.messagesCursorService.getMessages(
      conversationId,
      user,
      query,
    );
  }

  /**
   * GET /conversations/:id/messages/latest
   *
   * Returns the N most recent messages for the initial load.
   */
  @Get(':id/messages/latest')
  getLatestMessages(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') conversationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesCursorService.getLatestMessages(
      conversationId,
      user,
      limit ? Number(limit) : undefined,
    );
  }
}
