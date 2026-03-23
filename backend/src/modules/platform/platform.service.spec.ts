import { NotFoundException } from '@nestjs/common';
import type { CurrentAuthUser } from '../../common/decorators/current-user.decorator';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PlatformService } from './platform.service';

describe('PlatformService', () => {
  let service: PlatformService;
  let prismaService: jest.Mocked<PrismaService>;
  let controlPlanePrisma: jest.Mocked<ControlPlanePrismaService>;
  let findTenantUserMock: jest.Mock;
  let findCompanyMock: jest.Mock;
  let createSupportTicketMock: jest.Mock;
  let listSupportTicketsMock: jest.Mock;
  let findSupportTicketMock: jest.Mock;
  let createSupportTicketMessageMock: jest.Mock;
  let updateSupportTicketMock: jest.Mock;
  let controlPlaneTransactionMock: jest.Mock;

  const user = {
    sub: 'tenant-user-1',
    workspaceId: 'workspace-1',
    email: 'cliente@acme.com',
    name: 'Cliente Acme',
    role: 'ADMIN',
  } satisfies CurrentAuthUser;

  beforeEach(() => {
    findTenantUserMock = jest.fn();
    findCompanyMock = jest.fn();
    createSupportTicketMock = jest.fn();
    listSupportTicketsMock = jest.fn();
    findSupportTicketMock = jest.fn();
    createSupportTicketMessageMock = jest.fn();
    updateSupportTicketMock = jest.fn();
    controlPlaneTransactionMock = jest.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    prismaService = {
      user: {
        findUnique: findTenantUserMock,
      },
    } as unknown as jest.Mocked<PrismaService>;

    controlPlanePrisma = {
      company: {
        findFirst: findCompanyMock,
      },
      supportTicket: {
        create: createSupportTicketMock,
        findMany: listSupportTicketsMock,
        findFirst: findSupportTicketMock,
        update: updateSupportTicketMock,
      },
      supportTicketMessage: {
        create: createSupportTicketMessageMock,
      },
      $transaction: controlPlaneTransactionMock,
    } as unknown as jest.Mocked<ControlPlanePrismaService>;

    service = new PlatformService(prismaService, controlPlanePrisma);
  });

  it('cria chamado para o usuario autenticado', async () => {
    findCompanyMock.mockResolvedValue({
      id: 'company-1',
      name: 'Acme',
    } as never);
    findTenantUserMock.mockResolvedValue({
      globalUserId: 'global-user-1',
      name: 'Cliente Acme',
      email: 'cliente@acme.com',
    } as never);
    createSupportTicketMock.mockResolvedValue({
      id: 'ticket-1',
    } as never);

    await service.createSupportTicket(user, {
      title: 'Erro no CRM',
      body: 'O CRM nao abre a lista de contatos.',
      category: 'BUG',
    });

    expect(createSupportTicketMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-1',
        globalUserId: 'global-user-1',
        title: 'Erro no CRM',
      }),
    });
  });

  it('falha ao criar chamado sem empresa ou usuario global', async () => {
    findCompanyMock.mockResolvedValue(null);
    findTenantUserMock.mockResolvedValue({
      globalUserId: null,
    } as never);

    await expect(
      service.createSupportTicket(user, {
        title: 'Erro no CRM',
        body: 'O CRM nao abre a lista de contatos.',
        category: 'BUG',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adiciona mensagem do cliente no proprio chamado', async () => {
    findTenantUserMock
      .mockResolvedValueOnce({
        globalUserId: 'global-user-1',
        name: 'Cliente Acme',
        email: 'cliente@acme.com',
      } as never)
      .mockResolvedValueOnce({
        globalUserId: 'global-user-1',
      } as never);
    findCompanyMock
      .mockResolvedValueOnce({
        id: 'company-1',
      } as never)
      .mockResolvedValueOnce({
        id: 'company-1',
      } as never);
    findSupportTicketMock
      .mockResolvedValueOnce({
        id: 'ticket-1',
      } as never)
      .mockResolvedValueOnce({
        id: 'ticket-1',
        title: 'Erro no CRM',
        body: 'Descricao inicial',
        category: 'BUG',
        status: 'OPEN',
        companyName: 'Acme',
        authorName: 'Cliente Acme',
        authorEmail: 'cliente@acme.com',
        resolvedAt: null,
        createdAt: new Date('2026-03-23T12:00:00.000Z'),
        updatedAt: new Date('2026-03-23T12:10:00.000Z'),
        messages: [],
      } as never);
    createSupportTicketMessageMock.mockResolvedValue({
      id: 'message-1',
    } as never);
    updateSupportTicketMock.mockResolvedValue({
      id: 'ticket-1',
    } as never);

    const result = await service.addMessageToMyTicket(user, 'ticket-1', {
      body: '  Tenho mais detalhes sobre o erro.  ',
    });

    expect(createSupportTicketMessageMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 'ticket-1',
        senderType: 'CUSTOMER',
        body: 'Tenho mais detalhes sobre o erro.',
      }),
    });
    expect(result.id).toBe('ticket-1');
  });
});
