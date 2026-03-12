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
    return this.ensureDefaultPipeline(workspaceId);
  }

  async createStage(workspaceId: string, payload: StagePayload) {
    const pipeline = await this.ensureDefaultPipeline(workspaceId);

    return this.prisma.pipelineStage.create({
      data: {
        workspaceId,
        pipelineId: payload.pipelineId || pipeline.id,
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
    const pipeline = await this.ensureDefaultPipeline(workspaceId);
    const stageId = payload.stageId || pipeline.stages[0]?.id;

    if (!stageId) {
      throw new NotFoundException('Etapa nao encontrada.');
    }

    const lead = await this.prisma.lead.create({
      data: {
        workspaceId,
        pipelineId: payload.pipelineId || pipeline.id,
        stageId,
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

  private async ensureDefaultPipeline(workspaceId: string) {
    let pipeline = await this.prisma.pipeline.findFirst({
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
      pipeline = await this.prisma.pipeline.create({
        data: {
          workspaceId,
          name: 'Pipeline principal',
          stages: {
            create: this.defaultStages().map((stage) => ({
              workspaceId,
              ...stage,
            })),
          },
        },
        include: {
          stages: {
            where: { deletedAt: null },
            orderBy: { order: 'asc' },
          },
        },
      });

      return pipeline;
    }

    if (!pipeline.stages.length) {
      await this.prisma.pipelineStage.createMany({
        data: this.defaultStages().map((stage) => ({
          workspaceId,
          pipelineId: pipeline!.id,
          ...stage,
        })),
      });

      pipeline = await this.prisma.pipeline.findUniqueOrThrow({
        where: { id: pipeline.id },
        include: {
          stages: {
            where: { deletedAt: null },
            orderBy: { order: 'asc' },
          },
        },
      });
    }

    return pipeline;
  }

  private defaultStages() {
    return [
      { name: 'Entrada', color: '#3297ff', order: 1, probability: 10 },
      { name: 'Qualificacao', color: '#2b79e3', order: 2, probability: 35 },
      { name: 'Proposta', color: '#18a7c9', order: 3, probability: 65 },
      { name: 'Fechamento', color: '#59b6ff', order: 4, probability: 90 },
    ];
  }
}
