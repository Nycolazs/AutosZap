import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
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

  @Get('overview')
  getOverview(@CurrentUser() user: CurrentAuthUser) {
    return this.developmentService.getOverview(user.workspaceId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch('settings')
  updateSettings(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: UpdateDevelopmentSettingsDto,
  ) {
    return this.developmentService.updateSettings(user.workspaceId, dto);
  }
}
