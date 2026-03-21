export type NormalizedRole = 'ADMIN' | 'SELLER';

export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export type ConversationStatus =
  | 'NEW'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'RESOLVED'
  | 'CLOSED';

export type ConversationCloseReason =
  | 'USER_CLOSED'
  | 'UNANSWERED'
  | 'SYSTEM_TIMEOUT'
  | string;

export type MessageDirection = 'INBOUND' | 'OUTBOUND' | 'SYSTEM';

export type ReminderStatus = 'PENDING' | 'NOTIFIED' | 'COMPLETED' | 'CANCELED';

export type DevicePlatform =
  | 'IOS'
  | 'ANDROID'
  | 'WINDOWS'
  | 'MACOS'
  | 'WEB';

export type DeviceProvider = 'EXPO' | 'DESKTOP_LOCAL' | 'WEB';

export type ReleaseChannel = 'production' | 'preview' | 'internal';

export type ReleasePlatform = 'android' | 'windows' | 'macos';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  workspaceId: string;
}

export interface WorkspaceSummary {
  id?: string;
  name: string;
  slug: string;
  companyName?: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  workspace?: WorkspaceSummary;
}

export interface AuthMe {
  id: string;
  name: string;
  email: string;
  role: string;
  normalizedRole: NormalizedRole;
  title?: string | null;
  status: string;
  permissions: string[];
  permissionMap: Record<string, boolean>;
  workspace: WorkspaceSummary;
}

export interface ContactSummary {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
}

export interface TagSummary {
  id: string;
  name: string;
  color?: string | null;
}

export interface UserSummary {
  id: string;
  name: string;
  role?: string;
  normalizedRole?: string;
}

export interface ConversationMessage {
  id: string;
  direction: MessageDirection;
  messageType: string;
  content: string;
  status?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface ConversationReminder {
  id: string;
  messageToSend: string;
  internalDescription?: string | null;
  remindAt: string;
  status: ReminderStatus;
  createdAt: string;
  notifiedAt?: string | null;
  completedAt?: string | null;
  canceledAt?: string | null;
  createdBy: {
    id: string;
    name: string;
  };
  completedBy?: {
    id: string;
    name: string;
  } | null;
}

export interface ConversationSummary {
  id: string;
  status: ConversationStatus;
  closeReason?: ConversationCloseReason | null;
  unreadCount: number;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  contact: ContactSummary;
  assignedUser?: UserSummary | null;
  tags: TagSummary[];
}

export interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
  reminders?: ConversationReminder[];
  notes?: Array<{
    id: string;
    content: string;
    createdAt: string;
    author: {
      id: string;
      name: string;
    };
  }>;
}

export interface LeadSummary {
  id: string;
  name: string;
  company?: string | null;
  value: string;
  order: number;
  stage: {
    id: string;
    name: string;
    color?: string | null;
    order: number;
  };
  assignedTo?: UserSummary | null;
}

export interface CampaignSummary {
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
  hasMedia?: boolean;
}

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

export interface ContactRecord {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  source?: string;
  notes?: string | null;
  lastInteractionAt?: string | null;
  tags?: TagSummary[];
}

export interface TeamMemberRecord {
  id: string;
  userId?: string | null;
  name: string;
  email: string;
  title?: string | null;
  role: string;
  normalizedRole: string;
  status: string;
  lastLoginAt?: string | null;
}

export interface GroupRecord {
  id: string;
  name: string;
  description?: string | null;
  contactCount?: number;
  createdAt?: string;
}

export interface ContactListRecord {
  id: string;
  name: string;
  description?: string | null;
  contactCount?: number;
  createdAt?: string;
}

export interface InstanceRecord {
  id: string;
  name: string;
  provider: string;
  status: string;
  mode: string;
  appId?: string | null;
  phoneNumber?: string | null;
  businessAccountId?: string | null;
  phoneNumberId?: string | null;
  lastSyncAt?: string | null;
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

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: NotificationSeverity;
  linkHref?: string | null;
  metadata?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unreadCount: number;
}

export interface ConversationStatusSummary {
  ALL: number;
  NEW: number;
  IN_PROGRESS: number;
  WAITING: number;
  RESOLVED: number;
  CLOSED: number;
}

export interface RegisterDevicePayload {
  installationId: string;
  platform: DevicePlatform;
  provider: DeviceProvider;
  pushToken?: string;
  deviceName?: string;
  osVersion?: string;
  appVersion?: string;
  buildNumber?: string;
}

export interface RegisteredDevice {
  id: string;
  installationId: string;
  platform: DevicePlatform;
  provider: DeviceProvider;
  pushToken?: string | null;
  deviceName?: string | null;
  osVersion?: string | null;
  appVersion?: string | null;
  buildNumber?: string | null;
  lastSeenAt: string;
}

export interface PlatformReleaseArtifact {
  id: string;
  platform: ReleasePlatform;
  label: string;
  version: string;
  buildNumber: string;
  channel: ReleaseChannel;
  url: string;
  fileSizeMb?: number | null;
  notes?: string | null;
  minimumOsVersion?: string | null;
  qrCodeUrl?: string | null;
  checksum?: string | null;
  updatedAt: string;
}

export interface PlatformReleasesManifest {
  generatedAt: string;
  supportEmail?: string | null;
  documentationUrl?: string | null;
  artifacts: PlatformReleaseArtifact[];
}

export interface ReleaseLookupResult extends PlatformReleasesManifest {
  recommended?: PlatformReleaseArtifact | null;
}

// ── Assistants ──────────────────────────────────────────────

export type AssistantStatus = 'ACTIVE' | 'INACTIVE' | 'DRAFT';
export type EntityStatus = 'ACTIVE' | 'INACTIVE';

export interface AssistantRecord {
  id: string;
  name: string;
  description?: string | null;
  objective?: string | null;
  systemPrompt: string;
  temperature: number;
  model: string;
  status: AssistantStatus;
  knowledgeBases?: Array<{ id: string; name: string }>;
  tools?: Array<{ id: string; name: string; type: string }>;
  createdAt?: string;
}

export interface CreateAssistantPayload {
  name: string;
  description?: string;
  objective?: string;
  systemPrompt: string;
  temperature: number;
  model: string;
  status?: AssistantStatus;
  knowledgeBaseIds?: string[];
  toolIds?: string[];
}

// ── Knowledge Bases ─────────────────────────────────────────

export type KnowledgeBaseType = 'MANUAL' | 'URL' | 'FILE';
export type KnowledgeDocumentType = 'TEXT' | 'URL' | 'FAQ';

export interface KnowledgeBaseRecord {
  id: string;
  name: string;
  description?: string | null;
  type: KnowledgeBaseType;
  status: EntityStatus;
  documentCount?: number;
  createdAt?: string;
}

export interface CreateKnowledgeBasePayload {
  name: string;
  description?: string;
  type: KnowledgeBaseType;
  status?: EntityStatus;
}

export interface KnowledgeDocumentRecord {
  id: string;
  knowledgeBaseId: string;
  title: string;
  type: KnowledgeDocumentType;
  sourceUrl?: string | null;
  content: string;
  status: EntityStatus;
  createdAt?: string;
}

export interface CreateKnowledgeDocumentPayload {
  knowledgeBaseId: string;
  title: string;
  type: KnowledgeDocumentType;
  sourceUrl?: string;
  content: string;
  status?: EntityStatus;
}

// ── AI Tools ────────────────────────────────────────────────

export interface AiToolRecord {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  endpoint?: string | null;
  action?: string | null;
  status: EntityStatus;
  config?: Record<string, unknown> | null;
  createdAt?: string;
}

export interface CreateAiToolPayload {
  name: string;
  description?: string;
  type: string;
  endpoint?: string;
  action?: string;
  status?: EntityStatus;
  config?: Record<string, unknown>;
}

// ── Quick Messages ──────────────────────────────────────────

export interface QuickMessageRecord {
  id: string;
  title: string;
  content: string;
  createdAt?: string;
}

export interface CreateQuickMessagePayload {
  title: string;
  content: string;
}

// ── Pipeline Stages ─────────────────────────────────────────

export interface PipelineRecord {
  id: string;
  name: string;
  stages: PipelineStageRecord[];
}

export interface PipelineStageRecord {
  id: string;
  name: string;
  color: string;
  order: number;
  probability: number;
}

export interface CreatePipelineStagePayload {
  pipelineId: string;
  name: string;
  color: string;
  order: number;
  probability: number;
}

// ── Leads (extended) ────────────────────────────────────────

export interface LeadDetail extends LeadSummary {
  contactId?: string | null;
  source?: string | null;
  notes?: string | null;
  tags?: TagSummary[];
  createdAt?: string;
}

export interface CreateLeadPayload {
  pipelineId: string;
  stageId: string;
  contactId?: string;
  assignedToId?: string;
  name: string;
  company?: string;
  source?: string;
  value: string;
  order?: number;
  notes?: string;
  tagIds?: string[];
}

// ── Campaigns (extended) ────────────────────────────────────

export interface CreateCampaignPayload {
  name: string;
  description?: string;
  audienceType: string;
  targetConfig: Record<string, unknown>;
  message: string;
  scheduledAt?: string;
  status?: string;
  instanceId?: string;
}

// ── Contacts (payload) ─────────────────────────────────────

export interface CreateContactPayload {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  source?: string;
  notes?: string;
  tagIds?: string[];
}

// ── Team (payloads) ─────────────────────────────────────────

export interface CreateTeamMemberPayload {
  name: string;
  email: string;
  title?: string;
  role: string;
  status?: string;
  password?: string;
  confirmPassword?: string;
}

export interface UpdateTeamMemberPayload {
  name?: string;
  email?: string;
  title?: string;
  role?: string;
  status?: string;
  password?: string;
  confirmPassword?: string;
}

// ── Instances (payloads) ────────────────────────────────────

export interface CreateInstancePayload {
  name: string;
  provider?: string;
  status?: string;
  mode?: string;
  appId?: string;
  phoneNumber?: string;
  businessAccountId?: string;
  phoneNumberId?: string;
  accessToken?: string;
  webhookVerifyToken?: string;
  appSecret?: string;
}

export interface InstanceDiagnostics {
  healthy: boolean;
  simulated: boolean;
  detail: string;
  phoneNumber?: Record<string, unknown>;
  businessProfile?: Record<string, unknown>;
  subscribedApps?: Array<{ appId: string; appName: string; link: string }>;
  templates?: Array<{ name: string; status: string; language: string }>;
}

// ── Auth (extended) ─────────────────────────────────────────

export interface AuthMeExtended extends AuthMe {
  companies?: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    tenantRole: string;
    isDefault: boolean;
  }>;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  companyName: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

// ── Groups & Lists (payloads) ───────────────────────────────

export interface CreateGroupPayload {
  name: string;
  description?: string;
}

export interface CreateContactListPayload {
  name: string;
  description?: string;
}

// ── Conversation (extended payloads) ────────────────────────

export interface UpdateConversationPayload {
  assignedUserId?: string | null;
  tagIds?: string[];
}

// ── Permission Catalog ──────────────────────────────────────

export interface PermissionCatalogItem {
  key: string;
  label: string;
  description?: string;
  group?: string;
}
