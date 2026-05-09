import { Navigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import type { ReactNode } from 'react';

interface Props {
  roles: string[];
  children: ReactNode;
}

export function RequireRole({ roles, children }: Props) {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** RequireAuth but allows through users who still need to change their password (for the change-password page itself). */
export function RequireAuthNoForce({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}
