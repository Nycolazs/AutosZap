import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly tenantContext: TenantContextService) {}

  use(_request: Request, _response: Response, next: () => void) {
    this.tenantContext.runWithContext(
      {
        requestId: randomUUID(),
      },
      next,
    );
  }
}
