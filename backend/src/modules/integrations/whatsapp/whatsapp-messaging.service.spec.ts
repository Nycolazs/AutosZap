import {
  ConversationOwnership,
  ConversationStatus,
  InstanceMode,
  InstanceProvider,
  MessageStatus,
} from '@prisma/client';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';

describe('WhatsAppMessagingService contact and conversation resolution', () => {
  function createService() {
    const prisma = {
      contact: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      conversation: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      conversationMessage: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      instance: {
        findFirst: jest.fn(),
      },
    };
    const configService = {
      get: jest.fn(),
    };
    const cryptoService = {
      decrypt: jest.fn(),
    };
    const metaProvider = {
      downloadMedia: jest.fn(),
    };
    const whatsappWebTransportProvider = {
      downloadMedia: jest.fn(),
    };
    const mediaStorageService = {
      save: jest.fn(),
      read: jest.fn(),
    };

    const service = new WhatsAppMessagingService(
      prisma as never,
      configService as never,
      cryptoService as never,
      metaProvider as never,
      whatsappWebTransportProvider as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      mediaStorageService as never,
    );

    return {
      service,
      prisma,
      metaProvider,
      whatsappWebTransportProvider,
      mediaStorageService,
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('updates placeholder contact names when the qr session provides a better name', async () => {
    const { service, prisma } = createService();

    prisma.contact.findFirst.mockResolvedValue({
      id: 'contact-1',
      name: 'Contato 1234',
      phone: '551199991234',
    });
    prisma.contact.update.mockResolvedValue({
      id: 'contact-1',
      name: 'Maria Souza',
      phone: '551199991234',
    });

    const result = await (service as any).ensureContact(
      'ws-1',
      '+55 11 99991-1234',
      ' Maria Souza ',
    );

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: {
        id: 'contact-1',
      },
      data: {
        name: 'Maria Souza',
      },
    });
    expect(result.name).toBe('Maria Souza');
  });

  it('creates a new conversation for a different instance instead of reusing another instance thread', async () => {
    const { service, prisma } = createService();

    prisma.conversation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.conversation.create.mockResolvedValue({
      id: 'conv-2',
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      instanceId: 'instance-2',
    });

    const result = await (service as any).ensureConversation(
      'ws-1',
      'contact-1',
      'instance-2',
      null,
    );

    expect(prisma.conversation.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws-1',
          contactId: 'contact-1',
          instanceId: 'instance-2',
          deletedAt: null,
        }),
      }),
    );
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        instanceId: 'instance-2',
        assignedUserId: undefined,
        status: ConversationStatus.NEW,
        ownership: ConversationOwnership.UNASSIGNED,
      },
    });
    expect(result.instanceId).toBe('instance-2');
  });

  it('adopts legacy conversations without instance when the contact receives a new qr message', async () => {
    const { service, prisma } = createService();

    prisma.conversation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'conv-legacy',
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        instanceId: null,
      });
    prisma.conversation.update.mockResolvedValue({
      id: 'conv-legacy',
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      instanceId: 'instance-3',
    });

    const result = await (service as any).ensureConversation(
      'ws-1',
      'contact-1',
      'instance-3',
      null,
    );

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: {
        id: 'conv-legacy',
      },
      data: {
        instanceId: 'instance-3',
      },
    });
    expect(result.instanceId).toBe('instance-3');
  });

  it('does not attach qr media metadata to plain text messages', () => {
    const { service } = createService();

    const result = (service as any).buildWhatsAppWebSessionMediaMetadata({
      externalMessageId: 'wamid.text.1',
      metadata: {
        provider: 'WHATSAPP_WEB',
        providerMessageContext: {
          messageType: 'chat',
        },
      },
    });

    expect(result.media).toBeUndefined();
    expect(result.mediaId).toBeUndefined();
    expect(result.mimeType).toBeUndefined();
    expect(result.fileName).toBeUndefined();
  });

  it('maps provider send results to queued, sent and delivered statuses', () => {
    const { service } = createService();

    expect((service as any).mapProviderSendResultStatus('queued')).toBe(
      MessageStatus.QUEUED,
    );
    expect((service as any).mapProviderSendResultStatus('sent')).toBe(
      MessageStatus.SENT,
    );
    expect((service as any).mapProviderSendResultStatus('delivered')).toBe(
      MessageStatus.DELIVERED,
    );
  });

  it('keeps the most advanced outbound status when qr callbacks arrive out of order', () => {
    const { service } = createService();

    expect(
      (service as any).resolveNextOutboundMessageStatus(
        MessageStatus.READ,
        MessageStatus.SENT,
      ),
    ).toBe(MessageStatus.READ);
    expect(
      (service as any).resolveNextOutboundMessageStatus(
        MessageStatus.DELIVERED,
        MessageStatus.QUEUED,
      ),
    ).toBe(MessageStatus.DELIVERED);
    expect(
      (service as any).resolveNextOutboundMessageStatus(
        MessageStatus.SENT,
        MessageStatus.DELIVERED,
      ),
    ).toBe(MessageStatus.DELIVERED);
    expect(
      (service as any).resolveNextOutboundMessageStatus(
        MessageStatus.SENT,
        MessageStatus.FAILED,
      ),
    ).toBe(MessageStatus.FAILED);
  });

  it('marks status@broadcast payloads as ignorable before persistence', () => {
    const { service } = createService();

    const result = (service as any).shouldIgnoreInboundMessage({
      externalMessageId: 'wamid.status.1',
      metadata: {
        providerMessageContext: {
          isStatus: true,
          remoteJid: 'status@broadcast',
          fromRaw: 'status@broadcast',
          toRaw: '5511888888888@c.us',
        },
      },
    });

    expect(result).toBe(true);
  });

  it('does not ignore regular inbound messages from valid chats', () => {
    const { service } = createService();

    const result = (service as any).shouldIgnoreInboundMessage({
      externalMessageId: 'wamid.2',
      metadata: {
        providerMessageContext: {
          isStatus: false,
          remoteJid: '5511999999999@c.us',
          fromRaw: '5511999999999@c.us',
          toRaw: '5511888888888@c.us',
        },
      },
    });

    expect(result).toBe(false);
  });

  it('marks group payloads as ignorable before persistence', () => {
    const { service } = createService();

    const result = (service as any).shouldIgnoreInboundMessage({
      externalMessageId: 'wamid.group.1',
      metadata: {
        providerMessageContext: {
          isGroupMsg: true,
          remoteJid: '120363025570111111@g.us',
          fromRaw: '120363025570111111@g.us',
          toRaw: '5511888888888@c.us',
        },
      },
    });

    expect(result).toBe(true);
  });

  it('marks newsletter payloads as ignorable before persistence', () => {
    const { service } = createService();

    const result = (service as any).shouldIgnoreInboundMessage({
      externalMessageId:
        'false_120363424919294631@newsletter_3EB04A7362E303E74ADF71',
      metadata: {
        providerMessageContext: {
          isPrivateChat: false,
          remoteJid: '120363424919294631@newsletter',
          fromRaw: '120363424919294631@newsletter',
          toRaw: '5511888888888@c.us',
        },
      },
    });

    expect(result).toBe(true);
  });

  it('does not persist empty quote objects when merging duplicate qr metadata', async () => {
    const { service, prisma } = createService();

    prisma.conversationMessage.findFirst.mockResolvedValue({
      metadata: {
        contact: {
          profileName: 'Maria QR',
        },
      },
    });

    await (service as any).refreshDuplicateMessageMetadata('message-1', {
      provider: 'WHATSAPP_WEB',
      quotedMessageId: null,
    });

    expect(prisma.conversationMessage.update).toHaveBeenCalledWith({
      where: {
        id: 'message-1',
      },
      data: {
        metadata: {
          contact: {
            profileName: 'Maria QR',
          },
          provider: 'WHATSAPP_WEB',
          quotedMessageId: null,
        },
      },
    });
  });

  it('stores qr history media locally when the sync payload already includes base64', async () => {
    const { service, mediaStorageService } = createService();

    mediaStorageService.save.mockResolvedValue({
      storagePath: 'ws-1/instance-1/conv-1/inbound/foto.jpg',
      mimeType: 'image/jpeg',
      fileName: 'foto.jpg',
      size: 4,
    });

    const result = await (service as any).materializeInboundMediaMetadata({
      workspaceId: 'ws-1',
      instanceId: 'instance-1',
      conversationId: 'conv-1',
      provider: InstanceProvider.WHATSAPP_WEB,
      externalMessageId: 'wamid.media.1',
      metadata: {
        provider: 'WHATSAPP_WEB',
        media: {
          dataBase64: 'ZGF0YQ==',
          mimeType: 'image/jpeg',
          fileName: 'foto.jpg',
          size: 4,
        },
      },
      direction: 'inbound',
    });

    expect(mediaStorageService.save).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      instanceId: 'instance-1',
      conversationId: 'conv-1',
      direction: 'inbound',
      buffer: Buffer.from('data'),
      fileName: 'foto.jpg',
      mimeType: 'image/jpeg',
    });
    expect(result).toMatchObject({
      provider: 'WHATSAPP_WEB',
      media: {
        mimeType: 'image/jpeg',
        fileName: 'foto.jpg',
        size: 4,
        downloadError: null,
        isBase64: false,
        downloadStrategy: 'storage',
        storagePath: 'ws-1/instance-1/conv-1/inbound/foto.jpg',
      },
      mediaId: 'ws-1/instance-1/conv-1/inbound/foto.jpg',
      storagePath: 'ws-1/instance-1/conv-1/inbound/foto.jpg',
      mimeType: 'image/jpeg',
      fileName: 'foto.jpg',
    });
  });

  it('maps qr inbound media to session download metadata when history sync did not include base64', async () => {
    const { service, mediaStorageService } = createService();

    const result = await (service as any).materializeInboundMediaMetadata({
      workspaceId: 'ws-1',
      instanceId: 'instance-1',
      conversationId: 'conv-1',
      provider: InstanceProvider.WHATSAPP_WEB,
      externalMessageId: 'wamid.media.1',
      metadata: {
        provider: 'WHATSAPP_WEB',
        media: {
          mimeType: 'image/jpeg',
          fileName: 'foto.jpg',
          size: 4,
        },
      },
      direction: 'inbound',
    });

    expect(mediaStorageService.save).not.toHaveBeenCalled();
    expect(result).toEqual({
      provider: 'WHATSAPP_WEB',
      media: {
        mimeType: 'image/jpeg',
        fileName: 'foto.jpg',
        size: 4,
        voice: null,
        durationSeconds: null,
        downloadError: null,
        isBase64: false,
        downloadStrategy: 'session',
      },
      mediaId: 'wamid.media.1',
      mimeType: 'image/jpeg',
      fileName: 'foto.jpg',
    });
  });

  it('downloads qr media on demand using the external message id instead of local storage', async () => {
    const { service, prisma, whatsappWebTransportProvider, mediaStorageService } =
      createService();

    prisma.conversationMessage.findFirst.mockResolvedValue({
      id: 'message-1',
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      instanceId: 'instance-1',
      direction: 'INBOUND',
      externalMessageId: 'wamid.media.2',
      metadata: {
        mimeType: 'image/jpeg',
        fileName: 'cliente.jpg',
      },
      conversation: {
        instanceId: 'instance-1',
      },
    });
    mediaStorageService.save.mockResolvedValue({
      storagePath: 'ws-1/instance-1/conv-1/inbound/cliente.jpg',
      mimeType: 'image/jpeg',
      fileName: 'cliente.jpg',
      size: 8,
    });
    jest.spyOn(service as any, 'getInstanceConfig').mockResolvedValue({
      id: 'instance-1',
      workspaceId: 'ws-1',
      provider: InstanceProvider.WHATSAPP_WEB,
      mode: InstanceMode.LIVE,
    });
    whatsappWebTransportProvider.downloadMedia.mockResolvedValue({
      buffer: Buffer.from('qr-media'),
      mimeType: 'image/jpeg',
      fileName: 'cliente.jpg',
      contentLength: 8,
    });

    const result = await service.getMessageMedia('ws-1', 'message-1');

    expect(mediaStorageService.read).not.toHaveBeenCalled();
    expect(whatsappWebTransportProvider.downloadMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'instance-1',
        provider: InstanceProvider.WHATSAPP_WEB,
      }),
      'wamid.media.2',
    );
    expect(mediaStorageService.save).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      instanceId: 'instance-1',
      conversationId: 'conv-1',
      direction: 'inbound',
      buffer: Buffer.from('qr-media'),
      mimeType: 'image/jpeg',
      fileName: 'cliente.jpg',
    });
    expect(prisma.conversationMessage.update).toHaveBeenCalledWith({
      where: {
        id: 'message-1',
      },
      data: {
        metadata: expect.objectContaining({
          mediaId: 'ws-1/instance-1/conv-1/inbound/cliente.jpg',
          storagePath: 'ws-1/instance-1/conv-1/inbound/cliente.jpg',
          mimeType: 'image/jpeg',
          fileName: 'cliente.jpg',
          media: expect.objectContaining({
            storagePath: 'ws-1/instance-1/conv-1/inbound/cliente.jpg',
            downloadStrategy: 'storage',
          }),
        }),
      },
    });
    expect(result.buffer.toString('utf8')).toBe('qr-media');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.fileName).toBe('cliente.jpg');
    expect(result.contentLength).toBe(8);
  });

  it('falls back to the active conversation instance and external message id when legacy qr storage is unavailable', async () => {
    const { service, prisma, whatsappWebTransportProvider, mediaStorageService } =
      createService();

    prisma.conversationMessage.findFirst.mockResolvedValue({
      id: 'message-legacy-1',
      workspaceId: 'ws-1',
      conversationId: 'conv-1',
      instanceId: 'instance-deleted',
      direction: 'INBOUND',
      externalMessageId: 'wamid.legacy.media.1',
      metadata: {
        mediaId: 'ws-1/instance-deleted/conv-1/inbound/old-file.jpg',
        storagePath: 'ws-1/instance-deleted/conv-1/inbound/old-file.jpg',
        mimeType: 'image/jpeg',
        fileName: 'cliente-antigo.jpg',
      },
      conversation: {
        instanceId: 'instance-active',
      },
    });
    mediaStorageService.read.mockRejectedValue(new Error('missing file'));
    mediaStorageService.save.mockResolvedValue({
      storagePath: 'ws-1/instance-active/conv-1/inbound/cliente-antigo.jpg',
      mimeType: 'image/jpeg',
      fileName: 'cliente-antigo.jpg',
      size: 15,
    });
    const getInstanceConfigSpy = jest
      .spyOn(service as any, 'getInstanceConfig')
      .mockImplementation(async (instanceId: string) => {
        if (instanceId === 'instance-active') {
          return {
            id: 'instance-active',
            workspaceId: 'ws-1',
            provider: InstanceProvider.WHATSAPP_WEB,
            mode: InstanceMode.LIVE,
          };
        }

        throw new Error(`Unexpected instance lookup: ${instanceId}`);
      });
    whatsappWebTransportProvider.downloadMedia.mockResolvedValue({
      buffer: Buffer.from('qr-media-active'),
      mimeType: 'image/jpeg',
      fileName: 'cliente-antigo.jpg',
      contentLength: 15,
    });

    const result = await service.getMessageMedia('ws-1', 'message-legacy-1');

    expect(mediaStorageService.read).toHaveBeenCalledWith(
      'ws-1/instance-deleted/conv-1/inbound/old-file.jpg',
    );
    expect(getInstanceConfigSpy).toHaveBeenCalledWith('instance-active', 'ws-1');
    expect(whatsappWebTransportProvider.downloadMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'instance-active',
        provider: InstanceProvider.WHATSAPP_WEB,
      }),
      'wamid.legacy.media.1',
    );
    expect(mediaStorageService.save).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      instanceId: 'instance-active',
      conversationId: 'conv-1',
      direction: 'inbound',
      buffer: Buffer.from('qr-media-active'),
      mimeType: 'image/jpeg',
      fileName: 'cliente-antigo.jpg',
    });
    expect(result.buffer.toString('utf8')).toBe('qr-media-active');
  });

  it('prefers the latest private qr peer jid when resolving an outbound recipient', async () => {
    const { service, prisma } = createService();

    prisma.conversationMessage.findMany.mockResolvedValue([
      {
        externalMessageId: 'false_163144450211915@lid_3A11269E65ACF3E5F81B',
        metadata: {
          providerMessageContext: {
            remoteJid: '163144450211915@lid',
            fromRaw: '163144450211915@lid',
            toRaw: '558585712528@c.us',
            fromMe: false,
            isPrivateChat: true,
          },
        },
      },
    ]);

    const recipient = await (service as any).resolveConversationRecipient({
      conversation: {
        id: 'conv-1',
        workspaceId: 'ws-1',
        instanceId: 'instance-1',
        contact: {
          id: 'contact-1',
          name: 'Rafael Nunes',
          phone: '+5542999792797',
        },
      },
      instanceId: 'instance-1',
      config: {
        id: 'instance-1',
        workspaceId: 'ws-1',
        provider: InstanceProvider.WHATSAPP_WEB,
        mode: InstanceMode.LIVE,
      },
      transport: {} as never,
    });

    expect(prisma.conversationMessage.findMany).toHaveBeenCalledWith({
      where: {
        conversationId: 'conv-1',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 25,
      select: {
        externalMessageId: true,
        metadata: true,
      },
    });
    expect(recipient).toBe('163144450211915@lid');
  });

  it('falls back to the contact phone when no private qr peer jid is available', async () => {
    const { service, prisma } = createService();

    prisma.conversationMessage.findMany.mockResolvedValue([
      {
        externalMessageId: 'status@broadcast',
        metadata: {
          providerMessageContext: {
            remoteJid: 'status@broadcast',
            fromRaw: 'status@broadcast',
            toRaw: '558585712528@c.us',
            fromMe: false,
            isPrivateChat: false,
          },
        },
      },
    ]);

    const recipient = await (service as any).resolveConversationRecipient({
      conversation: {
        id: 'conv-2',
        workspaceId: 'ws-1',
        instanceId: 'instance-1',
        contact: {
          id: 'contact-2',
          name: 'Contato',
          phone: '+5541999999999',
        },
      },
      instanceId: 'instance-1',
      config: {
        id: 'instance-1',
        workspaceId: 'ws-1',
        provider: InstanceProvider.WHATSAPP_WEB,
        mode: InstanceMode.LIVE,
      },
      transport: {} as never,
    });

    expect(recipient).toBe('+5541999999999');
  });

});
