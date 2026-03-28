import { WhatsAppWebService } from './whatsapp-web.service';

describe('WhatsAppWebService inbound event mapping', () => {
  type PrivateServiceApi = {
    handleGatewayEventInTenantContext: (
      instanceId: string,
      payload: {
        instanceId: string;
        event: string;
        data: Record<string, unknown>;
      },
    ) => Promise<unknown>;
    mapInboundEvent: (
      instanceId: string,
      payload: Record<string, unknown>,
    ) => {
      from: string;
      profileName?: string;
      messageType: string;
      metadata: Record<string, unknown>;
    };
    shouldIgnoreInboundPayload: (payload: Record<string, unknown>) => boolean;
    mapGatewayEventType: (eventName: string) => string;
    buildHistorySyncDetail: (payload: {
      messagesDiscovered: number;
      chatsSynced: number;
      outboundMessages: number;
      inboundMessages: number;
      errors: Array<{ chatId?: string; message: string }>;
    }) => string;
    mapGatewayStateToInstanceUpdate: (state: {
      instanceId: string;
      status: 'connected';
      desiredState: 'running';
      hasSession: boolean;
      profilePictureUrl?: string | null;
      connectedAt: string;
      readyAt: string;
      lastSeenAt: string;
    }) => Record<string, unknown>;
  };

  function createService() {
    return new WhatsAppWebService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  function privateApi(service: WhatsAppWebService) {
    return service as unknown as PrivateServiceApi;
  }

  it('preserves the best contact name emitted by the gateway', () => {
    const service = createService();

    const result = privateApi(service).mapInboundEvent('instance-1', {
      from: '5511999999999',
      messageId: 'wamid.1',
      type: 'text',
      body: 'Oi',
      timestamp: 1710000000000,
      pushName: 'Maria QR',
      shortName: 'Maria',
    });

    expect(result.profileName).toBe('Maria QR');
    expect(result.metadata.contact).toEqual(
      expect.objectContaining({
        profileName: 'Maria QR',
        pushName: 'Maria QR',
        shortName: 'Maria',
      }),
    );
  });

  it('maps phone-sent private messages to the peer contact instead of the own number', () => {
    const service = createService();

    const result = privateApi(service).mapInboundEvent('instance-1', {
      from: '5511999999999',
      to: '5511888888888',
      fromMe: true,
      messageId: 'wamid.outbound.1',
      type: 'text',
      body: 'Oi do celular',
      timestamp: 1710000000000,
    });

    expect(result.from).toBe('5511888888888');
    expect(result.metadata.fromMe).toBe(true);
    expect((result.metadata.providerMessageContext as any).fromMe).toBe(true);
  });

  it('preserves voice-note metadata emitted by the qr gateway', () => {
    const service = createService();

    const result = privateApi(service).mapInboundEvent('instance-1', {
      from: '5511999999999',
      messageId: 'wamid.voice.1',
      type: 'ptt',
      body: '',
      timestamp: 1710000000000,
      voice: true,
      durationSeconds: 14,
      media: {
        mimeType: 'audio/ogg; codecs=opus',
        size: 2048,
        voice: true,
        durationSeconds: 14,
      },
    });

    expect(result.messageType).toBe('ptt');
    expect(result.metadata.voice).toBe(true);
    expect(result.metadata.durationSeconds).toBe(14);
    expect(result.metadata.media).toEqual(
      expect.objectContaining({
        mimeType: 'audio/ogg; codecs=opus',
        size: 2048,
        voice: true,
        durationSeconds: 14,
      }),
    );
  });

  it('maps profile picture updates from the qr gateway into instance cache fields', () => {
    const service = createService();

    const result = privateApi(service).mapGatewayStateToInstanceUpdate({
      instanceId: 'instance-1',
      status: 'connected',
      desiredState: 'running',
      hasSession: true,
      profilePictureUrl: 'https://cdn.example.com/profile.jpg',
      connectedAt: '2026-03-26T18:00:00.000Z',
      readyAt: '2026-03-26T18:00:00.000Z',
      lastSeenAt: '2026-03-26T18:00:05.000Z',
    });

    expect(result).toEqual(
      expect.objectContaining({
        profilePictureUrl: 'https://cdn.example.com/profile.jpg',
        profilePictureUpdatedAt: expect.any(Date),
      }),
    );
  });

  it('triggers qr history sync when the gateway reports a connected session', async () => {
    const prisma = {
      instance: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'instance-1',
          workspaceId: 'workspace-1',
          providerMetadata: null,
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      whatsAppWebhookEvent: {
        create: jest.fn().mockResolvedValue({
          id: 'webhook-1',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new WhatsAppWebService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {
        processIncomingPayload: jest.fn(),
      } as never,
    );
    const syncSpy = jest
      .spyOn(service as any, 'syncConnectedInstanceHistory')
      .mockResolvedValue(undefined);

    await privateApi(service).handleGatewayEventInTenantContext('instance-1', {
      instanceId: 'instance-1',
      event: 'session.connected',
      data: {
        connectedAt: '2026-03-26T18:00:00.000Z',
      },
    });

    expect(syncSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'instance-1',
      }),
      expect.objectContaining({
        trigger: 'session.connected',
      }),
    );
    expect(prisma.whatsAppWebhookEvent.update).toHaveBeenCalledWith({
      where: {
        id: 'webhook-1',
      },
      data: {
        processedAt: expect.any(Date),
      },
    });
  });

  it('auto-syncs connected qr history when the connection state is refreshed without a fresh snapshot', async () => {
    const prisma = {
      instance: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'instance-1',
          workspaceId: 'workspace-1',
          provider: 'WHATSAPP_WEB',
          providerMetadata: null,
          connectedAt: null,
          deletedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const gatewayClient = {
      registerInstance: jest.fn().mockResolvedValue({
        state: {
          instanceId: 'instance-1',
          status: 'connected',
        },
      }),
      getState: jest.fn().mockResolvedValue({
        instanceId: 'instance-1',
        status: 'connected',
        desiredState: 'running',
        hasSession: true,
        connectedAt: '2026-03-28T15:00:00.000Z',
        lastSeenAt: '2026-03-28T15:00:05.000Z',
      }),
      syncHistory: jest.fn().mockResolvedValue({
        instanceId: 'instance-1',
        startedAt: '2026-03-28T15:00:10.000Z',
        finishedAt: '2026-03-28T15:00:12.000Z',
        durationMs: 2000,
        chatsEvaluated: 1,
        chatsEligible: 1,
        chatsSynced: 1,
        messagesDiscovered: 2,
        messagesEmitted: 2,
        inboundMessages: 1,
        outboundMessages: 1,
        mediaMessages: 0,
        errors: [],
      }),
    };
    const service = new WhatsAppWebService(
      prisma as never,
      {
        get: jest.fn().mockReturnValue('http://127.0.0.1:3001'),
      } as never,
      {} as never,
      gatewayClient as never,
      {} as never,
    );

    await service.getConnectionState('workspace-1', 'instance-1');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(gatewayClient.syncHistory).toHaveBeenCalledWith('instance-1');
  });

  it('does not auto-sync connected qr history again when the latest snapshot already matches the current session', async () => {
    const prisma = {
      instance: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'instance-1',
          workspaceId: 'workspace-1',
          provider: 'WHATSAPP_WEB',
          providerMetadata: {
            historySync: {
              finishedAt: '2026-03-28T15:00:12.000Z',
            },
          },
          connectedAt: new Date('2026-03-28T15:00:00.000Z'),
          deletedAt: null,
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const gatewayClient = {
      registerInstance: jest.fn().mockResolvedValue({
        state: {
          instanceId: 'instance-1',
          status: 'connected',
        },
      }),
      getState: jest.fn().mockResolvedValue({
        instanceId: 'instance-1',
        status: 'connected',
        desiredState: 'running',
        hasSession: true,
        connectedAt: '2026-03-28T15:00:00.000Z',
        lastSeenAt: '2026-03-28T15:00:05.000Z',
      }),
      syncHistory: jest.fn(),
    };
    const service = new WhatsAppWebService(
      prisma as never,
      {
        get: jest.fn().mockReturnValue('http://127.0.0.1:3001'),
      } as never,
      {} as never,
      gatewayClient as never,
      {} as never,
    );

    await service.getConnectionState('workspace-1', 'instance-1');
    await Promise.resolve();

    expect(gatewayClient.syncHistory).not.toHaveBeenCalled();
  });

  it('unregisters a qr instance directly in the gateway and marks it disconnected in the db', async () => {
    const instanceUpdate = jest.fn().mockResolvedValue({});
    const gatewayClient = {
      cancelSyncHistory: jest.fn(),
      unregister: jest.fn().mockResolvedValue({
        success: true,
        instanceId: 'instance-1',
      }),
    };
    const service = new WhatsAppWebService(
      {
        instance: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'instance-1',
            workspaceId: 'workspace-1',
            provider: 'WHATSAPP_WEB',
            deletedAt: null,
          }),
          update: instanceUpdate,
        },
      } as never,
      {} as never,
      {} as never,
      gatewayClient as never,
      {} as never,
    );

    await expect(
      service.unregister('workspace-1', 'instance-1'),
    ).resolves.toEqual({
      success: true,
      instanceId: 'instance-1',
    });
    expect(gatewayClient.cancelSyncHistory).toHaveBeenCalledWith('instance-1');
    expect(gatewayClient.unregister).toHaveBeenCalledWith('instance-1');
    expect(instanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'instance-1' },
        data: expect.objectContaining({
          status: 'DISCONNECTED',
        }),
      }),
    );
  });

  it('identifies status@broadcast payloads so they are ignored before persistence', () => {
    const service = createService();

    const result = privateApi(service).shouldIgnoreInboundPayload({
      fromRaw: 'status@broadcast',
      remoteJid: 'status@broadcast',
      isStatus: true,
    });

    expect(result).toBe(true);
  });

  it('identifies group payloads so they are ignored before persistence', () => {
    const service = createService();

    const result = privateApi(service).shouldIgnoreInboundPayload({
      fromRaw: '120363025570111111@g.us',
      remoteJid: '120363025570111111@g.us',
      isGroupMsg: true,
    });

    expect(result).toBe(true);
  });

  it('identifies newsletter payloads so only private chats are persisted', () => {
    const service = createService();

    const result = privateApi(service).shouldIgnoreInboundPayload({
      fromRaw: '120363424919294631@newsletter',
      remoteJid: '120363424919294631@newsletter',
      isPrivateChat: false,
      messageId: 'false_120363424919294631@newsletter_3EB04A7362E303E74ADF71',
    });

    expect(result).toBe(true);
  });

  it('identifies archived chat payloads so they are ignored before persistence', () => {
    const service = createService();

    const result = privateApi(service).shouldIgnoreInboundPayload({
      fromRaw: '5511999999999@c.us',
      remoteJid: '5511999999999@c.us',
      isArchivedChat: true,
    });

    expect(result).toBe(true);
  });

  it('classifies batched history sync events as message webhooks', () => {
    const service = createService();

    const result = privateApi(service).mapGatewayEventType('messages.batch');

    expect(result).toBe('MESSAGE');
  });

  it('builds a user-facing summary for completed history syncs', () => {
    const service = createService();

    const result = privateApi(service).buildHistorySyncDetail({
      messagesDiscovered: 48,
      chatsSynced: 3,
      outboundMessages: 18,
      inboundMessages: 30,
      errors: [{ chatId: 'chat-1', message: 'Falha parcial' }],
    });

    expect(result).toContain('48 mensagens privadas');
    expect(result).toContain('3 conversas');
    expect(result).toContain('1 conversa(s) tiveram falhas parciais');
  });
});
