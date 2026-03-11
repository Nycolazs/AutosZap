import { Injectable } from '@nestjs/common';
import { MessageDirection } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

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
        where: { workspaceId, deletedAt: null, status: 'OPEN' },
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
      }),
      this.prisma.notification.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.conversationMessage.findMany({
        where: {
          workspaceId,
          direction: MessageDirection.OUTBOUND,
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
      recentActivity,
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
}
