import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';
import { ControlPlaneAuditService } from '../control-plane/control-plane-audit.service';
import { TenantProvisioningService } from '../control-plane/tenant-provisioning.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformAdminService } from './platform-admin.service';

describe('PlatformAdminService', () => {
  let service: PlatformAdminService;
  let controlPlanePrisma: jest.Mocked<ControlPlanePrismaService>;
  let auditService: jest.Mocked<ControlPlaneAuditService>;
  let tenantProvisioningService: jest.Mocked<TenantProvisioningService>;
  let prismaService: jest.Mocked<PrismaService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let findGlobalUserMock: jest.Mock;
  let findCompanyMock: jest.Mock;
  let upsertMembershipMock: jest.Mock;
  let supportTicketFindUniqueMock: jest.Mock;
  let supportTicketMessageCreateMock: jest.Mock;
  let supportTicketUpdateMock: jest.Mock;
  let controlPlaneTransactionMock: jest.Mock;
  let findTenantUserMock: jest.Mock;
  let runWithTenantMock: jest.Mock;
  let auditLogMock: jest.Mock;

  beforeEach(() => {
    findGlobalUserMock = jest.fn();
    findCompanyMock = jest.fn();
    upsertMembershipMock = jest.fn();
    supportTicketFindUniqueMock = jest.fn();
    supportTicketMessageCreateMock = jest.fn();
    supportTicketUpdateMock = jest.fn();
    controlPlaneTransactionMock = jest.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    findTenantUserMock = jest.fn();
    runWithTenantMock = jest.fn();
    auditLogMock = jest.fn();

    controlPlanePrisma = {
      globalUser: {
        findUnique: findGlobalUserMock,
      },
      company: {
        findUnique: findCompanyMock,
      },
      companyMembership: {
        upsert: upsertMembershipMock,
        updateMany: jest.fn(),
      },
      supportTicket: {
        findUnique: supportTicketFindUniqueMock,
        update: supportTicketUpdateMock,
      },
      supportTicketMessage: {
        create: supportTicketMessageCreateMock,
      },
      $transaction: controlPlaneTransactionMock,
    } as unknown as jest.Mocked<ControlPlanePrismaService>;
    auditService = {
      log: auditLogMock,
    } as unknown as jest.Mocked<ControlPlaneAuditService>;
    tenantProvisioningService = {
      provisionTenant: jest.fn(),
    } as unknown as jest.Mocked<TenantProvisioningService>;
    prismaService = {
      user: {
        findFirst: findTenantUserMock,
      },
      runWithTenant: runWithTenantMock,
    } as unknown as jest.Mocked<PrismaService>;
    notificationsService = {
      createForUsers: jest.fn(),
    } as unknown as jest.Mocked<NotificationsService>;

    service = new PlatformAdminService(
      controlPlanePrisma,
      auditService,
      tenantProvisioningService,
      prismaService,
      notificationsService,
    );
  });

  it('falha ao vincular usuario inexistente', async () => {
    findGlobalUserMock.mockResolvedValue(null);

    await expect(
      service.upsertMembership('actor-1', 'missing-user', {
        companyId: 'company-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('falha ao vincular empresa inexistente', async () => {
    findGlobalUserMock.mockResolvedValue({
      id: 'user-1',
      name: 'User',
      email: 'user@acme.com',
      passwordHash: 'hash',
    } as never);
    findCompanyMock.mockResolvedValue(null);

    await expect(
      service.upsertMembership('actor-1', 'user-1', {
        companyId: 'missing-company',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sincroniza tenant quando membership ativa', async () => {
    findGlobalUserMock.mockResolvedValue({
      id: 'user-1',
      name: 'User',
      email: 'user@acme.com',
      passwordHash: 'hash',
    } as never);
    findCompanyMock.mockResolvedValue({
      id: 'company-1',
      workspaceId: 'company-1',
      name: 'Acme',
    } as never);
    upsertMembershipMock.mockResolvedValue({
      id: 'membership-1',
      status: 'ACTIVE',
      tenantRole: 'SELLER',
    } as never);
    runWithTenantMock.mockResolvedValue(undefined as never);

    await service.upsertMembership('actor-1', 'user-1', {
      companyId: 'company-1',
      status: 'ACTIVE',
      tenantRole: 'SELLER',
    });

    expect(runWithTenantMock).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(auditLogMock).toHaveBeenCalled();
  });

  it('adiciona mensagem do suporte e notifica o autor do chamado', async () => {
    supportTicketFindUniqueMock
      .mockResolvedValueOnce({
        id: 'ticket-1',
        title: 'Inbox travado',
        companyId: 'company-1',
        globalUserId: 'global-user-1',
        company: {
          workspaceId: 'workspace-1',
        },
      } as never)
      .mockResolvedValueOnce({
        id: 'ticket-1',
        title: 'Inbox travado',
        body: 'Descricao inicial',
        category: 'BUG',
        status: 'OPEN',
        companyName: 'Acme',
        authorName: 'Cliente',
        authorEmail: 'cliente@acme.com',
        resolvedAt: null,
        createdAt: new Date('2026-03-23T12:00:00.000Z'),
        updatedAt: new Date('2026-03-23T12:10:00.000Z'),
        messages: [],
      } as never);
    supportTicketMessageCreateMock.mockResolvedValue({
      id: 'msg-1',
    } as never);
    supportTicketUpdateMock.mockResolvedValue({
      id: 'ticket-1',
    } as never);
    runWithTenantMock.mockImplementation(async (_companyId, callback) =>
      callback(),
    );
    findTenantUserMock.mockResolvedValue({
      id: 'tenant-user-1',
    } as never);

    const result = await service.addSupportTicketMessage(
      {
        sub: 'platform-user-1',
        globalUserId: 'platform-user-1',
        workspaceId: 'platform',
        email: 'support@autoszap.com',
        name: 'Equipe Support',
        role: 'ADMIN',
        platformRole: 'SUPPORT',
      },
      'ticket-1',
      { body: '  Estamos analisando isso agora.  ' },
    );

    expect(supportTicketMessageCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 'ticket-1',
        senderType: 'PLATFORM',
        senderName: 'Equipe Support',
        body: 'Estamos analisando isso agora.',
      }),
    });
    expect(runWithTenantMock).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(notificationsService.createForUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        userIds: ['tenant-user-1'],
        entityId: 'ticket-1',
        linkHref: '/app/suporte?ticket=ticket-1',
      }),
    );
    expect(result.id).toBe('ticket-1');
  });
});
