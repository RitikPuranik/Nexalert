import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Layout from './pages/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Incidents from './pages/Incidents.jsx';
import WarRoom from './pages/WarRoom.jsx';
import Staff from './pages/Staff.jsx';
import Audit from './pages/Audit.jsx';
import Health from './pages/Health.jsx';
import Reports from './pages/Reports.jsx';
import Sensors from './pages/Sensors.jsx';
import MyTasks from './pages/MyTasks.jsx';
import HotelSetup from './pages/HotelSetup.jsx';

function Loader() {
  return (
    <div className="min-h-screen bg-void-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"/>
        <span className="text-slate-600 text-xs tracking-widest uppercase">Loading</span>
      </div>
    </div>
  );
}

function NoProfileScreen() {
  const { user, logout, refreshProfile } = useAuth();
  const [uid, setUid] = useState('');
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState('');

  useEffect(() => {
    user?.getIdTokenResult().then(() => setUid(user.uid)).catch(() => setUid(user?.uid || ''));
  }, [user]);

  function copyUid() {
    navigator.clipboard.writeText(uid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function checkAgain() {
    setChecking(true); setCheckMsg('');
    try {
      await refreshProfile();
      setCheckMsg('✅ Profile found! Redirecting…');
    } catch {
      setCheckMsg('❌ Still no profile found.');
    }
    setChecking(false);
  }

  return (
    <div className="min-h-screen bg-void-950 flex items-center justify-center px-4">
      <div className="w-full max-w-[420px] space-y-4">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-3xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white">Account Not Linked</h1>
          <p className="text-slate-500 text-sm mt-2">Your Firebase account exists but isn't linked to a hotel profile yet.</p>
        </div>
        <div className="glass rounded-2xl p-5 space-y-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Your Firebase UID</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-indigo-300 font-mono bg-black/40 px-3 py-2.5 rounded-xl break-all">{uid || 'Loading…'}</code>
            <button onClick={copyUid} disabled={!uid}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold px-3 py-2.5 rounded-xl transition-all">
              {copied ? '✅' : '📋 Copy'}
            </button>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={logout}
            className="flex-1 bg-white/4 hover:bg-white/8 border border-white/8 text-slate-400 font-semibold py-3 rounded-xl text-sm transition-all">
            ← Sign Out
          </button>
          <button onClick={checkAgain} disabled={checking}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2">
            {checking ? <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"/>Checking…</> : "🔄 I've Linked It"}
          </button>
        </div>
        {checkMsg && <p className={`text-xs text-center font-medium ${checkMsg.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{checkMsg}</p>}
      </div>
    </div>
  );
}

function Guard({ children, managerOnly }) {
  const { user, profile, loading, noProfile } = useAuth();
  if (loading)   return <Loader />;
  if (!user)     return <Navigate to="/login" replace />;
  if (noProfile) return <NoProfileScreen />;
  if (managerOnly && profile?.role !== 'manager') return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace/> : <Login/>}/>
      <Route path="/dashboard" element={<Guard><Layout/></Guard>}>
        <Route index element={<Dashboard/>}/>
        <Route path="incidents" element={<Incidents/>}/>
        <Route path="warroom/:id" element={<WarRoom/>}/>
        <Route path="my-tasks"   element={<MyTasks/>}/>
        <Route path="staff"      element={<Guard managerOnly><Staff/></Guard>}/>
        <Route path="sensors"    element={<Guard managerOnly><Sensors/></Guard>}/>
        <Route path="reports"    element={<Guard managerOnly><Reports/></Guard>}/>
        <Route path="audit"      element={<Guard managerOnly><Audit/></Guard>}/>
        <Route path="health"     element={<Guard managerOnly><Health/></Guard>}/>
        <Route path="hotel-setup"element={<Guard managerOnly><HotelSetup/></Guard>}/>
      </Route>
      <Route path="*" element={<Navigate to={user?'/dashboard':'/login'} replace/>}/>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes/>
      </BrowserRouter>
    </AuthProvider>
  );
}
