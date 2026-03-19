import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';
import { ControlPlaneAuditService } from '../control-plane/control-plane-audit.service';
import { TenantProvisioningService } from '../control-plane/tenant-provisioning.service';
import { PlatformAdminService } from './platform-admin.service';

describe('PlatformAdminService', () => {
  let service: PlatformAdminService;
  let controlPlanePrisma: jest.Mocked<ControlPlanePrismaService>;
  let auditService: jest.Mocked<ControlPlaneAuditService>;
  let tenantProvisioningService: jest.Mocked<TenantProvisioningService>;
  let prismaService: jest.Mocked<PrismaService>;
  let findGlobalUserMock: jest.Mock;
  let findCompanyMock: jest.Mock;
  let upsertMembershipMock: jest.Mock;
  let runWithTenantMock: jest.Mock;
  let auditLogMock: jest.Mock;

  beforeEach(() => {
    findGlobalUserMock = jest.fn();
    findCompanyMock = jest.fn();
    upsertMembershipMock = jest.fn();
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
    } as unknown as jest.Mocked<ControlPlanePrismaService>;
    auditService = {
      log: auditLogMock,
    } as unknown as jest.Mocked<ControlPlaneAuditService>;
    tenantProvisioningService = {
      provisionTenant: jest.fn(),
    } as unknown as jest.Mocked<TenantProvisioningService>;
    prismaService = {
      runWithTenant: runWithTenantMock,
    } as unknown as jest.Mocked<PrismaService>;

    service = new PlatformAdminService(
      controlPlanePrisma,
      auditService,
      tenantProvisioningService,
      prismaService,
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
});
