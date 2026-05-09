import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { NavShell } from '../components/NavShell';
import type { UserDto } from '../lib/types';
import * as AuthContextModule from '../app/AuthContext';
import { vi } from 'vitest';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderWithContext(user: UserDto | null) {
  vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
    user,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NavShell>
          <div>Content</div>
        </NavShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NavShell role-based nav', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows admin links for ADMIN users', () => {
    renderWithContext({
      id: '1', username: 'admin', displayName: 'Admin', role: 'ADMIN',
      status: 'ACTIVE', mustChangePassword: false, createdAt: '', updatedAt: '',
    });
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Audit')).toBeInTheDocument();
    expect(screen.getByText('Metrics')).toBeInTheDocument();
  });

  it('hides admin links for DEVELOPER users', () => {
    renderWithContext({
      id: '2', username: 'dev', displayName: 'Developer', role: 'DEVELOPER',
      status: 'ACTIVE', mustChangePassword: false, createdAt: '', updatedAt: '',
    });
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit')).not.toBeInTheDocument();
    expect(screen.queryByText('Metrics')).not.toBeInTheDocument();
  });

  it('shows Dashboard and Projects for all roles', () => {
    renderWithContext({
      id: '3', username: 'maint', displayName: 'Maintainer', role: 'MAINTAINER',
      status: 'ACTIVE', mustChangePassword: false, createdAt: '', updatedAt: '',
    });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });
});
