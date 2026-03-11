import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    const tags = await this.prisma.tag.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            contacts: true,
            conversations: true,
            leads: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return tags;
  }

  async create(
    workspaceId: string,
    payload: { name: string; color: string; description?: string },
  ) {
    const existing = await this.prisma.tag.findFirst({
      where: {
        workspaceId,
        name: payload.name,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new BadRequestException('Ja existe uma tag com este nome.');
    }

    return this.prisma.tag.create({
      data: {
        workspaceId,
        name: payload.name,
        color: payload.color,
        description: payload.description,
      },
    });
  }

  async update(
    id: string,
    workspaceId: string,
    payload: { name?: string; color?: string; description?: string },
  ) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!tag) {
      throw new NotFoundException('Tag nao encontrada.');
    }

    if (payload.name && payload.name !== tag.name) {
      const duplicate = await this.prisma.tag.findFirst({
        where: {
          workspaceId,
          name: payload.name,
          deletedAt: null,
          NOT: {
            id,
          },
        },
      });

      if (duplicate) {
        throw new BadRequestException('Ja existe uma tag com este nome.');
      }
    }

    return this.prisma.tag.update({
      where: { id },
      data: {
        name: payload.name ?? tag.name,
        color: payload.color ?? tag.color,
        description: payload.description ?? tag.description,
      },
    });
  }

  async remove(id: string, workspaceId: string) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!tag) {
      throw new NotFoundException('Tag nao encontrada.');
    }

    await this.prisma.tag.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }
}
