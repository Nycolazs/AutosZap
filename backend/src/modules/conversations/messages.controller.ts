import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';

class MessagesQueryDto {
  @IsString()
  conversationId!: string;
}

class SendMessageDto {
  @IsString()
  conversationId!: string;

  @IsString()
  content!: string;
}

@Controller('messages')
export class MessagesController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser, @Query() query: MessagesQueryDto) {
    return this.conversationsService.listMessages(
      query.conversationId,
      user.workspaceId,
    );
  }

  @Post()
  send(@CurrentUser() user: CurrentAuthUser, @Body() dto: SendMessageDto) {
    return this.conversationsService.sendMessage(
      dto.conversationId,
      user.workspaceId,
      user.sub,
      dto.content,
    );
  }
}
