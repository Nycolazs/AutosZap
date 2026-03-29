import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInboundMessageData,
  isWhatsAppGroupMessage,
  isWhatsAppPrivateChatMessage,
  isWhatsAppStatusMessage,
} from "./message-normalizer";

test("captures the contact names exposed by whatsapp-web.js", async () => {
  const payload = await buildInboundMessageData("instance-1", {
    id: {
      _serialized: "wamid.1",
    },
    from: "5511999999999@c.us",
    to: "5511888888888@c.us",
    body: "Oi",
    type: "chat",
    timestamp: 1710000000,
    hasMedia: false,
    fromMe: false,
    ack: 0,
    getContact: async () => ({
      pushname: "Maria QR",
      name: "Maria Salva",
      shortName: "Maria",
    }),
  } as any);

  assert.equal(payload.profileName, "Maria QR");
  assert.equal(payload.contactName, "Maria Salva");
  assert.equal(payload.pushName, "Maria QR");
  assert.equal(payload.shortName, "Maria");
  assert.equal(payload.from, "5511999999999");
  assert.equal(payload.to, "5511888888888");
});

test("flags WhatsApp status updates so they can be ignored upstream", () => {
  const result = isWhatsAppStatusMessage({
    id: {
      remote: "status@broadcast",
    },
    from: "status@broadcast",
    to: "5511888888888@c.us",
    isStatus: true,
  } as any);

  assert.equal(result, true);
});

test("treats broadcast notifications as non-conversational status traffic", () => {
  const result = isWhatsAppStatusMessage({
    id: {
      remote: "5511888888888@broadcast",
    },
    from: "5511888888888@broadcast",
    to: "5511777777777@c.us",
    isStatus: false,
    broadcast: true,
    type: "broadcast_notification",
  } as any);

  assert.equal(result, true);
});

test("includes raw routing fields for backend-side status filtering", async () => {
  const payload = await buildInboundMessageData("instance-1", {
    id: {
      _serialized: "wamid.status.1",
      remote: "status@broadcast",
    },
    from: "status@broadcast",
    to: "5511888888888@c.us",
    body: "Status",
    type: "chat",
    timestamp: 1710000000,
    hasMedia: false,
    fromMe: false,
    ack: 0,
    isStatus: true,
    getContact: async () => null,
  } as any);

  assert.equal(payload.fromRaw, "status@broadcast");
  assert.equal(payload.remoteJid, "status@broadcast");
  assert.equal(payload.isStatus, true);
  assert.equal(payload.broadcast, false);
});

test("flags group chats so they can be ignored upstream", () => {
  const result = isWhatsAppGroupMessage({
    id: {
      remote: "120363025570111111@g.us",
    },
    from: "120363025570111111@g.us",
    to: "5511888888888@c.us",
  } as any);

  assert.equal(result, true);
});

test("keeps private chats eligible for sync when the peer jid is @lid", () => {
  const result = isWhatsAppPrivateChatMessage({
    id: {
      remote: "278555086868645@lid",
    },
    from: "278555086868645@lid",
    to: "5511888888888@c.us",
    fromMe: false,
  } as any);

  assert.equal(result, true);
});

test("flags newsletter chats as non-private so they can be ignored upstream", () => {
  const result = isWhatsAppPrivateChatMessage({
    id: {
      remote: "120363424919294631@newsletter",
    },
    from: "120363424919294631@newsletter",
    to: "5511888888888@c.us",
    fromMe: false,
  } as any);

  assert.equal(result, false);
});

test("includes group markers for backend-side group filtering", async () => {
  const payload = await buildInboundMessageData("instance-1", {
    id: {
      _serialized: "wamid.group.1",
      remote: "120363025570111111@g.us",
    },
    from: "120363025570111111@g.us",
    to: "5511888888888@c.us",
    body: "Mensagem do grupo",
    type: "chat",
    timestamp: 1710000000,
    hasMedia: false,
    fromMe: false,
    ack: 0,
    getContact: async () => null,
  } as any);

  assert.equal(payload.fromRaw, "120363025570111111@g.us");
  assert.equal(payload.remoteJid, "120363025570111111@g.us");
  assert.equal(payload.isGroupMsg, true);
  assert.equal(payload.isPrivateChat, false);
});

test("includes private-chat markers for backend-side sync decisions", async () => {
  const payload = await buildInboundMessageData("instance-1", {
    id: {
      _serialized: "wamid.private.1",
      remote: "278555086868645@lid",
    },
    from: "278555086868645@lid",
    to: "5511888888888@c.us",
    body: "Mensagem privada",
    type: "chat",
    timestamp: 1710000000,
    hasMedia: false,
    fromMe: false,
    ack: 0,
    getContact: async () => null,
  } as any);

  assert.equal(payload.remoteJid, "278555086868645@lid");
  assert.equal(payload.isPrivateChat, true);
});

test("includes archived markers so upstream persistence can reject archived chats", async () => {
  const payload = await buildInboundMessageData(
    "instance-1",
    {
      id: {
        _serialized: "wamid.archived.1",
        remote: "5511999999999@c.us",
      },
      from: "5511999999999@c.us",
      to: "5511888888888@c.us",
      body: "Mensagem arquivada",
      type: "chat",
      timestamp: 1710000000,
      hasMedia: false,
      fromMe: false,
      ack: 0,
      getContact: async () => null,
    } as any,
    {
      isArchivedChat: true,
    },
  );

  assert.equal(payload.isPrivateChat, true);
  assert.equal(payload.isArchivedChat, true);
});

test("marks qr voice notes with audio metadata that the inbox can render correctly", async () => {
  const payload = await buildInboundMessageData("instance-1", {
    id: {
      _serialized: "wamid.voice.1",
      remote: "5511999999999@c.us",
    },
    from: "5511999999999@c.us",
    to: "5511888888888@c.us",
    body: "",
    type: "ptt",
    duration: "11",
    timestamp: 1710000000,
    hasMedia: true,
    fromMe: false,
    ack: 0,
    _data: {
      mimetype: "audio/ogg; codecs=opus",
      filename: null,
      size: 4,
      isPtt: true,
    },
    getContact: async () => null,
  } as any);

  assert.equal(payload.voice, true);
  assert.equal(payload.durationSeconds, 11);
  assert.deepEqual(payload.media, {
    mimeType: "audio/ogg; codecs=opus",
    fileName: null,
    size: 4,
    voice: true,
    durationSeconds: 11,
    isBase64: false,
    downloadStrategy: "session",
  });
});

test("derives missed inbound call logs even when WhatsApp Web omits a body", async () => {
  const payload = await buildInboundMessageData("instance-1", {
    id: {
      _serialized: "wamid.call.1",
      remote: "5511999999999@c.us",
    },
    from: "5511999999999@c.us",
    to: "5511888888888@c.us",
    body: "",
    type: "call_log",
    timestamp: 1710000000,
    hasMedia: false,
    fromMe: false,
    ack: 0,
    getContact: async () => null,
  } as any);

  assert.deepEqual(payload.call, {
    status: "missed",
    type: null,
    durationSeconds: null,
  });
  assert.equal(payload.durationSeconds, null);
});

test("keeps call metadata that the inbox can use for connected outbound call logs", async () => {
  const payload = await buildInboundMessageData("instance-1", {
    id: {
      _serialized: "wamid.call.2",
      remote: "5511999999999@c.us",
    },
    from: "5511888888888@c.us",
    to: "5511999999999@c.us",
    body: "",
    type: "call_log",
    duration: "42",
    timestamp: 1710000000,
    hasMedia: false,
    fromMe: true,
    ack: 0,
    _data: {
      isVideo: true,
      callStatus: "connected",
    },
    getContact: async () => null,
  } as any);

  assert.deepEqual(payload.call, {
    status: "connected",
    type: "video",
    durationSeconds: 42,
  });
  assert.equal(payload.durationSeconds, 42);
});
