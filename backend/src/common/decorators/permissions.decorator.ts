import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '@prisma/client';

export const PERMISSIONS_KEY = 'permissions';

export type PermissionRequirement = {
  mode: 'all' | 'any';
  permissions: PermissionKey[];
};

export const Permissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, {
    mode: 'all',
    permissions,
  } satisfies PermissionRequirement);

export const AnyPermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, {
    mode: 'any',
    permissions,
  } satisfies PermissionRequirement);
