import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  InstanceMode,
  InstanceProvider,
  InstanceStatus,
  PermissionKey,
  Role,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MetaWhatsAppService } from '../integrations/meta-whatsapp/meta-whatsapp.service';
import { InstancesService } from './instances.service';

class EmbeddedSignupDto {
  @IsString()
  code!: string;

  @IsString()
  phoneNumberId!: string;

  @IsString()
  wabaId!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

class InstanceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(InstanceProvider)
  provider?: InstanceProvider;

  @IsOptional()
  @IsEnum(InstanceStatus)
  status?: InstanceStatus;

  @IsOptional()
  @IsEnum(InstanceMode)
  mode?: InstanceMode;

  @IsOptional()
  @IsString()
  appId?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  businessAccountId?: string;

  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  @IsString()
  webhookVerifyToken?: string;

  @IsOptional()
  @IsString()
  appSecret?: string;
}

class SubscribeAppDto {
  @IsOptional()
  @IsString()
  overrideCallbackUri?: string;

  @IsOptional()
  @IsString()
  verifyToken?: string;
}

const WHATSAPP_PROFILE_VERTICALS = [
  'UNDEFINED',
  'OTHER',
  'AUTO',
  'BEAUTY',
  'APPAREL',
  'EDU',
  'ENTERTAIN',
  'EVENT_PLAN',
  'FINANCE',
  'GROCERY',
  'GOVT',
  'HOTEL',
  'HEALTH',
  'NONPROFIT',
  'PROF_SERVICES',
  'RETAIL',
  'TRAVEL',
  'RESTAURANT',
  'NOT_A_BIZ',
] as const;

class UpdateBusinessProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(139)
  about?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsUrl(
    {
      require_protocol: true,
    },
    { each: true },
  )
  websites?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(256)
  address?: string;

  @IsOptional()
  @IsIn(WHATSAPP_PROFILE_VERTICALS)
  vertical?: (typeof WHATSAPP_PROFILE_VERTICALS)[number];
}

@Controller('instances')
@Permissions(PermissionKey.INTEGRATIONS_VIEW)
export class InstancesController {
  constructor(
    private readonly instancesService: InstancesService,
    private readonly metaWhatsAppService: MetaWhatsAppService,
  ) {}

  @Get()
  list(@CurrentUser() user: CurrentAuthUser) {
    return this.instancesService.list(user.workspaceId);
  }

  @Get('embedded-signup-config')
  getEmbeddedSignupConfig() {
    return this.instancesService.getEmbeddedSignupConfig();
  }

  @Roles(Role.ADMIN)
  @Post('embedded-signup')
  async embeddedSignup(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: EmbeddedSignupDto,
  ) {
    const instance = await this.instancesService.createFromEmbeddedSignup(
      user.workspaceId,
      user.sub,
      dto,
    );

    // Best-effort sync and subscribe — don't fail the request if these fail
    try {
      await this.metaWhatsAppService.syncInstance(user.workspaceId, instance.id);
    } catch {
      // Instance was created, user can retry sync manually
    }

    try {
      await this.metaWhatsAppService.subscribeApp(user.workspaceId, instance.id);
    } catch {
      // Instance was created, user can retry subscribe manually
    }

    return this.instancesService.findOne(instance.id, user.workspaceId);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: InstanceDto) {
    return this.instancesService.create(user.workspaceId, user.sub, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.instancesService.findOne(id, user.workspaceId);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<InstanceDto>,
  ) {
    return this.instancesService.update(id, user.workspaceId, dto);
  }

  @Roles(Role.ADMIN)
  @Post(':id/connect')
  connect(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.instancesService.connect(id, user.workspaceId);
  }

  @Roles(Role.ADMIN)
  @Post(':id/disconnect')
  disconnect(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.instancesService.disconnect(id, user.workspaceId);
  }

  @Post(':id/test')
  test(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.metaWhatsAppService.testConnection(user.workspaceId, id);
  }

  @Post(':id/sync')
  sync(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.metaWhatsAppService.syncInstance(user.workspaceId, id);
  }

  @Get(':id/business-profile')
  getBusinessProfile(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
  ) {
    return this.metaWhatsAppService.getBusinessProfile(user.workspaceId, id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/business-profile')
  updateBusinessProfile(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessProfileDto,
  ) {
    return this.metaWhatsAppService.updateBusinessProfile(
      user.workspaceId,
      id,
      dto,
    );
  }

  @Post(':id/subscribe-app')
  subscribeApp(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: SubscribeAppDto,
  ) {
    return this.metaWhatsAppService.subscribeApp(user.workspaceId, id, dto);
  }

  @Roles(Role.ADMIN)
  @Post(':id/profile-picture')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  updateProfilePicture(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
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
        'Selecione uma imagem para atualizar o perfil.',
      );
    }

    return this.metaWhatsAppService.updateProfilePicture(user.workspaceId, id, {
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      contentLength: file.size,
    });
  }

  @Get(':id/templates')
  listTemplates(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.metaWhatsAppService.listTemplates(user.workspaceId, id);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    return this.instancesService.remove(id, user.workspaceId);
  }
}
