export type InternalInstanceStatus =
  | "stopped"
  | "starting"
  | "qr"
  | "authenticated"
  | "connected"
  | "disconnected"
  | "error";

export type InternalInstanceDesiredState = "running" | "stopped";

export type GatewayEventName =
  | "qr.updated"
  | "session.ready"
  | "session.connected"
  | "session.disconnected"
  | "auth.failure"
  | "message.inbound"
  | "messages.batch"
  | "message.status";

export type InstanceRegistryEntry = {
  instanceId: string;
  callbackUrl: string;
  autoStart: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type InstanceState = {
  instanceId: string;
  status: InternalInstanceStatus;
  desiredState: InternalInstanceDesiredState;
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

export type RegisterInstanceRequest = {
  instanceId: string;
  callbackUrl?: string;
  autoStart?: boolean;
  metadata?: Record<string, unknown>;
};

export type InstanceTextSendRequest = {
  to: string;
  body: string;
  quotedMessageId?: string;
};

export type InstanceMediaSendRequest = {
  to: string;
  dataBase64: string;
  mimeType: string;
  fileName: string;
  caption?: string;
  voice?: boolean;
  quotedMessageId?: string;
  sendMediaAsDocument?: boolean;
};

export type GatewayCallbackEnvelope<T = Record<string, unknown>> = {
  event: GatewayEventName;
  instanceId: string;
  timestamp: string;
  data: T;
};

export type SendResult = {
  messageId: string;
  status: string;
  raw?: Record<string, unknown>;
};

export type HistorySyncResult = {
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
