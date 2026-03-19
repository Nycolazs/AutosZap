import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PermissionKey } from '@prisma/client';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { QuickMessagesService } from './quick-messages.service';

class QuickMessageDto {
  @IsString()
  title!: string;

  @IsString()
  content!: string;
}

class UpdateQuickMessageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;
}

class ApplyQuickMessageDto {
  @IsString()
  conversationId!: string;

  @IsString()
  @IsIn(['SEND_NOW', 'EDIT_IN_INPUT'])
  action!: 'SEND_NOW' | 'EDIT_IN_INPUT';
}

@Controller('quick-messages')
export class QuickMessagesController {
  constructor(private readonly quickMessagesService: QuickMessagesService) {}

  @Permissions(PermissionKey.INBOX_VIEW)
  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.quickMessagesService.list(user.workspaceId);
  }

  @Permissions(PermissionKey.CONFIGURE_AUTO_MESSAGES)
  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: QuickMessageDto) {
    return this.quickMessagesService.create(user, dto);
  }

  @Permissions(PermissionKey.CONFIGURE_AUTO_MESSAGES)
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateQuickMessageDto,
  ) {
    return this.quickMessagesService.update(id, user, dto);
  }

  @Permissions(PermissionKey.CONFIGURE_AUTO_MESSAGES)
  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.quickMessagesService.remove(id, user);
  }

  @Permissions(PermissionKey.INBOX_VIEW)
  @Post(':id/apply')
  apply(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: ApplyQuickMessageDto,
  ) {
    return this.quickMessagesService.applyMessageToConversation(id, user, dto);
  }
}
