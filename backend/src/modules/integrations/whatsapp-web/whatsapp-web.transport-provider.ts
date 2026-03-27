import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  InteractiveMessagePayload,
  MessagingInstanceConfig,
  MessagingProvider,
  ParsedWebhookPayload,
  ProviderHealthResult,
  ProviderInstanceDiagnostics,
  ProviderProfileUpdateResult,
  ProviderSendResult,
  ProviderTemplateSummary,
  TemplateParameter,
} from '../meta-whatsapp/messaging-provider.interface';
import { WhatsAppWebGatewayClient } from './whatsapp-web-gateway.client';

@Injectable()
export class WhatsAppWebTransportProvider implements MessagingProvider {
  constructor(private readonly gatewayClient: WhatsAppWebGatewayClient) {}

  async sendTextMessage(
    config: MessagingInstanceConfig,
    to: string,
    body: string,
    options?: {
      quotedExternalMessageId?: string;
    },
  ): Promise<ProviderSendResult> {
    const result = await this.gatewayClient.sendText({
      instanceId: this.resolveInstanceId(config),
      to,
      body,
      quotedMessageId: options?.quotedExternalMessageId,
    });

    return {
      externalMessageId: result.messageId,
      status: this.mapSendStatus(result.status),
      simulated: false,
      raw: result.raw ?? {},
      metadata: options?.quotedExternalMessageId
        ? {
            quotedExternalMessageId: options.quotedExternalMessageId,
          }
        : undefined,
    };
  }

  async sendTemplateMessage(
    _config: MessagingInstanceConfig,
    _to: string,
    _payload: {
      name: string;
      languageCode: string;
      headerParameters?: TemplateParameter[];
      bodyParameters?: TemplateParameter[];
    },
  ): Promise<ProviderSendResult> {
    throw new BadRequestException(
      'Templates aprovados nao sao suportados por instancias WhatsApp Web.',
    );
  }

  async sendInteractiveMessage(
    _config: MessagingInstanceConfig,
    _to: string,
    _payload: InteractiveMessagePayload,
  ): Promise<ProviderSendResult> {
    throw new BadRequestException(
      'Mensagens interativas nao sao suportadas por instancias WhatsApp Web.',
    );
  }

  async uploadMedia(
    _config: MessagingInstanceConfig,
    _payload: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
    },
  ): Promise<{
    mediaId: string;
    mimeType?: string | null;
    raw: Record<string, unknown>;
    simulated: boolean;
  }> {
    throw new BadRequestException(
      'Upload de midia separado nao e necessario para o gateway WhatsApp Web.',
    );
  }

  async sendMediaMessage(
    config: MessagingInstanceConfig,
    to: string,
    payload: {
      type: 'image' | 'audio' | 'video' | 'document' | 'sticker';
      mediaId?: string;
      mediaBufferBase64?: string;
      mimeType?: string;
      caption?: string;
      fileName?: string;
      voice?: boolean;
      quotedExternalMessageId?: string;
    },
  ): Promise<ProviderSendResult> {
    if (!payload.mediaBufferBase64 || !payload.mimeType || !payload.fileName) {
      throw new BadRequestException(
        'Payload de midia incompleto para instancias WhatsApp Web.',
      );
    }

    const result = await this.gatewayClient.sendMedia({
      instanceId: this.resolveInstanceId(config),
      to,
      dataBase64: payload.mediaBufferBase64,
      mimeType: payload.mimeType,
      fileName: payload.fileName,
      caption: payload.caption,
      voice: payload.voice ?? false,
      quotedMessageId: payload.quotedExternalMessageId,
      sendMediaAsDocument: payload.type === 'document',
    });

    return {
      externalMessageId: result.messageId,
      status: this.mapSendStatus(result.status),
      simulated: false,
      raw: result.raw ?? {},
      metadata: {
        mimeType: payload.mimeType,
        fileName: payload.fileName,
        caption: payload.caption,
        voice: payload.voice ?? false,
        quotedExternalMessageId: payload.quotedExternalMessageId,
      },
    };
  }

  async downloadMedia(
    config: MessagingInstanceConfig,
    mediaId: string,
  ): Promise<{
    buffer: Buffer;
    mimeType?: string | null;
    fileName?: string | null;
    contentLength?: number | null;
  }> {
    return this.gatewayClient.downloadMedia({
      instanceId: this.resolveInstanceId(config),
      messageId: mediaId,
    });
  }

  async healthCheck(
    config: MessagingInstanceConfig,
  ): Promise<ProviderHealthResult> {
    const state = await this.gatewayClient.getState(
      this.resolveInstanceId(config),
    );

    return {
      healthy: state.status === 'connected' || state.status === 'authenticated',
      simulated: false,
      detail: state.lastError ?? state.status,
      raw: state as unknown as Record<string, unknown>,
    };
  }

  async getInstanceDiagnostics(
    config: MessagingInstanceConfig,
  ): Promise<ProviderInstanceDiagnostics> {
    const state = await this.gatewayClient.getState(
      this.resolveInstanceId(config),
    );

    return {
      healthy: state.status === 'connected' || state.status === 'authenticated',
      simulated: false,
      detail: state.lastError ?? state.status,
      subscribedApps: [],
      templates: [],
      raw: state as unknown as Record<string, unknown>,
    };
  }

  async getBusinessProfile(
    _config: MessagingInstanceConfig,
  ): Promise<ProviderProfileUpdateResult> {
    throw new BadRequestException(
      'Perfil comercial nao e suportado por instancias WhatsApp Web.',
    );
  }

  async updateBusinessProfile(
    _config: MessagingInstanceConfig,
    _payload: {
      about?: string;
      description?: string;
      email?: string;
      websites?: string[];
      address?: string;
      vertical?: string;
    },
  ): Promise<ProviderProfileUpdateResult> {
    throw new BadRequestException(
      'Perfil comercial nao e suportado por instancias WhatsApp Web.',
    );
  }

  async updateBusinessProfilePicture(
    _config: MessagingInstanceConfig,
    _payload: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      contentLength: number;
    },
  ): Promise<ProviderProfileUpdateResult> {
    throw new BadRequestException(
      'Foto de perfil comercial nao e suportada por instancias WhatsApp Web.',
    );
  }

  async subscribeApp(
    _config: MessagingInstanceConfig,
    _payload?: {
      overrideCallbackUri?: string;
      verifyToken?: string;
    },
  ): Promise<{
    healthy: boolean;
    simulated: boolean;
    detail: string;
    raw?: Record<string, unknown>;
  }> {
    throw new BadRequestException(
      'Assinatura de app nao se aplica a instancias WhatsApp Web.',
    );
  }

  async listTemplates(
    _config: MessagingInstanceConfig,
  ): Promise<ProviderTemplateSummary[]> {
    return [];
  }

  canUseRealTransport(_config: MessagingInstanceConfig) {
    return true;
  }

  validateWebhookSignature(
    _rawBody: Buffer,
    _signature: string,
    _appSecret: string,
  ) {
    return false;
  }

  parseWebhook(_payload: Record<string, unknown>): ParsedWebhookPayload {
    throw new BadRequestException(
      'Webhooks externos nao sao processados pelo transport provider do WhatsApp Web.',
    );
  }

  private resolveInstanceId(config: MessagingInstanceConfig) {
    return config.externalInstanceId ?? config.id;
  }

  private mapSendStatus(value?: string | null): ProviderSendResult['status'] {
    const normalized = value?.trim().toLowerCase();

    if (normalized === 'read' || normalized === 'delivered') {
      return 'delivered';
    }

    if (normalized === 'pending' || normalized === 'queued') {
      return 'queued';
    }

    return 'sent';
  }
}
