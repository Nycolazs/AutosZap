import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let controlPlanePrisma: jest.Mocked<ControlPlanePrismaService>;
  let strategy: JwtStrategy;
  let findGlobalUserMock: jest.Mock;
  let findMembershipMock: jest.Mock;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    findGlobalUserMock = jest.fn();
    findMembershipMock = jest.fn();

    controlPlanePrisma = {
      globalUser: {
        findUnique: findGlobalUserMock,
      },
      companyMembership: {
        findFirst: findMembershipMock,
      },
    } as unknown as jest.Mocked<ControlPlanePrismaService>;

    strategy = new JwtStrategy(configService, controlPlanePrisma);
  });

  it('deve validar token de usuario ativo com membership', async () => {
    findGlobalUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'admin@acme.com',
      name: 'Admin',
      status: 'ACTIVE',
      deletedAt: null,
      platformRole: 'SUPER_ADMIN',
    } as never);
    findMembershipMock.mockResolvedValue({
      id: 'membership-1',
      companyId: 'company-1',
      tenantRole: 'ADMIN',
      company: {
        workspaceId: 'company-1',
      },
    } as never);

    const user = await strategy.validate({
      sub: 'user-1',
      email: 'admin@acme.com',
      name: 'Admin',
      workspaceId: 'company-1',
      role: 'ADMIN' as never,
      companyId: 'company-1',
      membershipId: 'membership-1',
    });

    expect(user.sub).toBe('user-1');
    expect(user.companyId).toBe('company-1');
    expect(user.workspaceId).toBe('company-1');
    expect(user.role).toBe('ADMIN');
  });

  it('deve rejeitar usuario bloqueado', async () => {
    findGlobalUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'admin@acme.com',
      name: 'Admin',
      status: 'BLOCKED',
      deletedAt: null,
      platformRole: null,
    } as never);

    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'admin@acme.com',
        name: 'Admin',
        workspaceId: 'company-1',
        role: 'ADMIN' as never,
        companyId: 'company-1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
