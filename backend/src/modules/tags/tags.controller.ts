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
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { TagsService } from './tags.service';

class TagDto {
  @IsString()
  name!: string;

  @IsString()
  color!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@Controller('tags')
@Permissions(PermissionKey.TAGS_VIEW)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.tagsService.list(user.workspaceId);
  }

  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: TagDto) {
    return this.tagsService.create(user.workspaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<TagDto>,
  ) {
    return this.tagsService.update(id, user.workspaceId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.tagsService.remove(id, user.workspaceId);
  }
}
