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
import { CampaignMediaStorageService } from './campaign-media-storage.service';

type CampaignPayload = {
  name: string;
  description?: string;
  audienceType: CampaignAudienceType;
  targetConfig: Record<string, unknown>;
  message: string;
  scheduledAt?: string;
  status?: CampaignStatus;
  instanceId?: string;
  removeMedia?: boolean;
};

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metaWhatsAppService: MetaWhatsAppService,
    private readonly campaignMediaStorageService: CampaignMediaStorageService,
  ) {}

  async list(workspaceId: string) {
    const campaigns = await this.prisma.campaign.findMany({
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

    return campaigns.map((campaign) => this.serializeCampaign(campaign));
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
      ...this.serializeCampaign(campaign),
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
        scheduledAt:
          payload.scheduledAt !== undefined
            ? payload.scheduledAt
              ? new Date(payload.scheduledAt)
              : null
            : campaign.scheduledAt,
        status: payload.status ?? campaign.status,
        instanceId:
          payload.instanceId !== undefined
            ? payload.instanceId || null
            : campaign.instanceId,
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

    await this.campaignMediaStorageService.delete(campaign.mediaStoragePath);

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

    if (!recipientIds.length) {
      throw new BadRequestException(
        'Nenhum destinatario encontrado para este publico. Selecione contatos, listas, tags ou grupos com contatos vinculados.',
      );
    }

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

    if (!contacts.length) {
      throw new BadRequestException(
        'Nenhum contato valido foi encontrado para esta campanha.',
      );
    }

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
        const message = campaign.mediaStoragePath
          ? await this.metaWhatsAppService.sendDirectMediaMessage(workspaceId, {
              instanceId: campaign.instanceId,
              to: contact.phone,
              buffer: await this.campaignMediaStorageService.read(
                campaign.mediaStoragePath,
              ),
              fileName: campaign.mediaFileName ?? 'campanha.jpg',
              mimeType: campaign.mediaMimeType ?? 'image/jpeg',
              caption: campaign.message,
              userId: actorId,
              contactName: contact.name,
            })
          : await this.metaWhatsAppService.sendDirectMessage(workspaceId, {
              instanceId: campaign.instanceId,
              to: contact.phone,
              body: campaign.message,
              userId: actorId,
              contactName: contact.name,
            });

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

  async saveMedia(
    id: string,
    workspaceId: string,
    file: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      size: number;
    },
  ) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        mediaStoragePath: true,
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campanha nao encontrada.');
    }

    if (!file.mimeType.startsWith('image/')) {
      throw new BadRequestException(
        'Somente imagens sao aceitas para a pre-visualizacao da campanha.',
      );
    }

    const savedFile = await this.campaignMediaStorageService.save(
      workspaceId,
      id,
      file,
    );

    await this.prisma.campaign.update({
      where: { id },
      data: {
        mediaStoragePath: savedFile.storagePath,
        mediaFileName: savedFile.fileName,
        mediaMimeType: savedFile.mimeType,
        mediaSize: savedFile.size,
      },
    });

    await this.campaignMediaStorageService.delete(campaign.mediaStoragePath);
    return this.findOne(id, workspaceId);
  }

  async removeMedia(id: string, workspaceId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        mediaStoragePath: true,
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campanha nao encontrada.');
    }

    await this.prisma.campaign.update({
      where: { id },
      data: {
        mediaStoragePath: null,
        mediaFileName: null,
        mediaMimeType: null,
        mediaSize: null,
      },
    });

    await this.campaignMediaStorageService.delete(campaign.mediaStoragePath);
    return { success: true };
  }

  async getMedia(id: string, workspaceId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      select: {
        mediaStoragePath: true,
        mediaFileName: true,
        mediaMimeType: true,
      },
    });

    if (!campaign || !campaign.mediaStoragePath) {
      throw new NotFoundException('Midia da campanha nao encontrada.');
    }

    return {
      buffer: await this.campaignMediaStorageService.read(
        campaign.mediaStoragePath,
      ),
      mimeType: campaign.mediaMimeType ?? 'application/octet-stream',
      fileName: campaign.mediaFileName ?? 'campanha',
    };
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

  private serializeCampaign<
    TCampaign extends {
      id: string;
      mediaStoragePath?: string | null;
      mediaFileName?: string | null;
      mediaMimeType?: string | null;
      mediaSize?: number | null;
    },
  >(campaign: TCampaign) {
    return {
      ...campaign,
      mediaUrl: campaign.mediaStoragePath
        ? `campaigns/${campaign.id}/media`
        : null,
      hasMedia: Boolean(campaign.mediaStoragePath),
    };
  }
}
