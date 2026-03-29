export type WhatsAppWebGatewayStatus =
  | 'stopped'
  | 'starting'
  | 'qr'
  | 'authenticated'
  | 'connected'
  | 'disconnected'
  | 'error';

export type WhatsAppWebGatewayState = {
  instanceId: string;
  status: WhatsAppWebGatewayStatus;
  desiredState: 'running' | 'stopped';
  hasSession: boolean;
  profilePictureUrl?: string | null;
  qr?: string | null;
  qrDataUrl?: string | null;
  qrExpiresAt?: string | null;
  lastError?: string | null;
  lastSeenAt?: string | null;
  connectedAt?: string | null;
  authenticatedAt?: string | null;
  readyAt?: string | null;
};

export type WhatsAppWebGatewayQrState = {
  instanceId: string;
  qr?: string | null;
  qrDataUrl?: string | null;
  qrExpiresAt?: string | null;
  status: WhatsAppWebGatewayStatus;
};

export type WhatsAppWebGatewaySendResult = {
  messageId: string;
  status: string;
  raw?: Record<string, unknown>;
};

export type WhatsAppWebGatewayMediaDownloadResult = {
  buffer: Buffer;
  mimeType?: string | null;
  fileName?: string | null;
  contentLength?: number | null;
};

export type WhatsAppWebGatewayHistorySyncResult = {
  instanceId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  chatsEvaluated: number;
  chatsEligible: number;
  chatsSynced: number;
  messagesDiscovered: number;
  messagesEmitted: number;
  inboundMessages: number;
  outboundMessages: number;
  mediaMessages: number;
  errors: Array<{
    chatId?: string;
    message: string;
  }>;
};

export type WhatsAppWebGatewayHistorySyncProgress = {
  totalChats: number;
  processedChats: number;
  messagesProcessed: number;
  inboundMessages: number;
  outboundMessages: number;
  mediaMessages: number;
};

export type WhatsAppWebGatewayMessageBatchPayload = {
  messages?: Array<Record<string, unknown>>;
  statuses?: Array<Record<string, unknown>>;
};

export type WhatsAppWebGatewayEventEnvelope = {
  event: string;
  instanceId: string;
  timestamp: string;
  data: Record<string, unknown>;
};
