import {
  Injectable,
  INestApplication,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { TenantConnectionService } from '../tenancy/tenant-connection.service';
import {
  TenantContextService,
  TenantRequestContext,
} from '../tenancy/tenant-context.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly localMethods = new Set<string>([
    'onModuleInit',
    'onModuleDestroy',
    'enableShutdownHooks',
    'runWithTenant',
    'patchTenantContext',
    'getTenantContext',
  ]);
  private readonly passthroughBaseClientMethods = new Set<string>([
    '$connect',
    '$disconnect',
    '$on',
    '$use',
    '$extends',
  ]);
  private tenantContext?: TenantContextService;
  private tenantConnection?: TenantConnectionService;

  constructor(
    configService: ConfigService,
    private readonly moduleRef: ModuleRef,
  ) {
    super({
      datasources: {
        db: {
          url:
            configService.get<string>('DATABASE_URL') ??
            configService.get<string>('CONTROL_PLANE_DATABASE_URL') ??
            'postgresql://postgres:postgres@localhost:5432/autoszap',
        },
      },
    });

    return new Proxy(this, {
      get: (target, prop, receiver) =>
        target.resolveProxyProperty(prop, receiver),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', () => {
      void app.close();
    });
  }

  getTenantContext() {
    return this.getTenantContextService().getContext();
  }

  patchTenantContext(patch: Partial<TenantRequestContext>) {
    this.getTenantContextService().patchContext(patch);
  }

  async runWithTenant<T>(companyId: string, callback: () => Promise<T> | T) {
    const tenantContext = this.getTenantContextService();
    const tenantConnection = this.getTenantConnectionService();

    const tenantClient = await tenantConnection.getTenantClient(companyId);

    return tenantContext.runWithPatch(
      {
        tenantId: companyId,
        companyId,
        workspaceId: companyId,
        tenantClient,
      },
      callback,
    );
  }

  private resolveProxyProperty(
    prop: string | symbol,
    receiver: unknown,
  ): unknown {
    if (typeof prop === 'symbol') {
      return Reflect.get(this, prop, receiver);
    }

    if (this.localMethods.has(prop)) {
      const local = Reflect.get(this, prop, this);
      return typeof local === 'function' ? local.bind(this) : local;
    }

    if (this.passthroughBaseClientMethods.has(prop)) {
      const baseMethod = Reflect.get(this, prop, this);
      return typeof baseMethod === 'function'
        ? baseMethod.bind(this)
        : baseMethod;
    }

    const tenantClient = this.resolveTenantClientSync();
    if (tenantClient) {
      const tenantValue: unknown = Reflect.get(tenantClient as object, prop);
      if (tenantValue !== undefined) {
        return typeof tenantValue === 'function'
          ? (tenantValue as (...args: unknown[]) => unknown).bind(tenantClient)
          : tenantValue;
      }
    }

    const value = Reflect.get(this, prop, this);
    if (typeof value === 'function') {
      return value.bind(this);
    }

    return value;
  }

  private resolveTenantClientSync(): PrismaClient | null {
    const context = this.getTenantContextService().getContext();
    return context?.tenantClient ?? null;
  }

  private getTenantContextService() {
    if (!this.tenantContext) {
      const tenantContext = this.moduleRef.get(TenantContextService, {
        strict: false,
      });

      if (!tenantContext) {
        throw new Error('TenantContextService nao inicializado.');
      }

      this.tenantContext = tenantContext;
    }

    return this.tenantContext;
  }

  private getTenantConnectionService() {
    if (!this.tenantConnection) {
      const tenantConnection = this.moduleRef.get(TenantConnectionService, {
        strict: false,
      });

      if (!tenantConnection) {
        throw new Error('TenantConnectionService nao inicializado.');
      }

      this.tenantConnection = tenantConnection;
    }

    return this.tenantConnection;
  }
}
