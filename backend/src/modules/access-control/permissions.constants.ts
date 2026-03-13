import { PermissionKey, Role } from '@prisma/client';

export type NormalizedRole = 'ADMIN' | 'SELLER';

export type PermissionCatalogEntry = {
  key: PermissionKey;
  label: string;
  description: string;
  category: 'Telas' | 'Acoes' | 'Analise' | 'Configuracoes';
};

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  {
    key: PermissionKey.DASHBOARD_VIEW,
    label: 'Dashboard',
    description: 'Acessar a visão geral da operação.',
    category: 'Telas',
  },
  {
    key: PermissionKey.REPORTS_VIEW,
    label: 'Relatórios',
    description: 'Acessar relatórios detalhados da operação.',
    category: 'Analise',
  },
  {
    key: PermissionKey.VIEW_METRICS,
    label: 'Ver métricas',
    description: 'Visualizar indicadores e ranking de performance.',
    category: 'Analise',
  },
  {
    key: PermissionKey.INBOX_VIEW,
    label: 'Inbox',
    description: 'Visualizar e atuar nas conversas do inbox.',
    category: 'Telas',
  },
  {
    key: PermissionKey.CRM_VIEW,
    label: 'CRM',
    description: 'Acessar o pipeline e os leads da empresa.',
    category: 'Telas',
  },
  {
    key: PermissionKey.CONTACTS_VIEW,
    label: 'Contatos',
    description: 'Consultar a base de contatos.',
    category: 'Telas',
  },
  {
    key: PermissionKey.CONTACTS_EDIT,
    label: 'Editar contatos',
    description: 'Criar, editar e remover contatos.',
    category: 'Acoes',
  },
  {
    key: PermissionKey.CAMPAIGNS_VIEW,
    label: 'Campanhas',
    description: 'Acessar disparos e campanhas.',
    category: 'Telas',
  },
  {
    key: PermissionKey.CAMPAIGNS_MANAGE,
    label: 'Gerenciar campanhas',
    description: 'Criar, editar, enviar e remover campanhas.',
    category: 'Acoes',
  },
  {
    key: PermissionKey.LISTS_VIEW,
    label: 'Listas',
    description: 'Visualizar listas de contatos.',
    category: 'Telas',
  },
  {
    key: PermissionKey.GROUPS_VIEW,
    label: 'Grupos',
    description: 'Visualizar grupos de contatos.',
    category: 'Telas',
  },
  {
    key: PermissionKey.TAGS_VIEW,
    label: 'Tags',
    description: 'Visualizar e associar tags.',
    category: 'Telas',
  },
  {
    key: PermissionKey.PIPELINE_VIEW,
    label: 'Pipeline',
    description: 'Acessar estrutura do pipeline comercial.',
    category: 'Telas',
  },
  {
    key: PermissionKey.ASSISTANTS_VIEW,
    label: 'Assistentes',
    description: 'Acessar assistentes do workspace.',
    category: 'Telas',
  },
  {
    key: PermissionKey.KNOWLEDGE_BASES_VIEW,
    label: 'Bases de conhecimento',
    description: 'Acessar bases e documentos.',
    category: 'Telas',
  },
  {
    key: PermissionKey.AI_TOOLS_VIEW,
    label: 'Ferramentas de IA',
    description: 'Acessar ferramentas de IA da workspace.',
    category: 'Telas',
  },
  {
    key: PermissionKey.INTEGRATIONS_VIEW,
    label: 'Integrações',
    description: 'Acessar instâncias e integrações.',
    category: 'Telas',
  },
  {
    key: PermissionKey.SETTINGS_VIEW,
    label: 'Configurações',
    description: 'Acessar a área de configurações do workspace.',
    category: 'Configuracoes',
  },
  {
    key: PermissionKey.TEAM_VIEW,
    label: 'Equipe',
    description: 'Visualizar a gestão de equipe e perfis.',
    category: 'Telas',
  },
  {
    key: PermissionKey.EXPORT_DATA,
    label: 'Exportar dados',
    description: 'Exportar informações e relatórios.',
    category: 'Acoes',
  },
  {
    key: PermissionKey.TRANSFER_CONVERSATION,
    label: 'Transferir conversa',
    description: 'Transferir o atendimento para outro vendedor.',
    category: 'Acoes',
  },
  {
    key: PermissionKey.REOPEN_CONVERSATION,
    label: 'Reabrir conversa',
    description: 'Reabrir conversas resolvidas ou encerradas.',
    category: 'Acoes',
  },
  {
    key: PermissionKey.RESOLVE_CONVERSATION,
    label: 'Resolver ticket',
    description: 'Marcar atendimento como resolvido com sucesso.',
    category: 'Acoes',
  },
  {
    key: PermissionKey.CLOSE_CONVERSATION,
    label: 'Encerrar ticket',
    description: 'Encerrar atendimento sem conversão.',
    category: 'Acoes',
  },
  {
    key: PermissionKey.CONFIGURE_CONVERSATION_ROUTING,
    label: 'Configurar fila',
    description: 'Configurar timeout e regras de liberação do atendimento.',
    category: 'Configuracoes',
  },
  {
    key: PermissionKey.CONFIGURE_AUTO_MESSAGES,
    label: 'Configurar mensagens automáticas',
    description: 'Editar mensagens automáticas do sistema.',
    category: 'Configuracoes',
  },
  {
    key: PermissionKey.CONFIGURE_BUSINESS_HOURS,
    label: 'Configurar horário de funcionamento',
    description: 'Editar dias, horários e timezone da empresa.',
    category: 'Configuracoes',
  },
  {
    key: PermissionKey.MANAGE_TEAM,
    label: 'Gerenciar equipe',
    description: 'Criar, editar, desativar e remover membros.',
    category: 'Configuracoes',
  },
  {
    key: PermissionKey.MANAGE_USER_ROLES,
    label: 'Gerenciar papéis',
    description: 'Promover e rebaixar usuários entre admin e vendedor.',
    category: 'Configuracoes',
  },
  {
    key: PermissionKey.MANAGE_USER_PERMISSIONS,
    label: 'Gerenciar permissões',
    description: 'Configurar permissões granulares por usuário.',
    category: 'Configuracoes',
  },
  {
    key: PermissionKey.DEVELOPMENT_VIEW,
    label: 'Desenvolvimento',
    description: 'Acessar recursos internos de desenvolvimento.',
    category: 'Telas',
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_CATALOG.map(
  (permission) => permission.key,
);

export const DEFAULT_SELLER_PERMISSIONS = new Set<PermissionKey>([
  PermissionKey.INBOX_VIEW,
  PermissionKey.CRM_VIEW,
  PermissionKey.CONTACTS_VIEW,
  PermissionKey.CAMPAIGNS_VIEW,
  PermissionKey.LISTS_VIEW,
  PermissionKey.GROUPS_VIEW,
  PermissionKey.TAGS_VIEW,
  PermissionKey.PIPELINE_VIEW,
  PermissionKey.ASSISTANTS_VIEW,
  PermissionKey.KNOWLEDGE_BASES_VIEW,
  PermissionKey.AI_TOOLS_VIEW,
]);

export function normalizeRole(role: Role): NormalizedRole {
  return role === 'ADMIN' ? 'ADMIN' : 'SELLER';
}

export function isAdminRole(role: Role): boolean {
  return normalizeRole(role) === 'ADMIN';
}
