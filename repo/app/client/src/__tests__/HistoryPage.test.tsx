import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoryPage } from '../features/history/HistoryPage';
import * as api from '../lib/api';
import * as AuthContextModule from '../app/AuthContext';
import type { RunDto, UserDto } from '../lib/types';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/projects/p1/history']}>
        <Routes>
          <Route path="/projects/:projectId/history" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const sampleRuns: RunDto[] = [
  {
    id: 'r1', projectId: 'p1', sourceBranch: 'feature/green', sourceCommitSha: 'abcdef1234',
    targetBranch: 'main', triggerType: 'MANUAL', triggeredByUserId: null,
    status: 'PASSED', queuedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    queueSequence: 2, attemptCount: 1, mergeCommitSha: 'mergesha', logsTruncated: false,
    cancelRequested: false, errorMessage: null, conflicts: [], attempts: [],
    createdAt: '', updatedAt: '',
  },
  {
    id: 'r2', projectId: 'p1', sourceBranch: 'feature/conflict', sourceCommitSha: 'cccccc',
    targetBranch: 'main', triggerType: 'MONITOR', triggeredByUserId: null,
    status: 'CONFLICT', queuedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    queueSequence: 1, attemptCount: 0, mergeCommitSha: null, logsTruncated: false,
    cancelRequested: false, errorMessage: null, conflicts: [], attempts: [],
    createdAt: '', updatedAt: '',
  },
];

function authValue(role: UserDto['role']) {
  return {
    user: {
      id: 'u1', username: 'u1', displayName: 'U1', role,
      status: 'ACTIVE', mustChangePassword: false, createdAt: '', updatedAt: '',
    } as UserDto,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };
}

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists every run with branch + status', async () => {
    vi.spyOn(api.pipelineApi, 'listRuns').mockResolvedValue({ runs: sampleRuns });
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue('DEVELOPER'));

    render(wrap(<HistoryPage />));

    await waitFor(() => expect(screen.getByText('feature/green')).toBeInTheDocument());
    expect(screen.getByText('feature/conflict')).toBeInTheDocument();
    expect(screen.getByText(/view conflicts/i)).toBeInTheDocument();
  });

  it('shows empty state when no runs are returned', async () => {
    vi.spyOn(api.pipelineApi, 'listRuns').mockResolvedValue({ runs: [] });
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue('DEVELOPER'));

    render(wrap(<HistoryPage />));

    await waitFor(() => expect(screen.getByText(/no runs yet\./i)).toBeInTheDocument());
  });
});
