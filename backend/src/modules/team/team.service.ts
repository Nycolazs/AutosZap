import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, PermissionKey, Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ControlPlanePrismaService } from '../../common/prisma/control-plane-prisma.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createAuditLog } from '../../common/utils/audit';
import { generateSecureToken } from '../../common/utils/auth';
import { AccessControlService } from '../access-control/access-control.service';
import { normalizeRole } from '../access-control/permissions.constants';
import {
  CompanyStatus,
  GlobalUserStatus,
  InviteCodeStatus,
  MembershipStatus,
  TenantRole,
} from '@autoszap/control-plane-client';
import { randomBytes } from 'node:crypto';

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControlService: AccessControlService,
    private readonly controlPlanePrisma: ControlPlanePrismaService,
  ) {}

  async list(workspaceId: string) {
    const members = await this.prisma.teamMember.findMany({
      where: {
        workspaceId,
      },
      include: {
        workspaceRole: {
          select: {
            id: true,
            name: true,
            description: true,
            permissions: {
              select: {
                permission: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            lastLoginAt: true,
            status: true,
            role: true,
            workspaceRoleId: true,
            workspaceRole: {
              select: {
                id: true,
                name: true,
                description: true,
                permissions: {
                  select: {
                    permission: true,
                  },
                },
              },
            },
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
      const workspaceRole = member.user?.workspaceRole ?? member.workspaceRole;
      const permissionMap = member.user
        ? this.accessControlService.buildPermissionMap(
            member.user.role,
            member.user.permissionOverrides,
            workspaceRole?.permissions.map(
              (permission) => permission.permission,
            ) ?? null,
          )
        : this.accessControlService.getPermissionDefaults(
            role,
            workspaceRole?.permissions.map(
              (permission) => permission.permission,
            ) ?? null,
          );

      return {
        ...member,
        role,
        normalizedRole: normalizeRole(role),
        userId: member.user?.id ?? member.userId,
        workspaceRoleId: workspaceRole?.id ?? null,
        workspaceRole: workspaceRole
          ? {
              id: workspaceRole.id,
              name: workspaceRole.name,
              description: workspaceRole.description,
            }
          : null,
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
      workspaceRoleId?: string;
      status?: UserStatus;
      password?: string;
      confirmPassword?: string;
    },
  ) {
    const normalizedEmail = payload.email.toLowerCase();
    const normalizedRole = normalizeRole(payload.role);
    const workspaceRoleId = await this.resolveWorkspaceRoleId(
      workspaceId,
      normalizedRole,
      payload.workspaceRoleId,
    );
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
              workspaceRoleId,
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
              workspaceRoleId,
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
            workspaceRoleId,
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

    await this.syncMemberWithControlPlane(workspaceId, member.id);

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
      workspaceRoleId?: string | null;
      status?: UserStatus;
      password?: string;
      confirmPassword?: string;
    },
  ) {
    const member = await this.prisma.teamMember.findFirst({
      where: { id, workspaceId },
      include: {
        user: {
          include: {
            workspaceRole: {
              select: {
                id: true,
              },
            },
          },
        },
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

    const nextRole = payload.role
      ? normalizeRole(payload.role)
      : (member.user?.role ?? member.role);
    const nextWorkspaceRoleId = await this.resolveWorkspaceRoleId(
      workspaceId,
      nextRole,
      payload.workspaceRoleId !== undefined
        ? payload.workspaceRoleId
        : (member.user?.workspaceRoleId ?? member.workspaceRoleId ?? null),
    );

    if (shouldUpdatePassword && !member.user) {
      const email = normalizedEmail ?? member.email.toLowerCase();
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingUser) {
        throw new BadRequestException('Ja existe uma conta com este email.');
      }

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
            workspaceRoleId: nextWorkspaceRoleId,
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
            workspaceRoleId: nextWorkspaceRoleId,
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

    if (
      member.user &&
      (payload.role || payload.workspaceRoleId !== undefined)
    ) {
      await this.accessControlService.updateUserRole(
        member.user.id,
        workspaceId,
        nextRole,
        nextWorkspaceRoleId,
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
        role: nextRole,
        workspaceRoleId: nextWorkspaceRoleId,
        status: payload.status ?? member.status,
      },
    });

    await this.syncMemberWithControlPlane(workspaceId, id);

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

    await this.syncMemberWithControlPlane(workspaceId, id);

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

  async generateInviteCode(
    workspaceId: string,
    actorId: string,
    payload: {
      role: Role;
      title?: string;
    },
  ) {
    // Find the company in control plane by workspaceId
    const company = await this.controlPlanePrisma.company.findFirst({
      where: { workspaceId },
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    // Find the actor's globalUserId
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { globalUserId: true },
    });

    // Generate a short, readable code (6 chars, uppercase alphanumeric)
    const code = this.generateShortCode(6);
    const normalizedRole = normalizeRole(payload.role);
    const tenantRole = this.mapTenantRole(normalizedRole);

    const inviteCode = await this.controlPlanePrisma.companyInviteCode.create({
      data: {
        companyId: company.id,
        code,
        role: tenantRole,
        title: payload.title,
        status: InviteCodeStatus.ACTIVE,
        createdByGlobalUserId: actor?.globalUserId ?? null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days
      },
    });

    return {
      code: inviteCode.code,
      role: inviteCode.role,
      title: inviteCode.title,
      expiresAt: inviteCode.expiresAt,
      companyName: company.name,
    };
  }

  async listInviteCodes(workspaceId: string) {
    const company = await this.controlPlanePrisma.company.findFirst({
      where: { workspaceId },
    });

    if (!company) {
      return [];
    }

    return this.controlPlanePrisma.companyInviteCode.findMany({
      where: {
        companyId: company.id,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async revokeInviteCode(workspaceId: string, codeId: string) {
    const company = await this.controlPlanePrisma.company.findFirst({
      where: { workspaceId },
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    const invite = await this.controlPlanePrisma.companyInviteCode.findFirst({
      where: {
        id: codeId,
        companyId: company.id,
        status: InviteCodeStatus.ACTIVE,
      },
    });

    if (!invite) {
      throw new NotFoundException('Codigo de convite nao encontrado.');
    }

    return this.controlPlanePrisma.companyInviteCode.update({
      where: { id: codeId },
      data: { status: InviteCodeStatus.REVOKED },
    });
  }

  private generateShortCode(length: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // removed 0,O,1,I for readability
    const bytes = randomBytes(length);
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars[(bytes[i] ?? 0) % chars.length];
    }
    return code;
  }

  private async resolveWorkspaceRoleId(
    workspaceId: string,
    role: Role,
    workspaceRoleId?: string | null,
  ) {
    if (normalizeRole(role) === Role.ADMIN) {
      return null;
    }

    if (!workspaceRoleId) {
      return null;
    }

    const workspaceRole = await this.prisma.workspaceRole.findFirst({
      where: {
        id: workspaceRoleId,
        workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!workspaceRole) {
      throw new BadRequestException('Papel do workspace nao encontrado.');
    }

    return workspaceRole.id;
  }

  private async syncMemberWithControlPlane(
    workspaceId: string,
    memberId: string,
  ) {
    const teamMember = await this.prisma.teamMember.findFirst({
      where: {
        id: memberId,
        workspaceId,
      },
      include: {
        user: true,
        workspace: true,
      },
    });

    if (!teamMember?.user) {
      return;
    }

    const workspace = teamMember.workspace;
    const user = teamMember.user;
    const role = this.mapTenantRole(user.role);
    const globalStatus = this.mapGlobalUserStatus(user.status);
    const membershipStatus = this.mapMembershipStatus(user.status);

    const company = await this.controlPlanePrisma.company.upsert({
      where: {
        id: workspaceId,
      },
      update: {
        workspaceId,
        name: workspace.companyName || workspace.name,
        slug: workspace.slug,
        status: CompanyStatus.ACTIVE,
      },
      create: {
        id: workspaceId,
        workspaceId,
        name: workspace.companyName || workspace.name,
        slug: workspace.slug,
        status: CompanyStatus.ACTIVE,
      },
    });

    const globalUser = await this.controlPlanePrisma.globalUser.upsert({
      where: {
        email: user.email,
      },
      update: {
        name: user.name,
        passwordHash: user.passwordHash,
        status: globalStatus,
        blockedAt:
          globalStatus === GlobalUserStatus.BLOCKED ? new Date() : null,
        deletedAt: null,
      },
      create: {
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        status: globalStatus,
        blockedAt:
          globalStatus === GlobalUserStatus.BLOCKED ? new Date() : null,
      },
    });

    if (!user.globalUserId || user.globalUserId !== globalUser.id) {
      await this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          globalUserId: globalUser.id,
        },
      });
    }

    const hasActiveMembership =
      await this.controlPlanePrisma.companyMembership.findFirst({
        where: {
          globalUserId: globalUser.id,
          status: MembershipStatus.ACTIVE,
        },
        select: {
          id: true,
        },
      });

    await this.controlPlanePrisma.companyMembership.upsert({
      where: {
        companyId_globalUserId: {
          companyId: company.id,
          globalUserId: globalUser.id,
        },
      },
      update: {
        tenantRole: role,
        status: membershipStatus,
        isDefault: hasActiveMembership ? undefined : true,
      },
      create: {
        companyId: company.id,
        globalUserId: globalUser.id,
        tenantRole: role,
        status: membershipStatus,
        isDefault: !hasActiveMembership,
      },
    });
  }

  private mapTenantRole(role: Role): TenantRole {
    if (role === Role.ADMIN) return TenantRole.ADMIN;
    if (role === Role.MANAGER) return TenantRole.MANAGER;
    if (role === Role.AGENT) return TenantRole.AGENT;
    return TenantRole.SELLER;
  }

  private mapGlobalUserStatus(status: UserStatus): GlobalUserStatus {
    if (status === UserStatus.ACTIVE) return GlobalUserStatus.ACTIVE;
    if (status === UserStatus.INACTIVE) return GlobalUserStatus.BLOCKED;
    return GlobalUserStatus.PENDING;
  }

  private mapMembershipStatus(status: UserStatus): MembershipStatus {
    if (status === UserStatus.ACTIVE) return MembershipStatus.ACTIVE;
    if (status === UserStatus.INACTIVE) return MembershipStatus.INACTIVE;
    return MembershipStatus.INVITED;
  }
}
