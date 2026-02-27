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
};
