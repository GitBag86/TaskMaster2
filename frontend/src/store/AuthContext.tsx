import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import type { Team, User } from '@/types'
import { api, clearCsrf, initCsrf, setAuthErrorHandler } from '@/api/client'

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
  updateUser: (user: User) => void;
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
      // Fetch CSRF token before rendering — state-changing requests depend on it.
      await initCsrf();
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh the CSRF token periodically so it never goes stale mid-session.
  useEffect(() => {
    const interval = setInterval(() => {
      void initCsrf();
    }, 20 * 60 * 1000); // every 20 minutes
    return () => clearInterval(interval);
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
    await initCsrf();
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
    await initCsrf();
    return res.user;
  };

  const logout = async () => {
    await api.auth.logout();
    clearCsrf();
    setUser(null);
  };

  const logoutAll = async () => {
    await api.auth.logoutAll();
    clearCsrf();
    setUser(null);
  };

  const updateUser = (updated: User) => {
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{ user, currentTeam, loading, login, signup, logout, logoutAll, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
