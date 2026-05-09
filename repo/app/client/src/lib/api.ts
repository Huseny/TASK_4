import type { UserDto, ProjectDto, TrackedBranchDto, RunDto, NotificationDto, AuditEventDto, DashboardProject } from './types';

let csrfToken: string | null = null;

function newIdempotencyKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getCsrfFromCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)ms_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function apiFetch<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  csrfToken = getCsrfFromCookie();
  const method = options.method?.toUpperCase() ?? '';
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (csrfToken && isMutation) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  // Auto-attach idempotency key for any authenticated mutation that hasn't
  // already supplied one (login/refresh skip server-side because no session
  // exists yet, so the header is harmless there).
  if (isMutation && !headers['Idempotency-Key'] && path !== '/api/auth/login' && path !== '/api/auth/refresh') {
    headers['Idempotency-Key'] = newIdempotencyKey();
  }
  const res = await fetch(path, { ...options, headers, credentials: 'same-origin' });

  if (res.status === 401 && !isRetry && path !== '/api/auth/refresh' && path !== '/api/auth/login') {
    try {
      await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // refresh failed — let original 401 propagate on retry
    }
    return apiFetch(path, options, true);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { code: 'UNKNOWN', message: res.statusText, details: null, requestId: null } }));
    throw Object.assign(new Error(body.error?.message ?? res.statusText), { apiError: body.error });
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export const authApi = {
  me: () => apiFetch<{ user: UserDto }>('/api/auth/me'),
  login: (username: string, password: string) =>
    apiFetch<{ user: UserDto }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => apiFetch<void>('/api/auth/logout', { method: 'POST' }),
  refresh: () => apiFetch<{ user: UserDto }>('/api/auth/refresh', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<void>('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
};

export const projectsApi = {
  list: () => apiFetch<{ projects: ProjectDto[] }>('/api/projects'),
  get: (id: string) => apiFetch<{ project: ProjectDto }>(`/api/projects/${id}`),
  create: (data: Partial<ProjectDto>) =>
    apiFetch<{ project: ProjectDto }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Idempotency-Key': newIdempotencyKey() },
    }),
  update: (id: string, data: Partial<ProjectDto>) =>
    apiFetch<{ project: ProjectDto }>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getMembers: (projectId: string) =>
    apiFetch<{ users: UserDto[] }>(`/api/projects/${projectId}/members`),
  getBranches: (projectId: string) =>
    apiFetch<{ branches: TrackedBranchDto[] }>(`/api/projects/${projectId}/branches`),
  createBranch: (projectId: string, data: { branchName: string; ownerUserId: string }) =>
    apiFetch<{ branch: TrackedBranchDto }>(`/api/projects/${projectId}/branches`, { method: 'POST', body: JSON.stringify(data) }),
  updateBranch: (projectId: string, branchId: string, data: { isActive?: boolean; ownerUserId?: string }) =>
    apiFetch<{ branch: TrackedBranchDto }>(`/api/projects/${projectId}/branches/${branchId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBranch: (projectId: string, branchId: string) =>
    apiFetch<void>(`/api/projects/${projectId}/branches/${branchId}`, { method: 'DELETE' }),
};

export const pipelineApi = {
  dashboard: () => apiFetch<{ projects: DashboardProject[]; queue: { queued: number; running: number } }>('/api/pipeline/dashboard'),
  listRuns: (projectId: string, limit?: number) =>
    apiFetch<{ runs: RunDto[] }>(`/api/pipeline/projects/${projectId}/runs${limit ? `?limit=${limit}` : ''}`),
  getRun: (projectId: string, runId: string) =>
    apiFetch<{ run: RunDto }>(`/api/pipeline/projects/${projectId}/runs/${runId}`),
  trigger: (projectId: string, sourceBranch: string, idempotencyKey: string) =>
    apiFetch<{ run: RunDto }>(`/api/pipeline/projects/${projectId}/runs`, {
      method: 'POST',
      body: JSON.stringify({ sourceBranch }),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  cancel: (projectId: string, runId: string) =>
    apiFetch<void>(`/api/pipeline/projects/${projectId}/runs/${runId}/cancel`, { method: 'POST' }),
};

export const notificationsApi = {
  list: (unreadOnly?: boolean) =>
    apiFetch<{ notifications: NotificationDto[] }>(`/api/notifications${unreadOnly ? '?unread=true' : ''}`),
  unreadCount: () => apiFetch<{ count: number }>('/api/notifications/unread-count'),
  markRead: (id: string) =>
    apiFetch<{ notification: NotificationDto }>(`/api/notifications/${id}/mark-read`, { method: 'POST' }),
  markAllRead: () => apiFetch<void>('/api/notifications/mark-all-read', { method: 'POST' }),
};

export const auditApi = {
  list: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch<{ events: AuditEventDto[] }>(`/api/audit${qs ? '?' + qs : ''}`);
  },
};

export const usersApi = {
  list: () => apiFetch<{ users: UserDto[] }>('/api/users'),
  create: (data: { username: string; displayName: string; role: string; password: string }) =>
    apiFetch<{ user: UserDto }>('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (id: string, role: string) =>
    apiFetch<{ user: UserDto }>(`/api/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  resetPassword: (id: string, newPassword: string) =>
    apiFetch<void>(`/api/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
  deactivate: (id: string) =>
    apiFetch<void>(`/api/users/${id}/deactivate`, { method: 'POST' }),
  delete: (id: string) =>
    apiFetch<void>(`/api/users/${id}`, { method: 'DELETE' }),
};

export const metricsApi = {
  get: () => apiFetch<unknown>('/api/metrics'),
};
