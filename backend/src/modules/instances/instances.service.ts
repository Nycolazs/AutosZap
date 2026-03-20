import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstanceMode, InstanceProvider, InstanceStatus } from '@prisma/client';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { CryptoService } from '../../common/crypto/crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';

type InstancePayload = {
  name: string;
  provider?: InstanceProvider;
  status?: InstanceStatus;
  mode?: InstanceMode;
  appId?: string;
  phoneNumber?: string;
  businessAccountId?: string;
  phoneNumberId?: string;
  accessToken?: string;
  webhookVerifyToken?: string;
  appSecret?: string;
};

export type EmbeddedSignupPayload = {
  code: string;
  phoneNumberId: string;
  wabaId: string;
  name?: string;
};

@Injectable()
export class InstancesService {
  private readonly logger = new Logger(InstancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
    private readonly configService: ConfigService,
  ) {}

  async list(workspaceId: string) {
    const items = await this.prisma.instance.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        _count: {
          select: {
            conversations: true,
            campaigns: true,
          },
        },
      },
    });

    return items.map((item) => this.sanitizeInstance(item));
  }

  async findOne(id: string, workspaceId: string) {
    const item = await this.prisma.instance.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            conversations: true,
            messages: true,
            campaigns: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Instancia nao encontrada.');
    }

    return this.sanitizeInstance(item);
  }

  async create(workspaceId: string, actorId: string, payload: InstancePayload) {
    const existing = await this.prisma.instance.findFirst({
      where: {
        workspaceId,
        name: payload.name,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new BadRequestException('Ja existe uma instancia com este nome.');
    }

    const deletedInstance = await this.prisma.instance.findFirst({
      where: {
        workspaceId,
        name: payload.name,
        NOT: {
          deletedAt: null,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (deletedInstance) {
      await this.prisma.instance.update({
        where: { id: deletedInstance.id },
        data: {
          deletedAt: null,
          createdById: actorId,
          name: payload.name,
          provider: payload.provider ?? InstanceProvider.META_WHATSAPP,
          status: payload.status ?? InstanceStatus.DISCONNECTED,
          mode: payload.mode ?? InstanceMode.DEV,
          appId: payload.appId,
          phoneNumber: payload.phoneNumber,
          businessAccountId: payload.businessAccountId,
          phoneNumberId: payload.phoneNumberId,
          accessTokenEncrypted: this.cryptoService.encrypt(payload.accessToken),
          webhookVerifyTokenEncrypted: this.cryptoService.encrypt(
            payload.webhookVerifyToken,
          ),
          appSecretEncrypted: this.cryptoService.encrypt(payload.appSecret),
          lastSyncAt:
            payload.status === InstanceStatus.CONNECTED ? new Date() : null,
        },
      });

      return this.findOne(deletedInstance.id, workspaceId);
    }

    const instance = await this.prisma.instance.create({
      data: {
        workspaceId,
        createdById: actorId,
        name: payload.name,
        provider: payload.provider ?? InstanceProvider.META_WHATSAPP,
        status: payload.status ?? InstanceStatus.DISCONNECTED,
        mode: payload.mode ?? InstanceMode.DEV,
        appId: payload.appId,
        phoneNumber: payload.phoneNumber,
        businessAccountId: payload.businessAccountId,
        phoneNumberId: payload.phoneNumberId,
        accessTokenEncrypted: this.cryptoService.encrypt(payload.accessToken),
        webhookVerifyTokenEncrypted: this.cryptoService.encrypt(
          payload.webhookVerifyToken,
        ),
        appSecretEncrypted: this.cryptoService.encrypt(payload.appSecret),
      },
    });

    return this.findOne(instance.id, workspaceId);
  }

  async update(
    id: string,
    workspaceId: string,
    payload: Partial<InstancePayload>,
  ) {
    const instance = await this.prisma.instance.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!instance) {
      throw new NotFoundException('Instancia nao encontrada.');
    }

    await this.prisma.instance.update({
      where: { id },
      data: {
        name: payload.name ?? instance.name,
        provider: payload.provider ?? instance.provider,
        status: payload.status ?? instance.status,
        mode: payload.mode ?? instance.mode,
        appId: payload.appId ?? instance.appId,
        phoneNumber: payload.phoneNumber ?? instance.phoneNumber,
        businessAccountId:
          payload.businessAccountId ?? instance.businessAccountId,
        phoneNumberId: payload.phoneNumberId ?? instance.phoneNumberId,
        accessTokenEncrypted:
          payload.accessToken !== undefined
            ? this.cryptoService.encrypt(payload.accessToken)
            : instance.accessTokenEncrypted,
        webhookVerifyTokenEncrypted:
          payload.webhookVerifyToken !== undefined
            ? this.cryptoService.encrypt(payload.webhookVerifyToken)
            : instance.webhookVerifyTokenEncrypted,
        appSecretEncrypted:
          payload.appSecret !== undefined
            ? this.cryptoService.encrypt(payload.appSecret)
            : instance.appSecretEncrypted,
        lastSyncAt:
          payload.status === InstanceStatus.CONNECTED
            ? new Date()
            : instance.lastSyncAt,
      },
    });

    return this.findOne(id, workspaceId);
  }

  async connect(id: string, workspaceId: string) {
    return this.update(id, workspaceId, {
      status: InstanceStatus.CONNECTED,
    });
  }

  async disconnect(id: string, workspaceId: string) {
    return this.update(id, workspaceId, {
      status: InstanceStatus.DISCONNECTED,
    });
  }

  async remove(id: string, workspaceId: string) {
    const instance = await this.prisma.instance.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!instance) {
      throw new NotFoundException('Instancia nao encontrada.');
    }

    await this.prisma.instance.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  async createFromEmbeddedSignup(
    workspaceId: string,
    actorId: string,
    payload: EmbeddedSignupPayload,
  ) {
    const appId = this.configService.get<string>('META_APP_ID');
    const appSecret = this.configService.get<string>('META_APP_SECRET');
    const graphVersion =
      this.configService.get<string>('META_GRAPH_API_VERSION') ?? 'v23.0';

    if (!appId || !appSecret) {
      throw new BadRequestException(
        'META_APP_ID e META_APP_SECRET precisam estar configurados no servidor.',
      );
    }

    // 1. Exchange authorization code for access token
    let accessToken: string;
    try {
      const tokenResponse = await axios.get(
        `https://graph.facebook.com/${graphVersion}/oauth/access_token`,
        {
          params: {
            client_id: appId,
            client_secret: appSecret,
            code: payload.code,
          },
        },
      );
      accessToken = tokenResponse.data.access_token;
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error)
          ? error.response?.data?.error?.message ?? error.message
          : 'Erro desconhecido';
      this.logger.error(`Falha ao trocar codigo por token: ${message}`);
      throw new BadRequestException(
        `Falha ao obter token de acesso do Meta: ${message}`,
      );
    }

    // 2. Fetch phone number details for display name
    let phoneNumber: string | undefined;
    let instanceName = payload.name;
    try {
      const phoneResponse = await axios.get(
        `https://graph.facebook.com/${graphVersion}/${payload.phoneNumberId}`,
        {
          params: {
            access_token: accessToken,
            fields: 'display_phone_number,verified_name',
          },
        },
      );
      phoneNumber = phoneResponse.data.display_phone_number;
      if (!instanceName) {
        instanceName =
          phoneResponse.data.verified_name || phoneNumber || undefined;
      }
    } catch {
      this.logger.warn(
        `Nao foi possivel buscar detalhes do numero ${payload.phoneNumberId}. Continuando sem.`,
      );
    }

    if (!instanceName) {
      instanceName = `WhatsApp ${payload.phoneNumberId}`;
    }

    // 3. Generate a webhook verify token
    const webhookVerifyToken =
      this.configService.get<string>('META_WHATSAPP_WEBHOOK_VERIFY_TOKEN') ??
      randomUUID();

    // 4. Create the instance using existing method
    return this.create(workspaceId, actorId, {
      name: instanceName,
      provider: InstanceProvider.META_WHATSAPP,
      status: InstanceStatus.CONNECTED,
      mode: InstanceMode.PRODUCTION,
      appId,
      phoneNumber,
      businessAccountId: payload.wabaId,
      phoneNumberId: payload.phoneNumberId,
      accessToken,
      webhookVerifyToken,
      appSecret,
    });
  }

  getEmbeddedSignupConfig() {
    const appId = this.configService.get<string>('META_APP_ID');
    if (!appId) {
      throw new BadRequestException(
        'META_APP_ID nao configurado no servidor.',
      );
    }
    return { appId };
  }

  sanitizeInstance<
    T extends {
      accessTokenEncrypted?: string | null;
      webhookVerifyTokenEncrypted?: string | null;
      appSecretEncrypted?: string | null;
    },
  >(instance: T) {
    const accessTokenMasked = this.maskStoredSecret(
      instance.accessTokenEncrypted,
    );
    const webhookVerifyTokenMasked = this.maskStoredSecret(
      instance.webhookVerifyTokenEncrypted,
    );
    const appSecretMasked = this.maskStoredSecret(instance.appSecretEncrypted);

    return {
      ...instance,
      accessTokenMasked,
      webhookVerifyTokenMasked,
      appSecretMasked,
      accessTokenEncrypted: undefined,
      webhookVerifyTokenEncrypted: undefined,
      appSecretEncrypted: undefined,
    };
  }

  private maskStoredSecret(encryptedValue?: string | null) {
    if (!encryptedValue) {
      return null;
    }

    try {
      const decryptedValue = this.cryptoService.decrypt(encryptedValue);
      const safeValue = this.normalizeSecretForDisplay(decryptedValue);

      if (safeValue) {
        return this.maskSecret(safeValue);
      }
    } catch {
      // Fallback below returns a generic mask when legacy data can not be decrypted.
    }

    return '********';
  }

  private normalizeSecretForDisplay(value?: string | null) {
    if (!value) {
      return null;
    }

    const normalizedValue = value.replace(/[^\x20-\x7E]/g, '').trim();

    if (!normalizedValue) {
      return null;
    }

    return normalizedValue;
  }

  private maskSecret(value: string) {
    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }

    return `${value.slice(0, 4)}${'*'.repeat(Math.max(value.length - 8, 4))}${value.slice(-4)}`;
  }
}
