import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Role, UserStatus } from '@prisma/client';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';
import {
  Prisma,
  ProvisioningJobStatus,
  TenantDatabaseStatus,
} from '@autoszap/control-plane-client';
import { CryptoService } from '../../common/crypto/crypto.service';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';
import { TenantConnectionService } from '../../common/tenancy/tenant-connection.service';

type ProvisionTenantInput = {
  companyId: string;
  companyName: string;
  companySlug: string;
  workspaceId: string;
  requestedById?: string | null;
  admin?: {
    globalUserId: string;
    name: string;
    email: string;
    passwordHash: string;
  };
};

@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(
    private readonly controlPlanePrisma: ControlPlanePrismaService,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly cryptoService: CryptoService,
    private readonly configService: ConfigService,
  ) {}

  async provisionTenant(input: ProvisionTenantInput) {
    const startedAt = new Date();
    const target = this.resolveTenantDatabaseTarget({
      companyId: input.companyId,
      companySlug: input.companySlug,
    });

    const encryptedConnectionUrl = this.cryptoService.encrypt(
      target.databaseUrl,
    );

    if (!encryptedConnectionUrl) {
      throw new InternalServerErrorException(
        'Nao foi possivel proteger a URL do banco do tenant.',
      );
    }

    const job = await this.controlPlanePrisma.tenantProvisioningJob.create({
      data: {
        companyId: input.companyId,
        requestedById: input.requestedById ?? null,
        status: ProvisioningJobStatus.RUNNING,
        startedAt,
        metadata: {
          databaseName: target.databaseName,
          strategy: target.strategy,
          dedicated: target.strategy === 'dedicated',
        } as Prisma.InputJsonValue,
      },
    });

    await this.controlPlanePrisma.tenantDatabase.upsert({
      where: {
        companyId: input.companyId,
      },
      update: {
        databaseName: target.databaseName,
        databaseHost: target.host,
        databasePort: target.port,
        databaseSchema: target.schema,
        connectionUrlEncrypted: encryptedConnectionUrl,
        status: TenantDatabaseStatus.PROVISIONING,
      },
      create: {
        companyId: input.companyId,
        databaseName: target.databaseName,
        databaseHost: target.host,
        databasePort: target.port,
        databaseSchema: target.schema,
        connectionUrlEncrypted: encryptedConnectionUrl,
        status: TenantDatabaseStatus.PROVISIONING,
      },
    });

    let tenantPrisma: PrismaClient | null = null;

    try {
      if (target.strategy === 'dedicated') {
        await this.createDatabaseIfMissing(target.databaseUrl);
      }

      await this.runTenantMigrations(target.databaseUrl);

      tenantPrisma = new PrismaClient({
        datasources: {
          db: {
            url: target.databaseUrl,
          },
        },
      });
      await tenantPrisma.$connect();

      await tenantPrisma.workspace.upsert({
        where: {
          id: input.workspaceId,
        },
        update: {
          name: input.companyName,
          slug: input.companySlug,
          companyName: input.companyName,
          deletedAt: null,
        },
        create: {
          id: input.workspaceId,
          name: input.companyName,
          slug: input.companySlug,
          companyName: input.companyName,
          settings: {
            locale: 'pt-BR',
            timezone: 'America/Sao_Paulo',
            theme: 'dark-blue',
          },
        },
      });

      await tenantPrisma.workspaceConversationSettings.upsert({
        where: {
          workspaceId: input.workspaceId,
        },
        update: {},
        create: {
          workspaceId: input.workspaceId,
        },
      });

      if (input.admin) {
        const normalizedEmail = input.admin.email.toLowerCase();
        const existingAdmin = await tenantPrisma.user.findFirst({
          where: {
            workspaceId: input.workspaceId,
            OR: [
              {
                globalUserId: input.admin.globalUserId,
              },
              {
                email: normalizedEmail,
              },
            ],
          },
        });

        const adminUser = existingAdmin
          ? await tenantPrisma.user.update({
              where: {
                id: existingAdmin.id,
              },
              data: {
                globalUserId: input.admin.globalUserId,
                workspaceId: input.workspaceId,
                name: input.admin.name,
                email: normalizedEmail,
                passwordHash: input.admin.passwordHash,
                role: Role.ADMIN,
                status: UserStatus.ACTIVE,
                deletedAt: null,
              },
            })
          : await tenantPrisma.user.create({
              data: {
                globalUserId: input.admin.globalUserId,
                workspaceId: input.workspaceId,
                name: input.admin.name,
                email: normalizedEmail,
                passwordHash: input.admin.passwordHash,
                role: Role.ADMIN,
                status: UserStatus.ACTIVE,
                title: 'Administrador',
              },
            });

        await tenantPrisma.teamMember.upsert({
          where: {
            workspaceId_email: {
              workspaceId: input.workspaceId,
              email: normalizedEmail,
            },
          },
          update: {
            userId: adminUser.id,
            invitedById: adminUser.id,
            name: adminUser.name,
            role: Role.ADMIN,
            status: UserStatus.ACTIVE,
            deactivatedAt: null,
          },
          create: {
            workspaceId: input.workspaceId,
            userId: adminUser.id,
            invitedById: adminUser.id,
            name: adminUser.name,
            email: normalizedEmail,
            role: Role.ADMIN,
            status: UserStatus.ACTIVE,
            title: adminUser.title,
          },
        });
      }

      const completedAt = new Date();

      await this.controlPlanePrisma.$transaction([
        this.controlPlanePrisma.tenantDatabase.update({
          where: {
            companyId: input.companyId,
          },
          data: {
            status: TenantDatabaseStatus.READY,
            provisionedAt: completedAt,
            lastMigrationAt: completedAt,
          },
        }),
        this.controlPlanePrisma.tenantProvisioningJob.update({
          where: {
            id: job.id,
          },
          data: {
            status: ProvisioningJobStatus.SUCCEEDED,
            finishedAt: completedAt,
            errorMessage: null,
          },
        }),
      ]);

      await this.tenantConnectionService.invalidateTenant(input.companyId);

      return {
        success: true,
        companyId: input.companyId,
        workspaceId: input.workspaceId,
        databaseName: target.databaseName,
        strategy: target.strategy,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha desconhecida no provisionamento.';
      const finishedAt = new Date();

      this.logger.error(
        `Falha ao provisionar tenant ${input.companyId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      await this.controlPlanePrisma.$transaction([
        this.controlPlanePrisma.tenantDatabase.updateMany({
          where: {
            companyId: input.companyId,
          },
          data: {
            status: TenantDatabaseStatus.FAILED,
          },
        }),
        this.controlPlanePrisma.tenantProvisioningJob.update({
          where: {
            id: job.id,
          },
          data: {
            status: ProvisioningJobStatus.FAILED,
            finishedAt,
            errorMessage: message,
          },
        }),
      ]);

      throw new InternalServerErrorException(
        `Nao foi possivel provisionar o tenant: ${message}`,
      );
    } finally {
      if (tenantPrisma) {
        await tenantPrisma.$disconnect();
      }
    }
  }

  async rerunTenantMigrations(companyId: string) {
    const runtime =
      await this.tenantConnectionService.resolveTenantRuntimeConfig(companyId);

    await this.runTenantMigrations(runtime.databaseUrl);

    await this.controlPlanePrisma.tenantDatabase.update({
      where: {
        companyId,
      },
      data: {
        status: TenantDatabaseStatus.READY,
        lastMigrationAt: new Date(),
      },
    });

    await this.tenantConnectionService.invalidateTenant(companyId);
  }

  private resolveTenantDatabaseTarget(input: {
    companyId: string;
    companySlug: string;
  }) {
    const strategy =
      (this.configService.get<string>('TENANT_DATABASE_STRATEGY') ??
        'dedicated') === 'shared'
        ? 'shared'
        : 'dedicated';

    const baseUrl =
      this.configService.get<string>('TENANT_DATABASE_BASE_URL') ??
      this.configService.get<string>('DATABASE_URL');

    if (!baseUrl) {
      throw new InternalServerErrorException(
        'DATABASE_URL/TENANT_DATABASE_BASE_URL nao configurada.',
      );
    }

    const prefix =
      this.configService.get<string>('TENANT_DATABASE_PREFIX') ??
      'autozap_tenant';
    const databaseName =
      strategy === 'shared'
        ? this.extractDatabaseName(baseUrl)
        : this.buildDatabaseName(prefix, input.companySlug, input.companyId);

    const explicitTemplate = this.configService.get<string>(
      'TENANT_DATABASE_URL_TEMPLATE',
    );
    const databaseUrl =
      strategy === 'shared'
        ? baseUrl
        : this.buildDedicatedDatabaseUrl({
            baseUrl,
            explicitTemplate,
            databaseName,
            companyId: input.companyId,
            companySlug: input.companySlug,
          });

    const parsed = new URL(databaseUrl);

    return {
      strategy,
      databaseName,
      databaseUrl,
      host: parsed.hostname || null,
      port: parsed.port ? Number(parsed.port) : null,
      schema: parsed.searchParams.get('schema'),
    };
  }

  private buildDatabaseName(prefix: string, slug: string, companyId: string) {
    const normalizedSlug = slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24);
    const suffix = companyId
      .replace(/[^a-z0-9]/gi, '')
      .slice(-6)
      .toLowerCase();

    return `${prefix}_${normalizedSlug || 'tenant'}_${suffix || 'local'}`;
  }

  private buildDedicatedDatabaseUrl(input: {
    baseUrl: string;
    explicitTemplate?: string;
    databaseName: string;
    companyId: string;
    companySlug: string;
  }) {
    if (input.explicitTemplate?.trim()) {
      return input.explicitTemplate
        .replaceAll('{database}', input.databaseName)
        .replaceAll('{companyId}', input.companyId)
        .replaceAll('{slug}', input.companySlug);
    }

    const parsed = new URL(input.baseUrl);
    parsed.pathname = `/${input.databaseName}`;
    return parsed.toString();
  }

  private extractDatabaseName(connectionUrl: string) {
    try {
      const parsed = new URL(connectionUrl);
      return parsed.pathname.replace(/^\//, '') || 'shared';
    } catch {
      return 'shared';
    }
  }

  private async createDatabaseIfMissing(databaseUrl: string) {
    const adminUrl =
      this.configService.get<string>('TENANT_DATABASE_ADMIN_URL') ??
      this.deriveAdminUrl(databaseUrl);
    const databaseName = this.extractDatabaseName(databaseUrl);
    const adminPrisma = new PrismaClient({
      datasources: {
        db: {
          url: adminUrl,
        },
      },
    });

    try {
      await adminPrisma.$connect();
      await adminPrisma.$executeRawUnsafe(
        `CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const alreadyExists =
        message.toLowerCase().includes('already exists') ||
        message.toLowerCase().includes('duplicate_database');

      if (!alreadyExists) {
        throw error;
      }
    } finally {
      await adminPrisma.$disconnect();
    }
  }

  private deriveAdminUrl(connectionUrl: string) {
    const parsed = new URL(connectionUrl);
    parsed.pathname = '/postgres';
    return parsed.toString();
  }

  private async runTenantMigrations(databaseUrl: string) {
    const schemaPath = 'prisma/schema.prisma';
    const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        npxCommand,
        ['prisma', 'migrate', 'deploy', '--schema', schemaPath],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            stderr.trim() ||
              `Falha ao executar migrations do tenant (exit code ${code ?? 'unknown'}).`,
          ),
        );
      });
    });
  }
}
