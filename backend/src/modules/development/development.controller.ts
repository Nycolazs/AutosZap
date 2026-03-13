import { Body, Controller, Get, Patch } from '@nestjs/common';
import { PermissionKey, Role } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { DevelopmentService } from './development.service';

class UpdateDevelopmentSettingsDto {
  @IsOptional()
  @IsString()
  localFrontendUrl?: string;

  @IsOptional()
  @IsString()
  localBackendUrl?: string;

  @IsOptional()
  @IsString()
  localTunnelUrl?: string;

  @IsOptional()
  @IsString()
  preferredInstanceId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller('development')
export class DevelopmentController {
  constructor(private readonly developmentService: DevelopmentService) {}

  @Permissions(PermissionKey.DEVELOPMENT_VIEW)
  @Get('overview')
  getOverview(@CurrentUser() user: CurrentAuthUser) {
    return this.developmentService.getOverview(user.workspaceId);
  }

  @Roles(Role.ADMIN)
  @Permissions(PermissionKey.DEVELOPMENT_VIEW)
  @Patch('settings')
  updateSettings(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: UpdateDevelopmentSettingsDto,
  ) {
    return this.developmentService.updateSettings(user.workspaceId, dto);
  }
}
