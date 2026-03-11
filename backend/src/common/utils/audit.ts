import { AuditAction, Prisma, PrismaClient } from '@prisma/client';

export async function createAuditLog(
  prisma: PrismaClient,
  workspaceId: string,
  action: AuditAction,
  entityType: string,
  entityId: string,
  actorId?: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      workspaceId,
      action,
      entityType,
      entityId,
      actorId,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
