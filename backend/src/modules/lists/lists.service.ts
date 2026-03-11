import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ListsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    return this.prisma.contactList.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      include: {
        items: {
          include: {
            contact: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async findOne(id: string, workspaceId: string) {
    const list = await this.prisma.contactList.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      include: {
        items: {
          include: {
            contact: {
              include: {
                tagLinks: {
                  include: { tag: true },
                },
              },
            },
          },
        },
      },
    });

    if (!list) {
      throw new NotFoundException('Lista nao encontrada.');
    }

    return {
      ...list,
      contacts: list.items.map((item) => ({
        ...item.contact,
        tags: item.contact.tagLinks.map((tagLink) => tagLink.tag),
      })),
    };
  }

  async create(
    workspaceId: string,
    payload: { name: string; description?: string; contactIds?: string[] },
  ) {
    const existing = await this.prisma.contactList.findFirst({
      where: {
        workspaceId,
        name: payload.name,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new BadRequestException('Ja existe uma lista com este nome.');
    }

    const list = await this.prisma.contactList.create({
      data: {
        workspaceId,
        name: payload.name,
        description: payload.description,
      },
    });

    if (payload.contactIds?.length) {
      await this.syncContacts(list.id, payload.contactIds);
    }

    return this.findOne(list.id, workspaceId);
  }

  async update(
    id: string,
    workspaceId: string,
    payload: { name?: string; description?: string; contactIds?: string[] },
  ) {
    const list = await this.prisma.contactList.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!list) {
      throw new NotFoundException('Lista nao encontrada.');
    }

    await this.prisma.contactList.update({
      where: { id },
      data: {
        name: payload.name ?? list.name,
        description: payload.description ?? list.description,
      },
    });

    if (payload.contactIds) {
      await this.syncContacts(id, payload.contactIds);
    }

    return this.findOne(id, workspaceId);
  }

  async remove(id: string, workspaceId: string) {
    const list = await this.prisma.contactList.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!list) {
      throw new NotFoundException('Lista nao encontrada.');
    }

    await this.prisma.contactList.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  private async syncContacts(listId: string, contactIds: string[]) {
    await this.prisma.contactListItem.deleteMany({
      where: { listId },
    });

    if (contactIds.length) {
      await this.prisma.contactListItem.createMany({
        data: contactIds.map((contactId) => ({ listId, contactId })),
        skipDuplicates: true,
      });
    }
  }
}
