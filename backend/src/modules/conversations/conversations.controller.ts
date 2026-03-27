import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { PermissionKey, Role } from '@prisma/client';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import {
  AnyPermissions,
  Permissions,
} from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ConversationsService } from './conversations.service';

class ConversationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  ownership?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  tagId?: string;

  @IsOptional()
  @IsString()
  instanceId?: string;
}

class ConversationDetailQueryDto {
  @IsOptional()
  @IsString()
  include?: string;
}

class UpdateConversationDto {
  @IsOptional()
  @IsString()
  assignedUserId?: string | null;

  @IsOptional()
  @IsArray()
  tagIds?: string[];
}

class NoteDto {
  @IsString()
  content!: string;
}

@Controller('conversations')
@Permissions(PermissionKey.INBOX_VIEW)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentAuthUser,
    @Query() query: ConversationsQueryDto,
  ) {
    return this.conversationsService.list(user, query);
  }

  @Get('summary')
  summary(
    @CurrentUser() user: CurrentAuthUser,
    @Query() query: ConversationsQueryDto,
  ) {
    return this.conversationsService.summary(user, query);
  }

  @Get('instances')
  listInboxInstances(@CurrentUser() user: CurrentAuthUser) {
    return this.conversationsService.listInboxInstances(user);
  }

  @Sse('stream')
  stream(@CurrentUser() user: CurrentAuthUser) {
    return this.conversationsService.stream(user);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Query() query: ConversationDetailQueryDto,
  ) {
    return this.conversationsService.findOne(id, user, query.include);
  }

  @Post(':id/read')
  markAsRead(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.conversationsService.markAsRead(id, user);
  }

  @AnyPermissions(PermissionKey.INBOX_VIEW, PermissionKey.TRANSFER_CONVERSATION)
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(id, user, dto);
  }

  @Post(':id/notes')
  addNote(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: NoteDto,
  ) {
    return this.conversationsService.addNote(id, user, dto.content);
  }

  @Permissions(PermissionKey.RESOLVE_CONVERSATION)
  @Post(':id/resolve')
  resolve(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.conversationsService.resolveConversation(id, user);
  }

  @Permissions(PermissionKey.CLOSE_CONVERSATION)
  @Post(':id/close')
  close(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.conversationsService.closeConversation(id, user);
  }

  @Permissions(PermissionKey.REOPEN_CONVERSATION)
  @Post(':id/reopen')
  reopen(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.conversationsService.reopenConversation(id, user);
  }

  @Roles(Role.ADMIN)
  @Post('reprocess-waiting-timeouts')
  reprocessWaitingTimeouts(@CurrentUser() user: CurrentAuthUser) {
    return this.conversationsService.reprocessWaitingTimeouts(user);
  }
}
