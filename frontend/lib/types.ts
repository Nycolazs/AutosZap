export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: ApiMeta;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string | null;
}

export interface UserSummary {
  id: string;
  name: string;
  email?: string;
  role?: string;
  normalizedRole?: 'ADMIN' | 'SELLER';
  title?: string | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  entityType?: string | null;
  entityId?: string | null;
  linkHref?: string | null;
  metadata?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
}

export interface PermissionCatalogEntry {
  key: string;
  label: string;
  description: string;
  category: 'Telas' | 'Acoes' | 'Analise' | 'Configuracoes';
}

export interface TeamMember {
  id: string;
  userId?: string | null;
  name: string;
  email: string;
  title?: string | null;
  role: string;
  normalizedRole: 'ADMIN' | 'SELLER';
  status: string;
  lastLoginAt?: string | null;
  permissions: Record<string, boolean>;
  grantedPermissions: string[];
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  source?: string;
  lastInteractionAt?: string | null;
  notes?: string | null;
  tags?: Tag[];
  timeline?: Array<{ type: string; title: string; date: string }>;
}

export interface ConversationMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'SYSTEM';
  messageType: string;
  content: string;
  metadata?: {
    mediaId?: string;
    mimeType?: string | null;
    fileName?: string | null;
    caption?: string | null;
    animated?: boolean;
    voice?: boolean;
    quotedExternalMessageId?: string | null;
    quote?: {
      messageId?: string | null;
      externalMessageId?: string | null;
      contentPreview?: string | null;
      messageType?: string | null;
      direction?: 'INBOUND' | 'OUTBOUND' | 'SYSTEM' | null;
      createdAt?: string | null;
      from?: string | null;
    } | null;
    templateName?: string | null;
    languageCode?: string | null;
    windowClosedTemplateReply?: boolean;
    headerParameters?: string[];
    bodyParameters?: string[];
  } | null;
  status: string;
  createdAt: string;
}

export interface ConversationReminder {
  id: string;
  messageToSend: string;
  internalDescription?: string | null;
  remindAt: string;
  status: 'PENDING' | 'NOTIFIED' | 'COMPLETED' | 'CANCELED';
  notifiedAt?: string | null;
  completedAt?: string | null;
  canceledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: UserSummary;
  completedBy?: UserSummary | null;
}

export interface QuickMessage {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuickMessageApplyResponse {
  action: 'SEND_NOW' | 'EDIT_IN_INPUT';
  content: string;
  message?: ConversationMessage;
}

export interface Conversation {
  id: string;
  status: string;
  closeReason?: 'MANUAL' | 'UNANSWERED' | null;
  ownership: string;
  unreadCount: number;
  createdAt: string;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  contact: Contact;
  assignedUser?: UserSummary | null;
  tags: Tag[];
  messages?: ConversationMessage[];
  notes?: Array<{ id: string; content: string; author: UserSummary; createdAt: string }>;
  reminders?: ConversationReminder[];
  waitingSince?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
}

export interface ConversationStatusSummary {
  ALL: number;
  NEW: number;
  IN_PROGRESS: number;
  WAITING: number;
  RESOLVED: number;
  CLOSED: number;
}

export interface Lead {
  id: string;
  name: string;
  company?: string | null;
  value: string;
  source: string;
  order: number;
  notes?: string | null;
  stage: { id: string; name: string; color: string; order: number };
  assignedTo?: UserSummary | null;
  tags: Tag[];
}

export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
  probability: number;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  audienceType: string;
  message: string;
  status: string;
  scheduledAt?: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  mediaUrl?: string | null;
  hasMedia?: boolean;
}

export interface Assistant {
  id: string;
  name: string;
  description?: string | null;
  objective?: string | null;
  systemPrompt: string;
  temperature: number;
  model: string;
  status: string;
  knowledgeBases: Array<{ id: string; name: string }>;
  tools: Array<{ id: string; name: string; type: string }>;
}

export interface Instance {
  id: string;
  name: string;
  provider: string;
  status: string;
  mode: string;
  appId?: string | null;
  phoneNumber?: string | null;
  businessAccountId?: string | null;
  phoneNumberId?: string | null;
  accessTokenMasked?: string | null;
  webhookVerifyTokenMasked?: string | null;
  appSecretMasked?: string | null;
  lastSyncAt?: string | null;
}

export interface EmbeddedSignupConfig {
  appId: string;
  configurationId: string;
  graphApiVersion: string;
  callbackUri?: string | null;
}

export interface CreateEmbeddedSignupPayload {
  code: string;
  phoneNumberId: string;
  wabaId: string;
  name?: string;
}

export interface EmbeddedSignupInstance extends Instance {
  embeddedSignup: {
    reusedExistingInstance: boolean;
    sync: {
      success: boolean;
      message: string;
    };
    subscribe: {
      success: boolean;
      message: string;
    };
  };
}

export interface DevelopmentOverview {
  environment: {
    nodeEnv: string;
    metaMode: string;
    backendPublicUrl?: string | null;
    productionCallbackUrl?: string | null;
    healthUrl?: string | null;
    docsUrl?: string | null;
    webhookPath: string;
    hasMetaCredentials: boolean;
    signatureValidationEnabled: boolean;
  };
  local: {
    frontendUrl: string;
    backendUrl: string;
    tunnelUrl?: string | null;
    callbackUrl?: string | null;
    ready: boolean;
    notes?: string | null;
  };
  webhook: {
    verifyToken?: string | null;
    callbackPath: string;
    hasVerifyToken: boolean;
  };
  checklist: {
    hasMetaCredentials: boolean;
    hasInstance: boolean;
    hasProductionUrl: boolean;
    hasTunnel: boolean;
    hasVerifyToken: boolean;
    canRouteLocal: boolean;
    canRouteProduction: boolean;
  };
  commands: {
    startStack: string;
    seed: string;
    startFrontend: string;
    startTunnel: string;
  };
  selectedInstanceId?: string | null;
  instances: Array<Pick<Instance, 'id' | 'name' | 'status' | 'mode' | 'phoneNumber' | 'businessAccountId' | 'phoneNumberId' | 'lastSyncAt'>>;
}

export interface WhatsAppTemplateSummary {
  id?: string;
  name: string;
  language?: string;
  status?: string;
  category?: string;
  qualityScore?: string | null;
  lastUpdatedTime?: string | null;
}

export interface WhatsAppInstanceDiagnostics {
  healthy: boolean;
  simulated: boolean;
  detail: string;
  phoneNumber?: {
    id?: string | null;
    displayPhoneNumber?: string | null;
    verifiedName?: string | null;
    qualityRating?: string | null;
    codeVerificationStatus?: string | null;
    nameStatus?: string | null;
  };
  businessProfile?: {
    about?: string | null;
    description?: string | null;
    email?: string | null;
    websites?: string[];
    address?: string | null;
    vertical?: string | null;
    profilePictureUrl?: string | null;
  } | null;
  subscribedApps: Array<{
    appId?: string;
    appName?: string;
    link?: string;
  }>;
  templates: WhatsAppTemplateSummary[];
}

export interface WhatsAppProfilePictureUpdateResult {
  simulated: boolean;
  detail: string;
  phoneNumber?: {
    id?: string | null;
    displayPhoneNumber?: string | null;
    verifiedName?: string | null;
    qualityRating?: string | null;
    codeVerificationStatus?: string | null;
    nameStatus?: string | null;
  };
  businessProfile?: WhatsAppInstanceDiagnostics['businessProfile'];
  raw?: Record<string, unknown>;
}

export type WhatsAppBusinessProfileOverview = WhatsAppProfilePictureUpdateResult;

export interface DashboardOverview {
  metrics: {
    activeConversations: number;
    totalContacts: number;
    responseRate: number;
    sentCampaigns: number;
    crmLeads: number;
    quickMessagesUsed: number;
    assignmentAutoMessagesSent: number;
  };
  chart: Array<{ label: string; value: number }>;
  recentActivity: Array<{
    id: string;
    entityType: string;
    entityId?: string;
    action: string;
    actionLabel?: string;
    entityLabel?: string;
    actorName?: string;
    actorEmail?: string | null;
    detail?: string | null;
    createdAt: string;
  }>;
  notifications: NotificationItem[];
  shortcuts: Array<{ title: string; href: string }>;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unreadCount: number;
}

export interface DashboardPerformance {
  period: {
    from: string;
    to: string;
  };
  totals: {
    resolvedCount: number;
    closedCount: number;
    assignedCount: number;
    avgFirstResponseMs: number | null;
    avgResolutionMs: number | null;
  };
  chart: Array<{ userId: string; label: string; value: number }>;
  ranking: Array<{
    userId: string;
    name: string;
    resolvedCount: number;
    closedCount: number;
    assignedCount: number;
    conversionRate: number;
    avgFirstResponseMs: number | null;
    avgResolutionMs: number | null;
  }>;
}

export interface WorkspaceConversationSettings {
  id: string;
  workspaceId: string;
  inactivityTimeoutMinutes: number;
  waitingAutoCloseTimeoutMinutes?: number | null;
  timezone: string;
  autoReplyCooldownMinutes: number;
  sendBusinessHoursAutoReply: boolean;
  businessHoursAutoReply?: string | null;
  sendOutOfHoursAutoReply: boolean;
  outOfHoursAutoReply?: string | null;
  sendResolvedAutoReply: boolean;
  resolvedAutoReplyMessage?: string | null;
  sendClosedAutoReply: boolean;
  closedAutoReplyMessage?: string | null;
  sendAssignmentAutoReply: boolean;
  assignmentAutoReplyMessage?: string | null;
  sendWindowClosedTemplateReply: boolean;
  windowClosedTemplateName?: string | null;
  windowClosedTemplateLanguageCode?: string | null;
  businessHours: Array<{
    id: string;
    weekday: number;
    isOpen: boolean;
    startTime?: string | null;
    endTime?: string | null;
  }>;
}

export interface AuthMeResponse {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: string;
  normalizedRole: 'ADMIN' | 'SELLER';
  title?: string | null;
  status: string;
  permissions: string[];
  permissionMap: Record<string, boolean>;
  workspace: {
    id: string;
    name: string;
    slug: string;
    companyName: string;
  };
  companies?: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    tenantRole: string;
    isDefault: boolean;
  }>;
  platform?: {
    role?: string | null;
    isPlatformAdmin: boolean;
  };
  companyId?: string;
  membershipId?: string;
  globalUserId?: string;
}

export interface PlatformDashboardResponse {
  totals: {
    companies: number;
    activeCompanies: number;
    inactiveCompanies: number;
    globalUsers: number;
    blockedUsers: number;
  };
  provisioning: {
    total: number;
    byStatus: Record<string, number>;
    recentJobs: Array<{
      id: string;
      companyId: string;
      status: string;
      errorMessage?: string | null;
      createdAt: string;
      finishedAt?: string | null;
      company: {
        id: string;
        name: string;
        slug: string;
      };
    }>;
  };
  securityAlerts: {
    blockedUsers: number;
    failedProvisioningJobs: number;
    recentFailures: Array<{
      id: string;
      companyId: string;
      companyName: string;
      errorMessage?: string | null;
      createdAt: string;
    }>;
  };
}

export interface PlatformCompany {
  id: string;
  workspaceId: string;
  name: string;
  legalName?: string | null;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  tenantDatabase?: {
    id: string;
    databaseName: string;
    status: string;
    lastMigrationAt?: string | null;
    provisionedAt?: string | null;
  } | null;
  memberships?: Array<{ id: string }>;
}

export interface PlatformGlobalUser {
  id: string;
  name: string;
  email: string;
  status: string;
  platformRole?: string | null;
  createdAt: string;
  memberships: Array<{
    id: string;
    companyId: string;
    tenantRole: string;
    status: string;
    isDefault: boolean;
    company: {
      id: string;
      name: string;
      slug: string;
      status: string;
    };
  }>;
}

export interface PlatformAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export type PlatformLeadInterestStatus =
  | 'PENDING'
  | 'CONTACTED'
  | 'CONVERTED'
  | 'ARCHIVED';

export interface PlatformLeadInterest {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  companyName?: string | null;
  attendantsCount?: number | null;
  notes?: string | null;
  source?: string | null;
  status: PlatformLeadInterestStatus;
  contactedAt?: string | null;
  convertedAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformMeResponse {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  status: string;
  platformRole?: string | null;
  isPlatformAdmin: boolean;
  memberships: Array<{
    id: string;
    companyId: string;
    tenantRole: string;
    status: string;
    isDefault: boolean;
    company: {
      id: string;
      name: string;
      slug: string;
      status: string;
    };
  }>;
}
