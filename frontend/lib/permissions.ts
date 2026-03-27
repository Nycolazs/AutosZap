export const PERMISSION_KEYS = [
  'DASHBOARD_VIEW',
  'REPORTS_VIEW',
  'VIEW_METRICS',
  'INBOX_VIEW',
  'CRM_VIEW',
  'CONTACTS_VIEW',
  'CONTACTS_EDIT',
  'CAMPAIGNS_VIEW',
  'CAMPAIGNS_MANAGE',
  'LISTS_VIEW',
  'GROUPS_VIEW',
  'TAGS_VIEW',
  'PIPELINE_VIEW',
  'ASSISTANTS_VIEW',
  'KNOWLEDGE_BASES_VIEW',
  'AI_TOOLS_VIEW',
  'INTEGRATIONS_VIEW',
  'SETTINGS_VIEW',
  'TEAM_VIEW',
  'EXPORT_DATA',
  'TRANSFER_CONVERSATION',
  'REOPEN_CONVERSATION',
  'RESOLVE_CONVERSATION',
  'CLOSE_CONVERSATION',
  'CONFIGURE_CONVERSATION_ROUTING',
  'CONFIGURE_AUTO_MESSAGES',
  'CONFIGURE_BUSINESS_HOURS',
  'MANAGE_TEAM',
  'MANAGE_USER_ROLES',
  'MANAGE_USER_PERMISSIONS',
  'DEVELOPMENT_VIEW',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type PermissionMap = Partial<Record<PermissionKey, boolean>>;
export type PermissionRequirement = {
  permission?: PermissionKey;
  permissions?: PermissionKey[];
  mode?: 'any' | 'all';
};

const ROUTE_PERMISSION_RULES: Array<{
  prefix: string;
  requirement?: PermissionRequirement;
}> = [
  {
    prefix: '/app/desenvolvimento',
    requirement: { permission: 'DEVELOPMENT_VIEW' },
  },
  {
    prefix: '/app/horarios-de-funcionamento',
    requirement: {
      permissions: [
        'SETTINGS_VIEW',
        'CONFIGURE_CONVERSATION_ROUTING',
        'CONFIGURE_AUTO_MESSAGES',
        'CONFIGURE_BUSINESS_HOURS',
      ],
      mode: 'any',
    },
  },
  {
    prefix: '/app/menu-interativo',
    requirement: {
      permissions: [
        'SETTINGS_VIEW',
        'CONFIGURE_AUTO_MESSAGES',
      ],
      mode: 'any',
    },
  },
  { prefix: '/app/boas-vindas', requirement: undefined },
  { prefix: '/app/suporte', requirement: undefined },
  {
    prefix: '/app/fluxo-de-atendimento',
    requirement: {
      permissions: [
        'SETTINGS_VIEW',
        'CONFIGURE_CONVERSATION_ROUTING',
        'CONFIGURE_AUTO_MESSAGES',
        'CONFIGURE_BUSINESS_HOURS',
      ],
      mode: 'any',
    },
  },
  { prefix: '/app/configuracoes', requirement: { permission: 'SETTINGS_VIEW' } },
  { prefix: '/app/papeis', requirement: { permission: 'MANAGE_USER_ROLES' } },
  { prefix: '/app/equipe', requirement: { permission: 'TEAM_VIEW' } },
  { prefix: '/app/instancias', requirement: { permission: 'INTEGRATIONS_VIEW' } },
  { prefix: '/app/bases-de-conhecimento', requirement: { permission: 'KNOWLEDGE_BASES_VIEW' } },
  { prefix: '/app/assistentes', requirement: { permission: 'ASSISTANTS_VIEW' } },
  { prefix: '/app/pipeline', requirement: { permission: 'PIPELINE_VIEW' } },
  { prefix: '/app/tags', requirement: { permission: 'TAGS_VIEW' } },
  { prefix: '/app/listas-de-contatos', requirement: { permission: 'LISTS_VIEW' } },
  { prefix: '/app/grupos', requirement: { permission: 'GROUPS_VIEW' } },
  { prefix: '/app/contatos', requirement: { permission: 'CONTACTS_VIEW' } },
  { prefix: '/app/disparos', requirement: { permission: 'CAMPAIGNS_VIEW' } },
  { prefix: '/app/crm', requirement: { permission: 'CRM_VIEW' } },
  { prefix: '/app/inbox', requirement: { permission: 'INBOX_VIEW' } },
  { prefix: '/app', requirement: { permission: 'DASHBOARD_VIEW' } },
];

export function canAccess(permissionMap: PermissionMap | undefined, permission?: PermissionKey) {
  if (!permission) {
    return true;
  }

  return Boolean(permissionMap?.[permission]);
}

export function canAccessRequirement(
  permissionMap: PermissionMap | undefined,
  requirement?: PermissionRequirement,
) {
  if (!requirement) {
    return true;
  }

  const permissions = requirement.permission
    ? [requirement.permission]
    : requirement.permissions ?? [];

  if (!permissions.length) {
    return true;
  }

  if (requirement.mode === 'all') {
    return permissions.every((permission) => canAccess(permissionMap, permission));
  }

  return permissions.some((permission) => canAccess(permissionMap, permission));
}

export function getRequiredPermissionForPath(pathname: string) {
  return ROUTE_PERMISSION_RULES.find((rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`))
    ?.requirement;
}

export function getFirstAccessibleAppPath(permissionMap: PermissionMap | undefined) {
  const preferredRoutes = [
    '/app/inbox',
    '/app/crm',
    '/app/disparos',
    '/app/contatos',
    '/app/listas-de-contatos',
    '/app/grupos',
    '/app/pipeline',
    '/app/tags',
    '/app/assistentes',
    '/app/bases-de-conhecimento',
    '/app/instancias',
    '/app/equipe',
    '/app/papeis',
    '/app/configuracoes',
    '/app/menu-interativo',
    '/app/horarios-de-funcionamento',
    '/app/fluxo-de-atendimento',
    '/app/desenvolvimento',
    '/app',
    '/app/boas-vindas',
    '/app/suporte',
  ].map((href) => ({
    href,
    requirement: ROUTE_PERMISSION_RULES.find((rule) => rule.prefix === href)
      ?.requirement,
  }));

  const firstMatch = preferredRoutes.find((route) =>
    canAccessRequirement(permissionMap, route.requirement),
  );
  return firstMatch?.href ?? '/app/suporte';
}

export function getRoleLabel(role?: string) {
  if (role === 'ADMIN') {
    return 'Administrador';
  }

  return 'Vendedor';
}
