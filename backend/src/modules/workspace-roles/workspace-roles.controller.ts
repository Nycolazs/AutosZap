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
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import {
  AnyPermissions,
  Permissions,
} from '../../common/decorators/permissions.decorator';
import { WorkspaceRolesService } from './workspace-roles.service';

class CreateWorkspaceRoleDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsEnum(PermissionKey, { each: true })
  permissions!: PermissionKey[];
}

class UpdateWorkspaceRoleDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsEnum(PermissionKey, { each: true })
  permissions!: PermissionKey[];
}

@Controller('workspace-roles')
export class WorkspaceRolesController {
  constructor(private readonly workspaceRolesService: WorkspaceRolesService) {}

  @AnyPermissions(PermissionKey.MANAGE_TEAM, PermissionKey.MANAGE_USER_ROLES)
  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.workspaceRolesService.list(user.workspaceId);
  }

  @Permissions(PermissionKey.MANAGE_USER_ROLES)
  @Post()
  create(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: CreateWorkspaceRoleDto,
  ) {
    return this.workspaceRolesService.create(user.workspaceId, dto);
  }

  @Permissions(PermissionKey.MANAGE_USER_ROLES)
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceRoleDto,
  ) {
    return this.workspaceRolesService.update(id, user.workspaceId, dto);
  }

  @Permissions(PermissionKey.MANAGE_USER_ROLES)
  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.workspaceRolesService.remove(id, user.workspaceId);
  }
}
