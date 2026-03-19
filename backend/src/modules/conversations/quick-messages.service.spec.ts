import { BadRequestException } from '@nestjs/common';
import { QuickMessagesService } from './quick-messages.service';

describe('QuickMessagesService', () => {
  function createService() {
    const prisma = {
      quickMessage: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      conversation: {
        findFirst: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
    };

    const conversationWorkflowService = {
      assertConversationAccess: jest.fn(),
    };

    const conversationsService = {
      sendMessage: jest.fn(),
    };

    const service = new QuickMessagesService(
      prisma as never,
      conversationWorkflowService as never,
      conversationsService as never,
    );

    return {
      service,
      prisma,
      conversationWorkflowService,
      conversationsService,
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('blocks duplicate quick-message titles in the same workspace', async () => {
    const { service, prisma } = createService();

    prisma.quickMessage.findFirst.mockResolvedValue({
      id: 'qm-1',
    });

    await expect(
      service.create(
        {
          sub: 'seller-1',
          workspaceId: 'ws-1',
        } as never,
        {
          title: 'Primeiro contato',
          content: 'Ola {nome}',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.quickMessage.create).not.toHaveBeenCalled();
  });

  it('resolves placeholders when inserting template into the chat input', async () => {
    const { service, prisma, conversationWorkflowService } = createService();

    prisma.quickMessage.findFirst.mockResolvedValueOnce({
      id: 'qm-1',
      workspaceId: 'ws-1',
      title: 'Transferencia',
      content:
        'Ola {nome}, aqui e {vendedor}. Agora seu atendimento segue com {novo_vendedor} na {empresa}.',
    });
    conversationWorkflowService.assertConversationAccess.mockResolvedValue(
      undefined,
    );
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      contact: {
        name: 'Joao',
      },
      assignedUser: {
        name: 'Pedro',
      },
      workspace: {
        name: 'AutoZap',
        companyName: 'AutoZap LTDA',
      },
    });
    prisma.user.findFirst.mockResolvedValue({
      name: 'Rafael',
    });

    const result = await service.applyMessageToConversation(
      'qm-1',
      {
        sub: 'seller-1',
        name: 'Rafael',
        role: 'SELLER',
        workspaceId: 'ws-1',
      } as never,
      {
        conversationId: 'conv-1',
        action: 'EDIT_IN_INPUT',
      },
    );

    expect(result).toEqual({
      action: 'EDIT_IN_INPUT',
      content:
        'Ola Joao, aqui e Rafael. Agora seu atendimento segue com Pedro na AutoZap LTDA.',
    });
  });

  it('sends the resolved quick message immediately when requested', async () => {
    const {
      service,
      prisma,
      conversationWorkflowService,
      conversationsService,
    } = createService();

    prisma.quickMessage.findFirst.mockResolvedValueOnce({
      id: 'qm-1',
      workspaceId: 'ws-1',
      title: 'Continuacao',
      content: 'Ola {nome}, {novo_vendedor} dara continuidade ao atendimento.',
    });
    conversationWorkflowService.assertConversationAccess.mockResolvedValue(
      undefined,
    );
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      contact: {
        name: 'Maria',
      },
      assignedUser: {
        name: 'Larissa',
      },
      workspace: {
        name: 'AutoZap',
        companyName: 'AutoZap',
      },
    });
    prisma.user.findFirst.mockResolvedValue({
      name: 'Rafael',
    });
    conversationsService.sendMessage.mockResolvedValue({
      id: 'msg-1',
      content:
        '*RAFAEL*:\nOla Maria, Larissa dara continuidade ao atendimento.',
    });

    const result = await service.applyMessageToConversation(
      'qm-1',
      {
        sub: 'seller-1',
        name: 'Rafael',
        role: 'SELLER',
        workspaceId: 'ws-1',
      } as never,
      {
        conversationId: 'conv-1',
        action: 'SEND_NOW',
      },
    );

    expect(conversationsService.sendMessage).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        sub: 'seller-1',
      }),
      'Ola Maria, Larissa dara continuidade ao atendimento.',
    );
    expect(result).toMatchObject({
      action: 'SEND_NOW',
      content: 'Ola Maria, Larissa dara continuidade ao atendimento.',
      message: {
        id: 'msg-1',
      },
    });
  });
});
