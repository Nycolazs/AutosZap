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
import { IsArray, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { GroupsService } from './groups.service';

class GroupDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  contactIds?: string[];
}

@Controller('groups')
@Permissions(PermissionKey.GROUPS_VIEW)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.groupsService.list(user.workspaceId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.groupsService.findOne(id, user.workspaceId);
  }

  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: GroupDto) {
    return this.groupsService.create(user.workspaceId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<GroupDto>,
  ) {
    return this.groupsService.update(id, user.workspaceId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.groupsService.remove(id, user.workspaceId);
  }
}
