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
});
