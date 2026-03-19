import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionService } from './tenant-connection.service';
import { ControlPlanePrismaService } from '../prisma/control-plane-prisma.service';
import { CryptoService } from '../crypto/crypto.service';

describe('TenantConnectionService', () => {
  const sharedDatabaseUrl = 'postgresql://autoszap:pwd@postgres:5432/autozap';

  let configService: jest.Mocked<ConfigService>;
  let controlPlanePrisma: jest.Mocked<ControlPlanePrismaService>;
  let cryptoService: jest.Mocked<CryptoService>;
  let service: TenantConnectionService;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') {
          return 'production';
        }

        if (key === 'DATABASE_URL') {
          return sharedDatabaseUrl;
        }

        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    controlPlanePrisma = {
      tenantDatabase: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as unknown as jest.Mocked<ControlPlanePrismaService>;

    cryptoService = {
      decrypt: jest.fn(),
    } as unknown as jest.Mocked<CryptoService>;

    service = new TenantConnectionService(
      controlPlanePrisma,
      cryptoService,
      configService,
    );
  });

  it('permite fallback compartilhado para bootstrap legado em produção', async () => {
    const runtimeConfig = await service.resolveTenantRuntimeConfig(
      'legacy-shared-bootstrap',
    );

    expect(runtimeConfig.companyId).toBe('legacy-shared-bootstrap');
    expect(runtimeConfig.workspaceId).toBe('legacy-shared-bootstrap');
    expect(runtimeConfig.databaseUrl).toBe(sharedDatabaseUrl);
  });

  it('mantém bloqueio de fallback para tenants normais em produção', async () => {
    await expect(
      service.resolveTenantRuntimeConfig('company-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
