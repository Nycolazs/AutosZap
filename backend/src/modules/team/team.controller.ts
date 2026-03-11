import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
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

@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.teamService.list(user.workspaceId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post()
  create(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: CreateTeamMemberDto,
  ) {
    return this.teamService.create(user.workspaceId, user.sub, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.teamService.update(id, user.workspaceId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete(':id')
  deactivate(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.teamService.deactivate(id, user.workspaceId);
  }
}
