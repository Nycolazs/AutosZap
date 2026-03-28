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
import { WhatsAppMediaStorageService } from '../integrations/whatsapp/whatsapp-media-storage.service';
import { getWhatsAppProviderCapabilities } from '../integrations/whatsapp/whatsapp-provider-capabilities';

type InstancePayload = {
  name: string;
  provider?: InstanceProvider;
  status?: InstanceStatus;
  mode?: InstanceMode;
  externalInstanceId?: string;
  appId?: string;
  phoneNumber?: string;
  businessAccountId?: string;
  phoneNumberId?: string;
  accessToken?: string;
  webhookVerifyToken?: string;
  appSecret?: string;
  providerConfig?: Record<string, unknown> | null;
  providerMetadata?: Record<string, unknown> | null;
  providerSessionState?: Record<string, unknown> | null;
};

export type EmbeddedSignupPayload = {
  code: string;
  phoneNumberId: string;
  wabaId: string;
  name?: string;
};

type EmbeddedSignupUpsertResult = {
  instanceId: string;
  reusedExistingInstance: boolean;
};

type MetaEmbeddedSignupTokenResponse = {
  access_token: string;
};

type MetaGraphErrorResponse = {
  error?: {
    message?: string;
  };
};

type MetaPhoneNumberResponse = {
  display_phone_number?: string;
  verified_name?: string;
};

@Injectable()
export class InstancesService {
  private readonly logger = new Logger(InstancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
    private readonly configService: ConfigService,
    private readonly mediaStorageService: WhatsAppMediaStorageService,
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
          externalInstanceId: payload.externalInstanceId,
          appId: payload.appId,
          phoneNumber: payload.phoneNumber,
          businessAccountId: payload.businessAccountId,
          phoneNumberId: payload.phoneNumberId,
          providerConfig: payload.providerConfig as never,
          providerMetadata: payload.providerMetadata as never,
          providerSessionState: payload.providerSessionState as never,
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
        externalInstanceId: payload.externalInstanceId,
        appId: payload.appId,
        phoneNumber: payload.phoneNumber,
        businessAccountId: payload.businessAccountId,
        phoneNumberId: payload.phoneNumberId,
        providerConfig: payload.providerConfig as never,
        providerMetadata: payload.providerMetadata as never,
        providerSessionState: payload.providerSessionState as never,
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

    const normalizedName =
      payload.name !== undefined ? payload.name.trim() : undefined;

    if (payload.name !== undefined && !normalizedName) {
      throw new BadRequestException('Informe um nome para a instancia.');
    }

    if (normalizedName && normalizedName !== instance.name) {
      const existing = await this.prisma.instance.findFirst({
        where: {
          workspaceId,
          name: normalizedName,
          deletedAt: null,
          NOT: {
            id,
          },
        },
      });

      if (existing) {
        throw new BadRequestException('Ja existe uma instancia com este nome.');
      }

      const deletedInstance = await this.prisma.instance.findFirst({
        where: {
          workspaceId,
          name: normalizedName,
          NOT: {
            deletedAt: null,
            id,
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      if (deletedInstance) {
        throw new BadRequestException(
          'Ja existe uma instancia removida com este nome. Escolha outro nome.',
        );
      }
    }

    await this.prisma.instance.update({
      where: { id },
      data: {
        name: normalizedName ?? instance.name,
        provider: payload.provider ?? instance.provider,
        status: payload.status ?? instance.status,
        mode: payload.mode ?? instance.mode,
        externalInstanceId:
          payload.externalInstanceId ?? instance.externalInstanceId,
        appId: payload.appId ?? instance.appId,
        phoneNumber: payload.phoneNumber ?? instance.phoneNumber,
        businessAccountId:
          payload.businessAccountId ?? instance.businessAccountId,
        phoneNumberId: payload.phoneNumberId ?? instance.phoneNumberId,
        providerConfig:
          payload.providerConfig !== undefined
            ? (payload.providerConfig as never)
            : undefined,
        providerMetadata:
          payload.providerMetadata !== undefined
            ? (payload.providerMetadata as never)
            : undefined,
        providerSessionState:
          payload.providerSessionState !== undefined
            ? (payload.providerSessionState as never)
            : undefined,
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

    await this.deleteInstanceMediaFiles(instance.workspaceId, instance.id);

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
  ): Promise<EmbeddedSignupUpsertResult> {
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
      const tokenResponse = await axios.get<MetaEmbeddedSignupTokenResponse>(
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
      const message = axios.isAxiosError<MetaGraphErrorResponse>(error)
        ? (error.response?.data?.error?.message ?? error.message)
        : 'Erro desconhecido';
      this.logger.error(`Falha ao trocar codigo por token: ${message}`);
      throw new BadRequestException(
        `Falha ao obter token de acesso do Meta: ${message}`,
      );
    }

    // 2. Fetch phone number details for display name
    let phoneNumber: string | undefined;
    let instanceName = payload.name?.trim() || undefined;
    try {
      const phoneResponse = await axios.get<MetaPhoneNumberResponse>(
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

    const existingInstance =
      await this.findEmbeddedSignupInstanceByPhoneNumberId(
        workspaceId,
        payload.phoneNumberId,
      );
    const resolvedInstanceName = await this.resolveAvailableInstanceName(
      workspaceId,
      instanceName,
      existingInstance?.id,
    );

    // Generate or preserve a verify token so webhook verification remains stable.
    const webhookVerifyToken =
      this.cryptoService.decrypt(
        existingInstance?.webhookVerifyTokenEncrypted,
      ) ??
      this.configService.get<string>('META_WHATSAPP_WEBHOOK_VERIFY_TOKEN') ??
      randomUUID();

    const instanceData = {
      name: resolvedInstanceName,
      provider: InstanceProvider.META_WHATSAPP,
      status: InstanceStatus.CONNECTED,
      mode: InstanceMode.PRODUCTION,
      appId,
      phoneNumber,
      businessAccountId: payload.wabaId,
      phoneNumberId: payload.phoneNumberId,
      accessTokenEncrypted: this.cryptoService.encrypt(accessToken),
      webhookVerifyTokenEncrypted:
        this.cryptoService.encrypt(webhookVerifyToken),
      appSecretEncrypted: this.cryptoService.encrypt(appSecret),
      lastSyncAt: new Date(),
    };

    if (existingInstance) {
      await this.prisma.instance.update({
        where: { id: existingInstance.id },
        data: {
          ...instanceData,
          deletedAt: null,
          createdById:
            existingInstance.deletedAt !== null
              ? actorId
              : existingInstance.createdById,
        },
      });

      return {
        instanceId: existingInstance.id,
        reusedExistingInstance: true,
      };
    }

    const createdInstance = await this.prisma.instance.create({
      data: {
        workspaceId,
        createdById: actorId,
        ...instanceData,
      },
    });

    return {
      instanceId: createdInstance.id,
      reusedExistingInstance: false,
    };
  }

  getEmbeddedSignupConfig() {
    const appId = this.configService.get<string>('META_APP_ID');
    const configurationId = this.configService.get<string>(
      'META_EMBEDDED_SIGNUP_CONFIG_ID',
    );
    if (!appId) {
      throw new BadRequestException('META_APP_ID nao configurado no servidor.');
    }
    if (!configurationId) {
      throw new BadRequestException(
        'META_EMBEDDED_SIGNUP_CONFIG_ID nao configurado no servidor.',
      );
    }

    return {
      appId,
      configurationId,
      graphApiVersion:
        this.configService.get<string>('META_GRAPH_API_VERSION') ?? 'v23.0',
      callbackUri: this.buildEmbeddedSignupCallbackUri(),
    };
  }

  sanitizeInstance<
    T extends {
      provider: InstanceProvider;
      status: InstanceStatus;
      externalInstanceId?: string | null;
      providerConfig?: unknown;
      providerMetadata?: unknown;
      providerSessionState?: unknown;
      qrCode?: string | null;
      qrCodeExpiresAt?: Date | null;
      connectedAt?: Date | null;
      lastSeenAt?: Date | null;
      accessTokenEncrypted?: string | null;
      webhookVerifyTokenEncrypted?: string | null;
      appSecretEncrypted?: string | null;
      internalWebhookSecretEncrypted?: string | null;
    },
  >(instance: T) {
    const accessTokenMasked = this.maskStoredSecret(
      instance.accessTokenEncrypted,
    );
    const webhookVerifyTokenMasked = this.maskStoredSecret(
      instance.webhookVerifyTokenEncrypted,
    );
    const appSecretMasked = this.maskStoredSecret(instance.appSecretEncrypted);
    const providerCapabilities = getWhatsAppProviderCapabilities(
      instance.provider,
    );
    const connectionState = this.buildConnectionState(instance);
    const qr = this.buildQrState(
      instance,
      connectionState?.phase ?? 'DISCONNECTED',
    );

    return {
      ...instance,
      providerCapabilities,
      connectionState,
      qr,
      accessTokenMasked,
      webhookVerifyTokenMasked,
      appSecretMasked,
      accessTokenEncrypted: undefined,
      webhookVerifyTokenEncrypted: undefined,
      appSecretEncrypted: undefined,
      internalWebhookSecretEncrypted: undefined,
    };
  }

  private async deleteInstanceMediaFiles(
    workspaceId: string,
    instanceId: string,
  ) {
    let cursorId: string | undefined;

    while (true) {
      const messages = await this.prisma.conversationMessage.findMany({
        where: {
          workspaceId,
          OR: [
            { instanceId },
            {
              conversation: {
                instanceId,
              },
            },
          ],
        },
        select: {
          id: true,
          metadata: true,
        },
        orderBy: {
          id: 'asc',
        },
        take: 200,
        ...(cursorId
          ? {
              cursor: {
                id: cursorId,
              },
              skip: 1,
            }
          : {}),
      });

      if (!messages.length) {
        break;
      }

      const storagePaths = new Set<string>();

      for (const message of messages) {
        for (const storagePath of this.extractMediaStoragePaths(
          message.metadata,
        )) {
          storagePaths.add(storagePath);
        }
      }

      if (storagePaths.size) {
        await Promise.all(
          Array.from(storagePaths).map((storagePath) =>
            this.mediaStorageService.delete(storagePath),
          ),
        );
      }

      cursorId = messages.at(-1)?.id;
    }
    await this.mediaStorageService.deleteInstanceDirectory(
      workspaceId,
      instanceId,
    );
  }

  private extractMediaStoragePaths(metadata: unknown) {
    const storagePaths = new Set<string>();

    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return storagePaths;
    }

    const root = metadata as Record<string, unknown>;
    const directPath =
      typeof root.storagePath === 'string' ? root.storagePath.trim() : '';

    if (directPath) {
      storagePaths.add(directPath);
    }

    const media =
      root.media && typeof root.media === 'object' && !Array.isArray(root.media)
        ? (root.media as Record<string, unknown>)
        : null;
    const nestedPath =
      typeof media?.storagePath === 'string' ? media.storagePath.trim() : '';

    if (nestedPath) {
      storagePaths.add(nestedPath);
    }

    return storagePaths;
  }

  private buildConnectionState(instance: {
    provider: InstanceProvider;
    status: InstanceStatus;
    externalInstanceId?: string | null;
    providerSessionState?: unknown;
    qrCode?: string | null;
    qrCodeExpiresAt?: Date | null;
    connectedAt?: Date | null;
    lastSeenAt?: Date | null;
  }) {
    const providerSessionState = this.toRecord(instance.providerSessionState);
    const phase = this.resolveConnectionPhase(
      instance.provider,
      instance.status,
      providerSessionState,
    );

    return {
      phase,
      healthy: instance.status === InstanceStatus.CONNECTED,
      detail:
        this.pickString(
          providerSessionState?.lastError,
          providerSessionState?.detail,
        ) ?? null,
      connectedAt: instance.connectedAt ?? null,
      lastSeenAt: instance.lastSeenAt ?? null,
      qrCode:
        this.pickString(providerSessionState?.qrCode, instance.qrCode) ?? null,
      qrCodeExpiresAt:
        instance.qrCodeExpiresAt ??
        this.parseDate(providerSessionState?.qrCodeExpiresAt),
      sessionId:
        this.pickString(
          providerSessionState?.sessionId,
          instance.externalInstanceId,
        ) ?? null,
      transport:
        instance.provider === InstanceProvider.WHATSAPP_WEB
          ? 'WHATSAPP_WEB_GATEWAY'
          : 'META_CLOUD_API',
      raw: providerSessionState,
    };
  }

  private buildQrState(
    instance: {
      provider: InstanceProvider;
      status: InstanceStatus;
      providerSessionState?: unknown;
      qrCode?: string | null;
      qrCodeExpiresAt?: Date | null;
    },
    phase: string,
  ) {
    const providerSessionState = this.toRecord(instance.providerSessionState);
    const qrCode =
      this.pickString(providerSessionState?.qrCode, instance.qrCode) ?? null;
    const qrCodeExpiresAt =
      instance.qrCodeExpiresAt ??
      this.parseDate(providerSessionState?.qrCodeExpiresAt);
    const now = Date.now();
    const expiresAtMs = qrCodeExpiresAt?.getTime() ?? null;

    let status: 'NONE' | 'PENDING' | 'READY' | 'EXPIRED' | 'SCANNED' | 'ERROR' =
      'NONE';

    if (instance.status === InstanceStatus.ERROR) {
      status = 'ERROR';
    } else if (phase === 'AUTHENTICATING' || phase === 'QR_SCANNED') {
      status = 'SCANNED';
    } else if (qrCode && expiresAtMs && expiresAtMs < now) {
      status = 'EXPIRED';
    } else if (qrCode) {
      status = 'READY';
    } else if (phase === 'CONNECTING') {
      status = 'PENDING';
    }

    return {
      status,
      qrCode,
      qrCodeExpiresAt,
      raw: providerSessionState,
    };
  }

  private resolveConnectionPhase(
    provider: InstanceProvider,
    status: InstanceStatus,
    providerSessionState?: Record<string, unknown> | null,
  ) {
    if (provider === InstanceProvider.WHATSAPP_WEB) {
      const state = this.pickString(providerSessionState?.state)?.toUpperCase();

      switch (state) {
        case 'QR_READY':
          return 'QR_PENDING';
        case 'AUTHENTICATED':
          return 'AUTHENTICATING';
        case 'CONNECTED':
          return 'CONNECTED';
        case 'STARTING':
          return 'CONNECTING';
        case 'RECONNECTING':
          return 'RECONNECTING';
        case 'LOGGED_OUT':
          return 'LOGGED_OUT';
        case 'ERROR':
          return 'ERROR';
        case 'STOPPED':
          return 'LOGGED_OUT';
        case 'DISCONNECTED':
        default:
          return status === InstanceStatus.CONNECTED
            ? 'CONNECTED'
            : status === InstanceStatus.SYNCING
              ? 'CONNECTING'
              : status === InstanceStatus.ERROR
                ? 'ERROR'
                : 'DISCONNECTED';
      }
    }

    if (status === InstanceStatus.CONNECTED) {
      return 'CONNECTED';
    }

    if (status === InstanceStatus.SYNCING) {
      return 'CONNECTING';
    }

    if (status === InstanceStatus.ERROR) {
      return 'ERROR';
    }

    return 'DISCONNECTED';
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

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private pickString(...values: unknown[]) {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private parseDate(value: unknown) {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private maskSecret(value: string) {
    if (value.length <= 8) {
      return '*'.repeat(value.length);
    }

    return `${value.slice(0, 4)}${'*'.repeat(Math.max(value.length - 8, 4))}${value.slice(-4)}`;
  }

  private buildEmbeddedSignupCallbackUri() {
    const backendPublicUrl = this.normalizeBaseUrl(
      this.configService.get<string>('BACKEND_PUBLIC_URL'),
    );

    return backendPublicUrl
      ? `${backendPublicUrl}/api/webhooks/meta/whatsapp`
      : null;
  }

  private async findEmbeddedSignupInstanceByPhoneNumberId(
    workspaceId: string,
    phoneNumberId: string,
  ) {
    const activeInstance = await this.prisma.instance.findFirst({
      where: {
        workspaceId,
        phoneNumberId,
        deletedAt: null,
      },
    });

    if (activeInstance) {
      return activeInstance;
    }

    return this.prisma.instance.findFirst({
      where: {
        workspaceId,
        phoneNumberId,
        NOT: {
          deletedAt: null,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  private async resolveAvailableInstanceName(
    workspaceId: string,
    preferredName: string,
    ignoreInstanceId?: string,
  ) {
    const baseName = preferredName.trim() || 'WhatsApp';
    let candidateName = baseName;
    let sequence = 2;

    while (true) {
      const duplicate = await this.prisma.instance.findFirst({
        where: {
          workspaceId,
          name: candidateName,
          deletedAt: null,
          ...(ignoreInstanceId
            ? {
                NOT: {
                  id: ignoreInstanceId,
                },
              }
            : {}),
        },
        select: {
          id: true,
        },
      });

      if (!duplicate) {
        return candidateName;
      }

      candidateName = `${baseName} (${sequence})`;
      sequence += 1;
    }
  }

  private normalizeBaseUrl(value?: string | null) {
    const normalizedValue = value?.trim();
    return normalizedValue ? normalizedValue.replace(/\/+$/, '') : null;
  }
}
