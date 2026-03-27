import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import type {
  WhatsAppWebGatewayHistorySyncResult,
  WhatsAppWebGatewayMediaDownloadResult,
  WhatsAppWebGatewayQrState,
  WhatsAppWebGatewaySendResult,
  WhatsAppWebGatewayState,
} from './whatsapp-web.types';

@Injectable()
export class WhatsAppWebGatewayClient {
  private client: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    const baseURL =
      this.configService.get<string>('WHATSAPP_WEB_GATEWAY_URL')?.trim() ||
      'http://127.0.0.1:3001';
    const sharedSecret = this.getSharedSecret();

    this.client = axios.create({
      baseURL: baseURL.replace(/\/+$/, ''),
      timeout: 20_000,
      headers: {
        'x-autoszap-internal-secret': sharedSecret,
      },
    });
  }

  async registerInstance(payload: {
    instanceId: string;
    callbackUrl?: string;
    autoStart?: boolean;
    metadata?: Record<string, unknown>;
  }) {
    return this.request<{
      instanceId: string;
      callbackUrl: string;
      autoStart: boolean;
      metadata?: Record<string, unknown>;
      state: WhatsAppWebGatewayState;
    }>({
      method: 'POST',
      url: '/instances',
      data: payload,
    });
  }

  async getState(instanceId: string) {
    return this.request<WhatsAppWebGatewayState>({
      method: 'GET',
      url: `/instances/${instanceId}/connection-state`,
    });
  }

  async getQr(instanceId: string) {
    return this.request<WhatsAppWebGatewayQrState>({
      method: 'GET',
      url: `/instances/${instanceId}/qr`,
    });
  }

  async connect(instanceId: string) {
    return this.request<WhatsAppWebGatewayState>({
      method: 'POST',
      url: `/instances/${instanceId}/connect`,
    });
  }

  async start(instanceId: string) {
    return this.request<WhatsAppWebGatewayState>({
      method: 'POST',
      url: `/instances/${instanceId}/start`,
    });
  }

  async reconnect(instanceId: string) {
    return this.request<WhatsAppWebGatewayState>({
      method: 'POST',
      url: `/instances/${instanceId}/reconnect`,
    });
  }

  async disconnect(instanceId: string) {
    return this.request<WhatsAppWebGatewayState>({
      method: 'POST',
      url: `/instances/${instanceId}/disconnect`,
    });
  }

  async logout(instanceId: string) {
    return this.request<WhatsAppWebGatewayState>({
      method: 'POST',
      url: `/instances/${instanceId}/logout`,
    });
  }

  async unregister(instanceId: string) {
    return this.request<{
      success: boolean;
      instanceId: string;
    }>({
      method: 'POST',
      url: `/instances/${instanceId}/unregister`,
    });
  }

  async refreshQr(instanceId: string) {
    return this.request<WhatsAppWebGatewayState>({
      method: 'POST',
      url: `/instances/${instanceId}/qr/refresh`,
    });
  }

  async syncHistory(instanceId: string) {
    return this.request<WhatsAppWebGatewayHistorySyncResult>({
      method: 'POST',
      url: `/instances/${instanceId}/history/sync`,
    });
  }

  async sendText(payload: {
    instanceId: string;
    to: string;
    body: string;
    quotedMessageId?: string;
  }) {
    return this.request<WhatsAppWebGatewaySendResult>({
      method: 'POST',
      url: `/instances/${payload.instanceId}/send/text`,
      data: {
        to: payload.to,
        body: payload.body,
        quotedMessageId: payload.quotedMessageId,
      },
    });
  }

  async sendMedia(payload: {
    instanceId: string;
    to: string;
    dataBase64: string;
    mimeType: string;
    fileName: string;
    caption?: string;
    voice?: boolean;
    quotedMessageId?: string;
    sendMediaAsDocument?: boolean;
  }) {
    return this.request<WhatsAppWebGatewaySendResult>({
      method: 'POST',
      url: `/instances/${payload.instanceId}/send/media`,
      data: payload,
    });
  }

  async downloadMedia(payload: {
    instanceId: string;
    messageId: string;
  }): Promise<WhatsAppWebGatewayMediaDownloadResult> {
    try {
      const response = await this.client.request<ArrayBuffer>({
        method: 'GET',
        url: `/instances/${payload.instanceId}/messages/${encodeURIComponent(payload.messageId)}/media`,
        responseType: 'arraybuffer',
      });

      return {
        buffer: Buffer.from(response.data),
        mimeType:
          typeof response.headers['content-type'] === 'string'
            ? response.headers['content-type']
            : null,
        fileName: this.extractFileName(response.headers['content-disposition']),
        contentLength:
          typeof response.headers['content-length'] === 'string'
            ? Number.parseInt(response.headers['content-length'], 10)
            : response.data.byteLength,
      };
    } catch (error) {
      if (axios.isAxiosError<{ message?: string }>(error)) {
        const responseMessage = error.response?.data?.message;
        const message =
          typeof responseMessage === 'string' ? responseMessage : error.message;

        throw new BadGatewayException(
          `Falha ao baixar midia do gateway WhatsApp Web: ${message}`,
        );
      }

      throw new InternalServerErrorException(
        'Falha inesperada ao baixar midia do gateway WhatsApp Web.',
      );
    }
  }

  async health() {
    return this.request<{
      ok: boolean;
      service: string;
      instances: Record<string, number>;
    }>({
      method: 'GET',
      url: '/health',
    });
  }

  private async request<T>(payload: {
    method: 'GET' | 'POST';
    url: string;
    data?: unknown;
  }): Promise<T> {
    try {
      const response = await this.client.request<T>({
        method: payload.method,
        url: payload.url,
        data: payload.data,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError<{ message?: string }>(error)) {
        const responseMessage = error.response?.data?.message;
        const message =
          typeof responseMessage === 'string' ? responseMessage : error.message;

        throw new BadGatewayException(
          `Falha ao comunicar com o gateway WhatsApp Web: ${message}`,
        );
      }

      throw new InternalServerErrorException(
        'Falha inesperada ao comunicar com o gateway WhatsApp Web.',
      );
    }
  }

  private getSharedSecret() {
    const value = this.configService
      .get<string>('WHATSAPP_WEB_GATEWAY_SHARED_SECRET')
      ?.trim();

    if (!value) {
      throw new Error(
        'WHATSAPP_WEB_GATEWAY_SHARED_SECRET precisa estar configurado.',
      );
    }

    return value;
  }

  private extractFileName(contentDisposition: unknown) {
    if (typeof contentDisposition !== 'string') {
      return null;
    }

    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1]);
    }

    const asciiMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    return asciiMatch?.[1] ?? null;
  }
}
