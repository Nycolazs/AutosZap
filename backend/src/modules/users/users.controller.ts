import { Body, Controller, Get, Patch } from '@nestjs/common';
import { PermissionKey } from '@prisma/client';
import {
  IsEmail,
  IsObject,
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
import { UsersService } from './users.service';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

class UpdateWorkspaceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @AnyPermissions(
    PermissionKey.INBOX_VIEW,
    PermissionKey.CRM_VIEW,
    PermissionKey.TEAM_VIEW,
  )
  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.usersService.list(user.workspaceId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.sub, user.workspaceId, dto);
  }

  @Patch('change-password')
  changePassword(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(
      user.sub,
      user.workspaceId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Get('workspace')
  getWorkspace(@CurrentUser() user: CurrentAuthUser) {
    return this.usersService.getWorkspace(user.workspaceId);
  }

  @AnyPermissions(
    PermissionKey.SETTINGS_VIEW,
    PermissionKey.CONFIGURE_CONVERSATION_ROUTING,
    PermissionKey.CONFIGURE_AUTO_MESSAGES,
    PermissionKey.CONFIGURE_BUSINESS_HOURS,
  )
  @Patch('workspace')
  updateWorkspace(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.usersService.updateWorkspace(user.workspaceId, dto);
  }
}
