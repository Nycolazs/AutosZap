import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, PermissionKey, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
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
      password?: string;
      confirmPassword?: string;
    },
  ) {
    const normalizedEmail = payload.email.toLowerCase();
    const normalizedRole = normalizeRole(payload.role);
    const shouldCreateLogin =
      typeof payload.password === 'string' && payload.password.length > 0;

    if (shouldCreateLogin && payload.password !== payload.confirmPassword) {
      throw new BadRequestException('As senhas informadas nao conferem.');
    }

    const existing = await this.prisma.teamMember.findFirst({
      where: { workspaceId, email: normalizedEmail },
    });

    if (existing) {
      throw new BadRequestException('Ja existe um membro com este email.');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException('Ja existe uma conta com este email.');
    }

    const status = shouldCreateLogin
      ? payload.status && payload.status !== UserStatus.PENDING
        ? payload.status
        : UserStatus.ACTIVE
      : (payload.status ?? UserStatus.PENDING);

    const member = shouldCreateLogin
      ? await this.prisma.$transaction(async (tx) => {
          const passwordHash = await bcrypt.hash(
            payload.password as string,
            10,
          );
          const user = await tx.user.create({
            data: {
              workspaceId,
              name: payload.name,
              email: normalizedEmail,
              passwordHash,
              role: normalizedRole,
              status,
              title: payload.title,
            },
          });

          return tx.teamMember.create({
            data: {
              workspaceId,
              invitedById: actorId,
              userId: user.id,
              name: payload.name,
              email: normalizedEmail,
              title: payload.title,
              role: normalizedRole,
              status,
              inviteToken: null,
            },
          });
        })
      : await this.prisma.teamMember.create({
          data: {
            workspaceId,
            invitedById: actorId,
            name: payload.name,
            email: normalizedEmail,
            title: payload.title,
            role: normalizedRole,
            status,
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
      email?: string;
      title?: string;
      role?: Role;
      status?: UserStatus;
      password?: string;
      confirmPassword?: string;
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

    const normalizedEmail = payload.email?.toLowerCase().trim();
    const shouldUpdateEmail =
      !!normalizedEmail && normalizedEmail !== member.email.toLowerCase();

    if (shouldUpdateEmail) {
      const existingMember = await this.prisma.teamMember.findFirst({
        where: {
          workspaceId,
          email: normalizedEmail,
          NOT: { id },
        },
        select: { id: true },
      });

      if (existingMember) {
        throw new BadRequestException('Ja existe um membro com este email.');
      }

      const existingUser = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (
        existingUser &&
        (!member.user || existingUser.id !== member.user.id)
      ) {
        throw new BadRequestException('Ja existe uma conta com este email.');
      }
    }

    const shouldUpdatePassword =
      typeof payload.password === 'string' && payload.password.length > 0;

    if (shouldUpdatePassword && payload.password !== payload.confirmPassword) {
      throw new BadRequestException('As senhas informadas nao conferem.');
    }

    if (shouldUpdatePassword && !member.user) {
      const email = normalizedEmail ?? member.email.toLowerCase();
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingUser) {
        throw new BadRequestException('Ja existe uma conta com este email.');
      }

      const nextRole = payload.role ? normalizeRole(payload.role) : member.role;
      const nextStatus =
        payload.status && payload.status !== UserStatus.PENDING
          ? payload.status
          : UserStatus.ACTIVE;
      const passwordHash = await bcrypt.hash(payload.password as string, 10);

      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            workspaceId,
            name: payload.name ?? member.name,
            email,
            passwordHash,
            role: nextRole,
            status: nextStatus,
            title: payload.title ?? member.title,
          },
        });

        await tx.teamMember.update({
          where: { id },
          data: {
            userId: user.id,
            name: payload.name ?? member.name,
            email,
            title: payload.title ?? member.title,
            role: nextRole,
            status: nextStatus,
            inviteToken: null,
          },
        });
      });

      return this.list(workspaceId).then((items) =>
        items.find((teamMember) => teamMember.id === id),
      );
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

    if (member.user && shouldUpdateEmail) {
      await this.prisma.user.update({
        where: {
          id: member.user.id,
        },
        data: {
          email: normalizedEmail,
        },
      });
    }

    if (member.user && shouldUpdatePassword) {
      await this.prisma.user.update({
        where: {
          id: member.user.id,
        },
        data: {
          passwordHash: await bcrypt.hash(payload.password as string, 10),
        },
      });
    }

    await this.prisma.teamMember.update({
      where: { id },
      data: {
        name: payload.name ?? member.name,
        email: normalizedEmail ?? member.email,
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
