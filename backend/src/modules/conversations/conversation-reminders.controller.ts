import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PermissionKey } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { ConversationRemindersService } from './conversation-reminders.service';

class ReminderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  messageToSend!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  internalDescription?: string;

  @IsISO8601()
  remindAt!: string;
}

@Controller('conversations/:conversationId/reminders')
@Permissions(PermissionKey.INBOX_VIEW)
export class ConversationRemindersController {
  constructor(
    private readonly conversationRemindersService: ConversationRemindersService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: CurrentAuthUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.conversationRemindersService.list(conversationId, user);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentAuthUser,
    @Param('conversationId') conversationId: string,
    @Body() dto: ReminderDto,
  ) {
    return this.conversationRemindersService.create(conversationId, user, dto);
  }

  @Patch(':reminderId')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('conversationId') conversationId: string,
    @Param('reminderId') reminderId: string,
    @Body() dto: ReminderDto,
  ) {
    return this.conversationRemindersService.update(
      conversationId,
      reminderId,
      user,
      dto,
    );
  }

  @Post(':reminderId/complete')
  complete(
    @CurrentUser() user: CurrentAuthUser,
    @Param('conversationId') conversationId: string,
    @Param('reminderId') reminderId: string,
  ) {
    return this.conversationRemindersService.complete(
      conversationId,
      reminderId,
      user,
    );
  }

  @Post(':reminderId/cancel')
  cancel(
    @CurrentUser() user: CurrentAuthUser,
    @Param('conversationId') conversationId: string,
    @Param('reminderId') reminderId: string,
  ) {
    return this.conversationRemindersService.cancel(
      conversationId,
      reminderId,
      user,
    );
  }
}
