import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, PermissionKey, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createAuditLog } from '../../common/utils/audit';
import { generateSecureToken } from '../../common/utils/auth';
import { AccessControlService } from '../access-control/access-control.service';
import { normalizeRole } from '../access-control/permissions.constants';

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControlService: AccessControlService,
  ) {}

  async list(workspaceId: string) {
    const members = await this.prisma.teamMember.findMany({
      where: {
        workspaceId,
      },
      include: {
        user: {
          select: {
            id: true,
            lastLoginAt: true,
            status: true,
            role: true,
            permissionOverrides: {
              select: {
                permission: true,
                allowed: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return members.map((member) => {
      const role = member.user?.role ?? member.role;
      const permissionMap = member.user
        ? this.accessControlService.buildPermissionMap(
            member.user.role,
            member.user.permissionOverrides,
          )
        : this.accessControlService.getPermissionDefaults(role);

      return {
        ...member,
        role,
        normalizedRole: normalizeRole(role),
        userId: member.user?.id ?? member.userId,
        lastLoginAt: member.user?.lastLoginAt ?? null,
        permissions: permissionMap,
        grantedPermissions: Object.entries(permissionMap)
          .filter(([, allowed]) => allowed)
          .map(([permission]) => permission),
      };
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
        role: normalizeRole(payload.role),
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
      include: {
        user: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Membro nao encontrado.');
    }

    if (
      member.user &&
      payload.status === UserStatus.INACTIVE &&
      normalizeRole(member.user.role) === Role.ADMIN
    ) {
      await this.accessControlService.ensureAnotherActiveAdmin(
        workspaceId,
        member.user.id,
      );
    }

    if (member.user && payload.role) {
      await this.accessControlService.updateUserRole(
        member.user.id,
        workspaceId,
        payload.role,
      );
    }

    if (member.user && payload.status) {
      await this.prisma.user.update({
        where: {
          id: member.user.id,
        },
        data: {
          status: payload.status,
        },
      });
    }

    await this.prisma.teamMember.update({
      where: { id },
      data: {
        name: payload.name ?? member.name,
        title: payload.title ?? member.title,
        role: payload.role ? normalizeRole(payload.role) : member.role,
        status: payload.status ?? member.status,
      },
    });

    return this.list(workspaceId).then((items) =>
      items.find((teamMember) => teamMember.id === id),
    );
  }

  async deactivate(id: string, workspaceId: string) {
    const member = await this.prisma.teamMember.findFirst({
      where: { id, workspaceId },
      include: {
        user: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Membro nao encontrado.');
    }

    if (member.user && normalizeRole(member.user.role) === Role.ADMIN) {
      await this.accessControlService.ensureAnotherActiveAdmin(
        workspaceId,
        member.user.id,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (member.user) {
        await tx.user.update({
          where: {
            id: member.user.id,
          },
          data: {
            status: UserStatus.INACTIVE,
          },
        });
      }

      await tx.teamMember.update({
        where: { id },
        data: {
          status: UserStatus.INACTIVE,
          deactivatedAt: new Date(),
        },
      });
    });

    return this.list(workspaceId).then((items) =>
      items.find((teamMember) => teamMember.id === id),
    );
  }

  async updatePermissions(
    id: string,
    workspaceId: string,
    permissions: Array<{ permission: PermissionKey; allowed: boolean }>,
  ) {
    const member = await this.prisma.teamMember.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Membro nao encontrado.');
    }

    if (!member.userId) {
      throw new BadRequestException(
        'As permissoes ficam disponiveis depois que o usuario ativa a conta.',
      );
    }

    return this.accessControlService.replaceUserPermissionOverrides(
      member.userId,
      workspaceId,
      permissions,
    );
  }
}
