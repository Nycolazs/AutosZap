import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export type MenuNodeInput = {
  id?: string;
  label: string;
  message: string;
  order: number;
  parentId?: string | null;
  children?: MenuNodeInput[];
};

@Injectable()
export class AutoResponseMenusService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    return this.prisma.autoResponseMenu.findMany({
      where: { workspaceId },
      include: {
        nodes: {
          orderBy: { order: 'asc' },
        },
        _count: { select: { nodes: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(workspaceId: string, id: string) {
    const menu = await this.prisma.autoResponseMenu.findFirst({
      where: { id, workspaceId },
      include: {
        nodes: {
          orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
        },
      },
    });

    if (!menu) {
      throw new NotFoundException('Menu nao encontrado.');
    }

    return menu;
  }

  async create(
    workspaceId: string,
    payload: {
      name: string;
      description?: string;
      isActive?: boolean;
      triggerKeywords?: string[];
      headerText?: string;
      footerText?: string;
      nodes?: MenuNodeInput[];
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const menu = await tx.autoResponseMenu.create({
        data: {
          workspaceId,
          name: payload.name,
          description: payload.description,
          isActive: payload.isActive ?? false,
          triggerKeywords: payload.triggerKeywords ?? [],
          headerText: payload.headerText,
          footerText: payload.footerText,
        },
      });

      if (payload.nodes && payload.nodes.length > 0) {
        await this.upsertNodes(tx, menu.id, payload.nodes, null);
      }

      return tx.autoResponseMenu.findFirst({
        where: { id: menu.id },
        include: {
          nodes: { orderBy: [{ parentId: 'asc' }, { order: 'asc' }] },
        },
      });
    });
  }

  async update(
    workspaceId: string,
    id: string,
    payload: {
      name?: string;
      description?: string;
      isActive?: boolean;
      triggerKeywords?: string[];
      headerText?: string;
      footerText?: string;
      nodes?: MenuNodeInput[];
    },
  ) {
    const menu = await this.prisma.autoResponseMenu.findFirst({
      where: { id, workspaceId },
    });

    if (!menu) {
      throw new NotFoundException('Menu nao encontrado.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.autoResponseMenu.update({
        where: { id },
        data: {
          name: payload.name ?? menu.name,
          description:
            payload.description !== undefined
              ? payload.description
              : menu.description,
          isActive:
            payload.isActive !== undefined ? payload.isActive : menu.isActive,
          triggerKeywords: payload.triggerKeywords ?? menu.triggerKeywords,
          headerText:
            payload.headerText !== undefined
              ? payload.headerText
              : menu.headerText,
          footerText:
            payload.footerText !== undefined
              ? payload.footerText
              : menu.footerText,
        },
      });

      if (payload.nodes !== undefined) {
        // Delete all existing nodes and re-create from scratch
        await tx.autoResponseMenuNode.deleteMany({ where: { menuId: id } });
        if (payload.nodes.length > 0) {
          await this.upsertNodes(tx, id, payload.nodes, null);
        }
      }

      return tx.autoResponseMenu.findFirst({
        where: { id },
        include: {
          nodes: { orderBy: [{ parentId: 'asc' }, { order: 'asc' }] },
        },
      });
    });
  }

  async toggleActive(workspaceId: string, id: string) {
    const menu = await this.prisma.autoResponseMenu.findFirst({
      where: { id, workspaceId },
    });

    if (!menu) {
      throw new NotFoundException('Menu nao encontrado.');
    }

    return this.prisma.autoResponseMenu.update({
      where: { id },
      data: { isActive: !menu.isActive },
    });
  }

  async remove(workspaceId: string, id: string) {
    const menu = await this.prisma.autoResponseMenu.findFirst({
      where: { id, workspaceId },
    });

    if (!menu) {
      throw new NotFoundException('Menu nao encontrado.');
    }

    await this.prisma.autoResponseMenu.delete({ where: { id } });
  }

  private async upsertNodes(
    tx: Prisma.TransactionClient,
    menuId: string,
    nodes: MenuNodeInput[],
    parentId: string | null,
  ) {
    for (const node of nodes) {
      const created = await tx.autoResponseMenuNode.create({
        data: {
          menuId,
          parentId,
          label: node.label,
          message: node.message,
          order: node.order,
        },
      });

      if (node.children && node.children.length > 0) {
        await this.upsertNodes(tx, menuId, node.children, created.id);
      }
    }
  }
}
