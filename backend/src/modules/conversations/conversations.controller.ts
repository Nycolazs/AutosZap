import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
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
}

class UpdateConversationDto {
  @IsOptional()
  @IsString()
  status?: string;

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
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentAuthUser,
    @Query() query: ConversationsQueryDto,
  ) {
    return this.conversationsService.list(user.workspaceId, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.conversationsService.findOne(id, user.workspaceId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(
      id,
      user.workspaceId,
      user.sub,
      dto,
    );
  }

  @Post(':id/notes')
  addNote(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: NoteDto,
  ) {
    return this.conversationsService.addNote(
      id,
      user.workspaceId,
      user.sub,
      dto.content,
    );
  }
}
