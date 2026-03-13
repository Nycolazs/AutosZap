import { PermissionKey, Role } from '@prisma/client';
import {
  ALL_PERMISSION_KEYS,
  DEFAULT_SELLER_PERMISSIONS,
  isAdminRole,
  normalizeRole,
} from './permissions.constants';

describe('permissions.constants', () => {
  it('normalizes every non-admin role to SELLER semantics', () => {
    expect(normalizeRole(Role.ADMIN)).toBe('ADMIN');
    expect(normalizeRole(Role.MANAGER)).toBe('SELLER');
    expect(normalizeRole(Role.AGENT)).toBe('SELLER');
    expect(normalizeRole(Role.SELLER)).toBe('SELLER');
  });

  it('marks only ADMIN as admin role', () => {
    expect(isAdminRole(Role.ADMIN)).toBe(true);
    expect(isAdminRole(Role.SELLER)).toBe(false);
    expect(isAdminRole(Role.MANAGER)).toBe(false);
  });

  it('ships seller defaults for inbox work without opening admin areas', () => {
    expect(DEFAULT_SELLER_PERMISSIONS.has(PermissionKey.INBOX_VIEW)).toBe(true);
    expect(DEFAULT_SELLER_PERMISSIONS.has(PermissionKey.CRM_VIEW)).toBe(true);
    expect(DEFAULT_SELLER_PERMISSIONS.has(PermissionKey.SETTINGS_VIEW)).toBe(
      false,
    );
    expect(DEFAULT_SELLER_PERMISSIONS.has(PermissionKey.MANAGE_TEAM)).toBe(
      false,
    );
    expect(ALL_PERMISSION_KEYS).toContain(PermissionKey.RESOLVE_CONVERSATION);
  });
});
