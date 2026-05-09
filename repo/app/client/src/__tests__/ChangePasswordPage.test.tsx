import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangePasswordPage } from '../features/auth/ChangePasswordPage';
import * as api from '../lib/api';
import * as AuthContextModule from '../app/AuthContext';
import type { UserDto } from '../lib/types';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function authValue(refreshImpl: () => Promise<void> = async () => undefined) {
  return {
    user: {
      id: 'u', username: 'developer', displayName: 'Developer', role: 'DEVELOPER',
      status: 'ACTIVE', mustChangePassword: true, createdAt: '', updatedAt: '',
    } as UserDto,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(async () => undefined),
    refreshUser: vi.fn(refreshImpl),
  };
}

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    vi.restoreAllMocks();
  });

  it('renders fields and shows the user display name', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue());
    render(<ChangePasswordPage />);
    expect(screen.getByText(/password change required/i)).toBeInTheDocument();
    expect(screen.getByText(/hello developer/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
  });

  it('on success calls authApi.changePassword and navigates home', async () => {
    const auth = authValue();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(auth);
    const change = vi.spyOn(api.authApi, 'changePassword').mockResolvedValue(undefined);

    render(<ChangePasswordPage />);
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'old' } });
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'NewValidPass1' } });
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(change).toHaveBeenCalledWith('old', 'NewValidPass1'));
    await waitFor(() => expect(auth.refreshUser).toHaveBeenCalled());
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
  });

  it('shows the API error and does not navigate on failure', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue());
    vi.spyOn(api.authApi, 'changePassword').mockRejectedValue(new Error('Password too weak.'));

    render(<ChangePasswordPage />);
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'old' } });
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'weak' } });
    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(screen.getByText(/password too weak\./i)).toBeInTheDocument());
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('Logout instead button calls logout from auth context', async () => {
    const auth = authValue();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(auth);

    render(<ChangePasswordPage />);
    fireEvent.click(screen.getByRole('button', { name: /logout instead/i }));

    await waitFor(() => expect(auth.logout).toHaveBeenCalled());
  });
});
