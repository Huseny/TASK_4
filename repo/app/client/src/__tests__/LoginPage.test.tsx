import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginPage } from '../features/auth/LoginPage';
import * as AuthContextModule from '../app/AuthContext';
import type { UserDto } from '../lib/types';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function makeAuthValue(loginImpl: (u: string, p: string) => Promise<void>) {
  return {
    user: null as UserDto | null,
    loading: false,
    login: vi.fn(loginImpl),
    logout: vi.fn(async () => undefined),
    refreshUser: vi.fn(async () => undefined),
  };
}

describe('LoginPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it('renders the form with username and password inputs', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(makeAuthValue(async () => undefined));
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(screen.getByText('MergeStream')).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('on success calls login then navigates to /', async () => {
    const auth = makeAuthValue(async () => undefined);
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(auth);
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'AdminPass1!' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(auth.login).toHaveBeenCalledWith('admin', 'AdminPass1!'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('shows the error from a failed login', async () => {
    const auth = makeAuthValue(async () => {
      throw new Error('Invalid username or password.');
    });
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(auth);
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument(),
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
