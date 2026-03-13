import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PermissionKey, Role, UserStatus } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import {
  AnyPermissions,
  Permissions,
} from '../../common/decorators/permissions.decorator';
import { AccessControlService } from '../access-control/access-control.service';
import { TeamService } from './team.service';

class CreateTeamMemberDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

class UpdateTeamMemberDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

class PermissionOverrideDto {
  @IsEnum(PermissionKey)
  permission!: PermissionKey;

  @IsBoolean()
  allowed!: boolean;
}

class UpdatePermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionOverrideDto)
  permissions!: PermissionOverrideDto[];
}

@Controller('team')
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Permissions(PermissionKey.TEAM_VIEW)
  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.teamService.list(user.workspaceId);
  }

  @Permissions(PermissionKey.MANAGE_TEAM)
  @Post()
  create(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: CreateTeamMemberDto,
  ) {
    return this.teamService.create(user.workspaceId, user.sub, dto);
  }

  @AnyPermissions(PermissionKey.MANAGE_TEAM, PermissionKey.MANAGE_USER_ROLES)
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.teamService.update(id, user.workspaceId, dto);
  }

  @Permissions(PermissionKey.MANAGE_USER_PERMISSIONS)
  @Patch(':id/permissions')
  updatePermissions(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePermissionsDto,
  ) {
    return this.teamService.updatePermissions(
      id,
      user.workspaceId,
      dto.permissions,
    );
  }

  @Permissions(PermissionKey.MANAGE_USER_PERMISSIONS)
  @Get('permissions/catalog')
  listPermissionCatalog() {
    return this.accessControlService.listPermissionCatalog();
  }

  @Permissions(PermissionKey.MANAGE_TEAM)
  @Delete(':id')
  deactivate(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.teamService.deactivate(id, user.workspaceId);
  }
}
