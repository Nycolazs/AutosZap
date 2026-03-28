import { ConfigService } from '@nestjs/config';
import { AutoMessageType, MessageDirection } from '@prisma/client';
import { MetaWhatsAppService } from './meta-whatsapp.service';

describe('MetaWhatsAppService automatic replies', () => {
  function getAutomaticReplyInvoker(service: MetaWhatsAppService) {
    const maybeSendAutomaticReply = (
      service as unknown as {
        maybeSendAutomaticReply?: unknown;
      }
    ).maybeSendAutomaticReply;

    if (typeof maybeSendAutomaticReply !== 'function') {
      throw new Error('Automatic reply invoker is not available.');
    }

    return maybeSendAutomaticReply.bind(service) as (
      workspaceId: string,
      conversationId: string,
    ) => Promise<void>;
  }

  function createService() {
    const prisma = {
      conversationMessage: {
        findFirst: jest.fn(),
      },
      conversation: {
        findFirst: jest.fn(),
      },
      workspaceConversationSettings: {
        update: jest.fn(),
      },
    };
    const provider = {
      isProductionMode: jest.fn(),
      canUseRealTransport: jest.fn(),
      sendTextMessage: jest.fn(),
      sendTemplateMessage: jest.fn(),
    };
    const workspaceSettings = {
      getBusinessHoursContext: jest.fn(),
      getConversationSettings: jest.fn(),
    };
    const whatsappMessagingService = {
      sendConversationMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
    };

    const service = new MetaWhatsAppService(
      prisma as never,
      {} as never,
      {} as never,
      provider as never,
      new ConfigService(),
      {} as never,
      workspaceSettings as never,
      {} as never,
      {} as never,
      {} as never,
      whatsappMessagingService as never,
    );

    return {
      service,
      prisma,
      provider,
      whatsappMessagingService,
      workspaceSettingsService: service[
        'workspaceSettingsService'
      ] as unknown as {
        getBusinessHoursContext: jest.Mock;
        getConversationSettings: jest.Mock;
      },
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('sends the configured in-hours system message when cooldown allows', async () => {
    const { service, prisma, workspaceSettingsService } = createService();
    const invokeAutomaticReply = getAutomaticReplyInvoker(service);
    const sendConversationMessageSpy = jest
      .spyOn(service, 'sendConversationMessage')
      .mockResolvedValue({ id: 'msg-1' } as never);

    workspaceSettingsService.getBusinessHoursContext.mockResolvedValue({
      isOpen: true,
      settings: {
        autoReplyCooldownMinutes: 120,
        sendBusinessHoursAutoReply: true,
        businessHoursAutoReply: 'Bem-vindo ao atendimento!',
        sendOutOfHoursAutoReply: true,
        outOfHoursAutoReply: 'Estamos fora do horario.',
      },
    });
    prisma.conversationMessage.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await invokeAutomaticReply('ws-1', 'conv-1');

    expect(sendConversationMessageSpy).toHaveBeenCalledWith(
      'ws-1',
      'conv-1',
      null,
      'Bem-vindo ao atendimento!',
      {
        direction: MessageDirection.SYSTEM,
        isAutomated: true,
        autoMessageType: AutoMessageType.IN_BUSINESS_HOURS,
      },
    );
  });

  it('does not send another automatic reply while still in cooldown', async () => {
    const { service, prisma, workspaceSettingsService } = createService();
    const invokeAutomaticReply = getAutomaticReplyInvoker(service);
    const sendConversationMessageSpy = jest
      .spyOn(service, 'sendConversationMessage')
      .mockResolvedValue({ id: 'msg-1' } as never);

    workspaceSettingsService.getBusinessHoursContext.mockResolvedValue({
      isOpen: false,
      settings: {
        autoReplyCooldownMinutes: 120,
        sendBusinessHoursAutoReply: true,
        businessHoursAutoReply: 'Bem-vindo ao atendimento!',
        sendOutOfHoursAutoReply: true,
        outOfHoursAutoReply: 'Voltamos amanha cedo.',
      },
    });
    prisma.conversationMessage.findFirst
      .mockResolvedValueOnce({
        createdAt: new Date(Date.now() - 60_000),
      })
      .mockResolvedValueOnce(null);

    await invokeAutomaticReply('ws-1', 'conv-1');

    expect(sendConversationMessageSpy).not.toHaveBeenCalled();
  });

  it('delegates sendConversationMessage to the shared messaging service', async () => {
    const { service, whatsappMessagingService } = createService();

    await service.sendConversationMessage(
      'ws-1',
      'conv-1',
      'seller-1',
      'Olá, tudo bem?',
    );

    expect(
      whatsappMessagingService.sendConversationMessage,
    ).toHaveBeenCalledWith(
      'ws-1',
      'conv-1',
      'seller-1',
      'Olá, tudo bem?',
      undefined,
    );
  });

  it('forwards options to the shared messaging service when sending a conversation message', async () => {
    const { service, whatsappMessagingService } = createService();
    const options = {
      direction: MessageDirection.OUTBOUND,
      isAutomated: true,
      autoMessageType: AutoMessageType.IN_BUSINESS_HOURS,
    };

    await service.sendConversationMessage(
      'ws-1',
      'conv-1',
      null,
      'Mensagem automática',
      options,
    );

    expect(
      whatsappMessagingService.sendConversationMessage,
    ).toHaveBeenCalledWith(
      'ws-1',
      'conv-1',
      null,
      'Mensagem automática',
      options,
    );
  });
});

describe('MetaWhatsAppService inbound webhook timestamps', () => {
  function createWebhookService() {
    const prisma = {
      runWithTenant: jest.fn((_: string, callback: () => unknown) =>
        callback(),
      ),
      instance: {
        findFirst: jest.fn(),
      },
      whatsAppWebhookEvent: {
        create: jest.fn(),
        update: jest.fn(),
      },
      conversationMessage: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      conversation: {
        updateMany: jest.fn(),
      },
    };
    const tenantConnectionService = {
      resolveTenantByPhoneNumberId: jest.fn(),
    };
    const provider = {
      parseWebhook: jest.fn(),
    };
    const conversationWorkflowService = {
      registerInboundActivity: jest.fn(),
      emitConversationRealtimeEvent: jest.fn(),
    };

    const whatsappMessagingService = {
      processIncomingPayload: jest
        .fn()
        .mockResolvedValue({ processed: 1, skipped: 0 }),
    };

    const service = new MetaWhatsAppService(
      prisma as never,
      tenantConnectionService as never,
      {} as never,
      provider as never,
      new ConfigService(),
      conversationWorkflowService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      whatsappMessagingService as never,
    );

    return {
      service,
      prisma,
      provider,
      tenantConnectionService,
      conversationWorkflowService,
      whatsappMessagingService,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-22T18:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('creates a webhook event record and delegates parsed messages to processIncomingPayload', async () => {
    const {
      service,
      prisma,
      provider,
      tenantConnectionService,
      whatsappMessagingService,
    } = createWebhookService();

    jest
      .spyOn(service as any, 'assertWebhookSignature')
      .mockResolvedValue(undefined);

    tenantConnectionService.resolveTenantByPhoneNumberId.mockResolvedValue(
      null,
    );
    provider.parseWebhook.mockReturnValue({
      messages: [
        {
          phoneNumberId: 'phone-1',
          from: '5585988887777',
          profileName: 'Nycolas',
          externalMessageId: 'wamid.1',
          messageType: 'text',
          body: 'Olá',
          timestamp: String(Math.floor(Date.now() / 1000)),
        },
      ],
      statuses: [],
    });
    prisma.instance.findFirst.mockResolvedValue({
      id: 'instance-1',
      workspaceId: 'workspace-1',
      phoneNumberId: 'phone-1',
    });
    prisma.whatsAppWebhookEvent.create.mockResolvedValue({ id: 'webhook-1' });

    await service.handleWebhook({ entry: [] }, { rawBody: Buffer.from('{}') });

    expect(prisma.whatsAppWebhookEvent.create).toHaveBeenCalled();
    expect(
      whatsappMessagingService.processIncomingPayload,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ externalMessageId: 'wamid.1' }),
        ]),
      }),
    );
    expect(prisma.whatsAppWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'webhook-1' },
        data: expect.objectContaining({ processedAt: expect.any(Date) }),
      }),
    );
  });

  it('marks the webhook event as processed even when there are no messages', async () => {
    const {
      service,
      prisma,
      provider,
      tenantConnectionService,
      whatsappMessagingService,
    } = createWebhookService();

    jest
      .spyOn(service as any, 'assertWebhookSignature')
      .mockResolvedValue(undefined);

    tenantConnectionService.resolveTenantByPhoneNumberId.mockResolvedValue(
      null,
    );
    provider.parseWebhook.mockReturnValue({ messages: [], statuses: [] });
    prisma.instance.findFirst.mockResolvedValue(null);
    prisma.whatsAppWebhookEvent.create.mockResolvedValue({ id: 'webhook-2' });

    await service.handleWebhook({ entry: [] }, { rawBody: Buffer.from('{}') });

    expect(
      whatsappMessagingService.processIncomingPayload,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], statuses: [] }),
    );
    expect(prisma.whatsAppWebhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'webhook-2' } }),
    );
  });
});
