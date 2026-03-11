import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstanceMode } from '@prisma/client';
import axios, { AxiosRequestConfig } from 'axios';
import { createHmac, randomUUID } from 'crypto';
import {
  MessagingInstanceConfig,
  MessagingProvider,
  ParsedWebhookPayload,
  ProviderHealthResult,
  ProviderInstanceDiagnostics,
  ProviderSendResult,
  ProviderSubscribedApp,
  ProviderTemplateSummary,
  TemplateParameter,
} from './messaging-provider.interface';

type MetaMessageResponse = {
  messages?: Array<{ id?: string }>;
};

type MetaPhoneNumberResponse = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  name_status?: string;
};

type MetaBusinessProfileResponse = {
  data?: Array<{
    about?: string;
    description?: string;
    email?: string;
    profile_picture_url?: string;
    websites?: string[];
  }>;
};

type MetaTemplatesResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    status?: string;
    language?: string;
    category?: string;
    quality_score?: { score?: string };
    last_updated_time?: string;
  }>;
};

type MetaSubscribedAppsResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    link?: string;
  }>;
  success?: boolean;
};

@Injectable()
export class MetaWhatsAppProvider implements MessagingProvider {
  constructor(private readonly configService: ConfigService) {}

  async sendTextMessage(
    config: MessagingInstanceConfig,
    to: string,
    body: string,
  ): Promise<ProviderSendResult> {
    if (!this.shouldUseRealMode(config)) {
      return {
        externalMessageId: `dev-${randomUUID()}`,
        status: 'delivered',
        simulated: true,
        raw: {
          mode: 'dev',
          type: 'text',
          to,
          body,
        },
      };
    }

    const response = await this.post<MetaMessageResponse>(
      config,
      `${config.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: this.normalizePhoneNumber(to),
        type: 'text',
        text: {
          preview_url: false,
          body,
        },
      },
    );

    return {
      externalMessageId: response.messages?.[0]?.id ?? randomUUID(),
      status: 'sent',
      simulated: false,
      raw: response as Record<string, unknown>,
    };
  }

  async sendTemplateMessage(
    config: MessagingInstanceConfig,
    to: string,
    payload: {
      name: string;
      languageCode: string;
      headerParameters?: TemplateParameter[];
      bodyParameters?: TemplateParameter[];
    },
  ): Promise<ProviderSendResult> {
    if (!this.shouldUseRealMode(config)) {
      return {
        externalMessageId: `dev-${randomUUID()}`,
        status: 'delivered',
        simulated: true,
        raw: {
          mode: 'dev',
          type: 'template',
          to,
          template: payload,
        },
      };
    }

    const components = [
      payload.headerParameters?.length
        ? {
            type: 'header',
            parameters: payload.headerParameters,
          }
        : null,
      payload.bodyParameters?.length
        ? {
            type: 'body',
            parameters: payload.bodyParameters,
          }
        : null,
    ].filter(Boolean);

    const response = await this.post<MetaMessageResponse>(
      config,
      `${config.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: this.normalizePhoneNumber(to),
        type: 'template',
        template: {
          name: payload.name,
          language: {
            code: payload.languageCode,
          },
          ...(components.length ? { components } : {}),
        },
      },
    );

    return {
      externalMessageId: response.messages?.[0]?.id ?? randomUUID(),
      status: 'sent',
      simulated: false,
      raw: response as Record<string, unknown>,
    };
  }

  async healthCheck(
    config: MessagingInstanceConfig,
  ): Promise<ProviderHealthResult> {
    const diagnostics = await this.getInstanceDiagnostics(config);

    return {
      healthy: diagnostics.healthy,
      simulated: diagnostics.simulated,
      detail: diagnostics.detail,
      raw: diagnostics.raw,
    };
  }

  async getInstanceDiagnostics(
    config: MessagingInstanceConfig,
  ): Promise<ProviderInstanceDiagnostics> {
    if (!this.shouldUseRealMode(config)) {
      return {
        healthy: true,
        simulated: true,
        detail:
          'Modo de desenvolvimento ativo; diagnostico concluido sem chamada real a Meta.',
        phoneNumber: {
          id: config.phoneNumberId,
          displayPhoneNumber: config.phoneNumber,
        },
        businessProfile: null,
        subscribedApps: [],
        templates: [],
        raw: {
          mode: 'dev',
        },
      };
    }

    const [
      phoneNumberResult,
      businessProfileResult,
      templatesResult,
      subscribedAppsResult,
    ] = await Promise.all([
      this.get<MetaPhoneNumberResponse>(
        config,
        `${config.phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status`,
      ),
      this.get<MetaBusinessProfileResponse>(
        config,
        `${config.phoneNumberId}/whatsapp_business_profile?fields=about,description,email,profile_picture_url,websites`,
      ),
      config.businessAccountId
        ? this.get<MetaTemplatesResponse>(
            config,
            `${config.businessAccountId}/message_templates?fields=id,name,status,language,category,quality_score,last_updated_time&limit=25`,
          )
        : Promise.resolve({ data: [] } satisfies MetaTemplatesResponse),
      config.businessAccountId
        ? this.get<MetaSubscribedAppsResponse>(
            config,
            `${config.businessAccountId}/subscribed_apps?limit=25`,
          )
        : Promise.resolve({ data: [] } satisfies MetaSubscribedAppsResponse),
    ]);

    const templates = (templatesResult.data ?? []).map<ProviderTemplateSummary>(
      (template) => ({
        id: template.id,
        name: template.name ?? 'template-sem-nome',
        status: template.status,
        language: template.language,
        category: template.category,
        qualityScore: template.quality_score?.score ?? null,
        lastUpdatedTime: template.last_updated_time ?? null,
      }),
    );

    const subscribedApps = (
      subscribedAppsResult.data ?? []
    ).map<ProviderSubscribedApp>((app) => ({
      appId: app.id,
      appName: app.name,
      link: app.link,
    }));

    return {
      healthy: true,
      simulated: false,
      detail: 'Credenciais, numero e recursos da WABA validados com sucesso.',
      phoneNumber: {
        id: phoneNumberResult.id ?? config.phoneNumberId,
        displayPhoneNumber:
          phoneNumberResult.display_phone_number ?? config.phoneNumber,
        verifiedName: phoneNumberResult.verified_name ?? null,
        qualityRating: phoneNumberResult.quality_rating ?? null,
        codeVerificationStatus:
          phoneNumberResult.code_verification_status ?? null,
        nameStatus: phoneNumberResult.name_status ?? null,
      },
      businessProfile: businessProfileResult.data?.[0]
        ? {
            about: businessProfileResult.data[0].about ?? null,
            description: businessProfileResult.data[0].description ?? null,
            email: businessProfileResult.data[0].email ?? null,
            websites: businessProfileResult.data[0].websites ?? [],
            profilePictureUrl:
              businessProfileResult.data[0].profile_picture_url ?? null,
          }
        : null,
      subscribedApps,
      templates,
      raw: {
        phoneNumber: phoneNumberResult,
        businessProfile: businessProfileResult,
        templates: templatesResult,
        subscribedApps: subscribedAppsResult,
      },
    };
  }

  async subscribeApp(
    config: MessagingInstanceConfig,
    payload?: {
      overrideCallbackUri?: string;
      verifyToken?: string;
    },
  ) {
    if (!this.shouldUseRealMode(config)) {
      return {
        healthy: true,
        simulated: true,
        detail:
          'Modo de desenvolvimento ativo; subscribe do app simulado com sucesso.',
        raw: {
          mode: 'dev',
          payload,
        },
      };
    }

    if (!config.businessAccountId) {
      throw new Error(
        'Business Account ID obrigatorio para subscribing do app na WABA.',
      );
    }

    const body: Record<string, string> = {};

    if (payload?.overrideCallbackUri) {
      body.override_callback_uri = payload.overrideCallbackUri;
    }

    if (payload?.verifyToken) {
      body.verify_token = payload.verifyToken;
    }

    const response = await this.post<MetaSubscribedAppsResponse>(
      config,
      `${config.businessAccountId}/subscribed_apps`,
      body,
    );

    return {
      healthy: true,
      simulated: false,
      detail: 'App inscrito na WABA com sucesso.',
      raw: response as Record<string, unknown>,
    };
  }

  async listTemplates(
    config: MessagingInstanceConfig,
  ): Promise<ProviderTemplateSummary[]> {
    const diagnostics = await this.getInstanceDiagnostics(config);
    return diagnostics.templates;
  }

  validateWebhookSignature(
    rawBody: Buffer,
    signature: string,
    appSecret: string,
  ) {
    const normalizedSignature = signature.replace(/^sha256=/, '').trim();
    const expectedSignature = createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    return normalizedSignature === expectedSignature;
  }

  parseWebhook(payload: Record<string, unknown>): ParsedWebhookPayload {
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    const messages: ParsedWebhookPayload['messages'] = [];
    const statuses: ParsedWebhookPayload['statuses'] = [];

    for (const entry of entries) {
      const changes = Array.isArray((entry as { changes?: unknown[] }).changes)
        ? ((entry as { changes: unknown[] }).changes ?? [])
        : [];

      for (const change of changes) {
        const value =
          (change as { value?: Record<string, unknown> }).value ?? {};
        const metadata =
          (value.metadata as { phone_number_id?: string } | undefined) ?? {};
        const phoneNumberId = metadata.phone_number_id;

        const contactProfiles = Array.isArray(value.contacts)
          ? value.contacts
          : [];
        const inboundMessages = Array.isArray(value.messages)
          ? value.messages
          : [];
        const deliveryStatuses = Array.isArray(value.statuses)
          ? value.statuses
          : [];

        for (const message of inboundMessages) {
          const parsed = message as {
            from?: string;
            id?: string;
            timestamp?: string;
            text?: { body?: string };
          };

          if (!parsed.from || !parsed.id) {
            continue;
          }

          const matchingContact = contactProfiles.find((contact) => {
            const parsedContact = contact as { wa_id?: string };
            return parsedContact.wa_id === parsed.from;
          }) as { profile?: { name?: string } } | undefined;

          messages.push({
            phoneNumberId,
            from: parsed.from,
            profileName: matchingContact?.profile?.name,
            externalMessageId: parsed.id,
            body: parsed.text?.body ?? '',
            timestamp: parsed.timestamp,
          });
        }

        for (const status of deliveryStatuses) {
          const parsed = status as {
            id?: string;
            status?: string;
            timestamp?: string;
            conversation?: { id?: string; origin?: { type?: string } };
            pricing?: { category?: string };
            errors?: Array<{
              code?: number;
              title?: string;
              message?: string;
              error_data?: { details?: string };
            }>;
          };

          if (!parsed.id || !parsed.status) {
            continue;
          }

          statuses.push({
            phoneNumberId,
            externalMessageId: parsed.id,
            status: parsed.status,
            timestamp: parsed.timestamp,
            conversationId: parsed.conversation?.id,
            conversationOriginType: parsed.conversation?.origin?.type,
            pricingCategory: parsed.pricing?.category,
            errors: parsed.errors?.map((error) => ({
              code: error.code,
              title: error.title,
              message: error.message,
              details: error.error_data?.details,
            })),
          });
        }
      }
    }

    return {
      messages,
      statuses,
    };
  }

  isProductionMode(config: MessagingInstanceConfig) {
    return this.shouldUseRealMode(config);
  }

  private async get<T>(
    config: MessagingInstanceConfig,
    path: string,
    axiosConfig?: AxiosRequestConfig,
  ) {
    const response = await axios.get<T>(this.buildGraphUrl(path), {
      ...axiosConfig,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        ...(axiosConfig?.headers ?? {}),
      },
    });

    return response.data;
  }

  private async post<T>(
    config: MessagingInstanceConfig,
    path: string,
    body: Record<string, unknown>,
    axiosConfig?: AxiosRequestConfig,
  ) {
    const response = await axios.post<T>(this.buildGraphUrl(path), body, {
      ...axiosConfig,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
        ...(axiosConfig?.headers ?? {}),
      },
    });

    return response.data;
  }

  private buildGraphUrl(path: string) {
    const version =
      this.configService.get<string>('META_GRAPH_API_VERSION') ?? 'v23.0';
    return `https://graph.facebook.com/${version}/${path}`;
  }

  private normalizePhoneNumber(phone: string) {
    return phone.replace(/^\+/, '');
  }

  private shouldUseRealMode(config: MessagingInstanceConfig) {
    const envMode = (
      this.configService.get<string>('META_MODE') ?? 'DEV'
    ).toUpperCase();
    const instanceMode = config.mode ?? InstanceMode.DEV;

    return (
      envMode === 'PRODUCTION' &&
      instanceMode === InstanceMode.PRODUCTION &&
      !!config.accessToken &&
      !!config.phoneNumberId
    );
  }
}
