import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PermissionKey, Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ALL_PERMISSION_KEYS,
  DEFAULT_SELLER_PERMISSIONS,
  NormalizedRole,
  PERMISSION_CATALOG,
  isAdminRole,
  normalizeRole,
} from './permissions.constants';

type PermissionOverrideInput = {
  permission: PermissionKey;
  allowed: boolean;
};

type UserPermissionRecord = {
  role: Role;
  normalizedRole: NormalizedRole;
  permissionMap: Record<PermissionKey, boolean>;
};

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  listPermissionCatalog() {
    return PERMISSION_CATALOG;
  }

  getPermissionDefaults(role: Role): Record<PermissionKey, boolean> {
    const normalizedRole = normalizeRole(role);

    const permissionMap = Object.fromEntries(
      ALL_PERMISSION_KEYS.map((permission) => [
        permission,
        normalizedRole === Role.ADMIN
          ? true
          : DEFAULT_SELLER_PERMISSIONS.has(permission),
      ]),
    ) as Record<PermissionKey, boolean>;

    return permissionMap;
  }

  buildPermissionMap(
    role: Role,
    overrides: Array<{ permission: PermissionKey; allowed: boolean }>,
  ) {
    const permissionMap = this.getPermissionDefaults(role);

    if (isAdminRole(role)) {
      return permissionMap;
    }

    for (const override of overrides) {
      permissionMap[override.permission] = override.allowed;
    }

    return permissionMap;
  }

  async getUserPermissions(userId: string, workspaceId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        workspaceId,
        deletedAt: null,
      },
      include: {
        permissionOverrides: {
          orderBy: {
            permission: 'asc',
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    return {
      role: user.role,
      normalizedRole: normalizeRole(user.role),
      permissionMap: this.buildPermissionMap(
        user.role,
        user.permissionOverrides.map((permission) => ({
          permission: permission.permission,
          allowed: permission.allowed,
        })),
      ),
    } satisfies UserPermissionRecord;
  }

  async ensurePermission(
    userId: string,
    workspaceId: string,
    permission: PermissionKey,
  ) {
    const snapshot = await this.getUserPermissions(userId, workspaceId);

    if (!snapshot.permissionMap[permission]) {
      throw new ForbiddenException('Voce nao tem permissao para esta acao.');
    }

    return snapshot;
  }

  async updateUserRole(userId: string, workspaceId: string, nextRole: Role) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        workspaceId,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    const normalizedCurrentRole = normalizeRole(user.role);
    const normalizedNextRole = normalizeRole(nextRole);
    const storedNextRole =
      normalizedNextRole === Role.ADMIN ? Role.ADMIN : Role.SELLER;

    if (
      normalizedCurrentRole === Role.ADMIN &&
      normalizedNextRole !== Role.ADMIN
    ) {
      await this.ensureAnotherActiveAdmin(workspaceId, userId);
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: {
          id: userId,
        },
        data: {
          role: storedNextRole,
        },
      });

      await tx.teamMember.updateMany({
        where: {
          workspaceId,
          userId,
        },
        data: {
          role: storedNextRole,
        },
      });

      if (storedNextRole === Role.ADMIN) {
        await tx.userPermission.deleteMany({
          where: {
            userId,
          },
        });
      }

      return updatedUser;
    });
  }

  async replaceUserPermissionOverrides(
    userId: string,
    workspaceId: string,
    permissions: PermissionOverrideInput[],
  ) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        workspaceId,
        deletedAt: null,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    if (isAdminRole(user.role)) {
      await this.prisma.userPermission.deleteMany({
        where: {
          userId,
        },
      });

      return this.getUserPermissions(userId, workspaceId);
    }

    const desiredMap = Object.fromEntries(
      permissions.map((permission) => [
        permission.permission,
        permission.allowed,
      ]),
    ) as Partial<Record<PermissionKey, boolean>>;

    const overrides = ALL_PERMISSION_KEYS.flatMap((permission) => {
      const desiredValue =
        desiredMap[permission] ?? DEFAULT_SELLER_PERMISSIONS.has(permission);
      const defaultValue = DEFAULT_SELLER_PERMISSIONS.has(permission);

      if (desiredValue === defaultValue) {
        return [];
      }

      return [
        {
          workspaceId,
          userId,
          permission,
          allowed: desiredValue,
        } satisfies Prisma.UserPermissionCreateManyInput,
      ];
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({
        where: {
          userId,
        },
      });

      if (overrides.length) {
        await tx.userPermission.createMany({
          data: overrides,
          skipDuplicates: true,
        });
      }
    });

    return this.getUserPermissions(userId, workspaceId);
  }

  async ensureAnotherActiveAdmin(workspaceId: string, excludedUserId: string) {
    const remainingAdmins = await this.prisma.user.count({
      where: {
        workspaceId,
        deletedAt: null,
        status: UserStatus.ACTIVE,
        id: {
          not: excludedUserId,
        },
        role: Role.ADMIN,
      },
    });

    if (remainingAdmins === 0) {
      throw new BadRequestException(
        'A empresa precisa manter ao menos um usuario administrador ativo.',
      );
    }
  }
}
