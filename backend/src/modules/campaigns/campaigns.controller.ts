import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CampaignAudienceType,
  CampaignStatus,
  PermissionKey,
} from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
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

type UploadedCampaignMedia = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller('campaigns')
@Permissions(PermissionKey.CAMPAIGNS_VIEW)
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

  @Permissions(PermissionKey.CAMPAIGNS_MANAGE)
  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: CampaignDto) {
    return this.campaignsService.create(user.workspaceId, user.sub, dto);
  }

  @Permissions(PermissionKey.CAMPAIGNS_MANAGE)
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<CampaignDto>,
  ) {
    return this.campaignsService.update(id, user.workspaceId, dto);
  }

  @Permissions(PermissionKey.CAMPAIGNS_MANAGE)
  @Post(':id/send')
  send(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.campaignsService.sendCampaign(id, user.workspaceId, user.sub);
  }

  @Permissions(PermissionKey.CAMPAIGNS_MANAGE)
  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.campaignsService.delete(id, user.workspaceId);
  }

  @Get(':id/media')
  async getMedia(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const media = await this.campaignsService.getMedia(id, user.workspaceId);

    response.setHeader('Content-Type', media.mimeType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${media.fileName.replace(/"/g, '')}"`,
    );

    return new StreamableFile(media.buffer);
  }

  @Permissions(PermissionKey.CAMPAIGNS_MANAGE)
  @Post(':id/media')
  @UseInterceptors(
    FileInterceptor('media', {
      limits: {
        fileSize: 8 * 1024 * 1024,
      },
    }),
  )
  uploadMedia(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedCampaignMedia | undefined,
  ) {
    if (!file) {
      return this.campaignsService.removeMedia(id, user.workspaceId);
    }

    return this.campaignsService.saveMedia(id, user.workspaceId, {
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    });
  }

  @Permissions(PermissionKey.CAMPAIGNS_MANAGE)
  @Delete(':id/media')
  removeMedia(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.campaignsService.removeMedia(id, user.workspaceId);
  }
}
