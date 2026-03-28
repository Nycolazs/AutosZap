import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CompanyStatus,
  GlobalUserStatus,
  PlatformRole,
} from '@autoszap/control-plane-client';
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
  let findGlobalUsersMock: jest.Mock;
  let updateGlobalUserMock: jest.Mock;
  let countGlobalUsersMock: jest.Mock;
  let findCompanyMock: jest.Mock;
  let findCompaniesMock: jest.Mock;
  let updateCompanyMock: jest.Mock;
  let updateGlobalRefreshTokensMock: jest.Mock;
  let updateTenantUsersMock: jest.Mock;
  let updateTeamMembersMock: jest.Mock;
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
    findGlobalUsersMock = jest.fn();
    updateGlobalUserMock = jest.fn();
    countGlobalUsersMock = jest.fn();
    findCompanyMock = jest.fn();
    findCompaniesMock = jest.fn();
    updateCompanyMock = jest.fn();
    updateGlobalRefreshTokensMock = jest.fn();
    updateTenantUsersMock = jest.fn();
    updateTeamMembersMock = jest.fn();
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
        findMany: findGlobalUsersMock,
        update: updateGlobalUserMock,
        count: countGlobalUsersMock,
      },
      globalRefreshToken: {
        updateMany: updateGlobalRefreshTokensMock,
      },
      company: {
        findUnique: findCompanyMock,
        findMany: findCompaniesMock,
        update: updateCompanyMock,
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
        updateMany: updateTenantUsersMock,
      },
      teamMember: {
        updateMany: updateTeamMembersMock,
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

  it('filtra empresas ativas e desativadas na listagem', async () => {
    findCompaniesMock.mockResolvedValue([]);

    await service.listCompanies({
      search: 'Acme',
      activity: 'active',
    });

    expect(findCompaniesMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'Acme', mode: 'insensitive' } },
            { slug: { contains: 'Acme', mode: 'insensitive' } },
            { workspaceId: { contains: 'Acme', mode: 'insensitive' } },
          ],
          status: CompanyStatus.ACTIVE,
        },
      }),
    );

    await service.listCompanies({
      activity: 'inactive',
    });

    expect(findCompaniesMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          status: {
            not: CompanyStatus.ACTIVE,
          },
        },
      }),
    );
  });

  it('filtra usuarios por atividade e empresa', async () => {
    findGlobalUsersMock.mockResolvedValue([]);

    await service.listGlobalUsers({
      search: 'joao',
      activity: 'active',
      companyId: 'company-1',
    });

    expect(findGlobalUsersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: 'joao', mode: 'insensitive' } },
            { email: { contains: 'joao', mode: 'insensitive' } },
          ],
          status: GlobalUserStatus.ACTIVE,
          memberships: {
            some: {
              companyId: 'company-1',
            },
          },
        },
      }),
    );
  });

  it('exclui usuario global, revoga acessos e sincroniza tenants', async () => {
    const deletedAt = new Date('2026-03-28T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(deletedAt);
    findGlobalUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'user@acme.com',
      deletedAt: null,
      platformRole: null,
      memberships: [
        {
          id: 'membership-1',
          companyId: 'company-1',
          company: {
            id: 'company-1',
            workspaceId: 'workspace-1',
          },
        },
      ],
    } as never);
    updateGlobalUserMock.mockResolvedValue({
      id: 'user-1',
    } as never);
    updateGlobalRefreshTokensMock.mockResolvedValue({ count: 1 } as never);
    runWithTenantMock.mockImplementation(async (_companyId, callback) =>
      callback(),
    );
    updateTenantUsersMock.mockResolvedValue({ count: 1 } as never);
    updateTeamMembersMock.mockResolvedValue({ count: 1 } as never);

    const result = await service.deleteGlobalUser('actor-1', 'user-1');

    expect(result).toEqual({ success: true });
    expect(updateGlobalRefreshTokensMock).toHaveBeenCalledWith({
      where: {
        globalUserId: 'user-1',
        revokedAt: null,
      },
      data: {
        revokedAt: deletedAt,
      },
    });
    expect(updateGlobalUserMock).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
      },
      data: {
        deletedAt,
      },
    });
    expect(runWithTenantMock).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
    expect(updateTenantUsersMock).toHaveBeenCalled();
    expect(updateTeamMembersMock).toHaveBeenCalled();
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'user-1',
        metadata: {
          deletedAt: deletedAt.toISOString(),
        },
      }),
    );
    jest.useRealTimers();
  });

  it('impede excluir o ultimo super admin', async () => {
    findGlobalUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'admin@autoszap.com',
      deletedAt: null,
      platformRole: PlatformRole.SUPER_ADMIN,
      memberships: [],
    } as never);
    countGlobalUsersMock.mockResolvedValue(0);

    await expect(
      service.deleteGlobalUser('actor-2', 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserva a data de desativacao ao atualizar empresa ja desativada', async () => {
    const deactivatedAt = new Date('2026-03-20T10:00:00.000Z');
    findCompanyMock.mockResolvedValue({
      id: 'company-1',
      name: 'Acme',
      legalName: 'Acme Ltda',
      slug: 'acme',
      status: CompanyStatus.INACTIVE,
      deactivatedAt,
    } as never);
    updateCompanyMock.mockResolvedValue({
      id: 'company-1',
      status: CompanyStatus.INACTIVE,
      deactivatedAt,
    } as never);

    await service.updateCompany('actor-1', 'company-1', {
      name: 'Acme Brasil',
      status: CompanyStatus.INACTIVE,
    });

    expect(updateCompanyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Acme Brasil',
          status: CompanyStatus.INACTIVE,
          deactivatedAt,
        }),
      }),
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
