import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

type PerformanceRow = {
  userId: string;
  name: string;
  resolvedCount: number;
  closedCount: number;
  assignedCount: number;
  avgFirstResponseMs: number | null;
  avgResolutionMs: number | null;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getOverview(workspaceId: string) {
    const cacheKey = `dashboard:${workspaceId}`;
    const cached = await this.redis.getJson<unknown>(cacheKey);

    if (cached) {
      return cached;
    }

    const [
      conversations,
      contacts,
      campaigns,
      leads,
      statuses,
      recentActivity,
      notifications,
      outboundMessages,
    ] = await Promise.all([
      this.prisma.conversation.count({
        where: {
          workspaceId,
          deletedAt: null,
          status: {
            in: ['NEW', 'IN_PROGRESS', 'WAITING'] as never,
          },
        },
      }),
      this.prisma.contact.count({
        where: { workspaceId, deletedAt: null },
      }),
      this.prisma.campaign.count({
        where: { workspaceId, deletedAt: null, status: 'SENT' },
      }),
      this.prisma.lead.count({
        where: { workspaceId, deletedAt: null },
      }),
      this.prisma.messageDeliveryStatus.findMany({
        where: { workspaceId },
        orderBy: { occurredAt: 'desc' },
        take: 50,
      }),
      this.prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          actor: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.notification.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.conversationMessage.findMany({
        where: {
          workspaceId,
          direction: 'OUTBOUND',
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 30,
      }),
    ]);

    const outboundStatuses = statuses.filter(
      (item) => item.status !== undefined,
    );
    const responseRate =
      outboundStatuses.length > 0
        ? Math.round(
            (outboundStatuses.filter(
              (item) => item.status === 'DELIVERED' || item.status === 'READ',
            ).length /
              outboundStatuses.length) *
              100,
          )
        : 0;

    const chartMap = new Map<string, number>();
    for (const message of outboundMessages) {
      const key = message.createdAt.toISOString().slice(5, 10);
      chartMap.set(key, (chartMap.get(key) ?? 0) + 1);
    }
    const chartSource = [...chartMap.entries()].slice(-7);
    const recentActivitySummary = recentActivity.map((activity) => {
      const metadata = this.parseAuditMetadata(activity.metadata);

      return {
        id: activity.id,
        entityType: activity.entityType,
        entityId: activity.entityId,
        action: activity.action,
        createdAt: activity.createdAt,
        actorName: activity.actor?.name ?? activity.actor?.email ?? 'Sistema',
        actorEmail: activity.actor?.email ?? null,
        actionLabel: this.mapAuditActionLabel(activity.action),
        entityLabel: this.mapAuditEntityLabel(activity.entityType),
        detail: this.buildAuditDetail(
          activity.action,
          activity.entityType,
          metadata,
        ),
      };
    });

    const response = {
      metrics: {
        activeConversations: conversations,
        totalContacts: contacts,
        responseRate,
        sentCampaigns: campaigns,
        crmLeads: leads,
      },
      chart: chartSource.map(([label, value]) => ({
        label,
        value,
      })),
      recentActivity: recentActivitySummary,
      notifications,
      shortcuts: [
        { title: 'Nova campanha', href: '/app/disparos' },
        { title: 'Criar lead', href: '/app/crm' },
        { title: 'Conectar instancia', href: '/app/instancias' },
      ],
    };

    await this.redis.setJson(cacheKey, response, 30);
    return response;
  }

  async getPerformance(
    workspaceId: string,
    filters?: {
      from?: string;
      to?: string;
      userId?: string;
    },
  ) {
    const { from, to } = this.resolveDateRange(filters?.from, filters?.to);
    const userIdFilter = filters?.userId?.trim() || null;
    const rows = await this.prisma.$queryRaw<PerformanceRow[]>(Prisma.sql`
      WITH seller_users AS (
        SELECT id, name
        FROM "User"
        WHERE "workspaceId" = ${workspaceId}
          AND "deletedAt" IS NULL
          AND role <> ${Role.ADMIN}
      ),
      resolved_events AS (
        SELECT
          COALESCE(metadata->>'ownerUserId', "actorUserId") AS "userId",
          COUNT(*)::int AS "resolvedCount",
          AVG(
            CASE
              WHEN COALESCE(metadata->>'resolutionTimeMs', '') ~ '^[0-9]+(\\.[0-9]+)?$'
              THEN NULLIF((metadata->>'resolutionTimeMs')::numeric, 0)
              ELSE NULL
            END
          )::float AS "avgResolutionMs"
        FROM "ConversationEvent"
        WHERE "workspaceId" = ${workspaceId}
          AND type = 'RESOLVED'
          AND "createdAt" >= ${from}
          AND "createdAt" <= ${to}
        GROUP BY 1
      ),
      closed_events AS (
        SELECT
          COALESCE(metadata->>'ownerUserId', "actorUserId") AS "userId",
          COUNT(*)::int AS "closedCount"
        FROM "ConversationEvent"
        WHERE "workspaceId" = ${workspaceId}
          AND type = 'CLOSED'
          AND "createdAt" >= ${from}
          AND "createdAt" <= ${to}
        GROUP BY 1
      ),
      first_response_events AS (
        SELECT
          "actorUserId" AS "userId",
          AVG(
            CASE
              WHEN COALESCE(metadata->>'responseTimeMs', '') ~ '^[0-9]+(\\.[0-9]+)?$'
              THEN NULLIF((metadata->>'responseTimeMs')::numeric, 0)
              ELSE NULL
            END
          )::float AS "avgFirstResponseMs"
        FROM "ConversationEvent"
        WHERE "workspaceId" = ${workspaceId}
          AND type = 'FIRST_RESPONSE'
          AND "createdAt" >= ${from}
          AND "createdAt" <= ${to}
          AND "actorUserId" IS NOT NULL
        GROUP BY 1
      ),
      assignments AS (
        SELECT
          "assignedToId" AS "userId",
          COUNT(*)::int AS "assignedCount"
        FROM "ConversationAssignment"
        WHERE "workspaceId" = ${workspaceId}
          AND "createdAt" >= ${from}
          AND "createdAt" <= ${to}
        GROUP BY 1
      )
      SELECT
        seller_users.id AS "userId",
        seller_users.name,
        COALESCE(resolved_events."resolvedCount", 0) AS "resolvedCount",
        COALESCE(closed_events."closedCount", 0) AS "closedCount",
        COALESCE(assignments."assignedCount", 0) AS "assignedCount",
        first_response_events."avgFirstResponseMs",
        resolved_events."avgResolutionMs"
      FROM seller_users
      LEFT JOIN resolved_events ON resolved_events."userId" = seller_users.id
      LEFT JOIN closed_events ON closed_events."userId" = seller_users.id
      LEFT JOIN first_response_events ON first_response_events."userId" = seller_users.id
      LEFT JOIN assignments ON assignments."userId" = seller_users.id
      ${userIdFilter ? Prisma.sql`WHERE seller_users.id = ${userIdFilter}` : Prisma.empty}
      ORDER BY "resolvedCount" DESC, "assignedCount" DESC, seller_users.name ASC
    `);

    const sellers = rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      resolvedCount: Number(row.resolvedCount ?? 0),
      closedCount: Number(row.closedCount ?? 0),
      assignedCount: Number(row.assignedCount ?? 0),
      conversionRate:
        Number(row.resolvedCount ?? 0) + Number(row.closedCount ?? 0) > 0
          ? Math.round(
              (Number(row.resolvedCount ?? 0) /
                (Number(row.resolvedCount ?? 0) +
                  Number(row.closedCount ?? 0))) *
                100,
            )
          : 0,
      avgFirstResponseMs:
        row.avgFirstResponseMs === null ? null : Number(row.avgFirstResponseMs),
      avgResolutionMs:
        row.avgResolutionMs === null ? null : Number(row.avgResolutionMs),
    }));

    const totals = sellers.reduce(
      (accumulator, seller) => ({
        resolvedCount: accumulator.resolvedCount + seller.resolvedCount,
        closedCount: accumulator.closedCount + seller.closedCount,
        assignedCount: accumulator.assignedCount + seller.assignedCount,
      }),
      {
        resolvedCount: 0,
        closedCount: 0,
        assignedCount: 0,
      },
    );

    const averageOf = (values: Array<number | null>) => {
      const validValues = values.filter(
        (value): value is number =>
          typeof value === 'number' && !Number.isNaN(value),
      );

      if (!validValues.length) {
        return null;
      }

      return Math.round(
        validValues.reduce((sum, value) => sum + value, 0) / validValues.length,
      );
    };

    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totals: {
        resolvedCount: totals.resolvedCount,
        closedCount: totals.closedCount,
        assignedCount: totals.assignedCount,
        avgFirstResponseMs: averageOf(
          sellers.map((seller) => seller.avgFirstResponseMs),
        ),
        avgResolutionMs: averageOf(
          sellers.map((seller) => seller.avgResolutionMs),
        ),
      },
      chart: sellers.map((seller) => ({
        userId: seller.userId,
        label: seller.name,
        value: seller.resolvedCount,
      })),
      ranking: sellers,
    };
  }

  private resolveDateRange(from?: string, to?: string) {
    const endDate = to ? new Date(to) : new Date();
    const startDate = from
      ? new Date(from)
      : new Date(endDate.getTime() - 1000 * 60 * 60 * 24 * 30);

    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      startDate.setHours(0, 0, 0, 0);
    }

    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      endDate.setHours(23, 59, 59, 999);
    }

    return {
      from: startDate,
      to: endDate,
    };
  }

  private parseAuditMetadata(metadata: Prisma.JsonValue | null | undefined) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    return metadata as Record<string, unknown>;
  }

  private mapAuditActionLabel(action: AuditAction) {
    const labels: Record<AuditAction, string> = {
      CREATE: 'Criou',
      UPDATE: 'Atualizou',
      DELETE: 'Removeu',
      LOGIN: 'Entrou no sistema',
      INVITE: 'Convidou usuário',
      SEND: 'Enviou',
      SYNC: 'Sincronizou',
    };

    return labels[action] ?? action;
  }

  private mapAuditEntityLabel(entityType: string) {
    const normalized = entityType.trim().toLowerCase();
    const labels: Record<string, string> = {
      user: 'Usuário',
      users: 'Usuário',
      team_member: 'Membro da equipe',
      contact: 'Contato',
      conversation: 'Conversa',
      campaign: 'Campanha',
      lead: 'Lead',
      instance: 'Instância',
      notification: 'Notificação',
    };

    return labels[normalized] ?? entityType;
  }

  private buildAuditDetail(
    action: AuditAction,
    entityType: string,
    metadata: Record<string, unknown> | null,
  ) {
    if (!metadata) {
      return `${this.mapAuditEntityLabel(entityType)} • sem detalhes adicionais`;
    }

    const userAgent =
      typeof metadata.userAgent === 'string' ? metadata.userAgent : '';
    const ipAddress =
      typeof metadata.ipAddress === 'string' ? metadata.ipAddress : '';
    const email = typeof metadata.email === 'string' ? metadata.email : '';
    const status = typeof metadata.status === 'string' ? metadata.status : '';

    if (action === AuditAction.LOGIN) {
      const loginDetails = [
        ipAddress ? `IP ${ipAddress}` : null,
        userAgent ? userAgent : null,
      ].filter(Boolean);
      return loginDetails.length
        ? loginDetails.join(' • ')
        : 'Login realizado com sucesso';
    }

    if (action === AuditAction.INVITE) {
      const inviteDetails = [
        email ? `Email ${email}` : null,
        status ? `Status ${status}` : null,
      ].filter(Boolean);
      return inviteDetails.length
        ? inviteDetails.join(' • ')
        : 'Convite enviado';
    }

    if (email) {
      return `Email ${email}`;
    }

    return `${this.mapAuditEntityLabel(entityType)} atualizada`;
  }
}
