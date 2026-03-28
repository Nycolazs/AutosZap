import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PermissionKey, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ALL_PERMISSION_KEYS } from '../access-control/permissions.constants';

type WorkspaceRolePayload = {
  name: string;
  description?: string;
  permissions: PermissionKey[];
};

type WorkspaceRoleListItem = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: PermissionKey[];
  permissionCount: number;
  assignedMembersCount: number;
  activeMembersCount: number;
  isSystem: boolean;
};

const SYSTEM_ADMIN_ROLE_ID = 'system-admin';
const SYSTEM_ROLE_NAMES = ['Administrador', 'Vendedor'];

@Injectable()
export class WorkspaceRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    const [
      roles,
      systemAdminAssignedMembersCount,
      systemAdminActiveMembersCount,
    ] = await Promise.all([
      this.prisma.workspaceRole.findMany({
        where: {
          workspaceId,
          deletedAt: null,
        },
        include: {
          permissions: {
            orderBy: {
              permission: 'asc',
            },
          },
          teamMembers: {
            select: {
              id: true,
              status: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      }),
      this.prisma.teamMember.count({
        where: {
          workspaceId,
          role: 'ADMIN',
        },
      }),
      this.prisma.teamMember.count({
        where: {
          workspaceId,
          role: 'ADMIN',
          status: UserStatus.ACTIVE,
        },
      }),
    ]);

    const customRoles = roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissions: role.permissions.map((permission) => permission.permission),
      permissionCount: role.permissions.length,
      assignedMembersCount: role.teamMembers.length,
      activeMembersCount: role.teamMembers.filter(
        (member) => member.status === UserStatus.ACTIVE,
      ).length,
      isSystem: false,
    })) satisfies WorkspaceRoleListItem[];

    return [
      ...this.buildSystemRoles({
        systemAdminAssignedMembersCount,
        systemAdminActiveMembersCount,
      }),
      ...customRoles,
    ];
  }

  async create(workspaceId: string, payload: WorkspaceRolePayload) {
    const normalizedPayload = this.normalizePayload(payload);
    await this.ensureUniqueName(workspaceId, normalizedPayload.name);

    const role = await this.prisma.$transaction(async (tx) => {
      const createdRole = await tx.workspaceRole.create({
        data: {
          workspaceId,
          name: normalizedPayload.name,
          description: normalizedPayload.description,
        },
      });

      if (normalizedPayload.permissions.length) {
        await tx.workspaceRolePermission.createMany({
          data: normalizedPayload.permissions.map((permission) => ({
            workspaceRoleId: createdRole.id,
            permission,
          })),
          skipDuplicates: true,
        });
      }

      return createdRole;
    });

    return this.getById(role.id, workspaceId);
  }

  async update(id: string, workspaceId: string, payload: WorkspaceRolePayload) {
    await this.getById(id, workspaceId);

    const normalizedPayload = this.normalizePayload(payload);
    await this.ensureUniqueName(workspaceId, normalizedPayload.name, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.workspaceRole.update({
        where: {
          id,
        },
        data: {
          name: normalizedPayload.name,
          description: normalizedPayload.description,
        },
      });

      await tx.workspaceRolePermission.deleteMany({
        where: {
          workspaceRoleId: id,
        },
      });

      if (normalizedPayload.permissions.length) {
        await tx.workspaceRolePermission.createMany({
          data: normalizedPayload.permissions.map((permission) => ({
            workspaceRoleId: id,
            permission,
          })),
          skipDuplicates: true,
        });
      }
    });

    return this.getById(id, workspaceId);
  }

  async remove(id: string, workspaceId: string) {
    const role = await this.prisma.workspaceRole.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      include: {
        teamMembers: {
          select: {
            id: true,
          },
        },
        users: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Papel nao encontrado.');
    }

    if (role.teamMembers.length || role.users.length) {
      throw new BadRequestException(
        'Desvincule este papel dos membros antes de exclui-lo.',
      );
    }

    await this.prisma.workspaceRole.delete({
      where: {
        id,
      },
    });

    return {
      success: true,
    };
  }

  private async getById(id: string, workspaceId: string) {
    const role = await this.prisma.workspaceRole.findFirst({
      where: {
        id,
        workspaceId,
        deletedAt: null,
      },
      include: {
        permissions: {
          orderBy: {
            permission: 'asc',
          },
        },
        teamMembers: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Papel nao encontrado.');
    }

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissions: role.permissions.map((permission) => permission.permission),
      permissionCount: role.permissions.length,
      assignedMembersCount: role.teamMembers.length,
      activeMembersCount: role.teamMembers.filter(
        (member) => member.status === UserStatus.ACTIVE,
      ).length,
      isSystem: false,
    };
  }

  private normalizePayload(payload: WorkspaceRolePayload) {
    const name = payload.name.trim();
    const description = payload.description?.trim() || undefined;
    const permissions = Array.from(new Set(payload.permissions));

    if (!name) {
      throw new BadRequestException('Informe o nome do papel.');
    }

    return {
      name,
      description,
      permissions,
    };
  }

  private async ensureUniqueName(
    workspaceId: string,
    name: string,
    excludedId?: string,
  ) {
    const normalizedName = name.trim().toLowerCase();

    if (
      SYSTEM_ROLE_NAMES.some(
        (systemRoleName) => systemRoleName.toLowerCase() === normalizedName,
      )
    ) {
      throw new BadRequestException(
        'Este nome ja e usado por um papel padrao do sistema.',
      );
    }

    const existingRole = await this.prisma.workspaceRole.findFirst({
      where: {
        workspaceId,
        deletedAt: null,
        name: {
          equals: name,
          mode: 'insensitive',
        },
        ...(excludedId
          ? {
              id: {
                not: excludedId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (existingRole) {
      throw new BadRequestException('Ja existe um papel com este nome.');
    }
  }

  private buildSystemRoles(counts: {
    systemAdminAssignedMembersCount: number;
    systemAdminActiveMembersCount: number;
  }): WorkspaceRoleListItem[] {
    const now = new Date();

    return [
      {
        id: SYSTEM_ADMIN_ROLE_ID,
        name: 'Administrador',
        description:
          'Papel padrao do sistema com acesso completo a todas as telas, acoes e configuracoes.',
        createdAt: now,
        updatedAt: now,
        permissions: [...ALL_PERMISSION_KEYS],
        permissionCount: ALL_PERMISSION_KEYS.length,
        assignedMembersCount: counts.systemAdminAssignedMembersCount,
        activeMembersCount: counts.systemAdminActiveMembersCount,
        isSystem: true,
      },
    ];
  }
}
