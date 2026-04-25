import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useSSE } from '../lib/useSSE';
import { initials } from '../lib/utils';

const NAV_LINKS = [
  { to: '/dashboard',           icon: '▦',  label: 'Overview',      end: true },
  { to: '/dashboard/incidents', icon: '⚠',  label: 'Incidents' },
  { to: '/dashboard/staff',     icon: '◉',  label: 'Staff' },
  { to: '/dashboard/audit',     icon: '≡',  label: 'Audit Trail' },
  { to: '/dashboard/health',    icon: '♥',  label: 'System Health' },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const hotelId = user?.profile?.hotel_id;
  const { connected } = useSSE(hotelId);
  const profile = user?.profile || {};

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen bg-[#04080f]">
      {/* Sidebar */}
      <aside className="w-[260px] min-h-screen bg-[#080d1a]/95 border-r border-white/5 flex flex-col fixed left-0 top-0 z-40">
        {/* Brand */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
          <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/20 flex items-center justify-center text-lg">
            🚨
          </div>
          <div>
            <div className="font-bold text-white text-base tracking-tight">NexAlert</div>
            <div className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold">Crisis Platform</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 mt-2">
          <p className="px-3 py-2 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Navigation</p>
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-500/15 text-white border border-indigo-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <span className="w-5 text-center text-base opacity-70">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}

          <div className="pt-4">
            <p className="px-3 py-2 text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Actions</p>
            <button
              onClick={() => navigate('/dashboard/incidents')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-150 w-full"
            >
              <span className="w-5 text-center text-base opacity-70">+</span>
              New Incident
            </button>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors duration-150">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-sm font-bold shrink-0">
              {initials(profile.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white truncate">{profile.name || 'User'}</div>
              <div className="text-xs text-slate-500 capitalize">{profile.role || 'staff'}</div>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-600 hover:text-red-400 transition-colors text-xs"
              title="Logout"
            >
              ⎋
            </button>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 ml-[260px] flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="h-16 bg-[#080d1a]/80 border-b border-white/5 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-30">
          <div>
            <h2 className="text-base font-semibold text-white">Crisis Command Center</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full ${
              connected
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              {connected ? 'Live' : 'Offline'}
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold px-3 py-1.5 rounded-full">
              Demo Mode
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
