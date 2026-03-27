import {
  ConversationOwnership,
  ConversationStatus,
  InstanceMode,
  InstanceProvider,
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

  it('maps qr inbound media to session download metadata without writing files locally', async () => {
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
          dataBase64: 'ZGF0YQ==',
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
      instanceId: 'instance-1',
      externalMessageId: 'wamid.media.2',
      metadata: {
        mimeType: 'image/jpeg',
        fileName: 'cliente.jpg',
      },
      conversation: {
        instanceId: 'instance-1',
      },
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
    expect(result.buffer.toString('utf8')).toBe('qr-media');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.fileName).toBe('cliente.jpg');
    expect(result.contentLength).toBe(8);
  });
});
