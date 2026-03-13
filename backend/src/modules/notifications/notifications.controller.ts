import { Controller, Get, Param, Post, Query, Sse } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentAuthUser,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationsService.listForUser(user, {
      limit: limit ? Number(limit) : undefined,
      unreadOnly: unreadOnly === 'true',
    });
  }

  @Sse('stream')
  stream(@CurrentUser() user: CurrentAuthUser) {
    return this.notificationsService.stream(user);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.notificationsService.markRead(id, user);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: CurrentAuthUser) {
    return this.notificationsService.markAllRead(user);
  }
}
