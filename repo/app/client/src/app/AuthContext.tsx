import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authApi } from '../lib/api';
import type { UserDto } from '../lib/types';

interface AuthState {
  user: UserDto | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const r = await authApi.me();
        setUser(r.user);
      } catch {
        try {
          await authApi.refresh();
          const r = await authApi.me();
          setUser(r.user);
        } catch {
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  const login = async (username: string, password: string) => {
    const r = await authApi.login(username, password);
    setUser(r.user);
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const r = await authApi.me();
      setUser(r.user);
    } catch {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
