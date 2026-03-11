import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AssistantStatus,
  EntityStatus,
  KnowledgeBaseType,
  KnowledgeDocumentType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type AssistantPayload = {
  name: string;
  description?: string;
  objective?: string;
  systemPrompt: string;
  temperature: number;
  model: string;
  status?: AssistantStatus;
  knowledgeBaseIds?: string[];
  toolIds?: string[];
};

type KnowledgeBasePayload = {
  name: string;
  description?: string;
  type: KnowledgeBaseType;
  status?: EntityStatus;
};

type KnowledgeDocumentPayload = {
  knowledgeBaseId: string;
  title: string;
  type: KnowledgeDocumentType;
  sourceUrl?: string;
  content: string;
  status?: EntityStatus;
};

type AiToolPayload = {
  name: string;
  description?: string;
  type: string;
  endpoint?: string;
  action?: string;
  status?: EntityStatus;
  config?: Record<string, unknown>;
};

@Injectable()
export class AssistantsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAssistants(workspaceId: string) {
    const assistants = await this.prisma.assistant.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      include: {
        knowledgeBases: {
          include: { knowledgeBase: true },
        },
        tools: {
          include: { tool: true },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return assistants.map((assistant) => this.mapAssistant(assistant));
  }

  async findAssistant(id: string, workspaceId: string) {
    const assistant = await this.prisma.assistant.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      include: {
        knowledgeBases: {
          include: { knowledgeBase: true },
        },
        tools: {
          include: { tool: true },
        },
      },
    });

    if (!assistant) {
      throw new NotFoundException('Assistente nao encontrado.');
    }

    return this.mapAssistant(assistant);
  }

  async createAssistant(workspaceId: string, payload: AssistantPayload) {
    const assistant = await this.prisma.assistant.create({
      data: {
        workspaceId,
        name: payload.name,
        description: payload.description,
        objective: payload.objective,
        systemPrompt: payload.systemPrompt,
        temperature: payload.temperature,
        model: payload.model,
        status: payload.status ?? AssistantStatus.ACTIVE,
      },
    });

    await this.syncAssistantRelations(
      assistant.id,
      payload.knowledgeBaseIds,
      payload.toolIds,
    );
    return this.findAssistant(assistant.id, workspaceId);
  }

  async updateAssistant(
    id: string,
    workspaceId: string,
    payload: Partial<AssistantPayload>,
  ) {
    const assistant = await this.prisma.assistant.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!assistant) {
      throw new NotFoundException('Assistente nao encontrado.');
    }

    await this.prisma.assistant.update({
      where: { id },
      data: {
        name: payload.name ?? assistant.name,
        description: payload.description ?? assistant.description,
        objective: payload.objective ?? assistant.objective,
        systemPrompt: payload.systemPrompt ?? assistant.systemPrompt,
        temperature: payload.temperature ?? assistant.temperature,
        model: payload.model ?? assistant.model,
        status: payload.status ?? assistant.status,
      },
    });

    if (payload.knowledgeBaseIds || payload.toolIds) {
      await this.syncAssistantRelations(
        id,
        payload.knowledgeBaseIds,
        payload.toolIds,
      );
    }

    return this.findAssistant(id, workspaceId);
  }

  async deleteAssistant(id: string, workspaceId: string) {
    const assistant = await this.prisma.assistant.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!assistant) {
      throw new NotFoundException('Assistente nao encontrado.');
    }

    await this.prisma.assistant.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  async testAssistant(id: string, workspaceId: string, message: string) {
    const assistant = await this.findAssistant(id, workspaceId);
    const docs = await this.prisma.knowledgeDocument.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        knowledgeBaseId: {
          in: assistant.knowledgeBases.map((item) => item.id),
        },
      },
      take: 2,
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return {
      assistantId: id,
      message,
      response: `${assistant.name}: ${assistant.objective ?? 'Posso te ajudar com o AutosZap.'} Com base nas referencias "${docs.map((doc) => doc.title).join(', ') || 'sem base vinculada'}", sugiro comecar por inbox, CRM e integracao oficial da Meta.`,
      simulated: true,
    };
  }

  async listKnowledgeBases(workspaceId: string) {
    const items = await this.prisma.knowledgeBase.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      include: {
        documents: {
          where: { deletedAt: null },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return items.map((item) => ({
      ...item,
      documentCount: item.documents.length,
    }));
  }

  async findKnowledgeBase(id: string, workspaceId: string) {
    const item = await this.prisma.knowledgeBase.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      include: {
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Base de conhecimento nao encontrada.');
    }

    return item;
  }

  async createKnowledgeBase(
    workspaceId: string,
    payload: KnowledgeBasePayload,
  ) {
    const item = await this.prisma.knowledgeBase.create({
      data: {
        workspaceId,
        name: payload.name,
        description: payload.description,
        type: payload.type,
        status: payload.status ?? EntityStatus.ACTIVE,
      },
    });

    return this.findKnowledgeBase(item.id, workspaceId);
  }

  async updateKnowledgeBase(
    id: string,
    workspaceId: string,
    payload: Partial<KnowledgeBasePayload>,
  ) {
    const item = await this.prisma.knowledgeBase.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!item) {
      throw new NotFoundException('Base de conhecimento nao encontrada.');
    }

    await this.prisma.knowledgeBase.update({
      where: { id },
      data: {
        name: payload.name ?? item.name,
        description: payload.description ?? item.description,
        type: payload.type ?? item.type,
        status: payload.status ?? item.status,
      },
    });

    return this.findKnowledgeBase(id, workspaceId);
  }

  async deleteKnowledgeBase(id: string, workspaceId: string) {
    const item = await this.prisma.knowledgeBase.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!item) {
      throw new NotFoundException('Base de conhecimento nao encontrada.');
    }

    await this.prisma.knowledgeBase.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  async listDocuments(workspaceId: string, knowledgeBaseId?: string) {
    return this.prisma.knowledgeDocument.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
      },
      include: {
        knowledgeBase: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async createDocument(workspaceId: string, payload: KnowledgeDocumentPayload) {
    const document = await this.prisma.knowledgeDocument.create({
      data: {
        workspaceId,
        knowledgeBaseId: payload.knowledgeBaseId,
        title: payload.title,
        type: payload.type,
        sourceUrl: payload.sourceUrl,
        content: payload.content,
        status: payload.status ?? EntityStatus.ACTIVE,
      },
    });

    return this.prisma.knowledgeDocument.findUnique({
      where: { id: document.id },
      include: { knowledgeBase: true },
    });
  }

  async updateDocument(
    id: string,
    workspaceId: string,
    payload: Partial<KnowledgeDocumentPayload>,
  ) {
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException('Documento nao encontrado.');
    }

    return this.prisma.knowledgeDocument.update({
      where: { id },
      data: {
        knowledgeBaseId: payload.knowledgeBaseId ?? document.knowledgeBaseId,
        title: payload.title ?? document.title,
        type: payload.type ?? document.type,
        sourceUrl: payload.sourceUrl ?? document.sourceUrl,
        content: payload.content ?? document.content,
        status: payload.status ?? document.status,
      },
      include: { knowledgeBase: true },
    });
  }

  async deleteDocument(id: string, workspaceId: string) {
    const document = await this.prisma.knowledgeDocument.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException('Documento nao encontrado.');
    }

    await this.prisma.knowledgeDocument.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  async listTools(workspaceId: string) {
    const tools = await this.prisma.aiTool.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      include: {
        assistants: {
          include: { assistant: true },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return tools.map((tool) => ({
      ...tool,
      assistants: tool.assistants.map((item) => item.assistant),
    }));
  }

  async createTool(workspaceId: string, payload: AiToolPayload) {
    return this.prisma.aiTool.create({
      data: {
        workspaceId,
        name: payload.name,
        description: payload.description,
        type: payload.type,
        endpoint: payload.endpoint,
        action: payload.action,
        status: payload.status ?? EntityStatus.ACTIVE,
        config: payload.config as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async updateTool(
    id: string,
    workspaceId: string,
    payload: Partial<AiToolPayload>,
  ) {
    const tool = await this.prisma.aiTool.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!tool) {
      throw new NotFoundException('Ferramenta nao encontrada.');
    }

    return this.prisma.aiTool.update({
      where: { id },
      data: {
        name: payload.name ?? tool.name,
        description: payload.description ?? tool.description,
        type: payload.type ?? tool.type,
        endpoint: payload.endpoint ?? tool.endpoint,
        action: payload.action ?? tool.action,
        status: payload.status ?? tool.status,
        config: (payload.config ?? tool.config ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
  }

  async deleteTool(id: string, workspaceId: string) {
    const tool = await this.prisma.aiTool.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!tool) {
      throw new NotFoundException('Ferramenta nao encontrada.');
    }

    await this.prisma.aiTool.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  private async syncAssistantRelations(
    assistantId: string,
    knowledgeBaseIds?: string[],
    toolIds?: string[],
  ) {
    if (knowledgeBaseIds) {
      await this.prisma.assistantKnowledgeBase.deleteMany({
        where: { assistantId },
      });

      if (knowledgeBaseIds.length) {
        await this.prisma.assistantKnowledgeBase.createMany({
          data: knowledgeBaseIds.map((knowledgeBaseId) => ({
            assistantId,
            knowledgeBaseId,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (toolIds) {
      await this.prisma.assistantTool.deleteMany({
        where: { assistantId },
      });

      if (toolIds.length) {
        await this.prisma.assistantTool.createMany({
          data: toolIds.map((toolId) => ({ assistantId, toolId })),
          skipDuplicates: true,
        });
      }
    }
  }

  private mapAssistant<
    T extends {
      name: string;
      objective: string | null;
      knowledgeBases: Array<{ knowledgeBase: { id: string; name: string } }>;
      tools: Array<{ tool: { id: string; name: string; type: string } }>;
    } & Record<string, unknown>,
  >(assistant: T) {
    return {
      ...assistant,
      knowledgeBases: assistant.knowledgeBases.map(
        (item) => item.knowledgeBase,
      ),
      tools: assistant.tools.map((item) => item.tool),
    };
  }
}
