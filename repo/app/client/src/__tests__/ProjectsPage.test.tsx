import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import * as api from '../lib/api';
import * as AuthContextModule from '../app/AuthContext';
import type { ProjectDto, UserDto } from '../lib/types';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const sampleProjects: ProjectDto[] = [
  {
    id: 'p1', name: 'Sample Service', slug: 'sample-service', description: 'demo',
    repoPath: '/repos/sample.git', targetBranch: 'main', testCommand: 'npm test',
    pollIntervalSeconds: 30, autoRetryAttempts: 1, isActive: true,
    maintainerUserIds: [], developerUserIds: [],
    createdAt: '', updatedAt: '',
  },
  {
    id: 'p2', name: 'Inactive Project', slug: 'inactive', description: '',
    repoPath: '/repos/x.git', targetBranch: 'main', testCommand: 'npm test',
    pollIntervalSeconds: 60, autoRetryAttempts: 0, isActive: false,
    maintainerUserIds: [], developerUserIds: [],
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

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists projects returned from the API', async () => {
    vi.spyOn(api.projectsApi, 'list').mockResolvedValue({ projects: sampleProjects });
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue('DEVELOPER'));

    render(wrap(<ProjectsPage />));

    await waitFor(() => expect(screen.getByText('Sample Service')).toBeInTheDocument());
    expect(screen.getByText('Inactive Project')).toBeInTheDocument();
    expect(screen.getByText(/poll: 30s/i)).toBeInTheDocument();
  });

  it('shows the New Project button only for admins', async () => {
    vi.spyOn(api.projectsApi, 'list').mockResolvedValue({ projects: sampleProjects });
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue('ADMIN'));

    render(wrap(<ProjectsPage />));

    await waitFor(() => expect(screen.getByText('Sample Service')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();
  });

  it('hides the New Project button for developers', async () => {
    vi.spyOn(api.projectsApi, 'list').mockResolvedValue({ projects: sampleProjects });
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue('DEVELOPER'));

    render(wrap(<ProjectsPage />));

    await waitFor(() => expect(screen.getByText('Sample Service')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /new project/i })).not.toBeInTheDocument();
  });

  it('shows empty state when there are no projects', async () => {
    vi.spyOn(api.projectsApi, 'list').mockResolvedValue({ projects: [] });
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue('DEVELOPER'));

    render(wrap(<ProjectsPage />));

    await waitFor(() => expect(screen.getByText(/no projects found/i)).toBeInTheDocument());
  });
});
