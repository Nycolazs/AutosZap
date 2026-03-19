import type {
  AuthMe,
  AuthSession,
  ContactListRecord,
  ContactRecord,
  DashboardOverview,
  ConversationDetail,
  ConversationReminder,
  ConversationStatusSummary,
  ConversationSummary,
  GroupRecord,
  InstanceRecord,
  LeadSummary,
  NotificationsResponse,
  PaginatedResponse,
  CampaignSummary,
  PlatformReleasesManifest,
  RegisteredDevice,
  RegisterDevicePayload,
  TagSummary,
  TeamMemberRecord,
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
  };
}
