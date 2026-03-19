import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

export type TenantRequestContext = {
  requestId: string;
  tenantId?: string;
  tenantClient?: PrismaClient;
  workspaceId?: string;
  companyId?: string;
  userId?: string;
  isPlatformRoute?: boolean;
};

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantRequestContext>();

  runWithContext<T>(context: TenantRequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  runWithPatch<T>(patch: Partial<TenantRequestContext>, callback: () => T): T {
    const current = this.storage.getStore();
    const next: TenantRequestContext = {
      requestId: current?.requestId ?? 'out-of-band',
      ...(current ?? {}),
      ...patch,
    };

    return this.storage.run(next, callback);
  }

  getContext() {
    return this.storage.getStore();
  }

  patchContext(patch: Partial<TenantRequestContext>) {
    const current = this.storage.getStore();

    if (!current) {
      return;
    }

    Object.assign(current, patch);
  }
}
