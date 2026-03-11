import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadSource, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  getPagination,
  paginatedResponse,
} from '../../common/utils/pagination';

type StagePayload = {
  pipelineId: string;
  name: string;
  color: string;
  order: number;
  probability: number;
};

type LeadPayload = {
  pipelineId: string;
  stageId: string;
  contactId?: string;
  assignedToId?: string;
  name: string;
  company?: string;
  source?: LeadSource;
  value: string;
  order?: number;
  notes?: string;
  tagIds?: string[];
};

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async getPipeline(workspaceId: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: {
        workspaceId,
        deletedAt: null,
      },
      include: {
        stages: {
          where: { deletedAt: null },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!pipeline) {
      throw new NotFoundException('Pipeline nao encontrado.');
    }

    return pipeline;
  }

  async createStage(workspaceId: string, payload: StagePayload) {
    return this.prisma.pipelineStage.create({
      data: {
        workspaceId,
        pipelineId: payload.pipelineId,
        name: payload.name,
        color: payload.color,
        order: payload.order,
        probability: payload.probability,
      },
    });
  }

  async updateStage(
    id: string,
    workspaceId: string,
    payload: Partial<StagePayload>,
  ) {
    const stage = await this.prisma.pipelineStage.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
    });

    if (!stage) {
      throw new NotFoundException('Etapa nao encontrada.');
    }

    return this.prisma.pipelineStage.update({
      where: { id },
      data: {
        name: payload.name ?? stage.name,
        color: payload.color ?? stage.color,
        order: payload.order ?? stage.order,
        probability: payload.probability ?? stage.probability,
      },
    });
  }

  async deleteStage(id: string, workspaceId: string) {
    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!stage) {
      throw new NotFoundException('Etapa nao encontrada.');
    }

    await this.prisma.pipelineStage.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  async listLeads(
    workspaceId: string,
    query: PaginationQueryDto & {
      stageId?: string;
      assignedToId?: string;
      tagId?: string;
    },
  ) {
    const { page, limit, skip, take } = getPagination(query.page, query.limit);
    const where: Prisma.LeadWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.stageId ? { stageId: query.stageId } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { company: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: {
          stage: true,
          contact: true,
          assignedTo: {
            select: { id: true, name: true },
          },
          tags: {
            include: {
              tag: true,
            },
          },
        },
        orderBy: [{ stage: { order: 'asc' } }, { order: 'asc' }],
        skip,
        take,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return paginatedResponse(
      data.map((lead) => ({
        ...lead,
        tags: lead.tags.map((item) => item.tag),
      })),
      total,
      page,
      limit,
    );
  }

  async findLead(id: string, workspaceId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      include: {
        stage: true,
        pipeline: true,
        contact: true,
        assignedTo: {
          select: { id: true, name: true, title: true },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead nao encontrado.');
    }

    return {
      ...lead,
      tags: lead.tags.map((item) => item.tag),
    };
  }

  async createLead(workspaceId: string, payload: LeadPayload) {
    const lead = await this.prisma.lead.create({
      data: {
        workspaceId,
        pipelineId: payload.pipelineId,
        stageId: payload.stageId,
        contactId: payload.contactId,
        assignedToId: payload.assignedToId,
        name: payload.name,
        company: payload.company,
        source: payload.source ?? LeadSource.MANUAL,
        value: new Prisma.Decimal(payload.value),
        order: payload.order ?? 0,
        notes: payload.notes,
      },
    });

    if (payload.tagIds?.length) {
      await this.syncTags(lead.id, payload.tagIds);
    }

    return this.findLead(lead.id, workspaceId);
  }

  async updateLead(
    id: string,
    workspaceId: string,
    payload: Partial<LeadPayload>,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead nao encontrado.');
    }

    await this.prisma.lead.update({
      where: { id },
      data: {
        pipelineId: payload.pipelineId ?? lead.pipelineId,
        stageId: payload.stageId ?? lead.stageId,
        contactId: payload.contactId ?? lead.contactId,
        assignedToId: payload.assignedToId ?? lead.assignedToId,
        name: payload.name ?? lead.name,
        company: payload.company ?? lead.company,
        source: payload.source ?? lead.source,
        value: payload.value ? new Prisma.Decimal(payload.value) : lead.value,
        order: payload.order ?? lead.order,
        notes: payload.notes ?? lead.notes,
      },
    });

    if (payload.tagIds) {
      await this.syncTags(id, payload.tagIds);
    }

    return this.findLead(id, workspaceId);
  }

  async deleteLead(id: string, workspaceId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead nao encontrado.');
    }

    await this.prisma.lead.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    return { success: true };
  }

  async reorderLead(
    id: string,
    workspaceId: string,
    stageId: string,
    order: number,
  ) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!lead) {
      throw new NotFoundException('Lead nao encontrado.');
    }

    return this.prisma.lead.update({
      where: { id },
      data: {
        stageId,
        order,
      },
    });
  }

  private async syncTags(leadId: string, tagIds: string[]) {
    await this.prisma.leadTag.deleteMany({
      where: { leadId },
    });

    if (tagIds.length) {
      await this.prisma.leadTag.createMany({
        data: tagIds.map((tagId) => ({ leadId, tagId })),
        skipDuplicates: true,
      });
    }
  }
}
