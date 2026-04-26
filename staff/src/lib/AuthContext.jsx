import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from './firebase.js';
import { api } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);  // firebase user
  const [profile, setProfile] = useState(null);  // backend profile
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      setUser(fbUser);
      try {
        const p = await api.get('/api/staff/profile');
        setProfile(p);
      } catch {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = useCallback(async (email, password) => {
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will pick it up and load profile
    } catch (err) {
      setError(err.message.replace('Firebase: ', '').replace(/ \(auth\/.*\)/, ''));
      setLoading(false);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const p = await api.get('/api/staff/profile');
      setProfile(p);
    } catch { /* ignore */ }
  }, []);

  return (
    <AuthCtx.Provider value={{ user, profile, loading, error, login, logout, refreshProfile }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
};
