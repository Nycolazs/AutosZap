import assert from "node:assert/strict";
import test from "node:test";
import { WhatsAppSession } from "./whatsapp-session";

function createSession(
  send: (
    instanceId: string,
    event: Record<string, unknown>,
  ) => Promise<void> = async () => undefined,
) {
  return new WhatsAppSession({
    instanceId: "instance-test",
    sessionDir: "/tmp/autoszap-gateway-tests",
    callbackSecret: "secret",
    callbackTransport: {
      send: send as never,
    },
    chromiumPath: "/tmp/chromium",
    headless: true,
    autoRestartDelayMs: 100,
  });
}

test("recovers corrupted session on launch failure when requested", async () => {
  const session = createSession() as any;
  let initializeCalls = 0;
  let resetCalls = 0;

  session.initializeClient = async () => {
    initializeCalls += 1;

    if (initializeCalls === 1) {
      throw new Error("Protocol error (Target.setAutoAttach): Target closed");
    }

    session.client = {};
    session.state = "qr";
    session.lastError = null;
  };

  session.resetSessionArtifacts = async ({
    clearSession,
  }: {
    clearSession: boolean;
  }) => {
    resetCalls += 1;
    assert.equal(clearSession, true);
  };

  await session.start({ recoverCorruptedSession: true });

  assert.equal(initializeCalls, 2);
  assert.equal(resetCalls, 1);
  assert.equal(session.getState().status, "qr");
  assert.equal(session.getState().lastError, null);
});

test("does not reset session when recovery is disabled", async () => {
  const session = createSession() as any;
  let resetCalls = 0;

  session.initializeClient = async () => {
    throw new Error("Protocol error (Target.setAutoAttach): Target closed");
  };

  session.resetSessionArtifacts = async () => {
    resetCalls += 1;
  };

  await assert.rejects(() => session.start(), /Target\.setAutoAttach/);
  assert.equal(resetCalls, 0);
});

test("syncs private chat history and includes inbound and outbound messages", async () => {
  const emittedEvents: Array<Record<string, unknown>> = [];
  const session = createSession(async (_instanceId, event) => {
    emittedEvents.push(event as Record<string, unknown>);
  }) as any;

  session.ensureClientReady = async () => ({
    getChats: async () => [
      {
        id: {
          _serialized: "5511999999999@c.us",
        },
        syncHistory: async () => true,
        getContact: async () => ({
          pushname: "Maria QR",
          name: "Maria Salva",
          shortName: "Maria",
        }),
        fetchMessages: async () => [
          {
            id: {
              _serialized: "wamid.inbound.1",
              remote: "5511999999999@c.us",
            },
            from: "5511999999999@c.us",
            to: "5511888888888@c.us",
            body: "Oi",
            type: "chat",
            timestamp: 1710000000,
            hasMedia: false,
            fromMe: false,
            ack: 0,
            getContact: async () => null,
          },
          {
            id: {
              _serialized: "wamid.outbound.1",
              remote: "5511999999999@c.us",
            },
            from: "5511888888888@c.us",
            to: "5511999999999@c.us",
            body: "Resposta",
            type: "chat",
            timestamp: 1710000001,
            hasMedia: false,
            fromMe: true,
            ack: 2,
            getContact: async () => null,
          },
        ],
      },
      {
        id: {
          _serialized: "120363025570111111@g.us",
        },
        syncHistory: async () => true,
        getContact: async () => null,
        fetchMessages: async () => [],
      },
    ],
  });

  const result = await session.syncHistory();

  assert.equal(result.chatsEvaluated, 2);
  assert.equal(result.chatsEligible, 1);
  assert.equal(result.chatsSynced, 1);
  assert.equal(result.messagesDiscovered, 2);
  assert.equal(result.messagesEmitted, 2);
  assert.equal(result.inboundMessages, 1);
  assert.equal(result.outboundMessages, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(emittedEvents.length, 1);
  assert.equal(emittedEvents[0]?.event, "messages.batch");

  const payload = emittedEvents[0]?.data as
    | { messages?: Array<Record<string, unknown>> }
    | undefined;

  assert.equal(payload?.messages?.length, 2);
  assert.equal(payload?.messages?.[0]?.fromMe, false);
  assert.equal(payload?.messages?.[1]?.fromMe, true);
});

test("downloads historical qr media so old chat attachments can be persisted", async () => {
  const emittedEvents: Array<Record<string, unknown>> = [];
  const session = createSession(async (_instanceId, event) => {
    emittedEvents.push(event as Record<string, unknown>);
  }) as any;

  session.ensureClientReady = async () => ({
    getChats: async () => [
      {
        id: {
          _serialized: "5511999999999@c.us",
        },
        syncHistory: async () => true,
        getContact: async () => ({
          pushname: "Maria QR",
          name: "Maria Salva",
          shortName: "Maria",
        }),
        fetchMessages: async () => [
          {
            id: {
              _serialized: "wamid.media.history.1",
              remote: "5511999999999@c.us",
            },
            from: "5511999999999@c.us",
            to: "5511888888888@c.us",
            body: "",
            type: "image",
            timestamp: 1710000000,
            hasMedia: true,
            fromMe: false,
            ack: 1,
            duration: "0",
            _data: {
              mimetype: "image/jpeg",
              filename: "historia.jpg",
              size: 5,
            },
            downloadMedia: async () => ({
              data: "aGVsbG8=",
              mimetype: "image/jpeg",
              filename: "historia.jpg",
              filesize: 5,
            }),
            getContact: async () => null,
          },
        ],
      },
    ],
  });

  const result = await session.syncHistory();

  assert.equal(result.mediaMessages, 1);
  assert.equal(emittedEvents.length, 1);

  const payload = emittedEvents[0]?.data as
    | { messages?: Array<Record<string, unknown>> }
    | undefined;
  const message = payload?.messages?.[0];
  const media = message?.media as Record<string, unknown> | undefined;

  assert.equal(message?.hasMedia, true);
  assert.equal(media?.dataBase64, "aGVsbG8=");
  assert.equal(media?.downloadStrategy, "history-sync");
  assert.equal(media?.isBase64, true);
});

test("resolves @lid contacts to a brazilian phone and avatar during qr history sync", async () => {
  const emittedEvents: Array<Record<string, unknown>> = [];
  const session = createSession(async (_instanceId, event) => {
    emittedEvents.push(event as Record<string, unknown>);
  }) as any;

  session.ensureClientReady = async () => ({
    getChats: async () => [
      {
        id: {
          _serialized: "163144450211915@lid",
        },
        syncHistory: async () => true,
        getContact: async () => ({
          id: {
            _serialized: "163144450211915@lid",
          },
          pushname: "Rafael Nunes",
          name: "Rafael Nunes",
          shortName: "Rafael",
          number: null,
        }),
        fetchMessages: async () => [
          {
            id: {
              _serialized: "wamid.lid.1",
              remote: "163144450211915@lid",
            },
            from: "163144450211915@lid",
            to: "558585712528@c.us",
            body: "Oi",
            type: "chat",
            timestamp: 1710000000,
            hasMedia: false,
            fromMe: false,
            ack: 1,
            getContact: async () => null,
          },
        ],
      },
    ],
    getContactLidAndPhone: async () => [
      {
        lid: "163144450211915@lid",
        pn: "5511998765432@c.us",
      },
    ],
    getContactById: async (contactId: string) => ({
      id: {
        _serialized: contactId,
      },
      number: "5511998765432",
      pushname: "Rafael Nunes",
      name: "Rafael Nunes",
      shortName: "Rafael",
      getFormattedNumber: async () => "+55 11 99876-5432",
      getProfilePicUrl: async () => {
        throw new Error("contact profile picture lookup failed");
      },
    }),
    getProfilePicUrl: async (contactId: string) =>
      contactId === "5511998765432@c.us"
        ? "https://cdn.example.com/rafael.jpg"
        : null,
  });

  const result = await session.syncHistory();

  assert.equal(result.messagesEmitted, 1);
  assert.equal(emittedEvents.length, 1);

  const payload = emittedEvents[0]?.data as
    | { messages?: Array<Record<string, unknown>> }
    | undefined;

  assert.equal(payload?.messages?.[0]?.from, "5511998765432");
  assert.equal(payload?.messages?.[0]?.contactPhone, "5511998765432");
  assert.equal(
    payload?.messages?.[0]?.contactProfilePictureUrl,
    "https://cdn.example.com/rafael.jpg",
  );
});

test("recursively retries qr chat enrichment until phone and avatar become available", async () => {
  const emittedEvents: Array<Record<string, unknown>> = [];
  const session = createSession(async (_instanceId, event) => {
    emittedEvents.push(event as Record<string, unknown>);
  }) as any;
  let lidLookupCalls = 0;

  session.ensureClientReady = async () => ({
    getChats: async () => [
      {
        id: {
          _serialized: "23123123123123@lid",
        },
        syncHistory: async () => true,
        getContact: async () => ({
          id: {
            _serialized: "23123123123123@lid",
          },
          pushname: "Bianca Lima",
          name: "Bianca Lima",
          shortName: "Bianca",
          number: null,
        }),
        fetchMessages: async () => [
          {
            id: {
              _serialized: "wamid.recursive.1",
              remote: "23123123123123@lid",
            },
            from: "23123123123123@lid",
            to: "558585712528@c.us",
            body: "Oi, ainda nao apareceu minha foto",
            type: "chat",
            timestamp: 1710000000,
            hasMedia: false,
            fromMe: false,
            ack: 1,
            getContact: async () => null,
          },
        ],
      },
    ],
    getContactLidAndPhone: async () => {
      lidLookupCalls += 1;

      if (lidLookupCalls === 1) {
        return [
          {
            lid: "23123123123123@lid",
            pn: null,
          },
        ];
      }

      return [
        {
          lid: "23123123123123@lid",
          pn: "5511987654321@c.us",
        },
      ];
    },
    getContactById: async (contactId: string) =>
      contactId === "5511987654321@c.us"
        ? {
            id: {
              _serialized: contactId,
            },
            number: "5511987654321",
            pushname: "Bianca Lima",
            name: "Bianca Lima",
            shortName: "Bianca",
            getFormattedNumber: async () => "+55 11 98765-4321",
            getProfilePicUrl: async () => "https://cdn.example.com/bianca.jpg",
          }
        : null,
    getProfilePicUrl: async (contactId: string) =>
      contactId === "5511987654321@c.us"
        ? "https://cdn.example.com/bianca.jpg"
        : null,
  });

  const result = await session.syncHistory();

  assert.equal(result.chatsSynced, 1);
  assert.equal(result.messagesDiscovered, 1);
  assert.equal(result.messagesEmitted, 2);
  assert.equal(lidLookupCalls, 2);
  assert.equal(emittedEvents.length, 2);

  const firstPayload = emittedEvents[0]?.data as
    | { messages?: Array<Record<string, unknown>> }
    | undefined;
  const lastPayload = emittedEvents[1]?.data as
    | { messages?: Array<Record<string, unknown>> }
    | undefined;

  assert.notEqual(firstPayload?.messages?.[0]?.contactPhone, "5511987654321");
  assert.equal(firstPayload?.messages?.[0]?.contactProfilePictureUrl, null);
  assert.equal(lastPayload?.messages?.[0]?.contactPhone, "5511987654321");
  assert.equal(
    lastPayload?.messages?.[0]?.contactProfilePictureUrl,
    "https://cdn.example.com/bianca.jpg",
  );
});

test("falls back to the cached profile picture thumb when direct qr avatar URLs are unavailable", async () => {
  const emittedEvents: Array<Record<string, unknown>> = [];
  const session = createSession(async (_instanceId, event) => {
    emittedEvents.push(event as Record<string, unknown>);
  }) as any;

  session.ensureClientReady = async () => ({
    getChats: async () => [
      {
        id: {
          _serialized: "5511999999999@c.us",
        },
        syncHistory: async () => true,
        getContact: async () => ({
          id: {
            _serialized: "5511999999999@c.us",
          },
          pushname: "Marina Souza",
          name: "Marina Souza",
          shortName: "Marina",
          number: "5511999999999",
          getProfilePicUrl: async () => null,
        }),
        fetchMessages: async () => [
          {
            id: {
              _serialized: "wamid.thumb.1",
              remote: "5511999999999@c.us",
            },
            from: "5511999999999@c.us",
            to: "5511888888888@c.us",
            body: "Minha foto vem do thumb",
            type: "chat",
            timestamp: 1710000000,
            hasMedia: false,
            fromMe: false,
            ack: 1,
            getContact: async () => null,
          },
        ],
      },
    ],
    getProfilePicUrl: async () => null,
    getContactById: async (contactId: string) => ({
      id: {
        _serialized: contactId,
      },
      number: "5511999999999",
      pushname: "Marina Souza",
      name: "Marina Souza",
      shortName: "Marina",
      getProfilePicUrl: async () => null,
    }),
    pupPage: {
      evaluate: async (_pageFunction: unknown, contactId: string) =>
        contactId === "5511999999999@c.us"
          ? "data:image/jpeg;base64,thumb-image"
          : null,
    },
  });

  await session.syncHistory();

  const payload = emittedEvents[0]?.data as
    | { messages?: Array<Record<string, unknown>> }
    | undefined;

  assert.equal(
    payload?.messages?.[0]?.contactProfilePictureUrl,
    "data:image/jpeg;base64,thumb-image",
  );
});

test("skips archived private chats during qr history sync", async () => {
  const emittedEvents: Array<Record<string, unknown>> = [];
  const session = createSession(async (_instanceId, event) => {
    emittedEvents.push(event as Record<string, unknown>);
  }) as any;

  session.ensureClientReady = async () => ({
    getChats: async () => [
      {
        id: {
          _serialized: "5511888888888@c.us",
        },
        archived: true,
        syncHistory: async () => true,
        getContact: async () => null,
        fetchMessages: async () => [
          {
            id: {
              _serialized: "wamid.archived.1",
              remote: "5511888888888@c.us",
            },
            from: "5511888888888@c.us",
            to: "5511999999999@c.us",
            body: "Nao importar",
            type: "chat",
            timestamp: 1710000000,
            hasMedia: false,
            fromMe: false,
            ack: 0,
            getContact: async () => null,
          },
        ],
      },
      {
        id: {
          _serialized: "5511999999999@c.us",
        },
        archived: false,
        syncHistory: async () => true,
        getContact: async () => null,
        fetchMessages: async () => [
          {
            id: {
              _serialized: "wamid.active.1",
              remote: "5511999999999@c.us",
            },
            from: "5511999999999@c.us",
            to: "5511888888888@c.us",
            body: "Importar",
            type: "chat",
            timestamp: 1710000001,
            hasMedia: false,
            fromMe: false,
            ack: 0,
            getContact: async () => null,
          },
        ],
      },
    ],
  });

  const result = await session.syncHistory();

  assert.equal(result.chatsEvaluated, 2);
  assert.equal(result.chatsEligible, 1);
  assert.equal(result.chatsSynced, 1);
  assert.equal(result.messagesDiscovered, 1);
  assert.equal(result.messagesEmitted, 1);
  assert.equal(emittedEvents.length, 1);
});

test("ignores realtime messages from archived private chats", async () => {
  const emittedEvents: Array<Record<string, unknown>> = [];
  const session = createSession(async (_instanceId, event) => {
    emittedEvents.push(event as Record<string, unknown>);
  }) as any;
  const handlers: Record<string, (...args: Array<any>) => Promise<void>> = {};

  session.attachEvents({
    on(event: string, handler: (...args: Array<any>) => Promise<void>) {
      handlers[event] = handler;
    },
  });

  await handlers.message_create?.({
    id: {
      _serialized: "wamid.archived.realtime.1",
      remote: "5511999999999@c.us",
    },
    from: "5511999999999@c.us",
    to: "5511888888888@c.us",
    body: "Nao mostrar",
    type: "chat",
    timestamp: 1710000000,
    hasMedia: false,
    fromMe: false,
    ack: 0,
    getChat: async () => ({
      archived: true,
    }),
    getContact: async () => null,
  });

  assert.equal(emittedEvents.length, 0);
});

test("downloads realtime qr media so inbound attachments can be persisted immediately", async () => {
  const emittedEvents: Array<Record<string, unknown>> = [];
  const session = createSession(async (_instanceId, event) => {
    emittedEvents.push(event as Record<string, unknown>);
  }) as any;
  const handlers: Record<string, (...args: Array<any>) => Promise<void>> = {};

  session.attachEvents({
    on(event: string, handler: (...args: Array<any>) => Promise<void>) {
      handlers[event] = handler;
    },
  });

  await handlers.message_create?.({
    id: {
      _serialized: "wamid.realtime.media.1",
      remote: "5511999999999@c.us",
    },
    from: "5511999999999@c.us",
    to: "5511888888888@c.us",
    body: "",
    type: "image",
    timestamp: 1710000000,
    hasMedia: true,
    fromMe: false,
    ack: 0,
    getChat: async () => ({
      archived: false,
    }),
    getContact: async () => null,
    _data: {
      mimetype: "image/jpeg",
      filename: "tempo-real.jpg",
      size: 5,
    },
    downloadMedia: async () => ({
      data: "aGVsbG8=",
      mimetype: "image/jpeg",
      filename: "tempo-real.jpg",
      filesize: 5,
    }),
  });

  assert.equal(emittedEvents.length, 1);
  assert.equal(emittedEvents[0]?.event, "message.inbound");

  const payload = emittedEvents[0]?.data as Record<string, unknown> | undefined;
  const media = payload?.media as Record<string, unknown> | undefined;

  assert.equal(payload?.hasMedia, true);
  assert.equal(media?.dataBase64, "aGVsbG8=");
  assert.equal(media?.downloadStrategy, "realtime");
  assert.equal(media?.isBase64, true);
});

test("sends recorded audio as a WhatsApp voice note when requested", async () => {
  const sentPayloads: Array<Record<string, unknown>> = [];
  const session = createSession() as any;

  session.ensureClientReady = async () => ({
    sendMessage: async (
      to: string,
      _media: unknown,
      options?: Record<string, unknown>,
    ) => {
      sentPayloads.push({
        to,
        ...(options ?? {}),
      });

      return {
        id: {
          _serialized: "wamid.voice.outbound.1",
        },
        ack: 1,
      };
    },
  });

  await session.sendMedia({
    to: "5511999999999",
    dataBase64: "ZGF0YQ==",
    mimeType: "audio/ogg; codecs=opus",
    fileName: "voice-note.ogg",
    voice: true,
  });

  assert.equal(sentPayloads.length, 1);
  assert.equal(sentPayloads[0]?.to, "5511999999999@c.us");
  assert.equal(sentPayloads[0]?.sendAudioAsVoice, true);
  assert.equal(sentPayloads[0]?.sendMediaAsDocument, false);
});

test("prefers the resolved @lid recipient when sending text to qr contacts", async () => {
  const sentRecipients: string[] = [];
  const session = createSession() as any;

  session.ensureClientReady = async () => ({
    getContactLidAndPhone: async () => [
      {
        lid: "163144450211915@lid",
        pn: "5542999792797@c.us",
      },
    ],
    sendMessage: async (to: string) => {
      sentRecipients.push(to);

      return {
        id: {
          _serialized: "wamid.text.outbound.1",
        },
        ack: 1,
      };
    },
  });

  await session.sendText({
    to: "5542999792797",
    body: "Oi",
  });

  assert.deepEqual(sentRecipients, ["163144450211915@lid"]);
});

test("falls back to the phone jid when the first qr recipient attempt requires a lid", async () => {
  const sentRecipients: string[] = [];
  const session = createSession() as any;

  session.ensureClientReady = async () => ({
    getContactLidAndPhone: async () => [
      {
        pn: "5542999792797@c.us",
      },
    ],
    sendMessage: async (to: string) => {
      sentRecipients.push(to);

      if (to === "163144450211915@lid") {
        throw new Error("No LID for user new");
      }

      return {
        id: {
          _serialized: "wamid.text.outbound.2",
        },
        ack: 1,
      };
    },
  });

  await session.sendText({
    to: "163144450211915@lid",
    body: "Oi",
  });

  assert.deepEqual(sentRecipients, [
    "163144450211915@lid",
    "5542999792797@c.us",
  ]);
});

test("downloads message media directly from the active qr session", async () => {
  const session = createSession() as any;

  session.ensureClientReady = async () => ({
    getMessageById: async (messageId: string) => ({
      id: {
        _serialized: messageId,
      },
      hasMedia: true,
      downloadMedia: async () => ({
        data: "aGVsbG8=",
        mimetype: "image/jpeg",
        filename: "photo.jpg",
        filesize: 5,
      }),
    }),
  });

  const result = await session.downloadMessageMedia("wamid.media.1");

  assert.equal(result.buffer.toString("utf8"), "hello");
  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(result.fileName, "photo.jpg");
  assert.equal(result.contentLength, 5);
});

test("desiredState is stopped after disconnect and running after start", async () => {
  const session = createSession() as any;

  session.initializeClient = async () => {
    session.client = {};
    session.state = "connected";
  };
  session.resetSessionArtifacts = async () => {};

  await session.start();
  assert.equal(session.getState().desiredState, "running");

  await session.stop(false);
  assert.equal(session.getState().desiredState, "stopped");
  assert.equal(session.getState().status, "stopped");
});

test("stop clears qr state and preserves profile picture when not logging out", async () => {
  const session = createSession() as any;

  session.initializeClient = async () => {
    session.client = {};
    session.state = "qr";
    session.qr = "raw-qr-data";
    session.qrDataUrl = "data:image/png;base64,qr";
    session.qrExpiresAt = new Date();
    session.profilePictureUrl = "https://example.com/profile.jpg";
  };
  session.resetSessionArtifacts = async () => {};

  await session.start();
  await session.stop(false);

  const state = session.getState();
  assert.equal(state.qr, null);
  assert.equal(state.qrDataUrl, null);
  assert.equal(state.qrExpiresAt, null);
  assert.equal(state.profilePictureUrl, "https://example.com/profile.jpg");
});

test("stop clears profile picture when logging out", async () => {
  const session = createSession() as any;

  session.initializeClient = async () => {
    session.client = {};
    session.state = "connected";
    session.profilePictureUrl = "https://example.com/profile.jpg";
  };
  session.resetSessionArtifacts = async () => {};

  await session.start();
  await session.stop(true);

  assert.equal(session.getState().profilePictureUrl, null);
});
