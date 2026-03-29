import type { Message } from "whatsapp-web.js";

const WHATSAPP_STATUS_BROADCAST_JID = "status@broadcast";
const WHATSAPP_GROUP_JID_SUFFIX = "@g.us";
const WHATSAPP_BROADCAST_JID_SUFFIX = "@broadcast";
const WHATSAPP_NEWSLETTER_JID_SUFFIX = "@newsletter";
const WHATSAPP_PRIVATE_JID_SUFFIXES = ["@c.us", "@lid"] as const;

type WhatsAppContactSnapshot = {
  id?: {
    _serialized?: string | null;
  } | null;
  number?: string | null;
  pushname?: string | null;
  name?: string | null;
  shortName?: string | null;
  getProfilePicUrl?: (() => Promise<string>) | null;
};

type WhatsAppMessageMediaSnapshot = {
  mimetype?: string | null;
  filename?: string | null;
  size?: number | null;
  isPtt?: boolean | null;
};

function normalizePhone(value?: string | null) {
  if (!value) return null;
  return value.replace(/[^\d+]/g, "").trim() || null;
}

function normalizePhoneFromJid(value?: string | null) {
  if (!value) {
    return null;
  }

  const normalizedValue = value.trim();
  const user = normalizedValue.includes("@")
    ? normalizedValue.slice(0, normalizedValue.indexOf("@"))
    : normalizedValue;

  return normalizePhone(user);
}

function isStatusBroadcastJid(value?: string | null) {
  return value?.trim() === WHATSAPP_STATUS_BROADCAST_JID;
}

function isGroupJid(value?: string | null) {
  return value?.trim().endsWith(WHATSAPP_GROUP_JID_SUFFIX) ?? false;
}

function isPrivateJid(value?: string | null) {
  const normalized = value?.trim();

  return normalized
    ? WHATSAPP_PRIVATE_JID_SUFFIXES.some((suffix) =>
        normalized.endsWith(suffix),
      )
    : false;
}

function readPeerJid(message: Pick<Message, "id" | "from" | "to" | "fromMe">) {
  return readRemoteJid(message) ?? (message.fromMe ? message.to : message.from);
}

function readRemoteJid(message: Pick<Message, "id">) {
  const remote = (message.id as { remote?: unknown } | undefined)?.remote;
  return typeof remote === "string" ? remote : null;
}

function pickFirstContactName(...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    const normalizedCandidate = candidate?.trim();

    if (normalizedCandidate) {
      return normalizedCandidate;
    }
  }

  return undefined;
}

export function isWhatsAppStatusMessage(
  message: Pick<
    Message,
    "broadcast" | "id" | "isStatus" | "from" | "to" | "type"
  >,
) {
  return (
    message.isStatus === true ||
    isStatusBroadcastJid(message.from) ||
    isStatusBroadcastJid(message.to) ||
    isStatusBroadcastJid(readRemoteJid(message)) ||
    (message.broadcast === true && message.type === "broadcast_notification")
  );
}

export function isWhatsAppGroupMessage(
  message: Pick<Message, "id" | "from" | "to">,
) {
  return (
    isGroupJid(message.from) ||
    isGroupJid(message.to) ||
    isGroupJid(readRemoteJid(message))
  );
}

export function isWhatsAppPrivateChatMessage(
  message: Pick<Message, "id" | "from" | "to" | "fromMe">,
) {
  const peerJid = readPeerJid(message);

  if (!peerJid) {
    return false;
  }

  if (peerJid === WHATSAPP_STATUS_BROADCAST_JID) {
    return false;
  }

  if (
    peerJid.endsWith(WHATSAPP_GROUP_JID_SUFFIX) ||
    peerJid.endsWith(WHATSAPP_BROADCAST_JID_SUFFIX) ||
    peerJid.endsWith(WHATSAPP_NEWSLETTER_JID_SUFFIX)
  ) {
    return false;
  }

  return isPrivateJid(peerJid);
}

export async function buildInboundMessageData(
  instanceId: string,
  message: Message,
  options?: {
    contact?: WhatsAppContactSnapshot | null;
    peerPhoneNumber?: string | null;
    contactProfilePictureUrl?: string | null;
    isArchivedChat?: boolean;
  },
): Promise<Record<string, unknown>> {
  const contact =
    options?.contact ?? (await message.getContact().catch(() => null));
  let media: Record<string, unknown> | null = null;
  const rawMedia = (message as unknown as { _data?: WhatsAppMessageMediaSnapshot })
    ._data;
  const isVoiceMessage =
    message.type === "ptt" ||
    (rawMedia?.isPtt ?? false) === true;
  const durationSeconds = Number.parseInt(message.duration ?? "0", 10);

  if (message.hasMedia) {
    media = {
      mimeType: rawMedia?.mimetype?.trim() || null,
      fileName: rawMedia?.filename?.trim() || null,
      size: typeof rawMedia?.size === "number" ? rawMedia.size : null,
      voice: isVoiceMessage,
      durationSeconds:
        Number.isFinite(durationSeconds) && durationSeconds > 0
          ? durationSeconds
          : null,
      isBase64: false,
      downloadStrategy: "session",
    };
  }

  const profileName = pickFirstContactName(
    contact?.pushname,
    contact?.name,
    contact?.shortName,
  );
  const peerPhoneNumber =
    options?.peerPhoneNumber ??
    contact?.number?.trim() ??
    normalizePhoneFromJid(readPeerJid(message));
  const contactProfilePictureUrl =
    options?.contactProfilePictureUrl?.trim() || null;

  return {
    instanceId,
    messageId: message.id?._serialized,
    from: message.fromMe
      ? normalizePhone(message.from)
      : peerPhoneNumber ?? normalizePhone(message.from),
    to: message.fromMe
      ? peerPhoneNumber ?? normalizePhone(message.to)
      : normalizePhone(message.to),
    fromRaw: message.from ?? null,
    toRaw: message.to ?? null,
    remoteJid: readRemoteJid(message),
    profileName,
    contactPhone: peerPhoneNumber ?? null,
    contactProfilePictureUrl,
    contactName: pickFirstContactName(contact?.name),
    pushName: pickFirstContactName(contact?.pushname),
    shortName: pickFirstContactName(contact?.shortName),
    body: message.body ?? "",
    type: message.type,
    timestamp: message.timestamp ? message.timestamp * 1000 : Date.now(),
    isStatus: isWhatsAppStatusMessage(message),
    broadcast: message.broadcast ?? false,
    isGroupMsg: isWhatsAppGroupMessage(message),
    isPrivateChat: isWhatsAppPrivateChatMessage(message),
    isArchivedChat: options?.isArchivedChat === true,
    hasMedia: message.hasMedia ?? false,
    voice: isVoiceMessage,
    durationSeconds:
      Number.isFinite(durationSeconds) && durationSeconds > 0
        ? durationSeconds
        : null,
    media,
    quotedMessageId:
      (message as unknown as { _data?: { quotedMsgId?: string } })._data
        ?.quotedMsgId ?? null,
    fromMe: message.fromMe ?? false,
    ack: message.ack,
  };
}

export function buildMessageStatusData(payload: {
  instanceId: string;
  messageId?: string;
  status: string;
  ack?: number;
  to?: string | null;
  from?: string | null;
  body?: string | null;
  type?: string | null;
}) {
  return payload;
}
