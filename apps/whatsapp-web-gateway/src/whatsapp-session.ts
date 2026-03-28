import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import QRCode from "qrcode";
import {
  Client,
  LocalAuth,
  type Chat,
  type Message,
  MessageMedia,
} from "whatsapp-web.js";
import {
  buildInboundMessageData,
  isWhatsAppPrivateChatMessage,
  buildMessageStatusData,
  isWhatsAppStatusMessage,
} from "./message-normalizer";
import type {
  GatewayCallbackEnvelope,
  GatewayEventName,
  HistorySyncResult,
  InstanceState,
  SendResult,
} from "./types";

const execFileAsync = promisify(execFile);

type CallbackTransport = {
  send: (instanceId: string, event: GatewayCallbackEnvelope) => Promise<void>;
};

type SessionOptions = {
  instanceId: string;
  sessionDir: string;
  callbackSecret: string;
  callbackTransport: CallbackTransport;
  chromiumPath?: string;
  headless: boolean;
  autoRestartDelayMs: number;
};

type SessionInternalState =
  | "stopped"
  | "starting"
  | "qr"
  | "authenticated"
  | "connected"
  | "disconnected"
  | "error";

type WhatsAppContactSnapshot = Awaited<ReturnType<Message["getContact"]>>;

type ResolvedPeerContact = {
  contact: WhatsAppContactSnapshot | null;
  phoneJid: string | null;
  phoneNumber: string | null;
};

type ResolvedRecipientCandidate = {
  jid: string;
  source: "normalized" | "lid" | "phone";
};

type ResolvedMessageContactContext = {
  contact: WhatsAppContactSnapshot | null;
  peerPhoneNumber: string | null;
  contactProfilePictureUrl: string | null;
  shouldRetry: boolean;
};

function buildPuppeteerArgs() {
  return [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--no-first-run",
    "--no-zygote",
    "--disable-gpu",
  ];
}

function isRecoverableLaunchFailureMessage(message: string) {
  const normalized = message.toLowerCase();

  return [
    "target.setautoattach",
    "target closed",
    "browser has disconnected",
    "failed to launch the browser process",
  ].some((pattern) => normalized.includes(pattern));
}

function normalizeRecipient(to: string) {
  const raw = to.trim();
  if (!raw) return raw;
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) {
    throw new Error("Invalid WhatsApp recipient.");
  }
  return `${digits}@c.us`;
}

function mapAckStatus(ack?: number) {
  switch (ack) {
    case -1:
      return "failed";
    case 0:
      return "pending";
    case 1:
      return "sent";
    case 2:
      return "delivered";
    case 3:
      return "read";
    case 4:
      return "played";
    default:
      return "sent";
  }
}

const HISTORY_SYNC_BATCH_SIZE = 50;
const HISTORY_SYNC_MAX_RECURSIVE_PASSES = 3;
const HISTORY_SYNC_RETRY_MESSAGE_LIMIT = 12;
const WHATSAPP_PRIVATE_CHAT_SUFFIXES = ["@c.us", "@lid"] as const;

function isSyncablePrivateChatId(chatId?: string | null) {
  const normalized = chatId?.trim();

  if (!normalized) {
    return false;
  }

  return WHATSAPP_PRIVATE_CHAT_SUFFIXES.some((suffix) =>
    normalized.endsWith(suffix),
  );
}

function isArchivedChat(chat?: Chat | null) {
  const archivedChat = chat as
    | (Chat & {
        archived?: boolean | null;
        isArchived?: boolean | null;
      })
    | null
    | undefined;

  return (
    archivedChat?.archived === true || archivedChat?.isArchived === true
  );
}

function normalizeSyncError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeBrazilianPhoneDigits(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";

  if (!digits) {
    return null;
  }

  const nationalDigits =
    digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;

  if (nationalDigits.length !== 10 && nationalDigits.length !== 11) {
    return null;
  }

  if (
    nationalDigits.length === 10 &&
    /^[6-9]$/.test(nationalDigits.charAt(2))
  ) {
    return `55${nationalDigits.slice(0, 2)}9${nationalDigits.slice(2)}`;
  }

  return `55${nationalDigits}`;
}

export class WhatsAppSession {
  private client: Client | null = null;
  private startPromise: Promise<void> | null = null;
  private state: SessionInternalState = "stopped";
  private qr: string | null = null;
  private qrDataUrl: string | null = null;
  private qrExpiresAt: Date | null = null;
  private profilePictureUrl: string | null = null;
  private lastError: string | null = null;
  private lastSeenAt: Date | null = null;
  private connectedAt: Date | null = null;
  private authenticatedAt: Date | null = null;
  private readyAt: Date | null = null;
  private desiredState: "running" | "stopped" = "running";
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;
  private historySyncPromise: Promise<HistorySyncResult> | null = null;
  private readonly lidPhoneCache = new Map<string, string>();
  private readonly contactProfilePictureCache = new Map<string, string>();

  constructor(private readonly options: SessionOptions) {}

  get instanceId() {
    return this.options.instanceId;
  }

  get hasSession() {
    return this.state !== "stopped" || this.client !== null;
  }

  getState(): InstanceState {
    return {
      instanceId: this.options.instanceId,
      status: this.state,
      desiredState: this.desiredState,
      hasSession: this.hasSession,
      profilePictureUrl: this.profilePictureUrl,
      qr: this.qr,
      qrDataUrl: this.qrDataUrl,
      qrExpiresAt: this.qrExpiresAt?.toISOString() ?? null,
      lastError: this.lastError,
      lastSeenAt: this.lastSeenAt?.toISOString() ?? null,
      connectedAt: this.connectedAt?.toISOString() ?? null,
      authenticatedAt: this.authenticatedAt?.toISOString() ?? null,
      readyAt: this.readyAt?.toISOString() ?? null,
    };
  }

  async start(options: { recoverCorruptedSession?: boolean } = {}) {
    this.desiredState = "running";

    if (this.startPromise) {
      return this.startPromise;
    }

    if (
      this.client &&
      ["starting", "qr", "authenticated", "connected"].includes(this.state)
    ) {
      return Promise.resolve();
    }

    if (this.client && ["disconnected", "error"].includes(this.state)) {
      try {
        await this.client.destroy();
      } catch {
        // Ignore stale client teardown failures before recreating the session.
      }
      this.client = null;
    }

    this.startPromise = (
      options.recoverCorruptedSession
        ? this.initializeClientWithRecovery()
        : this.initializeClient()
    )
      .catch(async (error: unknown) => {
        if (this.shouldSuppressLaunchFailure(error)) {
          this.lastError = null;
          return;
        }

        this.setError(error);
        await this.emit("auth.failure", {
          error: this.lastError,
        });
        throw error;
      })
      .finally(() => {
        this.startPromise = null;
      });

    return this.startPromise;
  }

  async reconnect(options: { recoverCorruptedSession?: boolean } = {}) {
    await this.stop(false);
    return this.start(options);
  }

  async refreshQr(options: { recoverCorruptedSession?: boolean } = {}) {
    if (this.state === "connected" || this.state === "authenticated") {
      return this.getState();
    }

    await this.reconnect(options);
    return this.getState();
  }

  async stop(clearSession: boolean) {
    this.desiredState = "stopped";
    this.clearReconnectTimer();

    const sessionPath = this.getSessionPath();

    if (this.client) {
      const currentClient = this.client;
      this.client = null;
      try {
        if (clearSession) {
          await currentClient.logout();
        }
      } catch {
        // Ignore logout failures while shutting down.
      }

      try {
        await currentClient.destroy();
      } catch {
        // Ignore destroy failures during disconnect.
      }
    }

    await this.resetSessionArtifacts({ clearSession });

    this.state = "stopped";
    if (clearSession) {
      this.profilePictureUrl = null;
    }
    this.qr = null;
    this.qrDataUrl = null;
    this.qrExpiresAt = null;
  }

  async sendText(payload: {
    to: string;
    body: string;
    quotedMessageId?: string;
  }): Promise<SendResult> {
    const client = await this.ensureClientReady();
    const { message, recipient } = await this.sendMessageWithResolvedRecipient(
      client,
      payload.to,
      payload.body,
      {
        quotedMessageId: payload.quotedMessageId,
      },
    );

    const result = {
      messageId: message.id?._serialized ?? `${Date.now()}`,
      status: mapAckStatus(message.ack),
      raw: {
        messageId: message.id?._serialized,
        ack: message.ack,
        to: recipient,
      },
    };

    return result;
  }

  async sendMedia(payload: {
    to: string;
    dataBase64: string;
    mimeType: string;
    fileName: string;
    caption?: string;
    voice?: boolean;
    quotedMessageId?: string;
    sendMediaAsDocument?: boolean;
  }): Promise<SendResult> {
    const client = await this.ensureClientReady();
    const media = new MessageMedia(
      payload.mimeType,
      payload.dataBase64,
      payload.fileName,
    );

    const { message, recipient } = await this.sendMessageWithResolvedRecipient(
      client,
      payload.to,
      media,
      {
        caption: payload.caption,
        sendAudioAsVoice: payload.voice ?? false,
        sendMediaAsDocument: payload.sendMediaAsDocument ?? false,
        quotedMessageId: payload.quotedMessageId,
      },
    );

    const result = {
      messageId: message.id?._serialized ?? `${Date.now()}`,
      status: mapAckStatus(message.ack),
      raw: {
        messageId: message.id?._serialized,
        ack: message.ack,
        to: recipient,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        voice: payload.voice ?? false,
      },
    };

    return result;
  }

  async downloadMessageMedia(messageId: string): Promise<{
    buffer: Buffer;
    mimeType?: string | null;
    fileName?: string | null;
    contentLength?: number | null;
  }> {
    const client = await this.ensureClientReady();
    const message = await client.getMessageById(messageId);

    if (!message) {
      throw new Error("WhatsApp message not found in the active QR session.");
    }

    if (!message.hasMedia) {
      throw new Error("WhatsApp message does not contain downloadable media.");
    }

    const downloaded = await message.downloadMedia();

    if (!downloaded?.data) {
      throw new Error("WhatsApp media is not available for download right now.");
    }

    const buffer = Buffer.from(downloaded.data, "base64");

    return {
      buffer,
      mimeType: downloaded.mimetype ?? null,
      fileName: downloaded.filename ?? null,
      contentLength:
        typeof downloaded.filesize === "number"
          ? downloaded.filesize
          : buffer.length,
    };
  }

  async logout() {
    await this.stop(true);
  }

  async disconnect() {
    await this.stop(false);
  }

  async syncHistory() {
    if (this.historySyncPromise) {
      return this.historySyncPromise;
    }

    this.historySyncPromise = this.performHistorySync().finally(() => {
      this.historySyncPromise = null;
    });

    return this.historySyncPromise;
  }

  async destroy() {
    this.destroyed = true;
    await this.stop(false);
  }

  async ensureClientReady() {
    if (!this.client) {
      await this.start();
    }

    if (!this.client) {
      throw new Error("WhatsApp client is not available.");
    }

    return this.client;
  }

  private async performHistorySync(): Promise<HistorySyncResult> {
    const client = await this.ensureClientReady();
    const startedAt = new Date();
    const result: HistorySyncResult = {
      instanceId: this.options.instanceId,
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      durationMs: 0,
      chatsEvaluated: 0,
      chatsEligible: 0,
      chatsSynced: 0,
      messagesDiscovered: 0,
      messagesEmitted: 0,
      inboundMessages: 0,
      outboundMessages: 0,
      mediaMessages: 0,
      errors: [],
    };
    const chats = await client.getChats();
    const eligibleChats: Chat[] = [];

    for (const chat of chats) {
      result.chatsEvaluated += 1;

      const chatId = chat.id?._serialized;

      if (!isSyncablePrivateChatId(chatId) || isArchivedChat(chat)) {
        continue;
      }

      eligibleChats.push(chat);
    }

    result.chatsEligible = eligibleChats.length;

    const syncedChatIds = new Set<string>();
    let pendingChats = eligibleChats;

    for (
      let pass = 0;
      pass < HISTORY_SYNC_MAX_RECURSIVE_PASSES && pendingChats.length;
      pass += 1
    ) {
      const retryPass = pass > 0;
      const nextPendingChats: Chat[] = [];

      for (const chat of pendingChats) {
        const chatId = chat.id?._serialized;

        try {
          const syncResult = await this.syncPrivateChatHistory(
            client,
            chat,
            result,
            {
              retryPass,
            },
          );

          if (chatId) {
            syncedChatIds.add(chatId);
          }

          if (
            syncResult.shouldRetry &&
            pass + 1 < HISTORY_SYNC_MAX_RECURSIVE_PASSES
          ) {
            nextPendingChats.push(chat);
          }
        } catch (error) {
          result.errors.push({
            chatId: chatId ?? undefined,
            message: normalizeSyncError(error),
          });
        }
      }

      pendingChats = nextPendingChats;
    }

    result.chatsSynced = syncedChatIds.size;

    const finishedAt = new Date();
    result.finishedAt = finishedAt.toISOString();
    result.durationMs = finishedAt.getTime() - startedAt.getTime();

    return result;
  }

  private async initializeClient() {
    if (this.destroyed) {
      throw new Error("Session has been destroyed.");
    }

    await mkdir(this.options.sessionDir, { recursive: true });
    const sessionPath = this.getSessionPath();
    await this.terminateBrowserProcesses(sessionPath);
    await this.cleanupSessionLocks(sessionPath);
    this.state = "starting";
    this.lastError = null;
    this.qr = null;
    this.qrDataUrl = null;
    this.qrExpiresAt = null;

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.options.instanceId,
        dataPath: this.options.sessionDir,
      }),
      puppeteer: {
        headless: this.options.headless,
        executablePath: this.options.chromiumPath,
        args: buildPuppeteerArgs(),
      },
    });

    this.client = client;
    this.attachEvents(client);

    await client.initialize();
  }

  private async syncPrivateChatHistory(
    client: Client,
    chat: Chat,
    result: HistorySyncResult,
    options?: {
      retryPass?: boolean;
    },
  ) {
    await chat.syncHistory().catch(() => false);

    const [messages, contact] = await Promise.all([
      chat.fetchMessages({
        limit: options?.retryPass
          ? HISTORY_SYNC_RETRY_MESSAGE_LIMIT
          : Number.POSITIVE_INFINITY,
      }),
      chat.getContact().catch(() => null),
    ]);

    const batch: Array<Record<string, unknown>> = [];
    let shouldRetry = false;

    for (const message of messages) {
      const contactContext = await this.resolveMessageContactContext(
        client,
        message,
        contact,
      );
      shouldRetry ||= contactContext.shouldRetry;
      const normalized = await buildInboundMessageData(
        this.options.instanceId,
        message,
        {
          contact: contactContext.contact ?? contact,
          peerPhoneNumber: contactContext.peerPhoneNumber,
          contactProfilePictureUrl: contactContext.contactProfilePictureUrl,
        },
      );
      const normalizedWithMedia =
        normalized.hasMedia === true
          ? await this.materializeMessageMediaPayload(
              message,
              normalized,
              "history-sync",
            )
          : normalized;

      if (!options?.retryPass) {
        result.messagesDiscovered += 1;

        if (normalizedWithMedia.fromMe === true) {
          result.outboundMessages += 1;
        } else {
          result.inboundMessages += 1;
        }

        if (normalizedWithMedia.hasMedia === true) {
          result.mediaMessages += 1;
        }
      }

      if (normalizedWithMedia.hasMedia === true) {
        await this.flushHistoryBatch(batch, result);
        await this.emit("messages.batch", {
          messages: [normalizedWithMedia],
          statuses: [],
        });
        result.messagesEmitted += 1;
        continue;
      }

      batch.push(normalizedWithMedia);

      if (batch.length >= HISTORY_SYNC_BATCH_SIZE) {
        await this.flushHistoryBatch(batch, result);
      }
    }

    await this.flushHistoryBatch(batch, result);

    return {
      shouldRetry: shouldRetry && messages.length > 0,
    };
  }

  private async materializeMessageMediaPayload(
    message: Message,
    payload: Record<string, unknown>,
    downloadStrategy: "history-sync" | "realtime",
  ) {
    const media =
      typeof payload.media === "object" &&
      payload.media !== null &&
      !Array.isArray(payload.media)
        ? (payload.media as Record<string, unknown>)
        : null;

    if (!media || !message.hasMedia) {
      return payload;
    }

    try {
      const downloaded = await message.downloadMedia();

      if (!downloaded?.data) {
        return {
          ...payload,
          media: {
            ...media,
            downloadError: "WhatsApp media is not available for download right now.",
          },
        };
      }

      const mimeType =
        downloaded.mimetype?.trim() ||
        (typeof media.mimeType === "string" ? media.mimeType : null) ||
        null;
      const fileName =
        downloaded.filename?.trim() ||
        (typeof media.fileName === "string" ? media.fileName : null) ||
        null;
      const size =
        typeof downloaded.filesize === "number"
          ? downloaded.filesize
          : typeof media.size === "number"
            ? media.size
            : null;

      return {
        ...payload,
        media: {
          ...media,
          dataBase64: downloaded.data,
          mimeType,
          fileName,
          size,
          isBase64: true,
          downloadStrategy,
          downloadError: null,
        },
        mimeType,
        fileName,
      };
    } catch (error) {
      return {
        ...payload,
        media: {
          ...media,
          downloadError: normalizeSyncError(error),
        },
      };
    }
  }

  private async initializeClientWithRecovery() {
    try {
      await this.initializeClient();
    } catch (error) {
      if (!this.shouldRecoverByResettingSession(error)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Recovering corrupted WhatsApp Web session ${this.options.instanceId} after launch failure: ${message}`,
      );

      if (this.client) {
        try {
          await this.client.destroy();
        } catch {
          // Ignore stale client teardown failures before retrying with a clean profile.
        }
        this.client = null;
      }

      await this.resetSessionArtifacts({ clearSession: true });
      await this.initializeClient();
    }
  }

  private attachEvents(client: Client) {
    client.on("qr", async (qr) => {
      this.qr = qr;
      this.qrExpiresAt = new Date(Date.now() + 90_000);
      this.qrDataUrl = await QRCode.toDataURL(qr, {
        margin: 1,
        scale: 6,
        errorCorrectionLevel: "M",
      });
      this.state = "qr";
      this.lastError = null;
      this.lastSeenAt = new Date();
      await this.emit("qr.updated", {
        qr,
        qrDataUrl: this.qrDataUrl,
        qrExpiresAt: this.qrExpiresAt.toISOString(),
      });
    });

    client.on("authenticated", async () => {
      this.state = "authenticated";
      this.lastError = null;
      this.authenticatedAt = new Date();
      this.lastSeenAt = new Date();
      await this.emit("session.ready", {
        authenticatedAt: this.authenticatedAt.toISOString(),
      });
    });

    client.on("ready", async () => {
      this.state = "connected";
      this.lastError = null;
      this.connectedAt = new Date();
      this.readyAt = new Date();
      this.lastSeenAt = new Date();
      this.qr = null;
      this.qrDataUrl = null;
      this.qrExpiresAt = null;
      this.profilePictureUrl = await this.resolveOwnProfilePictureUrl(client);
      await this.emit("session.connected", {
        connectedAt: this.connectedAt.toISOString(),
        profilePictureUrl: this.profilePictureUrl,
      });
    });

    client.on("disconnected", async (reason) => {
      this.state = "disconnected";
      this.lastError = reason ?? "disconnected";
      this.lastSeenAt = new Date();
      await this.emit("session.disconnected", {
        reason,
      });

      if (this.desiredState === "running" && !this.destroyed) {
        this.scheduleReconnect();
      }
    });

    client.on("auth_failure", async (message) => {
      this.state = "error";
      this.lastError = message;
      this.lastSeenAt = new Date();
      await this.emit("auth.failure", {
        error: message,
      });
    });

    client.on("message_create", async (message: Message) => {
      this.lastSeenAt = new Date();
      if (
        isWhatsAppStatusMessage(message) ||
        !isWhatsAppPrivateChatMessage(message)
      ) {
        return;
      }

      const chat = await message.getChat().catch(() => null);

      if (isArchivedChat(chat)) {
        return;
      }

      const contact = await message.getContact().catch(() => null);
      const contactContext = await this.resolveMessageContactContext(
        client,
        message,
        contact,
      );

      await this.emit(
        "message.inbound",
        await this.materializeMessageMediaPayload(
          message,
          await buildInboundMessageData(this.options.instanceId, message, {
            contact: contactContext.contact ?? contact,
            peerPhoneNumber: contactContext.peerPhoneNumber,
            contactProfilePictureUrl: contactContext.contactProfilePictureUrl,
          }),
          "realtime",
        ),
      );
    });

    client.on("message_ack", async (message: Message, ack: number) => {
      this.lastSeenAt = new Date();

      if (!isWhatsAppPrivateChatMessage(message)) {
        return;
      }

      await this.emit(
        "message.status",
        buildMessageStatusData({
          instanceId: this.options.instanceId,
          messageId: message.id?._serialized,
          status: mapAckStatus(ack),
          ack,
          to: message.to,
          from: message.from,
          body: message.body,
          type: message.type,
        }),
      );
    });
  }

  private async sendMessageWithResolvedRecipient(
    client: Client,
    to: string,
    content: string | MessageMedia,
    options?: Record<string, unknown>,
  ) {
    const recipientCandidates = await this.resolveRecipientCandidates(
      client,
      to,
    );
    let lastError: unknown = null;

    for (let index = 0; index < recipientCandidates.length; index += 1) {
      const candidate = recipientCandidates[index];

      try {
        const message = await client.sendMessage(
          candidate.jid,
          content,
          options,
        );

        return {
          message,
          recipient: candidate.jid,
        };
      } catch (error) {
        lastError = error;

        if (
          index + 1 >= recipientCandidates.length ||
          !this.shouldRetryWithAlternateRecipient(error)
        ) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Unable to send WhatsApp message.");
  }

  private async resolveRecipientCandidates(client: Client, to: string) {
    const normalizedRecipient = normalizeRecipient(to);
    const candidates: ResolvedRecipientCandidate[] = [
      {
        jid: normalizedRecipient,
        source: "normalized",
      },
    ];

    const clientWithIdentityLookup = client as Client & {
      getContactLidAndPhone?: (
        contactIds: string[],
      ) => Promise<Array<{ lid?: string | null; pn?: string | null }>>;
    };

    if (typeof clientWithIdentityLookup.getContactLidAndPhone === "function") {
      try {
        const [resolvedIdentity] = await clientWithIdentityLookup.getContactLidAndPhone(
          [normalizedRecipient],
        );
        const resolvedLid = resolvedIdentity?.lid?.trim() || null;
        const resolvedPhoneJid = resolvedIdentity?.pn?.trim() || null;

        if (normalizedRecipient.endsWith("@c.us")) {
          if (resolvedLid) {
            candidates.unshift({
              jid: resolvedLid,
              source: "lid",
            });
          }

          if (resolvedPhoneJid) {
            candidates.push({
              jid: resolvedPhoneJid,
              source: "phone",
            });
          }
        } else if (normalizedRecipient.endsWith("@lid")) {
          if (resolvedPhoneJid) {
            candidates.push({
              jid: resolvedPhoneJid,
              source: "phone",
            });
          }

          if (resolvedLid) {
            candidates.unshift({
              jid: resolvedLid,
              source: "lid",
            });
          }
        }
      } catch {
        // Ignore identity lookup failures and use the normalized recipient.
      }
    }

    return candidates.filter(
      (candidate, index, list) =>
        candidate.jid.trim().length > 0 &&
        list.findIndex((value) => value.jid === candidate.jid) === index,
    );
  }

  private shouldRetryWithAlternateRecipient(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const normalizedMessage = message.toLowerCase();

    return (
      normalizedMessage.includes("no lid for user") ||
      normalizedMessage.includes("invalid wid") ||
      normalizedMessage.includes("invalid whatsapp recipient")
    );
  }

  private async flushHistoryBatch(
    batch: Array<Record<string, unknown>>,
    result: HistorySyncResult,
  ) {
    if (!batch.length) {
      return;
    }

    const payload = batch.splice(0, batch.length);

    await this.emit("messages.batch", {
      messages: payload,
      statuses: [],
    });

    result.messagesEmitted += payload.length;
  }

  private scheduleReconnect() {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      void this.start().catch(() => {
        // If reconnect still fails, keep the session in error and wait for the next external action.
      });
    }, this.options.autoRestartDelayMs);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setError(error: unknown) {
    this.state = "error";
    this.lastError = error instanceof Error ? error.message : String(error);
    this.lastSeenAt = new Date();
  }

  private getSessionPath() {
    return path.join(
      this.options.sessionDir,
      `session-${this.options.instanceId}`,
    );
  }

  private shouldRecoverByResettingSession(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return isRecoverableLaunchFailureMessage(message);
  }

  private shouldSuppressLaunchFailure(error: unknown) {
    if (!this.shouldRecoverByResettingSession(error)) {
      return false;
    }

    return (
      this.state === "qr" ||
      this.state === "authenticated" ||
      this.state === "connected" ||
      this.qrDataUrl !== null
    );
  }

  private async resetSessionArtifacts(options: { clearSession: boolean }) {
    const sessionPath = this.getSessionPath();

    await this.terminateBrowserProcesses(sessionPath);
    await this.cleanupSessionLocks(sessionPath);

    if (options.clearSession) {
      await rm(sessionPath, { recursive: true, force: true });
    }
  }

  private async cleanupSessionLocks(sessionPath: string) {
    const ephemeralEntries = [
      "DevToolsActivePort",
      "SingletonCookie",
      "SingletonLock",
      "SingletonSocket",
    ];

    await Promise.allSettled(
      ephemeralEntries.map((entry) =>
        rm(path.join(sessionPath, entry), {
          force: true,
          recursive: true,
        }),
      ),
    );
  }

  private async terminateBrowserProcesses(sessionPath: string) {
    if (process.platform === "win32") {
      return;
    }

    try {
      const { stdout } = await execFileAsync("ps", [
        "ax",
        "-o",
        "pid=,command=",
      ]);
      const candidates = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line): { pid: number; command: string } | null => {
          const match = line.match(/^(\d+)\s+(.*)$/);
          if (!match) return null;
          return {
            pid: Number(match[1]),
            command: match[2],
          };
        })
        .filter(
          (entry): entry is { pid: number; command: string } =>
            entry !== null &&
            entry.pid !== process.pid &&
            entry.command.includes(sessionPath) &&
            /(chrom(e|ium)|chrome_crashpad_handler|google chrome)/i.test(
              entry.command,
            ),
        );

      if (!candidates.length) {
        return;
      }

      for (const candidate of candidates) {
        try {
          process.kill(candidate.pid, "SIGTERM");
        } catch {
          // Ignore already-exited processes.
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      for (const candidate of candidates) {
        try {
          process.kill(candidate.pid, 0);
          process.kill(candidate.pid, "SIGKILL");
        } catch {
          // Process already exited after SIGTERM.
        }
      }
    } catch {
      // If process inspection is unavailable, continue without hard cleanup.
    }
  }

  private async emit(event: GatewayEventName, data: Record<string, unknown>) {
    const envelope: GatewayCallbackEnvelope = {
      event,
      instanceId: this.options.instanceId,
      timestamp: new Date().toISOString(),
      data,
    };

    try {
      await this.options.callbackTransport.send(
        this.options.instanceId,
        envelope,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown callback error.";
      this.lastError = message;
      this.lastSeenAt = new Date();
      console.error(
        `Callback delivery failed for instance ${this.options.instanceId} on ${event}:`,
        error,
      );
    }
  }

  private async resolveOwnProfilePictureUrl(client: Client) {
    const ownContactId = client.info?.wid?._serialized?.trim();

    if (!ownContactId) {
      return null;
    }

    try {
      const profilePictureUrl = await client.getProfilePicUrl(ownContactId);
      return profilePictureUrl?.trim() || null;
    } catch {
      return null;
    }
  }

  private async resolveMessageContactContext(
    client: Client,
    message: Message,
    contact?: WhatsAppContactSnapshot | null,
  ): Promise<ResolvedMessageContactContext> {
    const peerJid =
      (
        (message.id as { remote?: unknown } | undefined)?.remote as
          | string
          | undefined
      )?.trim() || (message.fromMe ? message.to : message.from)?.trim() || null;

    const resolvedPeerContact = await this.resolvePeerContact(
      client,
      peerJid,
      contact,
    );

    const contactProfilePictureUrl = await this.resolveContactProfilePictureUrl(
      client,
      {
        peerJid,
        phoneJid: resolvedPeerContact.phoneJid,
        contact,
        resolvedContact: resolvedPeerContact.contact,
      },
    );

    const peerPhoneNumber =
      resolvedPeerContact.phoneNumber ??
      normalizeBrazilianPhoneDigits(contact?.number) ??
      null;
    const shouldRetry =
      peerJid?.trim().endsWith("@lid") === true &&
      (!peerPhoneNumber || !contactProfilePictureUrl);

    return {
      contact: resolvedPeerContact.contact ?? contact ?? null,
      peerPhoneNumber,
      contactProfilePictureUrl,
      shouldRetry,
    };
  }

  private async resolvePeerContact(
    client: Client,
    peerJid?: string | null,
    contact?: WhatsAppContactSnapshot | null,
  ): Promise<ResolvedPeerContact> {
    const normalizedPeerJid = peerJid?.trim();

    if (!normalizedPeerJid) {
      return {
        contact: contact ?? null,
        phoneJid: null,
        phoneNumber: normalizeBrazilianPhoneDigits(contact?.number) ?? null,
      };
    }

    if (!normalizedPeerJid.endsWith("@lid")) {
      return {
        contact: contact ?? null,
        phoneJid: normalizedPeerJid,
        phoneNumber:
          normalizeBrazilianPhoneDigits(contact?.number) ??
          normalizeBrazilianPhoneDigits(normalizedPeerJid) ??
          null,
      };
    }

    if (this.lidPhoneCache.has(normalizedPeerJid)) {
      const cachedPhoneJid = this.lidPhoneCache.get(normalizedPeerJid) ?? null;
      const resolvedContact = cachedPhoneJid
        ? await client.getContactById(cachedPhoneJid).catch(() => null)
        : null;

      return {
        contact: resolvedContact ?? contact ?? null,
        phoneJid: cachedPhoneJid,
        phoneNumber:
          normalizeBrazilianPhoneDigits(resolvedContact?.number) ??
          normalizeBrazilianPhoneDigits(cachedPhoneJid) ??
          null,
      };
    }

    try {
      const [resolvedIdentity] = await client.getContactLidAndPhone([
        normalizedPeerJid,
      ]);
      const resolvedPhoneJid = resolvedIdentity?.pn?.trim() || null;
      const resolvedContact = resolvedPhoneJid
        ? await client.getContactById(resolvedPhoneJid).catch(() => null)
        : null;
      const resolvedPhone =
        normalizeBrazilianPhoneDigits(resolvedContact?.number) ??
        (typeof resolvedContact?.getFormattedNumber === "function"
          ? normalizeBrazilianPhoneDigits(
              await resolvedContact.getFormattedNumber().catch(() => null),
            )
          : null) ??
        normalizeBrazilianPhoneDigits(resolvedPhoneJid) ??
        null;

      if (resolvedPhoneJid && resolvedPhone) {
        this.lidPhoneCache.set(normalizedPeerJid, resolvedPhoneJid);
      }

      return {
        contact: resolvedContact ?? contact ?? null,
        phoneJid: resolvedPhoneJid,
        phoneNumber: resolvedPhone,
      };
    } catch {
      return {
        contact: contact ?? null,
        phoneJid: null,
        phoneNumber: normalizeBrazilianPhoneDigits(contact?.number) ?? null,
      };
    }
  }

  private async resolveContactProfilePictureUrl(
    client: Client,
    options: {
      peerJid?: string | null;
      phoneJid?: string | null;
      contact?: WhatsAppContactSnapshot | null;
      resolvedContact?: WhatsAppContactSnapshot | null;
    },
  ) {
    const lookupCandidates = [
      {
        contact: options.resolvedContact ?? null,
        lookupId: options.phoneJid?.trim() || null,
      },
      {
        contact: options.contact ?? null,
        lookupId: options.contact?.id?._serialized?.trim() || null,
      },
      {
        contact: null,
        lookupId: options.peerJid?.trim() || null,
      },
    ];

    for (const candidate of lookupCandidates) {
      const lookupIds = Array.from(
        new Set(
          [
            candidate.lookupId?.trim() || null,
            candidate.contact?.id?._serialized?.trim() || null,
          ].filter((value): value is string => Boolean(value)),
        ),
      );

      if (!lookupIds.length) {
        continue;
      }

      for (const lookupId of lookupIds) {
        if (this.contactProfilePictureCache.has(lookupId)) {
          return this.contactProfilePictureCache.get(lookupId) ?? null;
        }
      }

      const profilePictureUrl = await this.tryResolveProfilePictureUrl(
        client,
        candidate.contact,
        lookupIds,
      );

      if (profilePictureUrl) {
        for (const lookupId of lookupIds) {
          this.contactProfilePictureCache.set(lookupId, profilePictureUrl);
        }

        return profilePictureUrl;
      }
    }

    return null;
  }

  private async tryResolveProfilePictureUrl(
    client: Client,
    contact: WhatsAppContactSnapshot | null,
    lookupIds: string[],
  ) {
    const attempts: Array<() => Promise<string | null>> = [];

    if (typeof contact?.getProfilePicUrl === "function") {
      attempts.push(async () => {
        const profilePictureUrl = await contact.getProfilePicUrl();
        return profilePictureUrl?.trim() || null;
      });
    }

    for (const lookupId of lookupIds) {
      attempts.push(async () => {
        const profilePictureUrl = await client.getProfilePicUrl(lookupId);
        return profilePictureUrl?.trim() || null;
      });

      attempts.push(async () => {
        const refreshedContact = await client.getContactById(lookupId).catch(
          () => null,
        );

        if (typeof refreshedContact?.getProfilePicUrl !== "function") {
          return null;
        }

        const profilePictureUrl = await refreshedContact.getProfilePicUrl();
        return profilePictureUrl?.trim() || null;
      });

      attempts.push(async () =>
        this.readProfilePictureThumbUrl(client, lookupId),
      );
    }

    for (const attempt of attempts) {
      try {
        const profilePictureUrl = await attempt();

        if (profilePictureUrl) {
          return profilePictureUrl;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async readProfilePictureThumbUrl(client: Client, contactId: string) {
    const browserPage = (
      client as Client & {
        pupPage?: {
          evaluate: <T>(
            pageFunction: (lookupId: string) => Promise<T>,
            lookupId: string,
          ) => Promise<T>;
        };
      }
    ).pupPage;

    if (!browserPage) {
      return null;
    }

    try {
      const profilePictureUrl = await browserPage.evaluate(
        async (lookupId: string) => {
          const browserWindow = window as typeof window & {
            Store?: {
              WidFactory?: {
                createWid?: (value: string) => unknown;
              };
              ProfilePicThumb?: {
                find?: (wid: unknown) => Promise<{
                  img?: string | null;
                } | null>;
              };
            };
            WWebJS?: {
              getProfilePicThumbToBase64?: (wid: unknown) => Promise<
                string | null | undefined
              >;
            };
          };

          try {
            const widFactory = browserWindow.Store?.WidFactory?.createWid;

            if (typeof widFactory !== "function") {
              return null;
            }

            const chatWid = widFactory(lookupId);
            const thumb = await browserWindow.Store?.ProfilePicThumb?.find?.(
              chatWid,
            );
            const thumbUrl =
              typeof thumb?.img === "string" ? thumb.img.trim() : null;

            if (thumbUrl) {
              return thumbUrl;
            }

            const thumbBase64 =
              await browserWindow.WWebJS?.getProfilePicThumbToBase64?.(chatWid);

            return typeof thumbBase64 === "string" && thumbBase64.trim()
              ? `data:image/jpeg;base64,${thumbBase64.trim()}`
              : null;
          } catch {
            return null;
          }
        },
        contactId,
      );

      return typeof profilePictureUrl === "string" && profilePictureUrl.trim()
        ? profilePictureUrl.trim()
        : null;
    } catch {
      return null;
    }
  }
}
