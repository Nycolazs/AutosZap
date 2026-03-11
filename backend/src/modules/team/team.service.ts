import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createAuditLog } from '../../common/utils/audit';
import { generateSecureToken } from '../../common/utils/auth';

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    return this.prisma.teamMember.findMany({
      where: {
        workspaceId,
      },
      include: {
        user: {
          select: {
            id: true,
            lastLoginAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async create(
    workspaceId: string,
    actorId: string,
    payload: {
      name: string;
      email: string;
      title?: string;
      role: Role;
      status?: UserStatus;
    },
  ) {
    const existing = await this.prisma.teamMember.findFirst({
      where: { workspaceId, email: payload.email.toLowerCase() },
    });

    if (existing) {
      throw new BadRequestException('Ja existe um membro com este email.');
    }

    const member = await this.prisma.teamMember.create({
      data: {
        workspaceId,
        invitedById: actorId,
        name: payload.name,
        email: payload.email.toLowerCase(),
        title: payload.title,
        role: payload.role,
        status: payload.status ?? UserStatus.PENDING,
        inviteToken: generateSecureToken(16),
      },
    });

    await createAuditLog(
      this.prisma,
      workspaceId,
      AuditAction.INVITE,
      'team_member',
      member.id,
      actorId,
      {
        email: member.email,
        status: member.status,
      },
    );

    return member;
  }

  async update(
    id: string,
    workspaceId: string,
    payload: {
      name?: string;
      title?: string;
      role?: Role;
      status?: UserStatus;
    },
  ) {
    const member = await this.prisma.teamMember.findFirst({
      where: { id, workspaceId },
    });

    if (!member) {
      throw new NotFoundException('Membro nao encontrado.');
    }

    return this.prisma.teamMember.update({
      where: { id },
      data: {
        name: payload.name ?? member.name,
        title: payload.title ?? member.title,
        role: payload.role ?? member.role,
        status: payload.status ?? member.status,
      },
    });
  }

  async deactivate(id: string, workspaceId: string) {
    const member = await this.prisma.teamMember.findFirst({
      where: { id, workspaceId },
    });

    if (!member) {
      throw new NotFoundException('Membro nao encontrado.');
    }

    return this.prisma.teamMember.update({
      where: { id },
      data: {
        status: UserStatus.INACTIVE,
        deactivatedAt: new Date(),
      },
    });
  }
}
