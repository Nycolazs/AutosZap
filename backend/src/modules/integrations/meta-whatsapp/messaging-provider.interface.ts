import { InstanceMode } from '@prisma/client';

export interface MessagingInstanceConfig {
  id: string;
  workspaceId: string;
  mode: InstanceMode;
  phoneNumber?: string | null;
  phoneNumberId?: string | null;
  businessAccountId?: string | null;
  accessToken?: string | null;
  verifyToken?: string | null;
  appSecret?: string | null;
}

export interface ProviderSendResult {
  externalMessageId: string;
  status: 'sent' | 'delivered' | 'queued';
  simulated: boolean;
  raw: Record<string, unknown>;
  messageType?: string;
  metadata?: Record<string, unknown>;
}

export interface TemplateParameter {
  type: 'text';
  text: string;
}

export interface ProviderTemplateSummary {
  id?: string;
  name: string;
  language?: string;
  status?: string;
  category?: string;
  qualityScore?: string | null;
  lastUpdatedTime?: string | null;
}

export interface ProviderSubscribedApp {
  appId?: string;
  appName?: string;
  link?: string;
}

export interface ProviderInstanceDiagnostics {
  healthy: boolean;
  simulated: boolean;
  detail: string;
  phoneNumber?: {
    id?: string | null;
    displayPhoneNumber?: string | null;
    verifiedName?: string | null;
    qualityRating?: string | null;
    codeVerificationStatus?: string | null;
    nameStatus?: string | null;
  };
  businessProfile?: {
    about?: string | null;
    description?: string | null;
    email?: string | null;
    websites?: string[];
    profilePictureUrl?: string | null;
  } | null;
  subscribedApps: ProviderSubscribedApp[];
  templates: ProviderTemplateSummary[];
  raw?: Record<string, unknown>;
}

export interface ProviderHealthResult {
  healthy: boolean;
  simulated: boolean;
  detail: string;
  raw?: Record<string, unknown>;
}

export interface ParsedWebhookPayload {
  messages: Array<{
    phoneNumberId?: string;
    from: string;
    profileName?: string;
    externalMessageId: string;
    messageType: string;
    body: string;
    timestamp?: string;
    metadata?: Record<string, unknown>;
  }>;
  statuses: Array<{
    phoneNumberId?: string;
    externalMessageId: string;
    status: string;
    timestamp?: string;
    conversationId?: string;
    conversationOriginType?: string;
    pricingCategory?: string;
    errors?: Array<{
      code?: number;
      title?: string;
      message?: string;
      details?: string;
    }>;
  }>;
}

export interface MessagingProvider {
  sendTextMessage(
    config: MessagingInstanceConfig,
    to: string,
    body: string,
  ): Promise<ProviderSendResult>;
  sendTemplateMessage(
    config: MessagingInstanceConfig,
    to: string,
    payload: {
      name: string;
      languageCode: string;
      headerParameters?: TemplateParameter[];
      bodyParameters?: TemplateParameter[];
    },
  ): Promise<ProviderSendResult>;
  uploadMedia(
    config: MessagingInstanceConfig,
    payload: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
    },
  ): Promise<{
    mediaId: string;
    mimeType?: string | null;
    raw: Record<string, unknown>;
    simulated: boolean;
  }>;
  sendMediaMessage(
    config: MessagingInstanceConfig,
    to: string,
    payload: {
      type: 'image' | 'audio' | 'video' | 'document' | 'sticker';
      mediaId: string;
      caption?: string;
      fileName?: string;
    },
  ): Promise<ProviderSendResult>;
  downloadMedia(
    config: MessagingInstanceConfig,
    mediaId: string,
  ): Promise<{
    buffer: Buffer;
    mimeType?: string | null;
    fileName?: string | null;
    contentLength?: number | null;
  }>;
  healthCheck(config: MessagingInstanceConfig): Promise<ProviderHealthResult>;
  getInstanceDiagnostics(
    config: MessagingInstanceConfig,
  ): Promise<ProviderInstanceDiagnostics>;
  subscribeApp(
    config: MessagingInstanceConfig,
    payload?: {
      overrideCallbackUri?: string;
      verifyToken?: string;
    },
  ): Promise<{
    healthy: boolean;
    simulated: boolean;
    detail: string;
    raw?: Record<string, unknown>;
  }>;
  listTemplates(
    config: MessagingInstanceConfig,
  ): Promise<ProviderTemplateSummary[]>;
  validateWebhookSignature(
    rawBody: Buffer,
    signature: string,
    appSecret: string,
  ): boolean;
  parseWebhook(payload: Record<string, unknown>): ParsedWebhookPayload;
}
