import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLATFORM_ADMIN_KEY } from '../decorators/platform-admin.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TenantConnectionService } from '../tenancy/tenant-connection.service';
import { TenantContextGuard } from './tenant-context.guard';

function buildExecutionContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('TenantContextGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let tenantConnectionService: jest.Mocked<TenantConnectionService>;
  let prismaService: jest.Mocked<PrismaService>;
  let guard: TenantContextGuard;
  let getTenantClientMock: jest.Mock;
  let patchTenantContextMock: jest.Mock;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    getTenantClientMock = jest.fn();
    tenantConnectionService = {
      getTenantClient: getTenantClientMock,
    } as unknown as jest.Mocked<TenantConnectionService>;
    patchTenantContextMock = jest.fn();
    prismaService = {
      patchTenantContext: patchTenantContextMock,
    } as unknown as jest.Mocked<PrismaService>;

    guard = new TenantContextGuard(
      reflector,
      tenantConnectionService,
      prismaService,
    );
  });

  it('permite rota publica', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return true;
      return false;
    });

    const canActivate = await guard.canActivate(
      buildExecutionContext({ user: undefined }),
    );

    expect(canActivate).toBe(true);
    expect(patchTenantContextMock).not.toHaveBeenCalled();
  });

  it('bloqueia rota de plataforma para usuario sem role', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PLATFORM_ADMIN_KEY) return true;
      return false;
    });

    await expect(
      guard.canActivate(
        buildExecutionContext({
          user: {
            sub: 'user-1',
            email: 'user@acme.com',
            name: 'User',
            role: 'ADMIN',
            workspaceId: 'ws-1',
            companyId: 'ws-1',
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite rota de plataforma para usuario com role SUPPORT', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PLATFORM_ADMIN_KEY) return true;
      return false;
    });

    const canActivate = await guard.canActivate(
      buildExecutionContext({
        user: {
          sub: 'user-1',
          email: 'support@autoszap.com',
          name: 'Support',
          role: 'ADMIN',
          workspaceId: 'ws-1',
          platformRole: 'SUPPORT',
        },
      }),
    );

    expect(canActivate).toBe(true);
    expect(getTenantClientMock).not.toHaveBeenCalled();
    expect(patchTenantContextMock).toHaveBeenCalledTimes(1);
  });

  it('resolve tenant client em rota comum', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PLATFORM_ADMIN_KEY) return false;
      return false;
    });

    getTenantClientMock.mockResolvedValue({} as never);

    const canActivate = await guard.canActivate(
      buildExecutionContext({
        user: {
          sub: 'user-1',
          email: 'user@acme.com',
          name: 'User',
          role: 'ADMIN',
          workspaceId: 'ws-1',
          companyId: 'ws-1',
          platformRole: 'SUPER_ADMIN',
        },
      }),
    );

    expect(canActivate).toBe(true);
    expect(getTenantClientMock).toHaveBeenCalledWith('ws-1');
    expect(patchTenantContextMock).toHaveBeenCalledTimes(2);
  });

  it('falha quando usuario nao possui empresa ativa', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === PLATFORM_ADMIN_KEY) return false;
      return false;
    });

    await expect(
      guard.canActivate(
        buildExecutionContext({
          user: {
            sub: 'user-1',
            email: 'user@acme.com',
            name: 'User',
            role: 'ADMIN',
            workspaceId: '',
          },
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
