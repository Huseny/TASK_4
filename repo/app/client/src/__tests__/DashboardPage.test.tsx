import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import * as api from '../lib/api';
import * as AuthContextModule from '../app/AuthContext';
import type { DashboardProject, UserDto } from '../lib/types';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const sampleProjects: DashboardProject[] = [
  {
    projectId: 'p1', name: 'Active Service', slug: 'active-service', isActive: true,
    latestRun: {
      id: 'r1', projectId: 'p1', sourceBranch: 'feature/x', sourceCommitSha: null,
      targetBranch: 'main', triggerType: 'MANUAL', triggeredByUserId: null,
      status: 'PASSED', queuedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      queueSequence: 1, attemptCount: 1, mergeCommitSha: null, logsTruncated: false,
      cancelRequested: false, errorMessage: null, conflicts: [], attempts: [],
      createdAt: '', updatedAt: '',
    },
  },
  {
    projectId: 'p2', name: 'No Runs Project', slug: 'no-runs', isActive: true,
    latestRun: null,
  },
];

function authValue(role: UserDto['role']) {
  return {
    user: {
      id: 'u', username: 'u', displayName: 'U', role,
      status: 'ACTIVE', mustChangePassword: false, createdAt: '', updatedAt: '',
    } as UserDto,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders queue counters and project cards from the dashboard payload', async () => {
    vi.spyOn(api.pipelineApi, 'dashboard').mockResolvedValue({
      projects: sampleProjects,
      queue: { queued: 2, running: 3 },
    });
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue('ADMIN'));

    render(wrap(<DashboardPage />));

    await waitFor(() => expect(screen.getByText('Active Service')).toBeInTheDocument());
    expect(screen.getByText('No Runs Project')).toBeInTheDocument();
    expect(screen.getByText(/queued: 2/i)).toBeInTheDocument();
    expect(screen.getByText(/running: 3/i)).toBeInTheDocument();
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument();
    expect(screen.getByText('feature/x')).toBeInTheDocument();
  });

  it('shows empty state when the user has no projects', async () => {
    vi.spyOn(api.pipelineApi, 'dashboard').mockResolvedValue({
      projects: [],
      queue: { queued: 0, running: 0 },
    });
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue('DEVELOPER'));

    render(wrap(<DashboardPage />));

    await waitFor(() =>
      expect(screen.getByText(/no projects assigned to you yet\./i)).toBeInTheDocument(),
    );
  });

  it('shows the failure message when the dashboard query errors', async () => {
    vi.spyOn(api.pipelineApi, 'dashboard').mockRejectedValue(new Error('boom'));
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue('ADMIN'));

    render(wrap(<DashboardPage />));

    await waitFor(() =>
      expect(screen.getByText(/failed to load dashboard\./i)).toBeInTheDocument(),
    );
  });
});
