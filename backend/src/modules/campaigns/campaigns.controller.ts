import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CampaignAudienceType, CampaignStatus } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { CampaignsService } from './campaigns.service';

class CampaignDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(CampaignAudienceType)
  audienceType!: CampaignAudienceType;

  @IsObject()
  targetConfig!: Record<string, unknown>;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @IsOptional()
  @IsString()
  instanceId?: string;
}

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.campaignsService.list(user.workspaceId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.campaignsService.findOne(id, user.workspaceId);
  }

  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: CampaignDto) {
    return this.campaignsService.create(user.workspaceId, user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CampaignDto>,
  ) {
    return this.campaignsService.update(id, user.workspaceId, dto);
  }

  @Post(':id/send')
  send(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.campaignsService.sendCampaign(id, user.workspaceId, user.sub);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.campaignsService.delete(id, user.workspaceId);
  }
}
