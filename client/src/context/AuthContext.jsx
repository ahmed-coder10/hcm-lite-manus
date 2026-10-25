import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [settings, setSettings] = useState(null);
  const [unread, setUnread] = useState(0);
  const [aiStatus, setAiStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState({ needsSetup: null });

  const loadSession = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const data = await api('/auth/me');
      setUser(data.user);
      setEmployee(data.employee);
      setSettings(data.settings);
      setUnread(data.notifications?.unread || 0);
      setAiStatus(data.ai || null);
      return data.user;
    } catch {
      setToken(null);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const checkSetup = useCallback(async () => {
    try {
      const status = await api('/setup');
      setSetup(status);
      return status;
    } catch {
      return { needsSetup: false };
    }
  }, []);

  useEffect(() => {
    (async () => {
      const status = await checkSetup();
      if (status?.needsSetup) {
        setLoading(false);
        return;
      }
      await loadSession();
    })();
  }, [checkSetup, loadSession]);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setEmployee(null);
    };
    window.addEventListener('hcm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('hcm:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    await loadSession();
    return data;
  }, [loadSession]);

  const setupCompany = useCallback(async (payload) => {
    const data = await api('/setup', { method: 'POST', body: payload });
    setToken(data.token);
    setSetup({ needsSetup: false });
    await loadSession();
    return data;
  }, [loadSession]);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* sign out locally regardless */
    }
    setToken(null);
    setUser(null);
    setEmployee(null);
  }, []);

  const refreshSession = useCallback(async () => {
    await loadSession();
  }, [loadSession]);

  const value = useMemo(
    () => ({
      user,
      employee,
      settings,
      unread,
      setUnread,
      aiStatus,
      loading,
      setup,
      role: user?.role || null,
      isStaff: user?.role === 'admin' || user?.role === 'hr',
      hasRole: (...roles) => roles.includes(user?.role),
      login,
      logout,
      setupCompany,
      refreshSession,
    }),
    [user, employee, settings, unread, aiStatus, loading, setup, login, logout, setupCompany, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
