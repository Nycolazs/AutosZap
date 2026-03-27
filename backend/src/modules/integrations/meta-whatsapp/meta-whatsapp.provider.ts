import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstanceMode } from '@prisma/client';
import axios, { AxiosRequestConfig } from 'axios';
import { createHmac, randomUUID } from 'crypto';
import {
  InteractiveMessagePayload,
  MessagingInstanceConfig,
  MessagingProvider,
  ParsedWebhookPayload,
  ProviderBusinessProfile,
  ProviderHealthResult,
  ProviderInstanceDiagnostics,
  ProviderProfileUpdateResult,
  ProviderSendResult,
  ProviderSubscribedApp,
  ProviderTemplateSummary,
  TemplateParameter,
} from './messaging-provider.interface';

type MetaMessageResponse = {
  messages?: Array<{ id?: string }>;
};

type MetaMediaUploadResponse = {
  id?: string;
};

type MetaMediaObjectResponse = {
  id?: string;
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
};

type MetaUploadSessionResponse = {
  id?: string;
};

type MetaUploadBinaryResponse = {
  h?: string;
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
    address?: string;
    vertical?: string;
  }>;
};

type MetaBusinessProfile = NonNullable<
  MetaBusinessProfileResponse['data']
>[number];

type MetaTemplatesResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    status?: string;
    language?: string;
    category?: string;
    quality_score?: { score?: string };
    last_updated_time?: string;
    components?: Array<{
      type?: string;
      format?: string;
      text?: string;
    }>;
  }>;
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
  };
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
  private static readonly TEMPLATE_FIELDS =
    'id,name,status,language,category,quality_score,last_updated_time,components';

  constructor(private readonly configService: ConfigService) {}

  async sendTextMessage(
    config: MessagingInstanceConfig,
    to: string,
    body: string,
    options?: {
      quotedExternalMessageId?: string;
    },
  ): Promise<ProviderSendResult> {
    if (!this.canUseRealTransport(config)) {
      return {
        externalMessageId: `dev-${randomUUID()}`,
        status: 'delivered',
        simulated: true,
        raw: {
          mode: 'dev',
          type: 'text',
          to,
          body,
          quotedExternalMessageId: options?.quotedExternalMessageId,
        },
        metadata: options?.quotedExternalMessageId
          ? {
              quotedExternalMessageId: options.quotedExternalMessageId,
            }
          : undefined,
      };
    }

    const messagePayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: this.normalizePhoneNumber(to),
      type: 'text',
      text: {
        preview_url: false,
        body,
      },
    };

    if (options?.quotedExternalMessageId) {
      messagePayload.context = {
        message_id: options.quotedExternalMessageId,
      };
    }

    const response = await this.post<MetaMessageResponse>(
      config,
      `${config.phoneNumberId}/messages`,
      messagePayload,
    );

    return {
      externalMessageId: response.messages?.[0]?.id ?? randomUUID(),
      status: 'sent',
      simulated: false,
      raw: response as Record<string, unknown>,
      metadata: options?.quotedExternalMessageId
        ? {
            quotedExternalMessageId: options.quotedExternalMessageId,
          }
        : undefined,
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
    if (!this.canUseRealTransport(config)) {
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
      messageType: 'template',
    };
  }

  async sendInteractiveMessage(
    config: MessagingInstanceConfig,
    to: string,
    payload: InteractiveMessagePayload,
    options?: {
      quotedExternalMessageId?: string;
    },
  ): Promise<ProviderSendResult> {
    if (!this.canUseRealTransport(config)) {
      return {
        externalMessageId: `dev-${randomUUID()}`,
        status: 'delivered',
        simulated: true,
        raw: {
          mode: 'dev',
          type: 'interactive',
          to,
          payload,
          quotedExternalMessageId: options?.quotedExternalMessageId,
        },
        messageType: 'interactive',
        metadata: {
          interactiveType: payload.type,
          quotedExternalMessageId: options?.quotedExternalMessageId,
        },
      };
    }

    const interactivePayload: Record<string, unknown> = {
      type: payload.type,
      body: {
        text: payload.body,
      },
      ...(payload.footer
        ? {
            footer: {
              text: payload.footer,
            },
          }
        : {}),
    };

    if (payload.type === 'button') {
      interactivePayload.action = {
        buttons: payload.buttons.map((button) => ({
          type: 'reply',
          reply: {
            id: button.id,
            title: button.title,
          },
        })),
      };
    } else {
      interactivePayload.action = {
        button: payload.buttonText,
        sections: payload.sections.map((section) => ({
          ...(section.title ? { title: section.title } : {}),
          rows: section.rows.map((row) => ({
            id: row.id,
            title: row.title,
            ...(row.description ? { description: row.description } : {}),
          })),
        })),
      };
    }

    const messagePayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: this.normalizePhoneNumber(to),
      type: 'interactive',
      interactive: interactivePayload,
    };

    if (options?.quotedExternalMessageId) {
      messagePayload.context = {
        message_id: options.quotedExternalMessageId,
      };
    }

    const response = await this.post<MetaMessageResponse>(
      config,
      `${config.phoneNumberId}/messages`,
      messagePayload,
    );

    return {
      externalMessageId: response.messages?.[0]?.id ?? randomUUID(),
      status: 'sent',
      simulated: false,
      raw: response as Record<string, unknown>,
      messageType: 'interactive',
      metadata: {
        interactiveType: payload.type,
        quotedExternalMessageId: options?.quotedExternalMessageId,
      },
    };
  }

  async uploadMedia(
    config: MessagingInstanceConfig,
    payload: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
    },
  ) {
    if (!this.canUseRealTransport(config)) {
      return {
        mediaId: `dev-media-${randomUUID()}`,
        mimeType: payload.mimeType,
        raw: {
          mode: 'dev',
          fileName: payload.fileName,
          mimeType: payload.mimeType,
        },
        simulated: true,
      };
    }

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append(
      'file',
      new Blob([Uint8Array.from(payload.buffer)], { type: payload.mimeType }),
      payload.fileName,
    );

    const response = await fetch(
      this.buildGraphUrl(`${config.phoneNumberId}/media`),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
        body: form,
      },
    );

    if (!response.ok) {
      throw new Error(await this.readProviderError(response));
    }

    const data = (await response.json()) as MetaMediaUploadResponse;

    return {
      mediaId: data.id ?? randomUUID(),
      mimeType: payload.mimeType,
      raw: data as Record<string, unknown>,
      simulated: false,
    };
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
    if (!payload.mediaId) {
      throw new Error(
        'mediaId is required to send media through the Meta provider.',
      );
    }

    if (!this.canUseRealTransport(config)) {
      return {
        externalMessageId: `dev-${randomUUID()}`,
        status: 'delivered',
        simulated: true,
        raw: {
          mode: 'dev',
          type: payload.type,
          to,
          mediaId: payload.mediaId,
          caption: payload.caption,
          fileName: payload.fileName,
          voice: payload.voice ?? false,
          quotedExternalMessageId: payload.quotedExternalMessageId,
        },
        messageType: payload.type,
        metadata: {
          mediaId: payload.mediaId,
          fileName: payload.fileName,
          caption: payload.caption,
          voice: payload.voice ?? false,
          quotedExternalMessageId: payload.quotedExternalMessageId,
        },
      };
    }

    const messagePayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: this.normalizePhoneNumber(to),
      type: payload.type,
      [payload.type]: {
        id: payload.mediaId,
      },
    };

    if (
      payload.caption &&
      (payload.type === 'image' ||
        payload.type === 'video' ||
        payload.type === 'document')
    ) {
      (messagePayload[payload.type] as Record<string, unknown>).caption =
        payload.caption;
    }

    if (payload.fileName && payload.type === 'document') {
      (messagePayload[payload.type] as Record<string, unknown>).filename =
        payload.fileName;
    }

    if (payload.quotedExternalMessageId) {
      messagePayload.context = {
        message_id: payload.quotedExternalMessageId,
      };
    }

    const response = await this.post<MetaMessageResponse>(
      config,
      `${config.phoneNumberId}/messages`,
      messagePayload,
    );

    return {
      externalMessageId: response.messages?.[0]?.id ?? randomUUID(),
      status: 'sent',
      simulated: false,
      raw: response as Record<string, unknown>,
      messageType: payload.type,
      metadata: {
        mediaId: payload.mediaId,
        caption: payload.caption,
        fileName: payload.fileName,
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
    const mediaObject = await this.get<MetaMediaObjectResponse>(
      config,
      mediaId,
    );

    if (!mediaObject.url) {
      throw new Error('A Meta nao retornou a URL da midia.');
    }

    const response = await fetch(mediaObject.url, {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(await this.readProviderError(response));
    }

    const arrayBuffer = await response.arrayBuffer();

    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType:
        response.headers.get('content-type') ?? mediaObject.mime_type ?? null,
      fileName: null,
      contentLength:
        Number(
          response.headers.get('content-length') ?? mediaObject.file_size ?? 0,
        ) || null,
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
    if (!this.canUseRealTransport(config)) {
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
      this.listAllTemplates(config),
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
        headerFormat: this.resolveTemplateHeaderFormat(template.components),
        headerParameterCount: this.countTemplateComponentParameters(
          template.components,
          'HEADER',
        ),
        bodyParameterCount: this.countTemplateComponentParameters(
          template.components,
          'BODY',
        ),
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
      businessProfile: this.mapBusinessProfile(businessProfileResult.data?.[0]),
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

  async getBusinessProfile(
    config: MessagingInstanceConfig,
  ): Promise<ProviderProfileUpdateResult> {
    if (!this.canUseRealTransport(config)) {
      return {
        simulated: true,
        detail:
          'Modo de desenvolvimento ativo; perfil do WhatsApp carregado sem chamada real.',
        phoneNumber: {
          id: config.phoneNumberId,
          displayPhoneNumber: config.phoneNumber,
        },
        businessProfile: null,
        raw: {
          mode: 'dev',
        },
      };
    }

    const [phoneNumberResult, businessProfileResult] = await Promise.all([
      this.get<MetaPhoneNumberResponse>(
        config,
        `${config.phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status`,
      ),
      this.get<MetaBusinessProfileResponse>(
        config,
        `${config.phoneNumberId}/whatsapp_business_profile?fields=about,description,email,profile_picture_url,websites,address,vertical`,
      ),
    ]);

    return {
      simulated: false,
      detail: 'Perfil do WhatsApp carregado com sucesso.',
      phoneNumber: this.mapPhoneNumber(phoneNumberResult, config),
      businessProfile: this.mapBusinessProfile(businessProfileResult.data?.[0]),
      raw: {
        phoneNumber: phoneNumberResult,
        businessProfile: businessProfileResult,
      },
    };
  }

  async updateBusinessProfile(
    config: MessagingInstanceConfig,
    payload: {
      about?: string;
      description?: string;
      email?: string;
      websites?: string[];
      address?: string;
      vertical?: string;
    },
  ): Promise<ProviderProfileUpdateResult> {
    if (!this.canUseRealTransport(config)) {
      return {
        simulated: true,
        detail:
          'Modo de desenvolvimento ativo; atualizacao do perfil simulada.',
        phoneNumber: {
          id: config.phoneNumberId,
          displayPhoneNumber: config.phoneNumber,
        },
        businessProfile: {
          about: payload.about ?? null,
          description: payload.description ?? null,
          email: payload.email ?? null,
          websites: payload.websites ?? [],
          address: payload.address ?? null,
          vertical: payload.vertical ?? null,
          profilePictureUrl: null,
        },
        raw: {
          mode: 'dev',
          payload,
        },
      };
    }

    const requestBody = {
      messaging_product: 'whatsapp',
      ...(payload.about !== undefined ? { about: payload.about } : {}),
      ...(payload.description !== undefined
        ? { description: payload.description }
        : {}),
      ...(payload.email !== undefined ? { email: payload.email } : {}),
      ...(payload.websites !== undefined ? { websites: payload.websites } : {}),
      ...(payload.address !== undefined ? { address: payload.address } : {}),
      ...(payload.vertical !== undefined ? { vertical: payload.vertical } : {}),
    };

    await this.post<Record<string, unknown>>(
      config,
      `${config.phoneNumberId}/whatsapp_business_profile`,
      requestBody,
    );

    const refreshedProfile = await this.getBusinessProfile(config);

    return {
      ...refreshedProfile,
      detail: 'Perfil do WhatsApp atualizado com sucesso.',
    };
  }

  async updateBusinessProfilePicture(
    config: MessagingInstanceConfig,
    payload: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      contentLength: number;
    },
  ): Promise<ProviderProfileUpdateResult> {
    if (!this.canUseRealTransport(config)) {
      return {
        simulated: true,
        detail:
          'Modo de desenvolvimento ativo; atualizacao da foto de perfil simulada.',
        businessProfile: {
          profilePictureUrl: null,
        },
        raw: {
          mode: 'dev',
          fileName: payload.fileName,
          mimeType: payload.mimeType,
          contentLength: payload.contentLength,
        },
      };
    }

    if (!config.appId) {
      throw new Error(
        'App ID obrigatorio para atualizar a foto do perfil via API da Meta.',
      );
    }

    if (!config.phoneNumberId) {
      throw new Error(
        'Phone Number ID obrigatorio para atualizar a foto do perfil.',
      );
    }

    const uploadSession = await axios.post<MetaUploadSessionResponse>(
      this.buildGraphUrl(`${config.appId}/uploads`),
      null,
      {
        params: {
          file_name: payload.fileName,
          file_length: payload.contentLength,
          file_type: payload.mimeType,
        },
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
        },
      },
    );

    const uploadSessionId = uploadSession.data.id;

    if (!uploadSessionId) {
      throw new Error('A Meta nao retornou o upload session id da imagem.');
    }

    const uploadResponse = await axios.post<MetaUploadBinaryResponse>(
      this.buildGraphUrl(uploadSessionId),
      payload.buffer,
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': payload.mimeType,
          file_offset: '0',
        },
        maxBodyLength: Infinity,
      },
    );

    const profilePictureHandle = uploadResponse.data.h;

    if (!profilePictureHandle) {
      throw new Error(
        'A Meta nao retornou o profile_picture_handle da imagem.',
      );
    }

    const updateResponse = await this.post<Record<string, unknown>>(
      config,
      `${config.phoneNumberId}/whatsapp_business_profile`,
      {
        messaging_product: 'whatsapp',
        profile_picture_handle: profilePictureHandle,
      },
    );

    const businessProfileOverview = await this.getBusinessProfile(config);

    return {
      simulated: false,
      detail: 'Foto do perfil do WhatsApp Business atualizada com sucesso.',
      phoneNumber: businessProfileOverview.phoneNumber,
      businessProfile: businessProfileOverview.businessProfile,
      raw: {
        uploadSession: uploadSession.data,
        uploadBinary: uploadResponse.data,
        updateProfile: updateResponse,
        profile: businessProfileOverview.raw,
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
    const missingRequirements: string[] = [];

    if (!config.accessToken) {
      missingRequirements.push('Access Token');
    }

    if (!config.businessAccountId) {
      missingRequirements.push('Business Account ID');
    }

    if (missingRequirements.length > 0) {
      throw new Error(
        `Nao foi possivel atualizar o callback da Meta. Configure ${missingRequirements.join(
          ' e ',
        )} na instancia antes de assinar o app na WABA.`,
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
    if (!this.canUseRealTransport(config)) {
      return [];
    }

    const templatesResult = await this.listAllTemplates(config);

    return (templatesResult.data ?? []).map<ProviderTemplateSummary>(
      (template) => ({
        id: template.id,
        name: template.name ?? 'template-sem-nome',
        status: template.status,
        language: template.language,
        category: template.category,
        qualityScore: template.quality_score?.score ?? null,
        lastUpdatedTime: template.last_updated_time ?? null,
        headerFormat: this.resolveTemplateHeaderFormat(template.components),
        headerParameterCount: this.countTemplateComponentParameters(
          template.components,
          'HEADER',
        ),
        bodyParameterCount: this.countTemplateComponentParameters(
          template.components,
          'BODY',
        ),
      }),
    );
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
            type?: string;
            text?: { body?: string };
            interactive?: {
              type?: string;
              button_reply?: {
                id?: string;
                title?: string;
              };
              list_reply?: {
                id?: string;
                title?: string;
                description?: string;
              };
            };
            image?: {
              id?: string;
              mime_type?: string;
              sha256?: string;
              caption?: string;
            };
            audio?: {
              id?: string;
              mime_type?: string;
              sha256?: string;
              voice?: boolean;
            };
            video?: {
              id?: string;
              mime_type?: string;
              sha256?: string;
              caption?: string;
              voice?: boolean;
            };
            sticker?: {
              id?: string;
              mime_type?: string;
              sha256?: string;
              animated?: boolean;
            };
            document?: {
              id?: string;
              mime_type?: string;
              sha256?: string;
              filename?: string;
              caption?: string;
            };
            context?: {
              from?: string;
              id?: string;
            };
          };

          if (!parsed.from || !parsed.id) {
            continue;
          }

          const matchingContact = contactProfiles.find((contact) => {
            const parsedContact = contact as { wa_id?: string };
            return parsedContact.wa_id === parsed.from;
          }) as { profile?: { name?: string } } | undefined;

          const normalizedType = this.normalizeInboundMessageType(parsed);
          const mediaMetadata = this.extractInboundMediaMetadata(parsed);
          const interactiveMetadata =
            this.extractInboundInteractiveMetadata(parsed);
          const quoteMetadata = this.extractInboundQuoteMetadata(parsed);
          const inboundMetadata = this.mergeInboundMetadata(
            mediaMetadata,
            interactiveMetadata,
            quoteMetadata,
          );

          messages.push({
            phoneNumberId,
            from: parsed.from,
            profileName: matchingContact?.profile?.name,
            externalMessageId: parsed.id,
            messageType: normalizedType,
            body: this.getInboundMessageBody(parsed, normalizedType),
            timestamp: parsed.timestamp,
            metadata: inboundMetadata,
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
    return this.shouldUseStrictProductionMode(config);
  }

  canUseRealTransport(config: MessagingInstanceConfig) {
    return !!config.accessToken && !!config.phoneNumberId;
  }

  private async get<T>(
    config: MessagingInstanceConfig,
    path: string,
    axiosConfig?: AxiosRequestConfig,
  ) {
    try {
      const response = await axios.get<T>(this.buildGraphUrl(path), {
        ...axiosConfig,
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          ...(axiosConfig?.headers ?? {}),
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(this.describeMetaRequestError(error));
    }
  }

  private async listAllTemplates(
    config: MessagingInstanceConfig,
  ): Promise<MetaTemplatesResponse> {
    if (!config.businessAccountId) {
      return { data: [] };
    }

    const templates: NonNullable<MetaTemplatesResponse['data']> = [];
    let after: string | undefined;
    let pageCount = 0;

    do {
      const querySuffix = after ? `&after=${encodeURIComponent(after)}` : '';
      const response = await this.get<MetaTemplatesResponse>(
        config,
        `${config.businessAccountId}/message_templates?fields=${MetaWhatsAppProvider.TEMPLATE_FIELDS}&limit=100${querySuffix}`,
      );

      templates.push(...(response.data ?? []));
      after = response.paging?.next
        ? response.paging.cursors?.after
        : undefined;
      pageCount += 1;
    } while (after && pageCount < 100);

    return {
      data: templates,
    };
  }

  private resolveTemplateHeaderFormat(
    components?: Array<{
      type?: string;
      format?: string;
      text?: string;
    }>,
  ) {
    const header = components?.find(
      (component) => component.type?.trim().toUpperCase() === 'HEADER',
    );

    return header?.format?.trim().toUpperCase() ?? null;
  }

  private countTemplateComponentParameters(
    components:
      | Array<{
          type?: string;
          format?: string;
          text?: string;
        }>
      | undefined,
    componentType: 'HEADER' | 'BODY',
  ): number | null {
    if (components === undefined) {
      return null;
    }

    const component = components.find(
      (item) => item.type?.trim().toUpperCase() === componentType,
    );

    if (!component?.text) {
      return 0;
    }

    return component.text.match(/\{\{[^}]+\}\}/g)?.length ?? 0;
  }

  private mapPhoneNumber(
    phoneNumberResult: MetaPhoneNumberResponse,
    config: MessagingInstanceConfig,
  ) {
    return {
      id: phoneNumberResult.id ?? config.phoneNumberId,
      displayPhoneNumber:
        phoneNumberResult.display_phone_number ?? config.phoneNumber,
      verifiedName: phoneNumberResult.verified_name ?? null,
      qualityRating: phoneNumberResult.quality_rating ?? null,
      codeVerificationStatus:
        phoneNumberResult.code_verification_status ?? null,
      nameStatus: phoneNumberResult.name_status ?? null,
    };
  }

  private mapBusinessProfile(
    profile?: MetaBusinessProfile,
  ): ProviderBusinessProfile | null {
    if (!profile) {
      return null;
    }

    return {
      about: profile.about ?? null,
      description: profile.description ?? null,
      email: profile.email ?? null,
      websites: profile.websites ?? [],
      address: profile.address ?? null,
      vertical: profile.vertical ?? null,
      profilePictureUrl: profile.profile_picture_url ?? null,
    };
  }

  private async post<T>(
    config: MessagingInstanceConfig,
    path: string,
    body: Record<string, unknown>,
    axiosConfig?: AxiosRequestConfig,
  ) {
    try {
      const response = await axios.post<T>(this.buildGraphUrl(path), body, {
        ...axiosConfig,
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
          ...(axiosConfig?.headers ?? {}),
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(this.describeMetaRequestError(error));
    }
  }

  private describeMetaRequestError(error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const payload = error.response?.data as
        | {
            error?: {
              message?: string;
              error_user_msg?: string;
              error_user_title?: string;
              code?: number;
            };
          }
        | undefined;
      const providerMessage =
        payload?.error?.error_user_msg ??
        payload?.error?.message ??
        error.message;

      if (status === 401) {
        return [
          'A Meta recusou as credenciais da instancia (401).',
          'Verifique o Access Token, o Phone Number ID e se o token ainda tem permissao para a WABA configurada.',
          providerMessage,
        ]
          .filter(Boolean)
          .join(' ');
      }

      if (status === 403) {
        return [
          'A Meta negou acesso ao recurso solicitado (403).',
          'Verifique se o app e o numero possuem as permissoes necessarias.',
          providerMessage,
        ]
          .filter(Boolean)
          .join(' ');
      }

      return providerMessage || 'Erro inesperado na comunicacao com a Meta.';
    }

    return error instanceof Error
      ? error.message
      : 'Erro inesperado na comunicacao com a Meta.';
  }

  private buildGraphUrl(path: string) {
    const version =
      this.configService.get<string>('META_GRAPH_API_VERSION') ?? 'v23.0';
    return `https://graph.facebook.com/${version}/${path}`;
  }

  private normalizePhoneNumber(phone: string) {
    return phone.replace(/^\+/, '');
  }

  private normalizeInboundMessageType(message: {
    type?: string;
    interactive?: {
      button_reply?: { id?: string };
      list_reply?: { id?: string };
    };
    image?: { id?: string };
    audio?: { id?: string };
    video?: { id?: string };
    sticker?: { id?: string };
    document?: { id?: string };
  }) {
    const normalizedInputType = message.type?.trim().toLowerCase();
    const typeMap: Record<string, string> = {
      text: 'text',
      image: 'image',
      audio: 'audio',
      voice: 'audio',
      ptt: 'audio',
      video: 'video',
      video_note: 'video',
      video_note_message: 'video',
      document: 'document',
      sticker: 'sticker',
      animated_sticker: 'sticker',
      interactive: 'text',
      button: 'text',
      button_reply: 'text',
      list_reply: 'text',
    };

    if (normalizedInputType && typeMap[normalizedInputType]) {
      return typeMap[normalizedInputType];
    }

    if (message.image?.id) return 'image';
    if (message.audio?.id) return 'audio';
    if (message.video?.id) return 'video';
    if (message.sticker?.id) return 'sticker';
    if (message.document?.id) return 'document';
    if (message.interactive?.button_reply?.id) return 'text';
    if (message.interactive?.list_reply?.id) return 'text';

    if (normalizedInputType) {
      return normalizedInputType;
    }

    return 'text';
  }

  private getInboundMessageBody(
    message: {
      text?: { body?: string };
      interactive?: {
        button_reply?: { title?: string };
        list_reply?: { title?: string };
      };
      image?: { caption?: string };
      video?: { caption?: string };
      document?: { caption?: string };
    },
    messageType: string,
  ) {
    if (messageType === 'text') {
      const interactiveTitle =
        message.interactive?.button_reply?.title ??
        message.interactive?.list_reply?.title;

      if (interactiveTitle?.trim()) {
        return interactiveTitle.trim();
      }

      return message.text?.body ?? '';
    }

    if (messageType === 'image') {
      return message.image?.caption ?? '';
    }

    if (messageType === 'video') {
      return message.video?.caption ?? '';
    }

    if (messageType === 'document') {
      return message.document?.caption ?? '';
    }

    return message.text?.body ?? '';
  }

  private extractInboundMediaMetadata(message: {
    image?: {
      id?: string;
      mime_type?: string;
      sha256?: string;
      caption?: string;
    };
    audio?: {
      id?: string;
      mime_type?: string;
      sha256?: string;
      voice?: boolean;
    };
    video?: {
      id?: string;
      mime_type?: string;
      sha256?: string;
      caption?: string;
      voice?: boolean;
    };
    sticker?: {
      id?: string;
      mime_type?: string;
      sha256?: string;
      animated?: boolean;
    };
    document?: {
      id?: string;
      mime_type?: string;
      sha256?: string;
      filename?: string;
      caption?: string;
    };
  }) {
    if (message.image?.id) {
      return {
        mediaId: message.image.id,
        mimeType: message.image.mime_type,
        sha256: message.image.sha256,
        caption: message.image.caption,
      };
    }

    if (message.audio?.id) {
      return {
        mediaId: message.audio.id,
        mimeType: message.audio.mime_type,
        sha256: message.audio.sha256,
        voice: message.audio.voice ?? false,
      };
    }

    if (message.video?.id) {
      return {
        mediaId: message.video.id,
        mimeType: message.video.mime_type,
        sha256: message.video.sha256,
        caption: message.video.caption,
        voice: message.video.voice ?? false,
      };
    }

    if (message.sticker?.id) {
      return {
        mediaId: message.sticker.id,
        mimeType: message.sticker.mime_type,
        sha256: message.sticker.sha256,
        animated: message.sticker.animated ?? false,
      };
    }

    if (message.document?.id) {
      return {
        mediaId: message.document.id,
        mimeType: message.document.mime_type,
        sha256: message.document.sha256,
        fileName: message.document.filename,
        caption: message.document.caption,
      };
    }

    return undefined;
  }

  private extractInboundInteractiveMetadata(message: {
    interactive?: {
      type?: string;
      button_reply?: {
        id?: string;
        title?: string;
      };
      list_reply?: {
        id?: string;
        title?: string;
        description?: string;
      };
    };
  }) {
    const interactive = message.interactive;

    if (!interactive) {
      return undefined;
    }

    const replyId =
      interactive.button_reply?.id ?? interactive.list_reply?.id ?? null;
    const replyTitle =
      interactive.button_reply?.title ?? interactive.list_reply?.title ?? null;
    const replyDescription = interactive.list_reply?.description ?? null;

    if (!replyId && !replyTitle) {
      return undefined;
    }

    return {
      interactive: {
        type: interactive.type ?? null,
        replyId,
        replyTitle,
        replyDescription,
      },
    };
  }

  private extractInboundQuoteMetadata(message: {
    context?: {
      from?: string;
      id?: string;
    };
  }) {
    if (!message.context?.id) {
      return undefined;
    }

    return {
      quote: {
        externalMessageId: message.context.id,
        from: message.context.from,
      },
    };
  }

  private mergeInboundMetadata(
    mediaMetadata?: Record<string, unknown>,
    interactiveMetadata?: Record<string, unknown>,
    quoteMetadata?: Record<string, unknown>,
  ) {
    if (!mediaMetadata && !interactiveMetadata && !quoteMetadata) {
      return undefined;
    }

    return {
      ...(mediaMetadata ?? {}),
      ...(interactiveMetadata ?? {}),
      ...(quoteMetadata ?? {}),
    };
  }

  private async readProviderError(response: Response) {
    try {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      return payload.error?.message ?? response.statusText;
    } catch {
      return response.statusText;
    }
  }

  private shouldUseStrictProductionMode(config: MessagingInstanceConfig) {
    const envMode = (
      this.configService.get<string>('META_MODE') ?? 'DEV'
    ).toUpperCase();
    const instanceMode = config.mode ?? InstanceMode.DEV;

    return (
      envMode === 'PRODUCTION' &&
      instanceMode === InstanceMode.PRODUCTION &&
      this.canUseRealTransport(config)
    );
  }
}
