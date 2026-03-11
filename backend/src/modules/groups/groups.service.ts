import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    return this.prisma.group.findMany({
      where: {
        workspaceId,
        deletedAt: null,
      },
      include: {
        members: {
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
    const group = await this.prisma.group.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      include: {
        members: {
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

    if (!group) {
      throw new NotFoundException('Grupo nao encontrado.');
    }

    return {
      ...group,
      contacts: group.members.map((member) => ({
        ...member.contact,
        tags: member.contact.tagLinks.map((tagLink) => tagLink.tag),
      })),
    };
  }

  async create(
    workspaceId: string,
    payload: { name: string; description?: string; contactIds?: string[] },
  ) {
    const existing = await this.prisma.group.findFirst({
      where: {
        workspaceId,
        name: payload.name,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new BadRequestException('Ja existe um grupo com este nome.');
    }

    const group = await this.prisma.group.create({
      data: {
        workspaceId,
        name: payload.name,
        description: payload.description,
      },
    });

    if (payload.contactIds?.length) {
      await this.syncContacts(group.id, payload.contactIds);
    }

    return this.findOne(group.id, workspaceId);
  }

  async update(
    id: string,
    workspaceId: string,
    payload: { name?: string; description?: string; contactIds?: string[] },
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!group) {
      throw new NotFoundException('Grupo nao encontrado.');
    }

    await this.prisma.group.update({
      where: { id },
      data: {
        name: payload.name ?? group.name,
        description: payload.description ?? group.description,
      },
    });

    if (payload.contactIds) {
      await this.syncContacts(id, payload.contactIds);
    }

    return this.findOne(id, workspaceId);
  }

  async remove(id: string, workspaceId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!group) {
      throw new NotFoundException('Grupo nao encontrado.');
    }

    await this.prisma.group.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  private async syncContacts(groupId: string, contactIds: string[]) {
    await this.prisma.groupMember.deleteMany({
      where: { groupId },
    });

    if (contactIds.length) {
      await this.prisma.groupMember.createMany({
        data: contactIds.map((contactId) => ({ groupId, contactId })),
        skipDuplicates: true,
      });
    }
  }
}
