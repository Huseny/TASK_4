import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsersPage } from '../features/admin-users/UsersPage';
import * as api from '../lib/api';
import type { UserDto } from '../lib/types';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const sample: UserDto[] = [
  {
    id: 'u1', username: 'admin', displayName: 'Administrator', role: 'ADMIN',
    status: 'ACTIVE', mustChangePassword: false, createdAt: '', updatedAt: '',
  },
  {
    id: 'u2', username: 'dev', displayName: 'Dev User', role: 'DEVELOPER',
    status: 'DEACTIVATED', mustChangePassword: false, createdAt: '', updatedAt: '',
  },
];

describe('UsersPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists users with role and status', async () => {
    vi.spyOn(api.usersApi, 'list').mockResolvedValue({ users: sample });

    render(wrap(<UsersPage />));

    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());
    expect(screen.getByText('dev')).toBeInTheDocument();
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('DEACTIVATED')).toBeInTheDocument();
  });

  it('shows the Create User form when the open button is clicked', async () => {
    vi.spyOn(api.usersApi, 'list').mockResolvedValue({ users: sample });

    render(wrap(<UsersPage />));

    await waitFor(() => expect(screen.getByText('admin')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /create user/i }));
    expect(screen.getByPlaceholderText(/username/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/display name/i)).toBeInTheDocument();
  });

  it('hides Deactivate button for users that are already DEACTIVATED', async () => {
    vi.spyOn(api.usersApi, 'list').mockResolvedValue({ users: sample });

    render(wrap(<UsersPage />));

    await waitFor(() => expect(screen.getByText('dev')).toBeInTheDocument());
    // The active admin row gets a Deactivate button; the deactivated dev row does not.
    const buttons = screen.getAllByRole('button', { name: /deactivate/i });
    expect(buttons).toHaveLength(1);
  });
});
