import {
  BadRequestException,
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
  MinLength,
  ValidateIf,
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

class GenerateInviteCodeDto {
  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  workspaceRoleId?: string;
}

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
  @IsString()
  workspaceRoleId?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ValidateIf((object: CreateTeamMemberDto) => object.password !== undefined)
  @IsString()
  @MinLength(6)
  confirmPassword?: string;
}

class UpdateTeamMemberDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  workspaceRoleId?: string | null;
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
    @CurrentUser() _user: CurrentAuthUser,
    @Body() _dto: CreateTeamMemberDto,
  ) {
    throw new BadRequestException(
      'Adicao manual desativada. Use Gerar codigo de convite.',
    );
  }

  @AnyPermissions(PermissionKey.MANAGE_TEAM, PermissionKey.MANAGE_USER_ROLES)
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.teamService.update(id, user.workspaceId, {
      title: dto.title,
      role: dto.role,
      workspaceRoleId: dto.workspaceRoleId,
    });
  }

  @Permissions(PermissionKey.MANAGE_USER_PERMISSIONS)
  @Patch(':id/permissions')
  updatePermissions(
    @CurrentUser() _user: CurrentAuthUser,
    @Param('id') _id: string,
    @Body() _dto: UpdatePermissionsDto,
  ) {
    throw new BadRequestException(
      'Permissoes individuais desativadas. Ajuste o papel do membro ou edite os papeis do workspace.',
    );
  }

  @AnyPermissions(
    PermissionKey.MANAGE_USER_PERMISSIONS,
    PermissionKey.MANAGE_USER_ROLES,
  )
  @Get('permissions/catalog')
  listPermissionCatalog() {
    return this.accessControlService.listPermissionCatalog();
  }

  @Permissions(PermissionKey.MANAGE_TEAM)
  @Delete(':id')
  deactivate(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.teamService.deactivate(id, user.workspaceId);
  }

  @Permissions(PermissionKey.MANAGE_TEAM)
  @Post(':id/activate')
  activate(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.teamService.activate(id, user.workspaceId);
  }

  @Permissions(PermissionKey.MANAGE_TEAM)
  @Post('invite-code')
  generateInviteCode(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: GenerateInviteCodeDto,
  ) {
    return this.teamService.generateInviteCode(user.workspaceId, user.sub, dto);
  }

  @Permissions(PermissionKey.MANAGE_TEAM)
  @Get('invite-codes')
  listInviteCodes(@CurrentUser() user: CurrentAuthUser) {
    return this.teamService.listInviteCodes(user.workspaceId);
  }

  @Permissions(PermissionKey.MANAGE_TEAM)
  @Delete('invite-code/:id')
  revokeInviteCode(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
  ) {
    return this.teamService.revokeInviteCode(user.workspaceId, id);
  }
}
