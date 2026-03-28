import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InstanceProvider,
  InstanceStatus,
  Prisma,
  WebhookEventType,
} from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantConnectionService } from '../../../common/tenancy/tenant-connection.service';
import { WhatsAppMessagingService } from '../whatsapp/whatsapp-messaging.service';
import {
  WhatsAppWebGatewayClient,
  WhatsAppWebGatewayHistorySyncCanceledError,
} from './whatsapp-web-gateway.client';
import type {
  WhatsAppWebGatewayEventEnvelope,
  WhatsAppWebGatewayHistorySyncResult,
  WhatsAppWebGatewayMessageBatchPayload,
  WhatsAppWebGatewayQrState,
  WhatsAppWebGatewayState,
} from './whatsapp-web.types';

@Injectable()
export class WhatsAppWebService {
  private readonly logger = new Logger(WhatsAppWebService.name);
  private readonly autoHistorySyncPromises = new Map<string, Promise<void>>();
  private readonly autoHistorySyncRetryCooldownUntil = new Map<
    string,
    number
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly gatewayClient: WhatsAppWebGatewayClient,
    private readonly messagingService: WhatsAppMessagingService,
  ) {}

  async testConnection(workspaceId: string, instanceId: string) {
    const instance = await this.getInstanceOrThrow(instanceId, workspaceId);
    await this.registerInstance(instance);
    const state = await this.gatewayClient.getState(instance.id);

    return {
      healthy: state.status === 'connected' || state.status === 'authenticated',
      simulated: false,
      detail: state.lastError ?? state.status,
      raw: state,
    };
  }

  async syncInstance(workspaceId: string, instanceId: string) {
    const instance = await this.getInstanceOrThrow(instanceId, workspaceId);
    await this.registerInstance(instance);
    const state = await this.gatewayClient.getState(instance.id);
    await this.updateInstanceFromGatewayState(instance.id, state);

    if (state.status !== 'connected') {
      return this.serializeGatewayState(state);
    }

    await this.markHistorySyncStarted(instance.id, 'manual');

    try {
      const historySync = await this.gatewayClient.syncHistory(instance.id);
      await this.updateHistorySyncSnapshot(instance, state.status, historySync);

      return this.serializeGatewayState(state, historySync);
    } catch (error) {
      if (error instanceof WhatsAppWebGatewayHistorySyncCanceledError) {
        await this.markHistorySyncCanceled(instance.id, 'manual');
      } else {
        await this.markHistorySyncFailed(
          instance.id,
          error instanceof Error ? error.message : 'Falha desconhecida.',
          'manual',
        );
      }

      throw error;
    }
  }

  async connect(workspaceId: string, instanceId: string) {
    const instance = await this.getInstanceOrThrow(instanceId, workspaceId);
    await this.registerInstance(instance, { autoStart: true });
    const state = await this.gatewayClient.connect(instance.id);
    await this.updateInstanceFromGatewayState(instance.id, state);
    return this.serializeGatewayState(state);
  }

  async disconnect(workspaceId: string, instanceId: string) {
    const instance = await this.getInstanceOrThrow(instanceId, workspaceId);
    this.cancelHistorySync(instance.id);
    await this.registerInstance(instance);
    const state = await this.gatewayClient.disconnect(instance.id);
    await this.updateInstanceFromGatewayState(instance.id, state);
    return this.serializeGatewayState(state);
  }

  async reconnect(workspaceId: string, instanceId: string) {
    const instance = await this.getInstanceOrThrow(instanceId, workspaceId);
    this.cancelHistorySync(instance.id);
    await this.registerInstance(instance, { autoStart: true });
    const state = await this.gatewayClient.reconnect(instance.id);
    await this.updateInstanceFromGatewayState(instance.id, state);
    return this.serializeGatewayState(state);
  }

  async logout(workspaceId: string, instanceId: string) {
    const instance = await this.getInstanceOrThrow(instanceId, workspaceId);
    this.cancelHistorySync(instance.id);
    await this.registerInstance(instance);
    const state = await this.gatewayClient.logout(instance.id);
    await this.updateInstanceFromGatewayState(instance.id, state);
    return this.serializeGatewayState(state);
  }

  async unregister(workspaceId: string, instanceId: string) {
    const instance = await this.getInstanceOrThrow(instanceId, workspaceId);
    this.cancelHistorySync(instance.id);
    await this.gatewayClient.unregister(instance.id);

    await this.prisma.instance.update({
      where: { id: instance.id },
      data: {
        status: InstanceStatus.DISCONNECTED,
        providerSessionState: {
          state: 'STOPPED',
          desiredState: 'stopped',
          hasSession: false,
        },
        lastSeenAt: new Date(),
      },
    });

    return {
      success: true,
      instanceId: instance.id,
    };
  }

  async getConnectionState(workspaceId: string, instanceId: string) {
    const instance = await this.getInstanceOrThrow(instanceId, workspaceId);
    await this.registerInstance(instance);
    const state = await this.gatewayClient.getState(instance.id);
    await this.updateInstanceFromGatewayState(instance.id, state);
    this.maybeScheduleConnectedHistorySync(instance, state, 'connection-state');
    return this.serializeGatewayState(state);
  }

  async getQr(workspaceId: string, instanceId: string) {
    const instance = await this.getInstanceOrThrow(instanceId, workspaceId);
    await this.registerInstance(instance);
    const qr = await this.gatewayClient.getQr(instance.id);
    await this.updateInstanceFromQrState(instance.id, qr);
    return {
      instanceId: qr.instanceId,
      state: this.mapGatewayStateValue(qr.status),
      qrCode: qr.qrDataUrl ?? qr.qr ?? null,
      qrRaw: qr.qr ?? null,
      qrCodeExpiresAt: qr.qrExpiresAt ?? null,
    };
  }

  async refreshQr(workspaceId: string, instanceId: string) {
    const instance = await this.getInstanceOrThrow(instanceId, workspaceId);
    await this.registerInstance(instance, { autoStart: true });
    const state = await this.gatewayClient.refreshQr(instance.id);
    await this.updateInstanceFromGatewayState(instance.id, state);
    return this.serializeGatewayState(state);
  }

  async handleGatewayEvent(
    payload: WhatsAppWebGatewayEventEnvelope,
    context: {
      signature?: string;
      timestamp?: string;
      instanceId?: string;
      rawBody?: Buffer;
    },
  ) {
    const instanceId = context.instanceId?.trim() || payload.instanceId?.trim();

    if (!instanceId) {
      throw new BadRequestException(
        'Evento interno do gateway sem identificador de instancia.',
      );
    }

    this.assertGatewaySignature(
      instanceId,
      context.signature,
      context.timestamp,
      context.rawBody,
    );

    const tenantResolution =
      await this.tenantConnectionService.resolveTenantByInstanceId(instanceId);

    if (tenantResolution?.companyId) {
      return this.prisma.runWithTenant(tenantResolution.companyId, () =>
        this.handleGatewayEventInTenantContext(instanceId, payload),
      );
    }

    this.logger.warn(
      `Tenant nao encontrado para a instancia ${instanceId} (evento: ${payload.event}). Processando no contexto padrao (modo legado).`,
    );

    return this.handleGatewayEventInTenantContext(instanceId, payload);
  }

  private async handleGatewayEventInTenantContext(
    instanceId: string,
    payload: WhatsAppWebGatewayEventEnvelope,
  ) {
    const instance = await this.prisma.instance.findFirst({
      where: {
        id: instanceId,
        provider: InstanceProvider.WHATSAPP_WEB,
        deletedAt: null,
      },
    });

    if (!instance) {
      throw new NotFoundException('Instancia WhatsApp Web nao encontrada.');
    }

    const webhookEvent = await this.prisma.whatsAppWebhookEvent.create({
      data: {
        workspaceId: instance.workspaceId,
        instanceId: instance.id,
        externalId: payload.instanceId,
        eventType: this.mapGatewayEventType(payload.event),
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });

    const stateUpdate = this.buildInstanceStateUpdate(
      instance.id,
      payload.event,
      payload.data,
    );
    if (stateUpdate) {
      await this.prisma.instance.update({
        where: { id: instance.id },
        data: stateUpdate,
      });
    }

    if (payload.event === 'message.inbound') {
      if (this.shouldIgnoreInboundPayload(payload.data)) {
        this.logger.warn(
          `Ignorando inbound nao privado do WhatsApp para a instancia ${instance.id}; apenas chats privados devem ser salvos como mensagem.`,
        );
      } else {
        await this.messagingService.processIncomingPayload({
          messages: [this.mapInboundEvent(instance.id, payload.data)],
          statuses: [],
        });
      }
    }

    if (payload.event === 'messages.batch') {
      const batchPayload = this.readMessageBatchPayload(payload.data);

      await this.messagingService.processIncomingPayload({
        messages: batchPayload.messages
          .filter((message) => {
            const shouldIgnore = this.shouldIgnoreInboundPayload(message);

            if (shouldIgnore) {
              this.logger.warn(
                `Ignorando item nao privado do lote sincronizado do WhatsApp para a instancia ${instance.id}.`,
              );
            }

            return !shouldIgnore;
          })
          .map((message) => this.mapInboundEvent(instance.id, message)),
        statuses: batchPayload.statuses.map((status) =>
          this.mapStatusEvent(instance.id, status),
        ),
        historical: true,
      });
    }

    if (payload.event === 'message.status') {
      await this.messagingService.processIncomingPayload({
        messages: [],
        statuses: [this.mapStatusEvent(instance.id, payload.data)],
      });
    }

    if (payload.event === 'session.connected') {
      this.maybeScheduleConnectedHistorySync(
        instance,
        {
          status: 'connected',
          connectedAt:
            typeof payload.data.connectedAt === 'string'
              ? payload.data.connectedAt
              : new Date().toISOString(),
        },
        'session.connected',
      );
    }

    await this.prisma.whatsAppWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        processedAt: new Date(),
      },
    });

    return {
      success: true,
      event: payload.event,
      instanceId,
    };
  }

  private mapInboundEvent(
    instanceId: string,
    payload: Record<string, unknown>,
  ) {
    const isFromMe = payload.fromMe === true;
    const normalizedFrom = this.readGatewayString(payload.from);
    const normalizedTo = this.readGatewayString(payload.to);
    const media =
      payload.media &&
      typeof payload.media === 'object' &&
      !Array.isArray(payload.media)
        ? (payload.media as Record<string, unknown>)
        : null;
    const profileName = this.readGatewayString(
      payload.profileName,
      payload.contactName,
      payload.pushName,
      payload.pushname,
      payload.notifyName,
      payload.shortName,
    );

    return {
      instanceId,
      from:
        (isFromMe ? normalizedTo : normalizedFrom) ??
        normalizedFrom ??
        normalizedTo ??
        '',
      profileName,
      externalMessageId:
        typeof payload.messageId === 'string'
          ? payload.messageId
          : `${instanceId}:${Date.now()}`,
      messageType: typeof payload.type === 'string' ? payload.type : 'text',
      body: typeof payload.body === 'string' ? payload.body : '',
      timestamp:
        typeof payload.timestamp === 'number'
          ? String(Math.floor(payload.timestamp / 1000))
          : typeof payload.timestamp === 'string'
            ? String(Math.floor(new Date(payload.timestamp).getTime() / 1000))
            : undefined,
      metadata: {
        provider: 'WHATSAPP_WEB',
        ack: payload.ack,
        voice: payload.voice === true,
        durationSeconds:
          typeof payload.durationSeconds === 'number'
            ? payload.durationSeconds
            : null,
        quotedMessageId: payload.quotedMessageId,
        fromMe: isFromMe,
        providerMessageContext: {
          isStatus: payload.isStatus === true,
          isGroupMsg: payload.isGroupMsg === true,
          isPrivateChat: payload.isPrivateChat !== false,
          fromMe: isFromMe,
          broadcast: payload.broadcast === true,
          messageType: typeof payload.type === 'string' ? payload.type : null,
          remoteJid: this.readGatewayString(payload.remoteJid),
          fromRaw: this.readGatewayString(payload.fromRaw),
          toRaw: this.readGatewayString(payload.toRaw),
        },
        contact: {
          profileName,
          phone: this.readGatewayString(payload.contactPhone),
          contactName: this.readGatewayString(payload.contactName),
          pushName: this.readGatewayString(payload.pushName, payload.pushname),
          notifyName: this.readGatewayString(payload.notifyName),
          shortName: this.readGatewayString(payload.shortName),
          profilePictureUrl: this.readGatewayString(
            payload.contactProfilePictureUrl,
          ),
        },
        interactive:
          typeof payload.quotedMessageId === 'string'
            ? {
                replyId: payload.quotedMessageId,
              }
            : undefined,
        ...(media
          ? {
              media: {
                dataBase64:
                  typeof media.dataBase64 === 'string'
                    ? media.dataBase64
                    : null,
                mimeType:
                  typeof media.mimeType === 'string' ? media.mimeType : null,
                fileName:
                  typeof media.fileName === 'string' ? media.fileName : null,
                voice: typeof media.voice === 'boolean' ? media.voice : null,
                durationSeconds:
                  typeof media.durationSeconds === 'number'
                    ? media.durationSeconds
                    : null,
                size: typeof media.size === 'number' ? media.size : null,
                downloadError:
                  typeof media.downloadError === 'string'
                    ? media.downloadError
                    : null,
              },
            }
          : {}),
      },
    };
  }

  private mapStatusEvent(instanceId: string, payload: Record<string, unknown>) {
    return {
      instanceId,
      externalMessageId:
        typeof payload.messageId === 'string' ? payload.messageId : '',
      status: typeof payload.status === 'string' ? payload.status : 'sent',
      timestamp:
        typeof payload.timestamp === 'string' ? payload.timestamp : undefined,
      errors:
        typeof payload.error === 'string'
          ? [
              {
                message: payload.error,
              },
            ]
          : undefined,
    };
  }

  private buildInstanceStateUpdate(
    instanceId: string,
    eventName: string,
    data: Record<string, unknown>,
  ): Prisma.InstanceUpdateInput | null {
    const state = this.deriveGatewayState(instanceId, eventName, data);

    if (!state) {
      return null;
    }

    return this.mapGatewayStateToInstanceUpdate(state);
  }

  private deriveGatewayState(
    instanceId: string,
    eventName: string,
    data: Record<string, unknown>,
  ): WhatsAppWebGatewayState | null {
    if (eventName === 'qr.updated') {
      return {
        instanceId,
        status: 'qr',
        desiredState: 'running',
        hasSession: true,
        qr: typeof data.qr === 'string' ? data.qr : null,
        qrDataUrl: typeof data.qrDataUrl === 'string' ? data.qrDataUrl : null,
        qrExpiresAt:
          typeof data.qrExpiresAt === 'string' ? data.qrExpiresAt : null,
        lastError: null,
        lastSeenAt: new Date().toISOString(),
      };
    }

    if (eventName === 'session.ready') {
      return {
        instanceId,
        status: 'authenticated',
        desiredState: 'running',
        hasSession: true,
        authenticatedAt:
          typeof data.authenticatedAt === 'string'
            ? data.authenticatedAt
            : new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };
    }

    if (eventName === 'session.connected') {
      return {
        instanceId,
        status: 'connected',
        desiredState: 'running',
        hasSession: true,
        profilePictureUrl: this.readGatewayNullableString(
          data,
          'profilePictureUrl',
        ),
        connectedAt:
          typeof data.connectedAt === 'string'
            ? data.connectedAt
            : new Date().toISOString(),
        readyAt:
          typeof data.connectedAt === 'string'
            ? data.connectedAt
            : new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };
    }

    if (eventName === 'session.disconnected') {
      return {
        instanceId,
        status: 'disconnected',
        desiredState: 'stopped',
        hasSession: false,
        lastError:
          typeof data.reason === 'string' ? data.reason : 'disconnected',
        lastSeenAt: new Date().toISOString(),
      };
    }

    if (eventName === 'auth.failure') {
      return {
        instanceId,
        status: 'error',
        desiredState: 'stopped',
        hasSession: false,
        lastError: typeof data.error === 'string' ? data.error : 'auth.failure',
        lastSeenAt: new Date().toISOString(),
      };
    }

    return null;
  }

  private async registerInstance(
    instance: {
      id: string;
      workspaceId: string;
      provider: InstanceProvider;
    },
    options?: {
      autoStart?: boolean;
    },
  ) {
    const callbackUrl = this.resolveGatewayCallbackUrl();

    await this.gatewayClient.registerInstance({
      instanceId: instance.id,
      callbackUrl,
      autoStart: options?.autoStart,
      metadata: {
        source: 'backend',
        workspaceId: instance.workspaceId,
        provider: instance.provider,
      },
    });
  }

  private resolveGatewayCallbackUrl() {
    const explicit = this.configService
      .get<string>('WHATSAPP_WEB_GATEWAY_CALLBACK_URL')
      ?.trim();
    if (explicit) {
      return explicit;
    }

    const internalBase = this.configService
      .get<string>('BACKEND_INTERNAL_BASE_URL')
      ?.trim();
    if (internalBase) {
      return `${internalBase.replace(/\/+$/, '')}/api/internal/whatsapp-web/events`;
    }

    const publicBase = this.configService
      .get<string>('BACKEND_PUBLIC_URL')
      ?.trim();
    if (publicBase) {
      return `${publicBase.replace(/\/+$/, '')}/api/internal/whatsapp-web/events`;
    }

    const port = this.configService.get<string>('PORT')?.trim() || '4000';
    return `http://127.0.0.1:${port}/api/internal/whatsapp-web/events`;
  }

  private async updateInstanceFromGatewayState(
    instanceId: string,
    state: WhatsAppWebGatewayState,
  ) {
    await this.prisma.instance.update({
      where: { id: instanceId },
      data: this.mapGatewayStateToInstanceUpdate(state),
    });
  }

  private async updateInstanceFromQrState(
    instanceId: string,
    qrState: WhatsAppWebGatewayQrState,
  ) {
    await this.prisma.instance.update({
      where: { id: instanceId },
      data: {
        status: this.mapGatewayStatus(qrState.status),
        providerSessionState: {
          state: this.mapGatewayStateValue(qrState.status),
          qrRaw: qrState.qr ?? null,
          qrCode: qrState.qrDataUrl ?? qrState.qr ?? null,
          qrCodeExpiresAt: qrState.qrExpiresAt ?? null,
        },
        qrCode: qrState.qrDataUrl ?? qrState.qr ?? null,
        qrCodeExpiresAt: qrState.qrExpiresAt
          ? new Date(qrState.qrExpiresAt)
          : null,
        lastSyncAt: new Date(),
      },
    });
  }

  private mapGatewayStateToInstanceUpdate(
    state: WhatsAppWebGatewayState,
  ): Prisma.InstanceUpdateInput {
    const normalizedProfilePictureUrl =
      typeof state.profilePictureUrl === 'string' &&
      state.profilePictureUrl.trim()
        ? state.profilePictureUrl.trim()
        : null;
    const shouldSyncProfilePicture = normalizedProfilePictureUrl !== null;

    return {
      status: this.mapGatewayStatus(state.status),
      externalInstanceId: state.instanceId,
      providerSessionState: {
        state: this.mapGatewayStateValue(state.status),
        desiredState: state.desiredState,
        hasSession: state.hasSession,
        qrRaw: state.qr ?? null,
        qrCode: state.qrDataUrl ?? state.qr ?? null,
        qrCodeExpiresAt: state.qrExpiresAt ?? null,
        lastError: state.lastError ?? null,
        authenticatedAt: state.authenticatedAt ?? null,
        readyAt: state.readyAt ?? null,
        profilePictureUrl: normalizedProfilePictureUrl,
      },
      providerMetadata: {
        lastGatewayStatus: state.status,
      },
      qrCode: state.qrDataUrl ?? state.qr ?? null,
      qrCodeExpiresAt: state.qrExpiresAt ? new Date(state.qrExpiresAt) : null,
      connectedAt: state.connectedAt ? new Date(state.connectedAt) : null,
      lastSeenAt: state.lastSeenAt ? new Date(state.lastSeenAt) : new Date(),
      lastSyncAt: new Date(),
      ...(shouldSyncProfilePicture
        ? {
            profilePictureUrl: normalizedProfilePictureUrl,
            profilePictureUpdatedAt: normalizedProfilePictureUrl
              ? new Date()
              : null,
          }
        : {}),
    };
  }

  private mapGatewayStatus(status: WhatsAppWebGatewayState['status']) {
    switch (status) {
      case 'connected':
        return InstanceStatus.CONNECTED;
      case 'starting':
      case 'qr':
      case 'authenticated':
        return InstanceStatus.SYNCING;
      case 'error':
        return InstanceStatus.ERROR;
      case 'disconnected':
      case 'stopped':
      default:
        return InstanceStatus.DISCONNECTED;
    }
  }

  private mapGatewayStateValue(status: WhatsAppWebGatewayState['status']) {
    switch (status) {
      case 'qr':
        return 'QR_READY';
      case 'authenticated':
        return 'AUTHENTICATED';
      case 'connected':
        return 'CONNECTED';
      case 'starting':
        return 'STARTING';
      case 'error':
        return 'ERROR';
      case 'disconnected':
        return 'DISCONNECTED';
      case 'stopped':
      default:
        return 'STOPPED';
    }
  }

  private serializeGatewayState(
    state: WhatsAppWebGatewayState,
    historySync?: WhatsAppWebGatewayHistorySyncResult,
  ) {
    return {
      state: this.mapGatewayStateValue(state.status),
      status: this.mapGatewayStatus(state.status),
      detail: state.lastError ?? state.status,
      desiredState: state.desiredState,
      hasSession: state.hasSession,
      qrCode: state.qrDataUrl ?? state.qr ?? null,
      qrRaw: state.qr ?? null,
      qrCodeExpiresAt: state.qrExpiresAt ?? null,
      lastSeenAt: state.lastSeenAt ?? null,
      connectedAt: state.connectedAt ?? null,
      authenticatedAt: state.authenticatedAt ?? null,
      readyAt: state.readyAt ?? null,
      lastError: state.lastError ?? null,
      profilePictureUrl: state.profilePictureUrl ?? null,
      historySync: historySync
        ? {
            ...historySync,
            detail: this.buildHistorySyncDetail(historySync),
          }
        : undefined,
    };
  }

  private async updateHistorySyncSnapshot(
    instance: {
      id: string;
      providerMetadata?: Prisma.JsonValue | null;
    },
    gatewayStatus: WhatsAppWebGatewayState['status'],
    historySync: WhatsAppWebGatewayHistorySyncResult,
  ) {
    await this.updateActiveInstanceProviderMetadata(
      instance.id,
      (providerMetadata) => ({
        ...(providerMetadata ?? {}),
        lastGatewayStatus: gatewayStatus,
        historySync: {
          ...historySync,
          detail: this.buildHistorySyncDetail(historySync),
          errorCount: historySync.errors.length,
        },
        historySyncJob: {
          ...this.readHistorySyncJob(providerMetadata),
          status: 'COMPLETED',
          finishedAt: new Date().toISOString(),
          detail: this.buildHistorySyncDetail(historySync),
        },
        autoHistorySyncLastError: null,
      }),
      {
        lastSyncAt: new Date(),
      },
    );
  }

  private maybeScheduleConnectedHistorySync(
    instance: {
      id: string;
      providerMetadata?: Prisma.JsonValue | null;
      connectedAt?: Date | null;
    },
    state: {
      status: WhatsAppWebGatewayState['status'];
      connectedAt?: string | null;
    },
    trigger: 'connection-state' | 'session.connected',
  ) {
    if (!this.shouldAutoSyncConnectedHistory(instance, state)) {
      return;
    }

    const syncPromise = this.syncConnectedInstanceHistory(instance, { trigger })
      .catch(() => undefined)
      .finally(() => {
        this.autoHistorySyncPromises.delete(instance.id);
      });

    this.autoHistorySyncPromises.set(instance.id, syncPromise);
  }

  private shouldAutoSyncConnectedHistory(
    instance: {
      id: string;
      providerMetadata?: Prisma.JsonValue | null;
      connectedAt?: Date | null;
    },
    state: {
      status: WhatsAppWebGatewayState['status'];
      connectedAt?: string | null;
    },
  ) {
    if (state.status !== 'connected') {
      return false;
    }

    if (this.autoHistorySyncPromises.has(instance.id)) {
      return false;
    }

    const cooldownUntil = this.autoHistorySyncRetryCooldownUntil.get(
      instance.id,
    );
    if (typeof cooldownUntil === 'number' && cooldownUntil > Date.now()) {
      return false;
    }

    const providerMetadata = this.toRecord(instance.providerMetadata);
    const historySync = this.toRecord(
      providerMetadata?.historySync as Prisma.JsonValue | null | undefined,
    );
    const historyFinishedAt = this.parseTimestamp(historySync?.finishedAt);
    const connectedAt = this.parseTimestamp(
      state.connectedAt ?? instance.connectedAt?.toISOString() ?? null,
    );

    if (
      historyFinishedAt &&
      (!connectedAt || historyFinishedAt >= connectedAt)
    ) {
      return false;
    }

    return true;
  }

  private async syncConnectedInstanceHistory(
    instance: {
      id: string;
      providerMetadata?: Prisma.JsonValue | null;
    },
    options?: {
      trigger?: 'connection-state' | 'session.connected';
    },
  ) {
    await this.markHistorySyncStarted(
      instance.id,
      options?.trigger ?? 'session.connected',
    );

    try {
      const historySync = await this.gatewayClient.syncHistory(instance.id);
      await this.updateHistorySyncSnapshot(instance, 'connected', historySync);
      this.autoHistorySyncRetryCooldownUntil.delete(instance.id);
    } catch (error) {
      if (error instanceof WhatsAppWebGatewayHistorySyncCanceledError) {
        this.autoHistorySyncRetryCooldownUntil.delete(instance.id);
        await this.markHistorySyncCanceled(
          instance.id,
          options?.trigger ?? 'session.connected',
        );
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : 'Falha desconhecida.';
      this.autoHistorySyncRetryCooldownUntil.set(
        instance.id,
        Date.now() + 60_000,
      );

      this.logger.warn(
        `Falha ao sincronizar o historico QR da instancia ${instance.id} via ${
          options?.trigger ?? 'session.connected'
        }: ${errorMessage}`,
      );

      await this.markHistorySyncFailed(
        instance.id,
        errorMessage,
        options?.trigger ?? 'session.connected',
      );

      throw error;
    }
  }

  private cancelHistorySync(instanceId: string) {
    this.gatewayClient.cancelSyncHistory(instanceId);
    this.autoHistorySyncPromises.delete(instanceId);
    this.autoHistorySyncRetryCooldownUntil.delete(instanceId);
  }

  private async markHistorySyncStarted(instanceId: string, trigger: string) {
    await this.updateActiveInstanceProviderMetadata(instanceId, (providerMetadata) => ({
      ...(providerMetadata ?? {}),
      historySyncJob: {
        ...this.readHistorySyncJob(providerMetadata),
        status: 'RUNNING',
        startedAt: new Date().toISOString(),
        finishedAt: null,
        trigger,
        detail:
          'Sincronizando conversas privadas e midias antigas do WhatsApp Web.',
      },
      autoHistorySyncLastError: null,
    }));
  }

  private async markHistorySyncFailed(
    instanceId: string,
    errorMessage: string,
    trigger: string,
  ) {
    await this.updateActiveInstanceProviderMetadata(instanceId, (providerMetadata) => ({
      ...(providerMetadata ?? {}),
      historySyncJob: {
        ...this.readHistorySyncJob(providerMetadata),
        status: 'FAILED',
        finishedAt: new Date().toISOString(),
        trigger,
        detail: errorMessage,
      },
      autoHistorySyncLastError: errorMessage,
    }));
  }

  private async markHistorySyncCanceled(instanceId: string, trigger: string) {
    await this.updateActiveInstanceProviderMetadata(instanceId, (providerMetadata) => ({
      ...(providerMetadata ?? {}),
      historySyncJob: {
        ...this.readHistorySyncJob(providerMetadata),
        status: 'CANCELED',
        finishedAt: new Date().toISOString(),
        trigger,
        detail:
          'Sincronizacao interrompida porque a sessao foi encerrada ou a instancia foi removida.',
      },
    }));
  }

  private async updateActiveInstanceProviderMetadata(
    instanceId: string,
    updater: (
      providerMetadata: Record<string, unknown> | null,
    ) => Record<string, unknown>,
    options?: {
      lastSyncAt?: Date;
    },
  ) {
    const currentInstance = await this.prisma.instance.findFirst({
      where: {
        id: instanceId,
        deletedAt: null,
      },
      select: {
        providerMetadata: true,
      },
    });

    if (!currentInstance) {
      return false;
    }

    const nextProviderMetadata = updater(
      this.toRecord(currentInstance.providerMetadata),
    );
    const updateResult = await this.prisma.instance.updateMany({
      where: {
        id: instanceId,
        deletedAt: null,
      },
      data: {
        providerMetadata: nextProviderMetadata as never,
        ...(options?.lastSyncAt ? { lastSyncAt: options.lastSyncAt } : {}),
      },
    });

    return updateResult.count > 0;
  }

  private readHistorySyncJob(providerMetadata: Record<string, unknown> | null) {
    return this.toRecord(
      providerMetadata?.historySyncJob as Prisma.JsonValue | null | undefined,
    );
  }

  private buildHistorySyncDetail(
    historySync: WhatsAppWebGatewayHistorySyncResult,
  ) {
    const baseDetail =
      `Historico processado: ${historySync.messagesDiscovered} mensagens privadas em ` +
      `${historySync.chatsSynced} conversas (${historySync.outboundMessages} enviadas, ` +
      `${historySync.inboundMessages} recebidas).`;

    if (!historySync.errors.length) {
      return baseDetail;
    }

    return `${baseDetail} ${historySync.errors.length} conversa(s) tiveram falhas parciais.`;
  }

  private mapGatewayEventType(eventName: string) {
    if (eventName === 'message.inbound') {
      return WebhookEventType.MESSAGE;
    }

    if (eventName === 'messages.batch') {
      return WebhookEventType.MESSAGE;
    }

    if (eventName === 'message.status') {
      return WebhookEventType.STATUS;
    }

    return WebhookEventType.OTHER;
  }

  private assertGatewaySignature(
    instanceId: string,
    signature: string | undefined,
    timestamp: string | undefined,
    rawBody: Buffer | undefined,
  ) {
    const sharedSecret = this.configService
      .get<string>('WHATSAPP_WEB_GATEWAY_SHARED_SECRET')
      ?.trim();

    if (!sharedSecret) {
      throw new UnauthorizedException(
        'WHATSAPP_WEB_GATEWAY_SHARED_SECRET nao configurado para validar eventos internos.',
      );
    }

    if (!signature || !timestamp || !rawBody) {
      throw new UnauthorizedException('Assinatura interna do gateway ausente.');
    }

    const eventAgeMs = Math.abs(Date.now() - new Date(timestamp).getTime());
    if (!Number.isFinite(eventAgeMs) || eventAgeMs > 5 * 60_000) {
      throw new UnauthorizedException('Evento interno do gateway expirado.');
    }

    const secret = createHmac('sha256', sharedSecret)
      .update(instanceId)
      .digest('hex');
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`)
      .digest('hex');

    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException(
        'Assinatura interna do gateway invalida.',
      );
    }
  }

  private async getInstanceOrThrow(instanceId: string, workspaceId: string) {
    const instance = await this.prisma.instance.findFirst({
      where: {
        id: instanceId,
        workspaceId,
        provider: InstanceProvider.WHATSAPP_WEB,
        deletedAt: null,
      },
    });

    if (!instance) {
      throw new NotFoundException('Instancia WhatsApp Web nao encontrada.');
    }

    return instance;
  }

  private readGatewayString(...candidates: unknown[]) {
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }

      const normalizedCandidate = candidate.trim();

      if (normalizedCandidate) {
        return normalizedCandidate;
      }
    }

    return undefined;
  }

  private readGatewayNullableString(
    value: Record<string, unknown>,
    key: string,
  ) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      return undefined;
    }

    const candidate = value[key];

    if (typeof candidate !== 'string') {
      return null;
    }

    const normalizedCandidate = candidate.trim();
    return normalizedCandidate || null;
  }

  private shouldIgnoreInboundPayload(payload: Record<string, unknown>) {
    return (
      payload.isArchivedChat === true ||
      payload.archived === true ||
      payload.isPrivateChat === false ||
      this.isNonPrivateInboundPayload(payload) ||
      this.isNonPrivateMessageId(payload.messageId) ||
      this.isStatusBroadcastInboundPayload(payload) ||
      this.isGroupInboundPayload(payload)
    );
  }

  private isNonPrivateInboundPayload(payload: Record<string, unknown>) {
    const peerJid = this.readGatewayString(
      payload.remoteJid,
      payload.fromMe === true ? payload.toRaw : payload.fromRaw,
      payload.fromMe === true ? payload.to : payload.from,
    );

    if (!peerJid || !peerJid.includes('@')) {
      return false;
    }

    return !this.isPrivateChatJid(peerJid);
  }

  private isStatusBroadcastInboundPayload(payload: Record<string, unknown>) {
    return (
      payload.isStatus === true ||
      (payload.broadcast === true &&
        typeof payload.type === 'string' &&
        payload.type === 'broadcast_notification') ||
      this.isStatusBroadcastJid(payload.remoteJid) ||
      this.isStatusBroadcastJid(payload.fromRaw) ||
      this.isStatusBroadcastJid(payload.toRaw) ||
      this.isStatusBroadcastJid(payload.from) ||
      this.isStatusBroadcastJid(payload.to)
    );
  }

  private isGroupInboundPayload(payload: Record<string, unknown>) {
    return (
      payload.isGroupMsg === true ||
      this.isGroupJid(payload.remoteJid) ||
      this.isGroupJid(payload.fromRaw) ||
      this.isGroupJid(payload.toRaw)
    );
  }

  private isStatusBroadcastJid(value: unknown) {
    return typeof value === 'string' && value.trim() === 'status@broadcast';
  }

  private isGroupJid(value: unknown) {
    return typeof value === 'string' && value.trim().endsWith('@g.us');
  }

  private isPrivateChatJid(value: unknown) {
    if (typeof value !== 'string') {
      return false;
    }

    const normalized = value.trim();

    return normalized.endsWith('@c.us') || normalized.endsWith('@lid');
  }

  private isNonPrivateMessageId(value: unknown) {
    return (
      typeof value === 'string' &&
      (value.includes('@g.us') ||
        value.includes('@newsletter') ||
        value.includes('status@broadcast') ||
        value.includes('@broadcast'))
    );
  }

  private readMessageBatchPayload(
    payload: Record<string, unknown>,
  ): Required<WhatsAppWebGatewayMessageBatchPayload> {
    const messages = Array.isArray(payload.messages)
      ? payload.messages.filter((item): item is Record<string, unknown> =>
          this.isRecord(item),
        )
      : [];
    const statuses = Array.isArray(payload.statuses)
      ? payload.statuses.filter((item): item is Record<string, unknown> =>
          this.isRecord(item),
        )
      : [];

    return {
      messages,
      statuses,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toRecord(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private parseTimestamp(value: unknown) {
    if (value instanceof Date) {
      const timestamp = value.getTime();
      return Number.isFinite(timestamp) ? timestamp : null;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return null;
    }

    const timestamp = new Date(normalizedValue).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
}
