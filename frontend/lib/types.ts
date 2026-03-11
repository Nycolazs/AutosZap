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
  title?: string | null;
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
  } | null;
  status: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  status: string;
  ownership: string;
  unreadCount: number;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  contact: Contact;
  assignedUser?: UserSummary | null;
  tags: Tag[];
  messages?: ConversationMessage[];
  notes?: Array<{ id: string; content: string; author: UserSummary; createdAt: string }>;
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
  phoneNumber?: string | null;
  businessAccountId?: string | null;
  phoneNumberId?: string | null;
  accessTokenMasked?: string | null;
  webhookVerifyTokenMasked?: string | null;
  appSecretMasked?: string | null;
  lastSyncAt?: string | null;
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
  subscribedApps: Array<{
    appId?: string;
    appName?: string;
    link?: string;
  }>;
  templates: WhatsAppTemplateSummary[];
}

export interface DashboardOverview {
  metrics: {
    activeConversations: number;
    totalContacts: number;
    responseRate: number;
    sentCampaigns: number;
    crmLeads: number;
  };
  chart: Array<{ label: string; value: number }>;
  recentActivity: Array<{ id: string; entityType: string; action: string; createdAt: string }>;
  notifications: Array<{ id: string; title: string; body: string; type: string; createdAt: string }>;
  shortcuts: Array<{ title: string; href: string }>;
}
