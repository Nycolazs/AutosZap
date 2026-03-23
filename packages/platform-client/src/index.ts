import type {
  AiToolRecord,
  AssistantRecord,
  AuthMe,
  AuthMeExtended,
  AuthSession,
  CampaignSummary,
  ContactListRecord,
  ContactRecord,
  ConversationDetail,
  ConversationReminder,
  ConversationStatusSummary,
  ConversationSummary,
  CreateAiToolPayload,
  CreateAssistantPayload,
  CreateCampaignPayload,
  CreateContactListPayload,
  CreateContactPayload,
  CreateEmbeddedSignupPayload,
  CreateGroupPayload,
  CreateInstancePayload,
  CreateKnowledgeBasePayload,
  CreateKnowledgeDocumentPayload,
  CreateLeadPayload,
  CreateQuickMessagePayload,
  CreatePipelineStagePayload,
  CreateTeamMemberPayload,
  DashboardOverview,
  EmbeddedSignupConfigRecord,
  EmbeddedSignupInstanceRecord,
  ForgotPasswordPayload,
  GroupRecord,
  InstanceDiagnostics,
  InstanceRecord,
  KnowledgeBaseRecord,
  KnowledgeDocumentRecord,
  LeadDetail,
  LeadSummary,
  NotificationsResponse,
  PaginatedResponse,
  PermissionCatalogItem,
  PipelineRecord,
  PipelineStageRecord,
  PlatformReleasesManifest,
  QuickMessageRecord,
  RegisteredDevice,
  RegisterDevicePayload,
  RegisterPayload,
  ResetPasswordPayload,
  TagSummary,
  TeamMemberRecord,
  UpdateConversationPayload,
  UpdateTeamMemberPayload,
  WorkspaceConversationSettings,
} from '@autoszap/platform-types';

type FetchLike = typeof fetch;

type ClientConfig = {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null> | string | null;
  getRefreshToken?: () => Promise<string | null> | string | null;
  onSessionUpdate?: (session: AuthSession) => Promise<void> | void;
  onAuthFailure?: () => Promise<void> | void;
  fetchImplementation?: FetchLike;
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  auth?: boolean;
  body?: unknown;
  headers?: Record<string, string>;
};

export class PlatformApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: 'Resposta inválida recebida do servidor.' };
  }
}

export function createPlatformClient(config: ClientConfig) {
  const fetcher = config.fetchImplementation ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = options.auth === false ? null : await config.getAccessToken?.();
    const response = await fetcher(`${baseUrl}/api/${path.replace(/^\/+/, '')}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
      body:
        options.body === undefined || options.method === 'GET'
          ? undefined
          : JSON.stringify(options.body),
    });

    if (response.status === 401 && options.auth !== false) {
      const refreshToken = await config.getRefreshToken?.();

      if (refreshToken) {
        const refreshed = await request<AuthSession>('auth/refresh', {
          method: 'POST',
          auth: false,
          body: { refreshToken },
        });
        await config.onSessionUpdate?.(refreshed);

        return request<T>(path, options);
      }

      await config.onAuthFailure?.();
      throw new PlatformApiError('Sessão expirada.', 401);
    }

    if (!response.ok) {
      const payload = await parseJson(response);
      const message = Array.isArray(payload.message)
        ? payload.message.join(', ')
        : String(payload.message ?? 'Erro inesperado ao comunicar com a API.');
      throw new PlatformApiError(message, response.status);
    }

    if (response.status === 204) {
      return null as T;
    }

    return (await response.json()) as T;
  }

  return {
    login(email: string, password: string) {
      return request<AuthSession>('auth/login', {
        method: 'POST',
        auth: false,
        body: { email, password },
      });
    },
    me() {
      return request<AuthMe>('auth/me');
    },
    logout(refreshToken?: string | null) {
      return request<{ success: boolean }>('auth/logout', {
        method: 'POST',
        body: refreshToken ? { refreshToken } : {},
      });
    },
    listConversations(params?: { search?: string; status?: string }) {
      const query = new URLSearchParams();
      query.set('limit', '50');
      if (params?.search) query.set('search', params.search);
      if (params?.status) query.set('status', params.status);
      return request<PaginatedResponse<ConversationSummary>>(`conversations?${query.toString()}`);
    },
    listConversationSummary(params?: { search?: string }) {
      const query = new URLSearchParams();
      if (params?.search) query.set('search', params.search);

      const suffix = query.size ? `?${query.toString()}` : '';
      return request<ConversationStatusSummary>(`conversations/summary${suffix}`);
    },
    getConversation(conversationId: string) {
      return request<ConversationDetail>(`conversations/${conversationId}`);
    },
    resolveConversation(conversationId: string) {
      return request<ConversationDetail>(`conversations/${conversationId}/resolve`, {
        method: 'POST',
      });
    },
    closeConversation(conversationId: string) {
      return request<ConversationDetail>(`conversations/${conversationId}/close`, {
        method: 'POST',
      });
    },
    reopenConversation(conversationId: string) {
      return request<ConversationDetail>(`conversations/${conversationId}/reopen`, {
        method: 'POST',
      });
    },
    sendConversationMessage(conversationId: string, content: string) {
      return request(`messages`, {
        method: 'POST',
        body: { conversationId, content },
      });
    },
    addConversationNote(conversationId: string, content: string) {
      return request(`conversations/${conversationId}/notes`, {
        method: 'POST',
        body: { content },
      });
    },
    createReminder(conversationId: string, payload: { messageToSend: string; internalDescription?: string; remindAt: string }) {
      return request<ConversationReminder>(`conversations/${conversationId}/reminders`, {
        method: 'POST',
        body: payload,
      });
    },
    updateReminder(conversationId: string, reminderId: string, payload: { messageToSend: string; internalDescription?: string; remindAt: string }) {
      return request<ConversationReminder>(`conversations/${conversationId}/reminders/${reminderId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    completeReminder(conversationId: string, reminderId: string) {
      return request<ConversationReminder>(`conversations/${conversationId}/reminders/${reminderId}/complete`, {
        method: 'POST',
      });
    },
    cancelReminder(conversationId: string, reminderId: string) {
      return request<ConversationReminder>(`conversations/${conversationId}/reminders/${reminderId}/cancel`, {
        method: 'POST',
      });
    },
    listNotifications(limit = 20) {
      return request<NotificationsResponse>(`notifications?limit=${limit}`);
    },
    listLeads(params?: { search?: string }) {
      const query = new URLSearchParams();
      query.set('limit', '100');
      if (params?.search) {
        query.set('search', params.search);
      }

      return request<PaginatedResponse<LeadSummary>>(`leads?${query.toString()}`);
    },
    listCampaigns() {
      return request<CampaignSummary[]>('campaigns');
    },
    dashboardOverview() {
      return request<DashboardOverview>('dashboard');
    },
    listContacts(params?: { search?: string; page?: number; limit?: number }) {
      const query = new URLSearchParams();
      query.set('page', String(params?.page ?? 1));
      query.set('limit', String(params?.limit ?? 50));
      if (params?.search) {
        query.set('search', params.search);
      }

      return request<PaginatedResponse<ContactRecord>>(
        `contacts?${query.toString()}`,
      );
    },
    listTags() {
      return request<TagSummary[]>('tags');
    },
    createTag(payload: { name: string; color: string; description?: string }) {
      return request<TagSummary>('tags', {
        method: 'POST',
        body: payload,
      });
    },
    deleteTag(tagId: string) {
      return request<{ success?: boolean }>(`tags/${tagId}`, {
        method: 'DELETE',
      });
    },
    listTeam() {
      return request<TeamMemberRecord[]>('team');
    },
    listGroups() {
      return request<GroupRecord[]>('groups');
    },
    listContactLists() {
      return request<ContactListRecord[]>('lists');
    },
    listInstances() {
      return request<InstanceRecord[]>('instances');
    },
    syncInstance(instanceId: string) {
      return request(`instances/${instanceId}/sync`, {
        method: 'POST',
      });
    },
    testInstance(instanceId: string) {
      return request(`instances/${instanceId}/test`, {
        method: 'POST',
      });
    },
    getWorkspaceSettings() {
      return request<WorkspaceConversationSettings>('workspace-settings');
    },
    updateWorkspaceSettings(payload: Partial<WorkspaceConversationSettings>) {
      return request<WorkspaceConversationSettings>('workspace-settings', {
        method: 'PATCH',
        body: payload,
      });
    },
    sendCampaign(campaignId: string) {
      return request<{ success?: boolean }>(`campaigns/${campaignId}/send`, {
        method: 'POST',
      });
    },
    markNotificationRead(notificationId: string) {
      return request<{ success: boolean }>(`notifications/${notificationId}/read`, {
        method: 'POST',
      });
    },
    registerDevice(payload: RegisterDevicePayload) {
      return request<RegisteredDevice>('platform/devices/register', {
        method: 'POST',
        body: payload,
      });
    },
    unregisterDevice(installationId: string) {
      return request<{ success: boolean }>('platform/devices/unregister', {
        method: 'POST',
        body: { installationId },
      });
    },
    listPlatformReleases() {
      return request<PlatformReleasesManifest>('platform/releases', {
        auth: false,
      });
    },
    buildSseUrl(path: 'notifications/stream' | 'conversations/stream', accessToken: string) {
      return `${baseUrl}/api/${path}?accessToken=${encodeURIComponent(accessToken)}`;
    },

    // ── Auth (extended) ──────────────────────────────────────

    register(payload: RegisterPayload) {
      return request<AuthSession>('auth/register', {
        method: 'POST',
        auth: false,
        body: payload,
      });
    },
    forgotPassword(payload: ForgotPasswordPayload) {
      return request<{ success: boolean }>('auth/forgot-password', {
        method: 'POST',
        auth: false,
        body: payload,
      });
    },
    resetPassword(payload: ResetPasswordPayload) {
      return request<{ success: boolean }>('auth/reset-password', {
        method: 'POST',
        auth: false,
        body: payload,
      });
    },
    meExtended() {
      return request<AuthMeExtended>('auth/me');
    },
    switchCompany(companyId: string) {
      return request<AuthSession>('auth/switch-company', {
        method: 'POST',
        body: { companyId },
      });
    },

    // ── Contacts (CRUD) ─────────────────────────────────────

    getContact(contactId: string) {
      return request<ContactRecord>(`contacts/${contactId}`);
    },
    createContact(payload: CreateContactPayload) {
      return request<ContactRecord>('contacts', {
        method: 'POST',
        body: payload,
      });
    },
    updateContact(contactId: string, payload: Partial<CreateContactPayload>) {
      return request<ContactRecord>(`contacts/${contactId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    deleteContact(contactId: string) {
      return request<{ success?: boolean }>(`contacts/${contactId}`, {
        method: 'DELETE',
      });
    },

    // ── Tags (update) ───────────────────────────────────────

    updateTag(tagId: string, payload: Partial<{ name: string; color: string; description?: string }>) {
      return request<TagSummary>(`tags/${tagId}`, {
        method: 'PATCH',
        body: payload,
      });
    },

    // ── Groups (CRUD) ───────────────────────────────────────

    createGroup(payload: CreateGroupPayload) {
      return request<GroupRecord>('groups', {
        method: 'POST',
        body: payload,
      });
    },
    updateGroup(groupId: string, payload: Partial<CreateGroupPayload>) {
      return request<GroupRecord>(`groups/${groupId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    deleteGroup(groupId: string) {
      return request<{ success?: boolean }>(`groups/${groupId}`, {
        method: 'DELETE',
      });
    },

    // ── Contact Lists (CRUD) ────────────────────────────────

    createContactList(payload: CreateContactListPayload) {
      return request<ContactListRecord>('lists', {
        method: 'POST',
        body: payload,
      });
    },
    updateContactList(listId: string, payload: Partial<CreateContactListPayload>) {
      return request<ContactListRecord>(`lists/${listId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    deleteContactList(listId: string) {
      return request<{ success?: boolean }>(`lists/${listId}`, {
        method: 'DELETE',
      });
    },

    // ── Leads (CRUD) ────────────────────────────────────────

    getLead(leadId: string) {
      return request<LeadDetail>(`leads/${leadId}`);
    },
    createLead(payload: CreateLeadPayload) {
      return request<LeadSummary>('leads', {
        method: 'POST',
        body: payload,
      });
    },
    updateLead(leadId: string, payload: Partial<CreateLeadPayload>) {
      return request<LeadSummary>(`leads/${leadId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    reorderLead(leadId: string, payload: { stageId: string; order: number }) {
      return request<LeadSummary>(`leads/${leadId}/reorder`, {
        method: 'PATCH',
        body: payload,
      });
    },
    deleteLead(leadId: string) {
      return request<{ success?: boolean }>(`leads/${leadId}`, {
        method: 'DELETE',
      });
    },

    // ── Pipeline Stages ─────────────────────────────────────

    listPipelineStages() {
      return request<PipelineRecord>('pipeline-stages');
    },
    createPipelineStage(payload: CreatePipelineStagePayload) {
      return request<PipelineStageRecord>('pipeline-stages', {
        method: 'POST',
        body: payload,
      });
    },
    updatePipelineStage(stageId: string, payload: Partial<CreatePipelineStagePayload>) {
      return request<PipelineStageRecord>(`pipeline-stages/${stageId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    deletePipelineStage(stageId: string) {
      return request<{ success?: boolean }>(`pipeline-stages/${stageId}`, {
        method: 'DELETE',
      });
    },

    // ── Campaigns (CRUD) ────────────────────────────────────

    getCampaign(campaignId: string) {
      return request<CampaignSummary>(`campaigns/${campaignId}`);
    },
    createCampaign(payload: CreateCampaignPayload) {
      return request<CampaignSummary>('campaigns', {
        method: 'POST',
        body: payload,
      });
    },
    updateCampaign(campaignId: string, payload: Partial<CreateCampaignPayload>) {
      return request<CampaignSummary>(`campaigns/${campaignId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    deleteCampaign(campaignId: string) {
      return request<{ success?: boolean }>(`campaigns/${campaignId}`, {
        method: 'DELETE',
      });
    },

    // ── Team (CRUD) ─────────────────────────────────────────

    createTeamMember(payload: CreateTeamMemberPayload) {
      return request<TeamMemberRecord>('team', {
        method: 'POST',
        body: payload,
      });
    },
    updateTeamMember(memberId: string, payload: UpdateTeamMemberPayload) {
      return request<TeamMemberRecord>(`team/${memberId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    deleteTeamMember(memberId: string) {
      return request<{ success?: boolean }>(`team/${memberId}`, {
        method: 'DELETE',
      });
    },
    listPermissionCatalog() {
      return request<PermissionCatalogItem[]>('team/permissions/catalog');
    },

    // ── Instances (CRUD) ────────────────────────────────────

    getInstance(instanceId: string) {
      return request<InstanceRecord>(`instances/${instanceId}`);
    },
    getEmbeddedSignupConfig() {
      return request<EmbeddedSignupConfigRecord>('instances/embedded-signup-config');
    },
    createInstanceFromEmbeddedSignup(payload: CreateEmbeddedSignupPayload) {
      return request<EmbeddedSignupInstanceRecord>('instances/embedded-signup', {
        method: 'POST',
        body: payload,
      });
    },
    createInstance(payload: CreateInstancePayload) {
      return request<InstanceRecord>('instances', {
        method: 'POST',
        body: payload,
      });
    },
    updateInstance(instanceId: string, payload: Partial<CreateInstancePayload>) {
      return request<InstanceRecord>(`instances/${instanceId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    deleteInstance(instanceId: string) {
      return request<{ success?: boolean }>(`instances/${instanceId}`, {
        method: 'DELETE',
      });
    },
    getInstanceDiagnostics(instanceId: string) {
      return request<InstanceDiagnostics>(`instances/${instanceId}/diagnostics`);
    },
    connectInstance(instanceId: string) {
      return request(`instances/${instanceId}/connect`, { method: 'POST' });
    },
    disconnectInstance(instanceId: string) {
      return request(`instances/${instanceId}/disconnect`, { method: 'POST' });
    },

    // ── Assistants (CRUD) ───────────────────────────────────

    listAssistants() {
      return request<AssistantRecord[]>('assistants');
    },
    getAssistant(assistantId: string) {
      return request<AssistantRecord>(`assistants/${assistantId}`);
    },
    createAssistant(payload: CreateAssistantPayload) {
      return request<AssistantRecord>('assistants', {
        method: 'POST',
        body: payload,
      });
    },
    updateAssistant(assistantId: string, payload: Partial<CreateAssistantPayload>) {
      return request<AssistantRecord>(`assistants/${assistantId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    deleteAssistant(assistantId: string) {
      return request<{ success?: boolean }>(`assistants/${assistantId}`, {
        method: 'DELETE',
      });
    },

    // ── Knowledge Bases (CRUD) ──────────────────────────────

    listKnowledgeBases() {
      return request<KnowledgeBaseRecord[]>('knowledge-bases');
    },
    getKnowledgeBase(kbId: string) {
      return request<KnowledgeBaseRecord>(`knowledge-bases/${kbId}`);
    },
    createKnowledgeBase(payload: CreateKnowledgeBasePayload) {
      return request<KnowledgeBaseRecord>('knowledge-bases', {
        method: 'POST',
        body: payload,
      });
    },
    updateKnowledgeBase(kbId: string, payload: Partial<CreateKnowledgeBasePayload>) {
      return request<KnowledgeBaseRecord>(`knowledge-bases/${kbId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    deleteKnowledgeBase(kbId: string) {
      return request<{ success?: boolean }>(`knowledge-bases/${kbId}`, {
        method: 'DELETE',
      });
    },

    // ── Knowledge Documents ─────────────────────────────────

    listKnowledgeDocuments(knowledgeBaseId: string) {
      return request<KnowledgeDocumentRecord[]>(`knowledge-documents?knowledgeBaseId=${knowledgeBaseId}`);
    },
    createKnowledgeDocument(payload: CreateKnowledgeDocumentPayload) {
      return request<KnowledgeDocumentRecord>('knowledge-documents', {
        method: 'POST',
        body: payload,
      });
    },
    updateKnowledgeDocument(docId: string, payload: Partial<CreateKnowledgeDocumentPayload>) {
      return request<KnowledgeDocumentRecord>(`knowledge-documents/${docId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    deleteKnowledgeDocument(docId: string) {
      return request<{ success?: boolean }>(`knowledge-documents/${docId}`, {
        method: 'DELETE',
      });
    },

    // ── AI Tools (CRUD) ─────────────────────────────────────

    listAiTools() {
      return request<AiToolRecord[]>('ai-tools');
    },
    createAiTool(payload: CreateAiToolPayload) {
      return request<AiToolRecord>('ai-tools', {
        method: 'POST',
        body: payload,
      });
    },
    updateAiTool(toolId: string, payload: Partial<CreateAiToolPayload>) {
      return request<AiToolRecord>(`ai-tools/${toolId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    deleteAiTool(toolId: string) {
      return request<{ success?: boolean }>(`ai-tools/${toolId}`, {
        method: 'DELETE',
      });
    },

    // ── Quick Messages (CRUD) ───────────────────────────────

    listQuickMessages() {
      return request<QuickMessageRecord[]>('quick-messages');
    },
    createQuickMessage(payload: CreateQuickMessagePayload) {
      return request<QuickMessageRecord>('quick-messages', {
        method: 'POST',
        body: payload,
      });
    },
    updateQuickMessage(qmId: string, payload: Partial<CreateQuickMessagePayload>) {
      return request<QuickMessageRecord>(`quick-messages/${qmId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    deleteQuickMessage(qmId: string) {
      return request<{ success?: boolean }>(`quick-messages/${qmId}`, {
        method: 'DELETE',
      });
    },
    applyQuickMessage(qmId: string, payload: { conversationId: string; action: 'SEND_NOW' | 'EDIT_IN_INPUT' }) {
      return request(`quick-messages/${qmId}/apply`, {
        method: 'POST',
        body: payload,
      });
    },

    // ── Conversation (update) ───────────────────────────────

    updateConversation(conversationId: string, payload: UpdateConversationPayload) {
      return request<ConversationDetail>(`conversations/${conversationId}`, {
        method: 'PATCH',
        body: payload,
      });
    },

    // ── Profile / Workspace / Password ──────────────────────

    updateProfile(payload: { name?: string; title?: string }) {
      return request<Record<string, unknown>>('users/profile', {
        method: 'PATCH',
        body: payload,
      });
    },
    updateWorkspace(payload: { name?: string; companyName?: string }) {
      return request<Record<string, unknown>>('users/workspace', {
        method: 'PATCH',
        body: payload,
      });
    },
    changePassword(payload: { currentPassword: string; newPassword: string }) {
      return request<{ success: boolean }>('users/change-password', {
        method: 'PATCH',
        body: payload,
      });
    },

    // ── Dashboard Performance ───────────────────────────────

    dashboardPerformance(params?: { from?: string; to?: string }) {
      const query = new URLSearchParams();
      if (params?.from) query.set('from', params.from);
      if (params?.to) query.set('to', params.to);
      const suffix = query.size ? `?${query.toString()}` : '';
      return request<Record<string, unknown>>(`dashboard/performance${suffix}`);
    },
  };
}
