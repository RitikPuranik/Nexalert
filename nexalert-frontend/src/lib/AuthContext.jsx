import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api, setToken, getToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if already have a token on mount
  useEffect(() => {
    const token = getToken();
    if (token) {
      // Validate by fetching profile
      api('/api/staff/profile')
        .then((profile) => setUser({ profile, token }))
        .catch(() => { setToken(null); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const loginDemo = useCallback(async () => {
    // 1. Seed demo data if needed
    const status = await api('/api/demo/status');
    if (!status.seeded) {
      await api('/api/demo/seed', { method: 'POST' });
    }

    // 2. Set demo token
    setToken('DEMO_MANAGER_TOKEN');

    // 3. Fetch profile
    const profile = await api('/api/staff/profile');
    setUser({ profile, token: 'DEMO_MANAGER_TOKEN' });

    return profile;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginDemo, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
