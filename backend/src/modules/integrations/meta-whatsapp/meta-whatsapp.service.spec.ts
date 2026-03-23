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
    );

    return {
      service,
      prisma,
      provider,
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

  it('falls back to the configured approved template when the 24-hour window is closed', async () => {
    const { service, prisma, provider, workspaceSettingsService } =
      createService();
    const sendTemplateConversationMessageSpy = jest
      .spyOn(service, 'sendTemplateConversationMessage')
      .mockResolvedValue({ id: 'msg-template-1' } as never);

    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workspaceId: 'ws-1',
      instanceId: 'instance-1',
      contact: {
        phone: '+5585988112201',
      },
    });
    prisma.conversationMessage.findFirst.mockResolvedValue(null);
    provider.canUseRealTransport.mockReturnValue(true);
    workspaceSettingsService.getConversationSettings.mockResolvedValue({
      sendWindowClosedTemplateReply: true,
      windowClosedTemplateName: 'retomada_atendimento_autozap',
      windowClosedTemplateLanguageCode: 'pt_BR',
    });
    Object.assign(service as unknown as Record<string, unknown>, {
      getInstanceConfig: jest.fn().mockResolvedValue({
        id: 'instance-1',
        workspaceId: 'ws-1',
        mode: 'PRODUCTION',
        accessToken: 'token',
        phoneNumberId: 'phone-id',
      }),
    });

    await service.sendConversationMessage(
      'ws-1',
      'conv-1',
      'seller-1',
      '*ANA*:\nPodemos continuar o atendimento por aqui?',
    );

    expect(sendTemplateConversationMessageSpy).toHaveBeenCalledWith(
      'ws-1',
      'conv-1',
      'seller-1',
      expect.objectContaining({
        instanceId: 'instance-1',
        templateName: 'retomada_atendimento_autozap',
        languageCode: 'pt_BR',
        bodyParameters: ['*ANA*:\nPodemos continuar o atendimento por aqui?'],
        contentPreview: '*ANA*:\nPodemos continuar o atendimento por aqui?',
        metadata: {
          windowClosedTemplateReply: true,
        },
      }),
    );
    expect(provider.sendTextMessage).not.toHaveBeenCalled();
  });

  it('auto-configures another approved template when the configured one fails', async () => {
    const { service, prisma, provider, workspaceSettingsService } =
      createService();

    const sendTemplateConversationMessageSpy = jest
      .spyOn(service, 'sendTemplateConversationMessage')
      .mockRejectedValueOnce(new Error('template not found'))
      .mockResolvedValueOnce({ id: 'msg-template-2' } as never);

    jest.spyOn(service, 'listTemplates').mockResolvedValue([
      {
        name: 'retomada_atendimento_autozap',
        language: 'pt_BR',
        status: 'APPROVED',
        bodyParameterCount: 1,
        headerParameterCount: 0,
        headerFormat: 'TEXT',
      },
      {
        name: 'retomada_atendimento_padrao',
        language: 'pt_BR',
        status: 'APPROVED',
        category: 'UTILITY',
        qualityScore: 'GREEN',
        bodyParameterCount: 1,
        headerParameterCount: 0,
        headerFormat: 'TEXT',
      },
    ] as never);

    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workspaceId: 'ws-1',
      instanceId: 'instance-1',
      contact: {
        phone: '+5585988112201',
      },
    });
    prisma.conversationMessage.findFirst.mockResolvedValue(null);
    provider.canUseRealTransport.mockReturnValue(true);
    workspaceSettingsService.getConversationSettings.mockResolvedValue({
      sendWindowClosedTemplateReply: true,
      windowClosedTemplateName: 'retomada_atendimento_autozap',
      windowClosedTemplateLanguageCode: 'pt_BR',
    });
    Object.assign(service as unknown as Record<string, unknown>, {
      getInstanceConfig: jest.fn().mockResolvedValue({
        id: 'instance-1',
        workspaceId: 'ws-1',
        mode: 'PRODUCTION',
        accessToken: 'token',
        phoneNumberId: 'phone-id',
      }),
    });

    await service.sendConversationMessage(
      'ws-1',
      'conv-1',
      'seller-1',
      '*ANA*:\nPodemos continuar o atendimento por aqui?',
    );

    expect(sendTemplateConversationMessageSpy).toHaveBeenNthCalledWith(
      1,
      'ws-1',
      'conv-1',
      'seller-1',
      expect.objectContaining({
        templateName: 'retomada_atendimento_autozap',
        languageCode: 'pt_BR',
      }),
    );

    expect(sendTemplateConversationMessageSpy).toHaveBeenNthCalledWith(
      2,
      'ws-1',
      'conv-1',
      'seller-1',
      expect.objectContaining({
        templateName: 'retomada_atendimento_padrao',
        languageCode: 'pt_BR',
        metadata: {
          windowClosedTemplateReply: true,
          autoTemplateConfigured: true,
        },
      }),
    );

    expect(prisma.workspaceConversationSettings.update).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
      },
      data: {
        sendWindowClosedTemplateReply: true,
        windowClosedTemplateName: 'retomada_atendimento_padrao',
        windowClosedTemplateLanguageCode: 'pt_BR',
      },
    });
  });

  it('normalizes the configured template language before sending outside the 24-hour window', async () => {
    const { service, prisma, provider, workspaceSettingsService } =
      createService();
    const sendTemplateConversationMessageSpy = jest
      .spyOn(service, 'sendTemplateConversationMessage')
      .mockResolvedValue({ id: 'msg-template-3' } as never);

    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workspaceId: 'ws-1',
      instanceId: 'instance-1',
      contact: {
        phone: '+5585988112201',
      },
    });
    prisma.conversationMessage.findFirst.mockResolvedValue(null);
    provider.canUseRealTransport.mockReturnValue(true);
    workspaceSettingsService.getConversationSettings.mockResolvedValue({
      sendWindowClosedTemplateReply: true,
      windowClosedTemplateName: 'retomada_atendimento_autozap',
      windowClosedTemplateLanguageCode: 'pt-br',
    });
    Object.assign(service as unknown as Record<string, unknown>, {
      getInstanceConfig: jest.fn().mockResolvedValue({
        id: 'instance-1',
        workspaceId: 'ws-1',
        mode: 'PRODUCTION',
        accessToken: 'token',
        phoneNumberId: 'phone-id',
      }),
    });

    await service.sendConversationMessage(
      'ws-1',
      'conv-1',
      'seller-1',
      '*ANA*:\nPodemos continuar o atendimento por aqui?',
    );

    expect(sendTemplateConversationMessageSpy).toHaveBeenCalledWith(
      'ws-1',
      'conv-1',
      'seller-1',
      expect.objectContaining({
        templateName: 'retomada_atendimento_autozap',
        languageCode: 'pt_BR',
      }),
    );
  });

  it('skips approved templates that are incompatible with the automatic closed-window flow', async () => {
    const { service, prisma, provider, workspaceSettingsService } =
      createService();

    const sendTemplateConversationMessageSpy = jest
      .spyOn(service, 'sendTemplateConversationMessage')
      .mockRejectedValueOnce(new Error('template not found'))
      .mockResolvedValueOnce({ id: 'msg-template-4' } as never);

    jest.spyOn(service, 'listTemplates').mockResolvedValue([
      {
        name: 'retomada_atendimento_autozap',
        language: 'pt_BR',
        status: 'APPROVED',
        bodyParameterCount: 1,
        headerParameterCount: 0,
        headerFormat: 'TEXT',
      },
      {
        name: 'template_com_header_midia',
        language: 'pt_BR',
        status: 'APPROVED',
        bodyParameterCount: 1,
        headerParameterCount: 0,
        headerFormat: 'IMAGE',
      },
      {
        name: 'template_com_duas_variaveis',
        language: 'pt_BR',
        status: 'APPROVED',
        bodyParameterCount: 2,
        headerParameterCount: 0,
        headerFormat: 'TEXT',
      },
      {
        name: 'retomada_atendimento_padrao',
        language: 'pt_BR',
        status: 'APPROVED',
        category: 'UTILITY',
        bodyParameterCount: 1,
        headerParameterCount: 0,
        headerFormat: 'TEXT',
      },
    ] as never);

    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      workspaceId: 'ws-1',
      instanceId: 'instance-1',
      contact: {
        phone: '+5585988112201',
      },
    });
    prisma.conversationMessage.findFirst.mockResolvedValue(null);
    provider.canUseRealTransport.mockReturnValue(true);
    workspaceSettingsService.getConversationSettings.mockResolvedValue({
      sendWindowClosedTemplateReply: true,
      windowClosedTemplateName: 'retomada_atendimento_autozap',
      windowClosedTemplateLanguageCode: 'pt_BR',
    });
    Object.assign(service as unknown as Record<string, unknown>, {
      getInstanceConfig: jest.fn().mockResolvedValue({
        id: 'instance-1',
        workspaceId: 'ws-1',
        mode: 'PRODUCTION',
        accessToken: 'token',
        phoneNumberId: 'phone-id',
      }),
    });

    await service.sendConversationMessage(
      'ws-1',
      'conv-1',
      'seller-1',
      '*ANA*:\nPodemos continuar o atendimento por aqui?',
    );

    expect(sendTemplateConversationMessageSpy).toHaveBeenNthCalledWith(
      1,
      'ws-1',
      'conv-1',
      'seller-1',
      expect.objectContaining({
        templateName: 'retomada_atendimento_autozap',
      }),
    );
    expect(sendTemplateConversationMessageSpy).toHaveBeenNthCalledWith(
      2,
      'ws-1',
      'conv-1',
      'seller-1',
      expect.objectContaining({
        templateName: 'retomada_atendimento_padrao',
      }),
    );
    expect(sendTemplateConversationMessageSpy).toHaveBeenCalledTimes(2);
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
    );

    return {
      service,
      prisma,
      provider,
      tenantConnectionService,
      conversationWorkflowService,
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

  it('stores stale inbound media using the original WhatsApp timestamp without reopening the conversation', async () => {
    const {
      service,
      prisma,
      provider,
      tenantConnectionService,
      conversationWorkflowService,
    } = createWebhookService();
    const assertWebhookSignatureSpy = jest
      .spyOn(service as any, 'assertWebhookSignature')
      .mockResolvedValue(undefined);
    const ensureContactSpy = jest
      .spyOn(service as any, 'ensureContact')
      .mockResolvedValue({
        id: 'contact-1',
        name: 'Nycolas Rocha',
      });
    const ensureConversationSpy = jest
      .spyOn(service as any, 'ensureConversation')
      .mockResolvedValue({
        id: 'conversation-1',
      });
    const enrichInboundMessageMetadataSpy = jest
      .spyOn(service as any, 'enrichInboundMessageMetadata')
      .mockResolvedValue({
        mediaId: 'media-1',
      });
    const notifyRecipientsSpy = jest
      .spyOn(service as any, 'notifyConversationRecipientsAboutInboundMessage')
      .mockResolvedValue(undefined);
    const maybeSendAutomaticReplySpy = jest
      .spyOn(service as any, 'maybeSendAutomaticReply')
      .mockResolvedValue(undefined);
    const staleTimestamp = String(
      Math.floor((Date.now() - 26 * 60 * 60_000) / 1000),
    );
    const staleSentAt = new Date(Number(staleTimestamp) * 1000);

    tenantConnectionService.resolveTenantByPhoneNumberId.mockResolvedValue(
      null,
    );
    provider.parseWebhook.mockReturnValue({
      messages: [
        {
          phoneNumberId: 'phone-1',
          from: '5585988887777',
          profileName: 'Nycolas Rocha',
          externalMessageId: 'wamid.stale.1',
          messageType: 'image',
          body: '',
          timestamp: staleTimestamp,
          metadata: {
            mediaId: 'media-1',
          },
        },
      ],
      statuses: [],
    });
    prisma.instance.findFirst.mockResolvedValue({
      id: 'instance-1',
      workspaceId: 'workspace-1',
      phoneNumberId: 'phone-1',
    });
    prisma.whatsAppWebhookEvent.create.mockResolvedValue({
      id: 'webhook-1',
    });
    prisma.conversationMessage.findFirst.mockResolvedValue(null);

    await service.handleWebhook(
      {
        entry: [],
      },
      {
        rawBody: Buffer.from('{}'),
      },
    );

    expect(assertWebhookSignatureSpy).toHaveBeenCalled();
    expect(ensureContactSpy).toHaveBeenCalledWith(
      'workspace-1',
      '5585988887777',
      'Nycolas Rocha',
    );
    expect(ensureConversationSpy).toHaveBeenCalledWith(
      'workspace-1',
      'contact-1',
      'instance-1',
    );
    expect(enrichInboundMessageMetadataSpy).toHaveBeenCalled();
    expect(prisma.conversationMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'workspace-1',
        conversationId: 'conversation-1',
        externalMessageId: 'wamid.stale.1',
        sentAt: staleSentAt,
      }),
    });
    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'conversation-1',
        OR: [
          {
            lastMessageAt: null,
          },
          {
            lastMessageAt: {
              lte: staleSentAt,
            },
          },
        ],
      },
      data: {
        lastMessageAt: staleSentAt,
        lastMessagePreview: 'Imagem',
        updatedAt: new Date('2026-03-22T18:30:00.000Z'),
      },
    });
    expect(
      conversationWorkflowService.registerInboundActivity,
    ).not.toHaveBeenCalled();
    expect(notifyRecipientsSpy).not.toHaveBeenCalled();
    expect(maybeSendAutomaticReplySpy).not.toHaveBeenCalled();
    expect(
      conversationWorkflowService.emitConversationRealtimeEvent,
    ).toHaveBeenCalledWith(
      'workspace-1',
      'conversation-1',
      'conversation.message.created',
      'INBOUND',
    );
  });

  it('still treats recent inbound messages as new activity', async () => {
    const {
      service,
      prisma,
      provider,
      tenantConnectionService,
      conversationWorkflowService,
    } = createWebhookService();
    const notifyRecipientsSpy = jest
      .spyOn(service as any, 'notifyConversationRecipientsAboutInboundMessage')
      .mockResolvedValue(undefined);
    const maybeSendAutomaticReplySpy = jest
      .spyOn(service as any, 'maybeSendAutomaticReply')
      .mockResolvedValue(undefined);
    const recentTimestamp = String(
      Math.floor((Date.now() - 4 * 60_000) / 1000),
    );

    jest
      .spyOn(service as any, 'assertWebhookSignature')
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, 'ensureContact').mockResolvedValue({
      id: 'contact-1',
      name: 'Nycolas Rocha',
    });
    jest.spyOn(service as any, 'ensureConversation').mockResolvedValue({
      id: 'conversation-1',
    });
    jest
      .spyOn(service as any, 'enrichInboundMessageMetadata')
      .mockResolvedValue({
        mediaId: 'media-2',
      });

    tenantConnectionService.resolveTenantByPhoneNumberId.mockResolvedValue(
      null,
    );
    provider.parseWebhook.mockReturnValue({
      messages: [
        {
          phoneNumberId: 'phone-1',
          from: '5585988887777',
          profileName: 'Nycolas Rocha',
          externalMessageId: 'wamid.recent.1',
          messageType: 'image',
          body: '',
          timestamp: recentTimestamp,
          metadata: {
            mediaId: 'media-2',
          },
        },
      ],
      statuses: [],
    });
    prisma.instance.findFirst.mockResolvedValue({
      id: 'instance-1',
      workspaceId: 'workspace-1',
      phoneNumberId: 'phone-1',
    });
    prisma.whatsAppWebhookEvent.create.mockResolvedValue({
      id: 'webhook-1',
    });
    prisma.conversationMessage.findFirst.mockResolvedValue(null);

    await service.handleWebhook(
      {
        entry: [],
      },
      {
        rawBody: Buffer.from('{}'),
      },
    );

    expect(
      conversationWorkflowService.registerInboundActivity,
    ).toHaveBeenCalledWith('conversation-1', 'workspace-1');
    expect(notifyRecipientsSpy).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      contactName: 'Nycolas Rocha',
      preview: 'Imagem',
    });
    expect(maybeSendAutomaticReplySpy).toHaveBeenCalledWith(
      'workspace-1',
      'conversation-1',
    );
  });

  it('does not react as a new inbound when an out-of-order message is older than the current conversation summary', async () => {
    const {
      service,
      prisma,
      provider,
      tenantConnectionService,
      conversationWorkflowService,
    } = createWebhookService();
    const notifyRecipientsSpy = jest
      .spyOn(service as any, 'notifyConversationRecipientsAboutInboundMessage')
      .mockResolvedValue(undefined);
    const maybeSendAutomaticReplySpy = jest
      .spyOn(service as any, 'maybeSendAutomaticReply')
      .mockResolvedValue(undefined);
    const outOfOrderTimestamp = String(
      Math.floor((Date.now() - 4 * 60_000) / 1000),
    );

    jest
      .spyOn(service as any, 'assertWebhookSignature')
      .mockResolvedValue(undefined);
    jest.spyOn(service as any, 'ensureContact').mockResolvedValue({
      id: 'contact-1',
      name: 'Nycolas Rocha',
    });
    jest.spyOn(service as any, 'ensureConversation').mockResolvedValue({
      id: 'conversation-1',
      lastMessageAt: new Date(Date.now() - 2 * 60_000),
    });
    jest
      .spyOn(service as any, 'enrichInboundMessageMetadata')
      .mockResolvedValue({
        mediaId: 'media-3',
      });

    tenantConnectionService.resolveTenantByPhoneNumberId.mockResolvedValue(
      null,
    );
    provider.parseWebhook.mockReturnValue({
      messages: [
        {
          phoneNumberId: 'phone-1',
          from: '5585988887777',
          profileName: 'Nycolas Rocha',
          externalMessageId: 'wamid.out-of-order.1',
          messageType: 'image',
          body: '',
          timestamp: outOfOrderTimestamp,
          metadata: {
            mediaId: 'media-3',
          },
        },
      ],
      statuses: [],
    });
    prisma.instance.findFirst.mockResolvedValue({
      id: 'instance-1',
      workspaceId: 'workspace-1',
      phoneNumberId: 'phone-1',
    });
    prisma.whatsAppWebhookEvent.create.mockResolvedValue({
      id: 'webhook-1',
    });
    prisma.conversationMessage.findFirst.mockResolvedValue(null);

    await service.handleWebhook(
      {
        entry: [],
      },
      {
        rawBody: Buffer.from('{}'),
      },
    );

    expect(
      conversationWorkflowService.registerInboundActivity,
    ).not.toHaveBeenCalled();
    expect(notifyRecipientsSpy).not.toHaveBeenCalled();
    expect(maybeSendAutomaticReplySpy).not.toHaveBeenCalled();
  });
});
