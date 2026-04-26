import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { useSSE } from '../lib/useSSE.js';
import { initials } from '../lib/utils.js';

const MANAGER_NAV = [
  { to:'/dashboard',           icon:'▦',  label:'Overview',   end:true },
  { to:'/dashboard/incidents', icon:'⚠',  label:'Incidents' },
  { to:'/dashboard/staff',     icon:'◉',  label:'Team' },
  { to:'/dashboard/sensors',   icon:'📡', label:'Sensors' },
  { to:'/dashboard/reports',   icon:'📄', label:'Reports' },
  { to:'/dashboard/audit',     icon:'≡',  label:'Audit' },
  { to:'/dashboard/health',    icon:'♥',  label:'Health' },
];

const STAFF_NAV = [
  { to:'/dashboard',              icon:'▦', label:'Overview', end:true },
  { to:'/dashboard/incidents',    icon:'⚠', label:'Incidents' },
  { to:'/dashboard/my-tasks',     icon:'✓', label:'My Tasks' },
];

export default function Layout() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const { connected, events } = useSSE(profile?.hotel_id);
  const isManager = profile?.role === 'manager';
  const nav = isManager ? MANAGER_NAV : STAFF_NAV;

  const activeIncidentCount = events.filter(e =>
    e.type?.startsWith('incident:') && !['resolved','false_alarm'].includes(e.status)
  ).length;

  async function handleLogout() { await logout(); navigate('/login'); }

  return (
    <div className="flex min-h-screen bg-void-950">
      {/* Sidebar */}
      <aside className="w-56 min-h-screen bg-void-900/95 border-r border-white/5 flex flex-col fixed top-0 left-0 z-40">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/5">
          <div className="w-8 h-8 rounded-xl bg-red-500/15 border border-red-500/15 flex items-center justify-center text-base">🚨</div>
          <div>
            <div className="font-bold text-white text-sm tracking-tight">NexAlert</div>
            <div className="text-[9px] text-slate-600 uppercase tracking-widest font-semibold">
              {isManager ? 'Manager' : 'Staff'}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2.5 space-y-0.5 pt-3">
          {nav.map(link => (
            <NavLink
              key={link.to} to={link.to} end={link.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-100 ${
                  isActive
                    ? 'bg-indigo-500/12 text-white border border-indigo-500/15'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/4'
                }`
              }
            >
              <span className="text-base w-5 text-center">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-2.5 border-t border-white/5">
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/4 transition-colors">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
              isManager ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-500/20 text-slate-300'
            }`}>
              {initials(profile?.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white truncate">{profile?.name || 'Staff'}</div>
              <div className="text-[10px] text-slate-600 capitalize">{profile?.role}</div>
            </div>
            <button onClick={handleLogout} title="Sign out"
              className="text-slate-700 hover:text-red-400 transition-colors text-sm">⎋</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 ml-56 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="h-14 bg-void-900/80 border-b border-white/5 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-mono">{profile?.hotel_id?.toString().slice(-8)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              connected
                ? 'bg-emerald-500/8 text-emerald-400 border-emerald-500/15'
                : 'bg-red-500/8 text-red-400 border-red-500/15'
            }`}>
              <div className={`w-1 h-1 rounded-full ${connected?'bg-emerald-400 animate-pulse':'bg-red-400'}`}/>
              {connected ? 'LIVE' : 'OFFLINE'}
            </div>
            {profile?.is_on_duty ? (
              <div className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-emerald-500/8 text-emerald-400 border-emerald-500/15">
                <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"/>ON DUTY
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-slate-500/8 text-slate-500 border-slate-500/15">
                OFF DUTY
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <Outlet/>
        </main>
      </div>
    </div>
  );
}
