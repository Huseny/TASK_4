import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequireRole, RequireAuth, RequireAuthNoForce } from '../routes/RequireRole';
import * as AuthContextModule from '../app/AuthContext';
import type { UserDto } from '../lib/types';

function user(role: UserDto['role'], mustChangePassword = false): UserDto {
  return {
    id: '1', username: 'u', displayName: 'U', role,
    status: 'ACTIVE', mustChangePassword, createdAt: '', updatedAt: '',
  };
}

function authValue(u: UserDto | null, loading = false) {
  return {
    user: u,
    loading,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };
}

function renderAt(initial: string, ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/login" element={<div>LOGIN</div>} />
        <Route path="/change-password" element={<div>CHANGE</div>} />
        <Route path="/" element={<div>HOME</div>} />
        <Route path="/protected" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireRole', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when role matches', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue(user('ADMIN')));
    renderAt('/protected', <RequireRole roles={['ADMIN']}><div>SECRET</div></RequireRole>);
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue(null));
    renderAt('/protected', <RequireRole roles={['ADMIN']}><div>SECRET</div></RequireRole>);
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
  });

  it('redirects to /change-password when mustChangePassword is true', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(
      authValue(user('ADMIN', true)),
    );
    renderAt('/protected', <RequireRole roles={['ADMIN']}><div>SECRET</div></RequireRole>);
    expect(screen.getByText('CHANGE')).toBeInTheDocument();
  });

  it('redirects to / when role is not allowed', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue(user('DEVELOPER')));
    renderAt('/protected', <RequireRole roles={['ADMIN']}><div>SECRET</div></RequireRole>);
    expect(screen.getByText('HOME')).toBeInTheDocument();
  });

  it('shows a loading indicator while auth is initializing', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(authValue(null, true));
    renderAt('/protected', <RequireRole roles={['ADMIN']}><div>SECRET</div></RequireRole>);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

describe('RequireAuth / RequireAuthNoForce', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('RequireAuth forces password change when mustChangePassword is true', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(
      authValue(user('DEVELOPER', true)),
    );
    renderAt('/protected', <RequireAuth><div>SECRET</div></RequireAuth>);
    expect(screen.getByText('CHANGE')).toBeInTheDocument();
  });

  it('RequireAuthNoForce lets users with mustChangePassword reach the page', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue(
      authValue(user('DEVELOPER', true)),
    );
    renderAt('/protected', <RequireAuthNoForce><div>SECRET</div></RequireAuthNoForce>);
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });
});
