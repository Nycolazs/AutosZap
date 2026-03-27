import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
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
  InstanceMode,
  InstanceProvider,
  PermissionKey,
  Role,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsObject,
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
import { WhatsAppWebService } from '../integrations/whatsapp-web/whatsapp-web.service';
import { InstancesService } from './instances.service';
import type { Response } from 'express';

type InstanceControllerRecord = {
  provider: InstanceProvider;
  providerCapabilities?: Record<string, unknown> | null;
  connectionState?: {
    healthy?: boolean;
    detail?: string | null;
    [key: string]: unknown;
  } | null;
  qr?: Record<string, unknown> | null;
};

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

class CreateInstanceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(Object.values(InstanceProvider))
  provider?: InstanceProvider;

  @IsOptional()
  @IsIn(Object.values(InstanceMode))
  mode?: InstanceMode;

  @IsOptional()
  @IsString()
  externalInstanceId?: string;

  @IsOptional()
  @IsObject()
  providerConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  providerMetadata?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  providerSessionState?: Record<string, unknown>;
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
  private readonly logger = new Logger(InstancesController.name);

  constructor(
    private readonly instancesService: InstancesService,
    private readonly metaWhatsAppService: MetaWhatsAppService,
    private readonly whatsappWebService: WhatsAppWebService,
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
    await this.assertMetaInstance(
      user.workspaceId,
      id,
      'consultar a foto de perfil da Meta',
    );

    const profilePicture =
      await this.metaWhatsAppService.getInstanceProfilePicture(
        user.workspaceId,
        id,
      );

    response.setHeader('Content-Type', profilePicture.mimeType ?? 'image/jpeg');
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
  create(@CurrentUser() user: CurrentAuthUser, @Body() dto: CreateInstanceDto) {
    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException('Informe um nome para a instancia.');
    }

    const provider = dto.provider ?? InstanceProvider.META_WHATSAPP;

    if (provider !== InstanceProvider.WHATSAPP_WEB) {
      throw new BadRequestException(
        'Cadastro manual de instancias oficiais foi desativado. Use o Embedded Signup da Meta em /instances/embedded-signup.',
      );
    }

    return this.instancesService.create(user.workspaceId, user.sub, {
      name,
      provider,
      mode: dto.mode ?? InstanceMode.PRODUCTION,
      externalInstanceId: dto.externalInstanceId?.trim() || undefined,
      providerConfig: {
        autoStart: false,
        ...(dto.providerConfig ?? {}),
      },
      providerMetadata: {
        transport: 'WHATSAPP_WEB_GATEWAY',
        ...(dto.providerMetadata ?? {}),
      },
      providerSessionState: dto.providerSessionState ?? {
        state: 'STOPPED',
        desiredState: 'stopped',
      },
    });
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
  async connect(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    const instance = await this.getInstanceRecord(user.workspaceId, id);

    if (instance.provider === InstanceProvider.WHATSAPP_WEB) {
      await this.whatsappWebService.connect(user.workspaceId, id);
      return this.instancesService.findOne(id, user.workspaceId);
    }

    return this.instancesService.connect(id, user.workspaceId);
  }

  @Roles(Role.ADMIN)
  @Post(':id/disconnect')
  async disconnect(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
  ) {
    const instance = await this.getInstanceRecord(user.workspaceId, id);

    if (instance.provider === InstanceProvider.WHATSAPP_WEB) {
      await this.whatsappWebService.disconnect(user.workspaceId, id);
      return this.instancesService.findOne(id, user.workspaceId);
    }

    return this.instancesService.disconnect(id, user.workspaceId);
  }

  @Post(':id/test')
  async test(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    const instance = await this.getInstanceRecord(user.workspaceId, id);

    if (instance.provider === InstanceProvider.WHATSAPP_WEB) {
      const result = await this.whatsappWebService.testConnection(
        user.workspaceId,
        id,
      );

      return {
        ...result,
        provider: instance.provider,
        capabilities: instance.providerCapabilities ?? null,
        connectionState: instance.connectionState ?? null,
        qr: instance.qr ?? null,
      };
    }

    return this.metaWhatsAppService.testConnection(user.workspaceId, id);
  }

  @Post(':id/sync')
  async sync(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    const instance = await this.getInstanceRecord(user.workspaceId, id);

    if (instance.provider === InstanceProvider.WHATSAPP_WEB) {
      const syncResult = await this.whatsappWebService.syncInstance(
        user.workspaceId,
        id,
      );
      const refreshedInstance = await this.getInstanceRecord(
        user.workspaceId,
        id,
      );

      return {
        healthy: Boolean(refreshedInstance.connectionState?.healthy),
        simulated: false,
        detail:
          syncResult.historySync?.detail ??
          refreshedInstance.connectionState?.detail ??
          'Estado da sessao sincronizado com o gateway.',
        provider: refreshedInstance.provider,
        capabilities: refreshedInstance.providerCapabilities ?? null,
        connectionState: refreshedInstance.connectionState ?? null,
        qr: refreshedInstance.qr ?? null,
        historySync: syncResult.historySync ?? null,
      };
    }

    return this.metaWhatsAppService.syncInstance(user.workspaceId, id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/reconnect')
  async reconnect(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
  ) {
    await this.assertWhatsAppWebInstance(
      user.workspaceId,
      id,
      'reconectar a sessao QR',
    );
    await this.whatsappWebService.reconnect(user.workspaceId, id);
    return this.instancesService.findOne(id, user.workspaceId);
  }

  @Roles(Role.ADMIN)
  @Post(':id/logout')
  async logout(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    await this.assertWhatsAppWebInstance(
      user.workspaceId,
      id,
      'encerrar a sessao QR',
    );
    await this.whatsappWebService.logout(user.workspaceId, id);
    return this.instancesService.findOne(id, user.workspaceId);
  }

  @Get(':id/connection-state')
  async getConnectionState(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
  ) {
    const instance = await this.getInstanceRecord(user.workspaceId, id);

    if (instance.provider === InstanceProvider.WHATSAPP_WEB) {
      await this.whatsappWebService.getConnectionState(user.workspaceId, id);
      const refreshedInstance = await this.getInstanceRecord(
        user.workspaceId,
        id,
      );

      return refreshedInstance.connectionState;
    }

    return instance.connectionState;
  }

  @Get(':id/qr')
  async getQr(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    await this.assertWhatsAppWebInstance(
      user.workspaceId,
      id,
      'consultar o QR da sessao',
    );
    await this.whatsappWebService.getQr(user.workspaceId, id);
    const instance = await this.getInstanceRecord(user.workspaceId, id);
    return instance.qr;
  }

  @Roles(Role.ADMIN)
  @Post(':id/qr/refresh')
  async refreshQr(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
  ) {
    await this.assertWhatsAppWebInstance(
      user.workspaceId,
      id,
      'atualizar o QR da sessao',
    );
    await this.whatsappWebService.refreshQr(user.workspaceId, id);
    const instance = await this.getInstanceRecord(user.workspaceId, id);
    return instance.qr;
  }

  @Get(':id/business-profile')
  async getBusinessProfile(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
  ) {
    await this.assertMetaInstance(
      user.workspaceId,
      id,
      'consultar o perfil comercial da Meta',
    );
    return this.metaWhatsAppService.getBusinessProfile(user.workspaceId, id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/business-profile')
  async updateBusinessProfile(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessProfileDto,
  ) {
    await this.assertMetaInstance(
      user.workspaceId,
      id,
      'atualizar o perfil comercial da Meta',
    );
    return this.metaWhatsAppService.updateBusinessProfile(
      user.workspaceId,
      id,
      dto,
    );
  }

  @Post(':id/subscribe-app')
  async subscribeApp(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
    @Body() dto: SubscribeAppDto,
  ) {
    await this.assertMetaInstance(
      user.workspaceId,
      id,
      'assinar o webhook oficial da Meta',
    );
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
  async updateProfilePicture(
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

    await this.assertMetaInstance(
      user.workspaceId,
      id,
      'atualizar a foto de perfil da Meta',
    );

    return this.metaWhatsAppService.updateProfilePicture(user.workspaceId, id, {
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      contentLength: file.size,
    });
  }

  @Get(':id/templates')
  async listTemplates(
    @CurrentUser() user: CurrentAuthUser,
    @Param('id') id: string,
  ) {
    await this.assertMetaInstance(
      user.workspaceId,
      id,
      'listar templates oficiais da Meta',
    );
    return this.metaWhatsAppService.listTemplates(user.workspaceId, id);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@CurrentUser() user: CurrentAuthUser, @Param('id') id: string) {
    const instance = await this.getInstanceRecord(user.workspaceId, id);

    if (instance.provider === InstanceProvider.WHATSAPP_WEB) {
      try {
        await this.whatsappWebService.unregister(user.workspaceId, id);
      } catch (error) {
        this.logger.warn(
          `Falha ao desregistrar a sessao WhatsApp Web antes da remocao da instancia ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return this.instancesService.remove(id, user.workspaceId);
  }

  private async getInstanceRecord(workspaceId: string, id: string) {
    return (await this.instancesService.findOne(
      id,
      workspaceId,
    )) as unknown as InstanceControllerRecord;
  }

  private async assertMetaInstance(
    workspaceId: string,
    id: string,
    action: string,
  ) {
    const instance = await this.getInstanceRecord(workspaceId, id);

    if (instance.provider !== InstanceProvider.META_WHATSAPP) {
      throw new BadRequestException(
        `A instancia selecionada nao usa o provedor oficial da Meta. Nao e possivel ${action} neste provedor.`,
      );
    }

    return instance;
  }

  private async assertWhatsAppWebInstance(
    workspaceId: string,
    id: string,
    action: string,
  ) {
    const instance = await this.getInstanceRecord(workspaceId, id);

    if (instance.provider !== InstanceProvider.WHATSAPP_WEB) {
      throw new BadRequestException(
        `A instancia selecionada nao usa o provedor WhatsApp Web QR. Nao e possivel ${action} neste provedor.`,
      );
    }

    return instance;
  }
}
