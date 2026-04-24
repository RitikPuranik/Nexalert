import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useSSE } from '../lib/useSSE';
import { initials } from '../lib/utils';

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const hotelId = user?.profile?.hotel_id;
  const { connected } = useSSE(hotelId);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const profile = user?.profile || {};
  const links = [
    { to: '/dashboard',           icon: '📊', label: 'Overview' },
    { to: '/dashboard/incidents', icon: '🚨', label: 'Incidents' },
    { to: '/dashboard/staff',     icon: '👥', label: 'Staff' },
    { to: '/dashboard/audit',     icon: '📋', label: 'Audit Trail' },
    { to: '/dashboard/health',    icon: '💚', label: 'System Health' },
  ];

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon">🚨</span>
          <span className="sidebar-brand-text">NexAlert</span>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Navigation</div>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/dashboard'}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <span className="sidebar-link-icon">{link.icon}</span>
              {link.label}
            </NavLink>
          ))}

          <div className="sidebar-section-label" style={{ marginTop: 16 }}>Quick Actions</div>
          <button
            className="sidebar-link"
            style={{ border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', width: '100%', fontFamily: 'var(--font)', fontSize: '0.9rem' }}
            onClick={() => navigate('/dashboard/incidents')}
          >
            <span className="sidebar-link-icon">➕</span>
            New Incident
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{initials(profile.name)}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{profile.name || 'User'}</div>
              <div className="sidebar-user-role">{profile.role || 'staff'}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-left">
          <h2 className="topbar-title">Crisis Command Center</h2>
        </div>
        <div className="topbar-right">
          <div className="topbar-conn">
            <div className={`topbar-conn-dot ${connected ? '' : 'disconnected'}`} />
            {connected ? 'Live' : 'Offline'}
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Demo Mode
          </span>
          <button className="topbar-btn danger" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
