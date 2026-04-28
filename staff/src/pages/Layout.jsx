import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { useSSE } from '../lib/useSSE.js';
import { initials, INCIDENT_ICONS, timeAgo } from '../lib/utils.js';

const MANAGER_NAV = [
  { to:'/dashboard',                icon:'◈',  label:'Overview',     end:true },
  { to:'/dashboard/incidents',      icon:'🚨', label:'Incidents' },
  { to:'/dashboard/staff',          icon:'👥', label:'Team' },
  { to:'/dashboard/sensors',        icon:'📡', label:'Sensors' },
  { to:'/dashboard/reports',        icon:'📄', label:'Reports' },
  { to:'/dashboard/audit',          icon:'📋', label:'Audit Log' },
  { to:'/dashboard/health',         icon:'♥',  label:'System Health' },
  { to:'/dashboard/hotel-setup',    icon:'🏨', label:'Hotel Setup' },
];
const STAFF_NAV = [
  { to:'/dashboard',              icon:'◈',  label:'Overview',  end:true },
  { to:'/dashboard/incidents',    icon:'🚨', label:'Incidents' },
  { to:'/dashboard/my-tasks',     icon:'✓',  label:'My Tasks' },
];

/* ── SOS Toast ──────────────────────────────────────────────────────────────── */
function SosToast({ event, onDismiss, onView }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 12000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex items-start gap-3 bg-red-950/90 border border-red-500/40 rounded-2xl p-4 shadow-2xl shadow-red-900/50 backdrop-blur-xl"
      style={{ animation: 'slideInRight 0.3s ease-out' }}>
      <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-xl shrink-0 animate-pulse">🆘</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-red-400 uppercase tracking-widest">Guest SOS Alert</p>
        <p className="text-sm font-semibold text-white mt-0.5">
          Room {event.room} · Floor {event.floor}
        </p>
        <p className="text-[10px] text-red-300/60 mt-0.5">{timeAgo(event.ts || new Date())}</p>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button onClick={onView}
          className="bg-red-500 hover:bg-red-400 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all">
          VIEW →
        </button>
        <button onClick={onDismiss}
          className="text-red-500/60 hover:text-red-400 text-[10px] text-center transition-all">
          Dismiss
        </button>
      </div>
    </div>
  );
}

/* ── Event Toast ──────────────────────────────────────────────────────────────── */
function EventToast({ event, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, []);
  const isIncident = event.type?.startsWith('incident');
  return (
    <div className="flex items-start gap-3 bg-void-900/95 border border-white/10 rounded-xl p-3 shadow-xl backdrop-blur-xl"
      style={{ animation: 'slideInRight 0.2s ease-out' }}>
      <span className="text-base shrink-0">{isIncident ? '🚨' : '📡'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white">{event.type?.replace(/:/g,' → ')}</p>
        {event.floor && <p className="text-[10px] text-slate-600 mt-0.5">Floor {event.floor}</p>}
      </div>
      <button onClick={onDismiss} className="text-slate-700 hover:text-slate-400 text-xs ml-2">✕</button>
    </div>
  );
}

export default function Layout() {
  const { profile, logout } = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const { connected, events } = useSSE(profile?.hotel_id);
  const isManager  = profile?.role === 'manager';
  const nav        = isManager ? MANAGER_NAV : STAFF_NAV;

  const [toasts,    setToasts]    = useState([]);   // { id, event, kind }
  const [sideOpen,  setSideOpen]  = useState(true);
  const seen = useRef(new Set());

  // Process incoming SSE events into toasts
  useEffect(() => {
    if (!events.length) return;
    const latest = events[0];
    if (!latest || seen.current.has(latest._id)) return;
    seen.current.add(latest._id);

    const isSos = latest.type === 'incident:created' && latest.source === 'guest_sos';
    const isNewIncident = latest.type === 'incident:created';

    if (isSos || isNewIncident) {
      const id = Date.now();
      setToasts(p => [{ id, event: latest, kind: isSos ? 'sos' : 'incident' }, ...p].slice(0, 5));
    }
  }, [events]);

  function dismissToast(id) {
    setToasts(p => p.filter(t => t.id !== id));
  }

  async function handleLogout() {
    try { await logout(); } catch { /* ignore */ }
    navigate('/login');
  }

  const activeIncidents = events.filter(e =>
    e.type === 'incident:created' && !['resolved','false_alarm'].includes(e.status)
  ).length;

  // Build a "current page" label for the topbar
  const pageLabel = (() => {
    const path = location.pathname;
    if (path.includes('warroom')) return '⚔️  War Room';
    const n = [...MANAGER_NAV, ...STAFF_NAV].find(n => path.endsWith(n.to.split('/').pop()) || (n.end && path === '/dashboard'));
    return n ? `${n.icon}  ${n.label}` : '';
  })();

  return (
    <div className="flex min-h-screen bg-void-950">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className={`${sideOpen ? 'w-56' : 'w-14'} min-h-screen bg-void-900/98 border-r border-white/5 flex flex-col fixed top-0 left-0 z-40 transition-all duration-200`}>
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-3 py-4 border-b border-white/5 min-h-[57px]">
          <div className="w-8 h-8 rounded-xl bg-red-500/15 border border-red-500/15 flex items-center justify-center text-base shrink-0">🚨</div>
          {sideOpen && (
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-sm tracking-tight">NexAlert</div>
              <div className="text-[9px] text-slate-600 uppercase tracking-widest font-semibold">
                {isManager ? 'Manager' : 'Staff'}
              </div>
            </div>
          )}
          <button onClick={() => setSideOpen(p => !p)} className="text-slate-700 hover:text-slate-400 text-xs transition-colors shrink-0 ml-auto">
            {sideOpen ? '◂' : '▸'}
          </button>
        </div>

        {/* Live indicator */}
        {sideOpen && (
          <div className={`mx-3 mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border ${
            connected ? 'bg-emerald-500/8 text-emerald-400 border-emerald-500/15' : 'bg-red-500/8 text-red-400 border-red-500/15'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}/>
            {connected ? 'LIVE — Connected' : 'OFFLINE'}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 pt-3 overflow-y-auto">
          {nav.map(link => (
            <NavLink
              key={link.to} to={link.to} end={link.end}
              title={!sideOpen ? link.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-100 ${
                  isActive
                    ? 'bg-indigo-500/12 text-white border border-indigo-500/15'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/4'
                }`
              }
            >
              <span className="text-base w-5 text-center shrink-0">{link.icon}</span>
              {sideOpen && <span className="truncate">{link.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-2 border-t border-white/5">
          {sideOpen ? (
            <div className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/4 transition-colors">
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
          ) : (
            <button onClick={handleLogout} title="Sign out"
              className="w-full flex justify-center py-2 text-slate-700 hover:text-red-400 transition-colors text-sm">⎋</button>
          )}
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────── */}
      <div className={`flex-1 ${sideOpen ? 'ml-56' : 'ml-14'} flex flex-col min-h-screen transition-all duration-200`}>
        {/* Topbar */}
        <header className="h-14 bg-void-900/80 border-b border-white/5 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400">{pageLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* SOS badge if active SOS events */}
            {events.some(e => e.source === 'guest_sos' && e.type === 'incident:created') && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-red-500/12 text-red-400 border-red-500/20 animate-pulse">
                🆘 SOS ACTIVE
              </div>
            )}
            {/* Duty status */}
            {profile?.is_on_duty ? (
              <div className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-emerald-500/8 text-emerald-400 border-emerald-500/15">
                <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"/>ON DUTY
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border bg-slate-500/8 text-slate-500 border-slate-500/15">
                OFF DUTY
              </div>
            )}
            {/* Hotel ID chip */}
            <div className="text-[10px] font-mono text-slate-700 bg-white/3 px-2 py-1 rounded-lg border border-white/5">
              {profile?.hotel_id?.toString().slice(-8)}
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <Outlet/>
        </main>
      </div>

      {/* ── Toast container ─────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 w-80">
        {toasts.map(({ id, event, kind }) =>
          kind === 'sos' ? (
            <SosToast
              key={id}
              event={event}
              onDismiss={() => dismissToast(id)}
              onView={() => { dismissToast(id); if (event.incident_id) navigate(`/dashboard/warroom/${event.incident_id}`); else navigate('/dashboard/incidents'); }}
            />
          ) : (
            <EventToast key={id} event={event} onDismiss={() => dismissToast(id)}/>
          )
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
