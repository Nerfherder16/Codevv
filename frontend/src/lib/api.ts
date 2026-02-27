const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('bh-token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  orgs: {
    list: () => request<import('../types').Organization[]>('/orgs/me'),
    get: (orgId: string) => request<import('../types').Organization>(`/orgs/${orgId}`),
    create: (data: { name: string; slug: string; claude_auth_mode?: string; default_persona?: string }) =>
      request<import('../types').Organization>('/orgs', { method: 'POST', body: JSON.stringify(data) }),
    update: (orgId: string, data: Partial<import('../types').Organization>) =>
      request<import('../types').Organization>(`/orgs/${orgId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    members: (orgId: string) => request<import('../types').OrgMember[]>(`/orgs/${orgId}/members`),
    invite: (orgId: string, data: { email: string; role: string; persona: string }) =>
      request<import('../types').OrgMember>(`/orgs/${orgId}/invite`, { method: 'POST', body: JSON.stringify(data) }),
    removeMember: (orgId: string, memberId: string) =>
      request<void>(`/orgs/${orgId}/members/${memberId}`, { method: 'DELETE' }),
    getInvite: (token: string) => request<import('../types').OrgInviteDetail>(`/orgs/invites/${token}`),
    acceptInvite: (token: string) =>
      request<import('../types').OrgMember>(`/orgs/invites/${token}/accept`, { method: 'POST' }),
    claudeStatus: (orgId: string) =>
      request<{ connected: boolean; valid: boolean; reason: string | null; subscription: string | null }>(`/orgs/${orgId}/claude-status`),
  },

  activity: {
    list: (projectId: string, params?: { entity_type?: string; actor_id?: string; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.entity_type) qs.set('entity_type', params.entity_type);
      if (params?.actor_id) qs.set('actor_id', params.actor_id);
      if (params?.limit != null) qs.set('limit', String(params.limit));
      if (params?.offset != null) qs.set('offset', String(params.offset));
      const q = qs.toString() ? `?${qs.toString()}` : '';
      return request<import('../types').Activity[]>(`/projects/${projectId}/activity${q}`);
    },
    summary: (projectId: string) =>
      request<import('../types').ActivitySummary>(`/projects/${projectId}/activity/summary`),
  },
};
