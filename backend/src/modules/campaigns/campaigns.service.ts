import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignAudienceType,
  CampaignRecipientStatus,
  CampaignStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MetaWhatsAppService } from '../integrations/meta-whatsapp/meta-whatsapp.service';

type CampaignPayload = {
  name: string;
  description?: string;
  audienceType: CampaignAudienceType;
  targetConfig: Record<string, unknown>;
  message: string;
  scheduledAt?: string;
  status?: CampaignStatus;
  instanceId?: string;
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaWhatsAppService: MetaWhatsAppService,
  ) {}

  async list(workspaceId: string) {
    return this.prisma.campaign.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            recipients: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, workspaceId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      include: {
        recipients: {
          include: {
            contact: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campanha nao encontrada.');
    }

    return {
      ...campaign,
      metrics: {
        total: campaign.recipients.length || campaign.recipientCount,
        sent: campaign.recipients.filter(
          (item) =>
            item.status === CampaignRecipientStatus.SENT ||
            item.status === CampaignRecipientStatus.DELIVERED ||
            item.status === CampaignRecipientStatus.READ,
        ).length,
        delivered: campaign.recipients.filter(
          (item) =>
            item.status === CampaignRecipientStatus.DELIVERED ||
            item.status === CampaignRecipientStatus.READ,
        ).length,
        read: campaign.recipients.filter(
          (item) => item.status === CampaignRecipientStatus.READ,
        ).length,
        failed: campaign.recipients.filter(
          (item) => item.status === CampaignRecipientStatus.FAILED,
        ).length,
      },
    };
  }

  async create(workspaceId: string, actorId: string, payload: CampaignPayload) {
    const recipientIds = await this.resolveRecipients(
      workspaceId,
      payload.audienceType,
      payload.targetConfig,
    );
    const campaign = await this.prisma.campaign.create({
      data: {
        workspaceId,
        createdById: actorId,
        instanceId: payload.instanceId,
        name: payload.name,
        description: payload.description,
        audienceType: payload.audienceType,
        targetConfig: payload.targetConfig as Prisma.InputJsonValue,
        message: payload.message,
        scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
        status: payload.status ?? CampaignStatus.DRAFT,
        recipientCount: recipientIds.length,
      },
    });

    if (payload.status === CampaignStatus.SENT) {
      await this.sendCampaign(campaign.id, workspaceId, actorId);
    }

    return this.findOne(campaign.id, workspaceId);
  }

  async update(
    id: string,
    workspaceId: string,
    payload: Partial<CampaignPayload>,
  ) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campanha nao encontrada.');
    }

    const audienceType = payload.audienceType ?? campaign.audienceType;
    const targetConfig =
      payload.targetConfig ??
      (campaign.targetConfig as Record<string, unknown>);
    const recipientIds = await this.resolveRecipients(
      workspaceId,
      audienceType,
      targetConfig,
    );

    await this.prisma.campaign.update({
      where: { id },
      data: {
        name: payload.name ?? campaign.name,
        description: payload.description ?? campaign.description,
        audienceType,
        targetConfig: targetConfig as Prisma.InputJsonValue,
        message: payload.message ?? campaign.message,
        scheduledAt: payload.scheduledAt
          ? new Date(payload.scheduledAt)
          : campaign.scheduledAt,
        status: payload.status ?? campaign.status,
        instanceId: payload.instanceId ?? campaign.instanceId,
        recipientCount: recipientIds.length,
      },
    });

    return this.findOne(id, workspaceId);
  }

  async delete(id: string, workspaceId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campanha nao encontrada.');
    }

    await this.prisma.campaign.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  async sendCampaign(id: string, workspaceId: string, actorId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campanha nao encontrada.');
    }

    if (!campaign.instanceId) {
      throw new BadRequestException(
        'Selecione uma instancia para realizar os disparos.',
      );
    }

    const recipientIds = await this.resolveRecipients(
      workspaceId,
      campaign.audienceType,
      campaign.targetConfig as Record<string, unknown>,
    );

    await this.prisma.campaignRecipient.deleteMany({
      where: { campaignId: id },
    });

    const contacts = await this.prisma.contact.findMany({
      where: {
        id: {
          in: recipientIds,
        },
        deletedAt: null,
      },
    });

    let sentCount = 0;
    let failedCount = 0;

    await this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatus.SENDING,
      },
    });

    for (const contact of contacts) {
      try {
        const message = await this.metaWhatsAppService.sendDirectMessage(
          workspaceId,
          {
            instanceId: campaign.instanceId,
            to: contact.phone,
            body: campaign.message,
            userId: actorId,
            contactName: contact.name,
          },
        );

        await this.prisma.campaignRecipient.create({
          data: {
            campaignId: campaign.id,
            contactId: contact.id,
            status: CampaignRecipientStatus.DELIVERED,
            messageId: message.id,
            sentAt: new Date(),
            deliveredAt: new Date(),
          },
        });

        sentCount += 1;
      } catch (error) {
        failedCount += 1;

        await this.prisma.campaignRecipient.create({
          data: {
            campaignId: campaign.id,
            contactId: contact.id,
            status: CampaignRecipientStatus.FAILED,
            error:
              error instanceof Error
                ? error.message
                : 'Falha ao enviar mensagem',
          },
        });
      }
    }

    await this.prisma.campaign.update({
      where: { id },
      data: {
        status: failedCount > 0 ? CampaignStatus.SENT : CampaignStatus.SENT,
        recipientCount: contacts.length,
        sentCount,
        failedCount,
      },
    });

    return this.findOne(id, workspaceId);
  }

  private async resolveRecipients(
    workspaceId: string,
    audienceType: CampaignAudienceType,
    targetConfig: Record<string, unknown>,
  ) {
    if (audienceType === CampaignAudienceType.LIST) {
      const listIds = Array.isArray(targetConfig.listIds)
        ? (targetConfig.listIds as string[])
        : [];
      const items = await this.prisma.contactListItem.findMany({
        where: {
          listId: { in: listIds },
          list: { workspaceId, deletedAt: null },
        },
        select: { contactId: true },
      });
      return [...new Set(items.map((item) => item.contactId))];
    }

    if (audienceType === CampaignAudienceType.TAG) {
      const tagIds = Array.isArray(targetConfig.tagIds)
        ? (targetConfig.tagIds as string[])
        : [];
      const items = await this.prisma.contactTag.findMany({
        where: {
          tagId: { in: tagIds },
          tag: { workspaceId, deletedAt: null },
        },
        select: { contactId: true },
      });
      return [...new Set(items.map((item) => item.contactId))];
    }

    if (audienceType === CampaignAudienceType.GROUP) {
      const groupIds = Array.isArray(targetConfig.groupIds)
        ? (targetConfig.groupIds as string[])
        : [];
      const items = await this.prisma.groupMember.findMany({
        where: {
          groupId: { in: groupIds },
          group: { workspaceId, deletedAt: null },
        },
        select: { contactId: true },
      });
      return [...new Set(items.map((item) => item.contactId))];
    }

    const customContactIds = Array.isArray(targetConfig.contactIds)
      ? (targetConfig.contactIds as string[])
      : [];

    return customContactIds;
  }
}
