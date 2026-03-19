import { Injectable } from '@nestjs/common';
import { PlatformAuditAction, Prisma } from '@autoszap/control-plane-client';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';

@Injectable()
export class ControlPlaneAuditService {
  constructor(private readonly controlPlanePrisma: ControlPlanePrismaService) {}

  async log(payload: {
    actorId?: string | null;
    action: PlatformAuditAction;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    return this.controlPlanePrisma.platformAuditLog.create({
      data: {
        actorId: payload.actorId ?? null,
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId ?? null,
        metadata: (payload.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        ipAddress: payload.ipAddress ?? null,
        userAgent: payload.userAgent ?? null,
      },
    });
  }
}
