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

const DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS = 20_000;
const HISTORY_SYNC_REQUEST_TIMEOUT_MS = 120_000;

@Injectable()
export class WhatsAppWebGatewayClient {
  private clients: AxiosInstance[];

  constructor(private readonly configService: ConfigService) {
    const baseURL =
      this.configService.get<string>('WHATSAPP_WEB_GATEWAY_URL')?.trim() ||
      'http://127.0.0.1:3001';
    const sharedSecret = this.getSharedSecret();

    this.clients = this.buildBaseUrlCandidates(baseURL).map((candidate) =>
      axios.create({
        baseURL: candidate,
        timeout: DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS,
        headers: {
          'x-autoszap-internal-secret': sharedSecret,
        },
      }),
    );
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
      timeoutMs: HISTORY_SYNC_REQUEST_TIMEOUT_MS,
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
    let lastError: unknown = null;

    for (const client of this.clients) {
      try {
        const response = await client.request<ArrayBuffer>({
          method: 'GET',
          url: `/instances/${payload.instanceId}/messages/${encodeURIComponent(payload.messageId)}/media`,
          responseType: 'arraybuffer',
        });
        const contentTypeHeader = this.readHeader(
          response.headers,
          'content-type',
        );
        const contentDispositionHeader = this.readHeader(
          response.headers,
          'content-disposition',
        );
        const contentLengthHeader = this.readHeader(
          response.headers,
          'content-length',
        );

        return {
          buffer: Buffer.from(new Uint8Array(response.data)),
          mimeType:
            typeof contentTypeHeader === 'string' ? contentTypeHeader : null,
          fileName: this.extractFileName(contentDispositionHeader),
          contentLength:
            typeof contentLengthHeader === 'string'
              ? Number.parseInt(contentLengthHeader, 10)
              : response.data.byteLength,
        };
      } catch (error) {
        lastError = error;

        if (axios.isAxiosError(error) && !error.response) {
          continue;
        }

        return this.translateMediaDownloadError(error);
      }
    }

    return this.translateMediaDownloadError(lastError);
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
    timeoutMs?: number;
  }): Promise<T> {
    let lastError: unknown = null;

    for (const client of this.clients) {
      try {
        const response = await client.request<T>({
          method: payload.method,
          url: payload.url,
          data: payload.data,
          timeout: payload.timeoutMs,
        });

        return response.data;
      } catch (error) {
        lastError = error;

        if (axios.isAxiosError(error) && !error.response) {
          continue;
        }

        return this.translateRequestError(error);
      }
    }

    return this.translateRequestError(lastError);
  }

  private translateRequestError(error: unknown): never {
    if (axios.isAxiosError<{ message?: string }>(error)) {
      const responseMessage = error.response?.data?.message;
      const isTimeoutError =
        error.code === 'ECONNABORTED' ||
        /timeout/i.test(responseMessage ?? '') ||
        /timeout/i.test(error.message);
      const message = isTimeoutError
        ? 'O gateway WhatsApp Web demorou mais que o esperado para responder.'
        : typeof responseMessage === 'string'
          ? responseMessage
          : error.message;

      throw new BadGatewayException(
        `Falha ao comunicar com o gateway WhatsApp Web: ${message}`,
      );
    }

    throw new InternalServerErrorException(
      'Falha inesperada ao comunicar com o gateway WhatsApp Web.',
    );
  }

  private translateMediaDownloadError(error: unknown): never {
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

  private buildBaseUrlCandidates(baseURL: string): string[] {
    const normalizedBaseUrl = baseURL.replace(/\/+$/, '');
    const candidates = [normalizedBaseUrl];

    try {
      const parsedUrl = new URL(normalizedBaseUrl);

      if (parsedUrl.hostname === 'whatsapp-web-gateway') {
        const localhostUrl = new URL(normalizedBaseUrl);
        localhostUrl.hostname = '127.0.0.1';
        candidates.push(localhostUrl.toString().replace(/\/+$/, ''));
      }
    } catch {
      return candidates;
    }

    return [...new Set(candidates)];
  }

  private readHeader(
    headers: Record<string, unknown> | undefined,
    name: string,
  ): unknown {
    if (!headers) {
      return null;
    }

    return headers[name];
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
