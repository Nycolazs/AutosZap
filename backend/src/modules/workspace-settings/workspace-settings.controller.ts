import { Body, Controller, Get, Patch } from '@nestjs/common';
import { PermissionKey } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { AnyPermissions } from '../../common/decorators/permissions.decorator';
import { WorkspaceSettingsService } from './workspace-settings.service';

class BusinessHourDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsBoolean()
  isOpen!: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime?: string | null;
}

class UpdateWorkspaceConversationSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  inactivityTimeoutMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  waitingAutoCloseTimeoutMinutes?: number | null;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  sendBusinessHoursAutoReply?: boolean;

  @IsOptional()
  @IsString()
  businessHoursAutoReply?: string | null;

  @IsOptional()
  @IsBoolean()
  sendOutOfHoursAutoReply?: boolean;

  @IsOptional()
  @IsString()
  outOfHoursAutoReply?: string | null;

  @IsOptional()
  @IsBoolean()
  sendWindowClosedTemplateReply?: boolean;

  @IsOptional()
  @IsString()
  windowClosedTemplateName?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(?:[_-][A-Z]{2})?$/)
  windowClosedTemplateLanguageCode?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => BusinessHourDto)
  businessHours?: BusinessHourDto[];
}

@Controller('workspace-settings')
export class WorkspaceSettingsController {
  constructor(
    private readonly workspaceSettingsService: WorkspaceSettingsService,
  ) {}

  @AnyPermissions(
    PermissionKey.SETTINGS_VIEW,
    PermissionKey.CONFIGURE_CONVERSATION_ROUTING,
    PermissionKey.CONFIGURE_AUTO_MESSAGES,
    PermissionKey.CONFIGURE_BUSINESS_HOURS,
  )
  @Get()
  getSettings(@CurrentUser() user: CurrentAuthUser) {
    return this.workspaceSettingsService.getConversationSettings(
      user.workspaceId,
    );
  }

  @AnyPermissions(
    PermissionKey.SETTINGS_VIEW,
    PermissionKey.CONFIGURE_CONVERSATION_ROUTING,
    PermissionKey.CONFIGURE_AUTO_MESSAGES,
    PermissionKey.CONFIGURE_BUSINESS_HOURS,
  )
  @Patch()
  updateSettings(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: UpdateWorkspaceConversationSettingsDto,
  ) {
    return this.workspaceSettingsService.updateConversationSettings(
      user.workspaceId,
      dto,
    );
  }
}
