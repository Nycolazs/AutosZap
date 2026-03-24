import {
  BadRequestException,
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
import { PermissionKey, Role } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
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
import type { Response } from 'express';

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

class RenameInstanceDto {
  @IsString()
  name!: string;
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

  @Permissions()
  @Get(':id/profile-picture')
  async getProfilePicture(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const profilePicture = await this.metaWhatsAppService.getInstanceProfilePicture(
      user.workspaceId,
      id,
    );

    response.setHeader(
      'Content-Type',
      profilePicture.mimeType ?? 'image/jpeg',
    );
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.setHeader('Content-Length', String(profilePicture.buffer.length));
    response.setHeader(
      'Content-Disposition',
      'inline; filename="instance-profile-picture"',
    );

    return new StreamableFile(profilePicture.buffer);
  }

  @Roles(Role.ADMIN)
  @Post('embedded-signup')
  async embeddedSignup(
    @CurrentUser() user: CurrentAuthUser,
    @Body() dto: EmbeddedSignupDto,
  ) {
    const result = await this.instancesService.createFromEmbeddedSignup(
      user.workspaceId,
      user.sub,
      dto,
    );

    const instanceId = result.instanceId;
    let syncError: string | null = null;
    let subscribeError: string | null = null;

    // Best-effort sync and subscribe - do not fail the request if these fail
    try {
      await this.metaWhatsAppService.syncInstance(user.workspaceId, instanceId);
    } catch (error) {
      syncError =
        error instanceof Error ? error.message : 'Falha ao sincronizar a Meta.';
    }

    try {
      await this.metaWhatsAppService.subscribeApp(user.workspaceId, instanceId);
    } catch (error) {
      subscribeError =
        error instanceof Error
          ? error.message
          : 'Falha ao assinar o app na WABA.';
    }

    const instance = await this.instancesService.findOne(
      instanceId,
      user.workspaceId,
    );
    const instanceData = instance as Record<string, unknown>;

    return {
      ...instanceData,
      embeddedSignup: {
        reusedExistingInstance: result.reusedExistingInstance,
        sync: {
          success: syncError === null,
          message:
            syncError ?? 'Instancia sincronizada com a Meta automaticamente.',
        },
        subscribe: {
          success: subscribeError === null,
          message:
            subscribeError ??
            'Webhook da Meta inscrito automaticamente para a instancia.',
        },
      },
    };
  }

  @Roles(Role.ADMIN)
  @Post()
  create() {
    throw new BadRequestException(
      'Cadastro manual de instancias foi desativado. Use o Embedded Signup da Meta em /instances/embedded-signup.',
    );
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
    @Body() dto: RenameInstanceDto,
  ) {
    return this.instancesService.update(id, user.workspaceId, {
      name: dto.name,
    });
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
