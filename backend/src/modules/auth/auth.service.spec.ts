import * as bcrypt from 'bcrypt';
import { Role, UserStatus } from '@prisma/client';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const sharedDatabaseUrl =
    'postgresql://autoszap:pwd@postgres:5432/autoszap?schema=public';

  let service: AuthService;
  let prisma: {
    runWithTenant: jest.Mock;
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    workspace: {
      findUnique: jest.Mock;
    };
  };
  let controlPlanePrisma: {
    globalUser: {
      upsert: jest.Mock;
    };
    company: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    companyMembership: {
      upsert: jest.Mock;
    };
    tenantDatabase: {
      upsert: jest.Mock;
    };
  };
  let configService: {
    get: jest.Mock;
  };
  let cryptoService: {
    encrypt: jest.Mock;
  };
  let tenantConnectionService: {
    listActiveTenantIds: jest.Mock;
  };

  const loginEmail = 'ana@autoszap.com';
  const plainPassword = '123456';
  const hashedPassword = bcrypt.hashSync(plainPassword, 4);

  beforeEach(() => {
    prisma = {
      runWithTenant: jest.fn(
        async (_tenantId: string, callback: () => Promise<unknown>) =>
          callback(),
      ),
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
      workspace: {
        findUnique: jest.fn(),
      },
    };

    controlPlanePrisma = {
      globalUser: {
        upsert: jest.fn().mockResolvedValue({
          id: 'global-1',
          email: loginEmail,
          name: 'Ana',
          passwordHash: 'hash-global',
          status: 'ACTIVE',
          deletedAt: null,
          blockedAt: null,
        }),
      },
      company: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          id: 'workspace-1',
          workspaceId: 'workspace-1',
          name: 'Acme',
          slug: 'acme',
          status: 'ACTIVE',
        }),
      },
      companyMembership: {
        upsert: jest.fn().mockResolvedValue({
          id: 'membership-1',
          companyId: 'workspace-1',
          globalUserId: 'global-1',
          tenantRole: 'ADMIN',
          status: 'ACTIVE',
          isDefault: true,
        }),
      },
      tenantDatabase: {
        upsert: jest.fn().mockResolvedValue({
          id: 'tenant-db-1',
        }),
      },
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'DATABASE_URL') {
          return sharedDatabaseUrl;
        }

        return undefined;
      }),
    };

    cryptoService = {
      encrypt: jest.fn().mockReturnValue('encrypted-shared-url'),
    };

    tenantConnectionService = {
      listActiveTenantIds: jest.fn(),
    };

    service = new AuthService(
      prisma as never,
      controlPlanePrisma as never,
      { signAsync: jest.fn() } as never,
      configService as never,
      cryptoService as never,
      {} as never,
      { log: jest.fn() } as never,
      {} as never,
      tenantConnectionService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('nao sobrescreve tenantDatabase para usuario encontrado em tenant dedicado', async () => {
    tenantConnectionService.listActiveTenantIds.mockResolvedValue([
      'company-1',
    ]);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: loginEmail,
      name: 'Ana',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      deletedAt: null,
      passwordHash: hashedPassword,
      workspaceId: 'workspace-1',
    });
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'workspace-1',
      name: 'Acme',
      slug: 'acme',
      companyName: 'Acme',
    });
    const globalUser = await (
      service as unknown as {
        bootstrapLegacyIdentityFromTenant: (
          email: string,
          plainPassword: string,
        ) => Promise<{ id: string } | null>;
      }
    ).bootstrapLegacyIdentityFromTenant(loginEmail, plainPassword);

    expect(globalUser?.id).toBe('global-1');
    expect(controlPlanePrisma.tenantDatabase.upsert).not.toHaveBeenCalled();
    expect(prisma.runWithTenant).toHaveBeenCalledWith(
      'company-1',
      expect.any(Function),
    );
  });

  it('persiste tenantDatabase compartilhado no bootstrap legado', async () => {
    tenantConnectionService.listActiveTenantIds.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: loginEmail,
      name: 'Ana',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      deletedAt: null,
      passwordHash: hashedPassword,
      workspaceId: 'workspace-1',
    });
    prisma.workspace.findUnique.mockResolvedValue({
      id: 'workspace-1',
      name: 'Acme',
      slug: 'acme',
      companyName: 'Acme',
    });
    await (
      service as unknown as {
        bootstrapLegacyIdentityFromTenant: (
          email: string,
          plainPassword: string,
        ) => Promise<{ id: string } | null>;
      }
    ).bootstrapLegacyIdentityFromTenant(loginEmail, plainPassword);

    expect(controlPlanePrisma.tenantDatabase.upsert).toHaveBeenCalledTimes(1);
    expect(controlPlanePrisma.tenantDatabase.upsert).toHaveBeenCalledWith({
      where: {
        companyId: 'workspace-1',
      },
      update: {
        status: 'READY',
        connectionUrlEncrypted: 'encrypted-shared-url',
      },
      create: {
        companyId: 'workspace-1',
        databaseName: 'legacy-shared',
        connectionUrlEncrypted: 'encrypted-shared-url',
        status: 'READY',
      },
    });
    expect(prisma.runWithTenant).toHaveBeenCalledWith(
      'legacy-shared-bootstrap',
      expect.any(Function),
    );
  });
});
