import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { URL } from 'node:url';
import { CryptoService } from '../crypto/crypto.service';
import { ControlPlanePrismaService } from '../prisma/control-plane-prisma.service';
import {
  CompanyStatus,
  TenantDatabaseStatus,
} from '../../generated/control-plane-client';

type TenantClientEntry = {
  client: PrismaClient;
  databaseUrl: string;
  connectedAt: Date;
};

type TenantRuntimeConfig = {
  companyId: string;
  workspaceId: string;
  databaseName: string;
  databaseUrl: string;
};

@Injectable()
export class TenantConnectionService implements OnModuleDestroy {
  private readonly logger = new Logger(TenantConnectionService.name);
  private readonly tenantClients = new Map<string, TenantClientEntry>();
  private readonly configCache = new Map<string, TenantRuntimeConfig>();

  constructor(
    private readonly controlPlanePrisma: ControlPlanePrismaService,
    private readonly cryptoService: CryptoService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleDestroy() {
    const disconnectPromises = Array.from(this.tenantClients.values()).map(
      ({ client }) => client.$disconnect(),
    );
    await Promise.allSettled(disconnectPromises);
    this.tenantClients.clear();
    this.configCache.clear();
  }

  async invalidateTenant(companyId: string) {
    this.configCache.delete(companyId);
    const existing = this.tenantClients.get(companyId);
    if (existing) {
      await existing.client.$disconnect();
      this.tenantClients.delete(companyId);
    }
  }

  async listActiveTenantIds() {
    const rows = await this.controlPlanePrisma.tenantDatabase.findMany({
      where: {
        status: TenantDatabaseStatus.READY,
        company: {
          status: CompanyStatus.ACTIVE,
        },
      },
      select: {
        companyId: true,
      },
    });

    return rows.map((row) => row.companyId);
  }

  async getTenantClient(companyId: string) {
    const config = await this.resolveTenantRuntimeConfig(companyId);
    const existing = this.tenantClients.get(companyId);

    if (existing && existing.databaseUrl === config.databaseUrl) {
      return existing.client;
    }

    if (existing && existing.databaseUrl !== config.databaseUrl) {
      await existing.client.$disconnect();
      this.tenantClients.delete(companyId);
    }

    const client = new PrismaClient({
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
    });

    await client.$connect();

    this.tenantClients.set(companyId, {
      client,
      databaseUrl: config.databaseUrl,
      connectedAt: new Date(),
    });

    return client;
  }

  async resolveTenantByPhoneNumberId(phoneNumberId: string) {
    const tenantIds = await this.listActiveTenantIds();
    const candidateTenantIds = tenantIds.length
      ? tenantIds
      : ['legacy-shared-bootstrap'];

    for (const tenantId of candidateTenantIds) {
      let tenantClient: PrismaClient;
      try {
        tenantClient = await this.getTenantClient(tenantId);
      } catch {
        continue;
      }
      const instance = await tenantClient.instance.findFirst({
        where: {
          phoneNumberId,
          deletedAt: null,
        },
        select: {
          id: true,
          workspaceId: true,
        },
      });

      if (!instance) {
        continue;
      }

      return {
        companyId: tenantId,
        workspaceId: instance.workspaceId,
        instanceId: instance.id,
      };
    }

    return null;
  }

  async resolveTenantByWebhookVerifyToken(token: string) {
    const tenantIds = await this.listActiveTenantIds();
    const candidateTenantIds = tenantIds.length
      ? tenantIds
      : ['legacy-shared-bootstrap'];

    for (const tenantId of candidateTenantIds) {
      let tenantClient: PrismaClient;
      try {
        tenantClient = await this.getTenantClient(tenantId);
      } catch {
        continue;
      }
      const instances = await tenantClient.instance.findMany({
        where: {
          deletedAt: null,
        },
        select: {
          webhookVerifyTokenEncrypted: true,
          workspaceId: true,
        },
      });

      const matched = instances.find((instance) => {
        const decryptedToken = this.cryptoService.decrypt(
          instance.webhookVerifyTokenEncrypted,
        );
        return decryptedToken === token;
      });

      if (matched) {
        return {
          companyId: tenantId,
          workspaceId: matched.workspaceId,
        };
      }
    }

    return null;
  }

  async resolveTenantRuntimeConfig(
    companyId: string,
  ): Promise<TenantRuntimeConfig> {
    const cached = this.configCache.get(companyId);
    if (cached) {
      return cached;
    }

    const tenantDb = await this.controlPlanePrisma.tenantDatabase.findUnique({
      where: {
        companyId,
      },
      include: {
        company: {
          select: {
            id: true,
            workspaceId: true,
            status: true,
          },
        },
      },
    });

    if (
      tenantDb &&
      tenantDb.status === TenantDatabaseStatus.READY &&
      tenantDb.company.status === CompanyStatus.ACTIVE
    ) {
      const decryptedUrl = this.cryptoService.decrypt(
        tenantDb.connectionUrlEncrypted,
      );

      if (!decryptedUrl) {
        throw new ServiceUnavailableException(
          'Configuracao do banco do tenant invalida.',
        );
      }

      const runtimeConfig: TenantRuntimeConfig = {
        companyId,
        workspaceId: tenantDb.company.workspaceId,
        databaseName: tenantDb.databaseName,
        databaseUrl: decryptedUrl,
      };

      this.configCache.set(companyId, runtimeConfig);
      return runtimeConfig;
    }

    const fallback = this.resolveDevelopmentFallback(companyId);
    if (fallback) {
      this.configCache.set(companyId, fallback);
      return fallback;
    }

    if (!tenantDb) {
      throw new NotFoundException('Tenant nao encontrado no control plane.');
    }

    throw new ServiceUnavailableException(
      'Tenant nao esta pronto para receber trafego.',
    );
  }

  private resolveDevelopmentFallback(
    companyId: string,
  ): TenantRuntimeConfig | null {
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';
    const allowSharedFallback =
      this.configService.get<string>('TENANT_ALLOW_SHARED_FALLBACK') ===
        'true' || nodeEnv !== 'production';

    if (!allowSharedFallback) {
      return null;
    }

    const sharedUrl = this.configService.get<string>('DATABASE_URL');
    if (!sharedUrl) {
      return null;
    }

    this.logger.warn(
      `Tenant ${companyId} sem banco dedicado configurado. Usando DATABASE_URL compartilhada (modo fallback).`,
    );

    let databaseName = 'shared';
    try {
      const parsed = new URL(sharedUrl);
      databaseName = parsed.pathname.replace(/^\//, '') || databaseName;
    } catch {
      databaseName = 'shared';
    }

    return {
      companyId,
      workspaceId: companyId,
      databaseName,
      databaseUrl: sharedUrl,
    };
  }
}
