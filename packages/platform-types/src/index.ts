export type NormalizedRole = 'ADMIN' | 'SELLER';

export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export type ConversationStatus =
  | 'NEW'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'RESOLVED'
  | 'CLOSED';

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
