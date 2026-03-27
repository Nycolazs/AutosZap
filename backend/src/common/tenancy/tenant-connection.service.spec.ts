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

  it('normaliza tenant URL com localhost para o host do banco principal', async () => {
    controlPlanePrisma.tenantDatabase.findUnique.mockResolvedValue({
      status: 'READY',
      databaseName: 'autozap_tenant_demo',
      company: {
        id: 'company-1',
        workspaceId: 'workspace-1',
        status: 'ACTIVE',
      },
      connectionUrlEncrypted: 'encrypted',
    } as never);

    cryptoService.decrypt.mockReturnValue(
      'postgresql://postgres:postgres@localhost:5432/autozap_tenant_demo?schema=public',
    );

    const runtimeConfig = await service.resolveTenantRuntimeConfig('company-1');

    expect(runtimeConfig.databaseUrl).toBe(
      'postgresql://postgres:postgres@postgres:5432/autozap_tenant_demo?schema=public',
    );
  });

  it('normaliza tenant URL com host docker para localhost quando o backend roda fora do container', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'NODE_ENV') {
        return 'production';
      }

      if (key === 'DATABASE_URL') {
        return 'postgresql://autoszap:pwd@localhost:5432/autozap';
      }

      return undefined;
    });

    controlPlanePrisma.tenantDatabase.findUnique.mockResolvedValue({
      status: 'READY',
      databaseName: 'autozap_tenant_demo',
      company: {
        id: 'company-1',
        workspaceId: 'workspace-1',
        status: 'ACTIVE',
      },
      connectionUrlEncrypted: 'encrypted',
    } as never);

    cryptoService.decrypt.mockReturnValue(
      'postgresql://postgres:postgres@postgres:5432/autozap_tenant_demo?schema=public',
    );

    const runtimeConfig = await service.resolveTenantRuntimeConfig('company-1');

    expect(runtimeConfig.databaseUrl).toBe(
      'postgresql://postgres:postgres@localhost:5432/autozap_tenant_demo?schema=public',
    );
  });
});
