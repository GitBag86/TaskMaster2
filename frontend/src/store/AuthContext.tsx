import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import type { Team, User } from '@/types'
import { api, setAuthErrorHandler } from '@/api/client'

interface AuthContextType {
  user: User | null;
  currentTeam: Team | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  signup: (data: {
    username: string;
    password: string;
    email: string;
    accept_terms: boolean;
    accept_privacy: boolean;
    accept_marketing: boolean;
    invite_token?: string | null;
  }) => Promise<User>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const handlingAuthError = useRef(false);
  const currentTeam = user?.team ?? null;

  const fetchUser = useCallback(async () => {
    try {
      const u = await api.auth.me();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setAuthErrorHandler(() => {
      if (handlingAuthError.current) return;
      handlingAuthError.current = true;
      setUser(null);
      void api.auth.logout().catch(() => undefined).finally(() => {
        handlingAuthError.current = false;
      });
      if (window.location.pathname !== '/auth') {
        window.location.assign('/auth');
      }
    });

    return () => setAuthErrorHandler(null);
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (username: string, password: string) => {
    const res = await api.auth.login(username, password);
    setUser(res.user);
    return res.user;
  };

  const signup = async (data: {
    username: string;
    password: string;
    email: string;
    accept_terms: boolean;
    accept_privacy: boolean;
    accept_marketing: boolean;
    invite_token?: string | null;
  }) => {
    const res = await api.auth.signup(data);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
  };

  const logoutAll = async () => {
    await api.auth.logoutAll();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, currentTeam, loading, login, signup, logout, logoutAll }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
