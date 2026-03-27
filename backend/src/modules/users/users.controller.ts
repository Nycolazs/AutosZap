import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PermissionKey, Role } from '@prisma/client';
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { AnyPermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
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
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  cnpj?: string;

  @IsOptional()
  @IsString()
  stateRegistration?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  stateCode?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

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

  @Post('profile/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  uploadProfileAvatar(
    @CurrentUser() user: CurrentAuthUser,
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          originalname: string;
          mimetype: string;
          size: number;
        }
      | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Selecione uma imagem para atualizar a foto de perfil.',
      );
    }

    return this.usersService.updateProfileAvatar(
      user.sub,
      user.workspaceId,
      user.globalUserId ?? user.sub,
      {
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      },
    );
  }

  @Get('profile/avatar')
  async getProfileAvatar(@CurrentUser() user: CurrentAuthUser) {
    const avatar = await this.usersService.getProfileAvatar(
      user.sub,
      user.workspaceId,
      user.globalUserId ?? user.sub,
    );

    return new StreamableFile(avatar.buffer, {
      type: avatar.mimeType,
      disposition: 'inline; filename="profile-avatar"',
      length: avatar.buffer.length,
    });
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

  @Roles(Role.ADMIN)
  @Patch('workspace')
  updateWorkspace(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.usersService.updateWorkspace(user.workspaceId, dto);
  }
}
