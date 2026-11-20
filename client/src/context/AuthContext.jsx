import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { TOKEN_KEY } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((data) => {
    if (data?.accessToken) localStorage.setItem(TOKEN_KEY, data.accessToken);
    if (data?.user) setUser(data.user);
    if (data?.tenant !== undefined) setTenant(data.tenant);
  }, []);

  const bootstrap = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    try {
      if (token) {
        const { data } = await api.get('/auth/me');
        setUser(data.data.user);
        setTenant(data.data.tenant);
        return;
      }
      const { data } = await api.post('/auth/refresh');
      applySession(data.data);
      setUser(data.data.user);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
      setTenant(null);
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  /** `portal` is 'business' | 'staff' | 'super-admin' and is enforced server-side. */
  const login = useCallback(
    async (email, password, portal) => {
      const { data } = await api.post('/auth/login', { email, password, ...(portal ? { portal } : {}) });
      applySession(data.data);
      setTenant(data.data.tenant);
      return data.data;
    },
    [applySession],
  );

  /** Registration only creates the workspace; the owner must verify the email first. */
  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    return data.data;
  }, []);

  const verifyEmail = useCallback(
    async (email, code) => {
      const { data } = await api.post('/auth/verify-email', { email, code });
      applySession(data.data);
      setTenant(data.data.tenant);
      return data.data;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Best effort: the local session is cleared regardless.
    }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setTenant(null);
    window.location.href = '/login';
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.data.user);
      setTenant(data.data.tenant);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      tenant,
      loading,
      login,
      register,
      verifyEmail,
      logout,
      refreshUser,
      isSuperAdmin: user?.role === 'super_admin',
      isBusinessAdmin: user?.role === 'business_admin',
      isStaff: user?.role === 'staff',
    }),
    [user, tenant, loading, login, register, verifyEmail, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
