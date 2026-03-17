import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContactSource, Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildEquivalentContactPhones,
  normalizeContactPhone,
  normalizeSearchPhone,
} from '../../common/utils/phone';
import {
  getPagination,
  paginatedResponse,
} from '../../common/utils/pagination';

const DUPLICATE_CONTACT_PHONE_MESSAGE =
  'Ja existe um contato cadastrado com este numero.';

type ContactPayload = {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  source?: ContactSource;
  notes?: string;
  tagIds?: string[];
};

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    workspaceId: string,
    query: PaginationQueryDto & { tagId?: string },
  ) {
    const { page, limit, skip, take } = getPagination(query.page, query.limit);
    const searchPhoneVariants = normalizeSearchPhone(query.search);

    const where: Prisma.ContactWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              ...(searchPhoneVariants.length
                ? searchPhoneVariants.map((phone) => ({
                    phone: { contains: phone },
                  }))
                : []),
              { email: { contains: query.search, mode: 'insensitive' } },
              { company: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.tagId
        ? {
            tagLinks: {
              some: {
                tagId: query.tagId,
              },
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        include: {
          tagLinks: {
            include: {
              tag: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        skip,
        take,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return paginatedResponse(
      data.map((contact) => ({
        ...contact,
        tags: contact.tagLinks.map((tagLink) => tagLink.tag),
      })),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string, workspaceId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      include: {
        tagLinks: {
          include: { tag: true },
        },
        listItems: {
          include: {
            list: true,
          },
        },
        groupMembers: {
          include: {
            group: true,
          },
        },
        conversations: {
          where: {
            deletedAt: null,
          },
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: {
            lastMessageAt: 'desc',
          },
        },
        campaignRecipients: {
          include: {
            campaign: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!contact) {
      throw new NotFoundException('Contato nao encontrado.');
    }

    const timeline = [
      ...contact.conversations.map((conversation) => ({
        type: 'conversation',
        title: conversation.lastMessagePreview ?? 'Interacao na inbox',
        date: conversation.lastMessageAt ?? conversation.updatedAt,
      })),
      ...contact.campaignRecipients.map((recipient) => ({
        type: 'campaign',
        title: `${recipient.campaign.name} - ${recipient.status}`,
        date: recipient.sentAt ?? recipient.createdAt,
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      ...contact,
      tags: contact.tagLinks.map((tagLink) => tagLink.tag),
      lists: contact.listItems.map((item) => item.list),
      groups: contact.groupMembers.map((item) => item.group),
      timeline,
    };
  }

  async create(workspaceId: string, payload: ContactPayload) {
    const normalizedPhone = normalizeContactPhone(payload.phone);
    const equivalentPhones = this.buildPhoneCandidates(payload.phone);

    if (!normalizedPhone) {
      throw new BadRequestException('Informe um numero de telefone valido.');
    }

    const existing = await this.prisma.contact.findFirst({
      where: {
        workspaceId,
        phone: {
          in: equivalentPhones,
        },
        deletedAt: null,
      },
    });

    if (existing) {
      throw new BadRequestException(DUPLICATE_CONTACT_PHONE_MESSAGE);
    }

    let contact;

    try {
      contact = await this.prisma.contact.create({
        data: {
          workspaceId,
          name: payload.name,
          phone: normalizedPhone,
          email: payload.email,
          company: payload.company,
          jobTitle: payload.jobTitle,
          source: payload.source as never,
          notes: payload.notes,
        },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(DUPLICATE_CONTACT_PHONE_MESSAGE);
      }

      throw error;
    }

    if (payload.tagIds?.length) {
      await this.syncTags(contact.id, payload.tagIds);
    }

    return this.findOne(contact.id, workspaceId);
  }

  async update(
    id: string,
    workspaceId: string,
    payload: Partial<ContactPayload>,
  ) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!contact) {
      throw new NotFoundException('Contato nao encontrado.');
    }

    const normalizedPhone = payload.phone
      ? normalizeContactPhone(payload.phone)
      : contact.phone;
    const equivalentPhones = payload.phone
      ? this.buildPhoneCandidates(payload.phone)
      : [contact.phone];

    if (payload.phone && !normalizedPhone) {
      throw new BadRequestException('Informe um numero de telefone valido.');
    }

    if (normalizedPhone !== contact.phone) {
      const existing = await this.prisma.contact.findFirst({
        where: {
          workspaceId,
          phone: {
            in: equivalentPhones.length ? equivalentPhones : [normalizedPhone],
          },
          deletedAt: null,
          NOT: {
            id,
          },
        },
      });

      if (existing) {
        throw new BadRequestException(DUPLICATE_CONTACT_PHONE_MESSAGE);
      }
    }

    try {
      await this.prisma.contact.update({
        where: { id },
        data: {
          name: payload.name ?? contact.name,
          phone: normalizedPhone,
          email: payload.email ?? contact.email,
          company: payload.company ?? contact.company,
          jobTitle: payload.jobTitle ?? contact.jobTitle,
          source: (payload.source as never) ?? contact.source,
          notes: payload.notes ?? contact.notes,
        },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(DUPLICATE_CONTACT_PHONE_MESSAGE);
      }

      throw error;
    }

    if (payload.tagIds) {
      await this.syncTags(id, payload.tagIds);
    }

    return this.findOne(id, workspaceId);
  }

  async remove(id: string, workspaceId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!contact) {
      throw new NotFoundException('Contato nao encontrado.');
    }

    await this.prisma.contact.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  private async syncTags(contactId: string, tagIds: string[]) {
    await this.prisma.contactTag.deleteMany({
      where: { contactId },
    });

    if (tagIds.length) {
      await this.prisma.contactTag.createMany({
        data: tagIds.map((tagId) => ({ contactId, tagId })),
        skipDuplicates: true,
      });
    }
  }

  private buildPhoneCandidates(phone: string) {
    const normalizedPhone = normalizeContactPhone(phone);
    const equivalentPhones = buildEquivalentContactPhones(phone);

    return [...new Set([normalizedPhone, ...equivalentPhones].filter(Boolean))];
  }
}
