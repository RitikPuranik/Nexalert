import { useState, useEffect } from 'react';
import { get, patch } from '../lib/api';
import { initials, timeAgo } from '../lib/utils';

export default function Staff() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    Promise.all([
      get('/api/staff/team').catch(() => []),
      get('/api/staff/my-tasks').catch(() => []),
    ]).then(([t, tk]) => {
      setTeam(Array.isArray(t) ? t : []);
      setTasks(Array.isArray(tk) ? tk : []);
    }).finally(() => setLoading(false));
  }, []);

  async function toggleDuty(staffId, currentDuty) {
    try {
      // Note: Only the staff member can toggle their own duty
      // For demo, we show the UI but the API may restrict this
      await patch('/api/staff/duty', { is_on_duty: !currentDuty });
      const updated = await get('/api/staff/team');
      setTeam(Array.isArray(updated) ? updated : []);
    } catch (err) {
      console.error('Toggle duty failed:', err);
    }
  }

  if (loading) return <div className="loading-page"><div className="loading-spinner" /><span>Loading staff…</span></div>;

  const onDuty = team.filter(s => s.is_on_duty);
  const offDuty = team.filter(s => !s.is_on_duty);

  return (
    <div>
      <div className="page-header">
        <h1>Staff Management</h1>
        <p>{team.length} team members · {onDuty.length} on duty</p>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card glass">
          <div className="stat-card-info">
            <div className="stat-card-label">On Duty</div>
            <div className="stat-card-value" style={{ color: 'var(--success)' }}>{onDuty.length}</div>
          </div>
          <div className="stat-card-icon green">🟢</div>
        </div>
        <div className="stat-card glass">
          <div className="stat-card-info">
            <div className="stat-card-label">Off Duty</div>
            <div className="stat-card-value">{offDuty.length}</div>
          </div>
          <div className="stat-card-icon amber">🔴</div>
        </div>
        <div className="stat-card glass">
          <div className="stat-card-info">
            <div className="stat-card-label">Active Tasks</div>
            <div className="stat-card-value" style={{ color: 'var(--accent-light)' }}>{tasks.length}</div>
          </div>
          <div className="stat-card-icon purple">📋</div>
        </div>
      </div>

      {/* Team Table */}
      <div className="glass" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Floor</th>
              <th>Zone</th>
              <th>Status</th>
              <th>Last Active</th>
            </tr>
          </thead>
          <tbody>
            {team.map((member) => (
              <tr key={member._id}>
                <td style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="sidebar-user-avatar" style={{
                    width: 32, height: 32, fontSize: '0.7rem',
                    background: member.is_on_duty
                      ? 'linear-gradient(135deg, var(--success), #16a34a)'
                      : 'linear-gradient(135deg, var(--text-muted), #475569)',
                  }}>
                    {initials(member.name)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{member.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{member.email}</div>
                  </div>
                </td>
                <td>
                  <span style={{
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    background: member.role === 'manager' ? 'rgba(99,102,241,0.12)' : 'rgba(59,130,246,0.12)',
                    color: member.role === 'manager' ? 'var(--accent-light)' : 'var(--info)',
                  }}>
                    {member.role}
                  </span>
                </td>
                <td>{member.floor_assignment ?? '—'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{member.zone_assignment || '—'}</td>
                <td>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: '0.8rem', fontWeight: 600,
                    color: member.is_on_duty ? 'var(--success)' : 'var(--text-muted)',
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: member.is_on_duty ? 'var(--success)' : 'var(--text-muted)',
                    }} />
                    {member.is_on_duty ? 'On Duty' : 'Off Duty'}
                  </span>
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {member.last_duty_at ? timeAgo(member.last_duty_at) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* My Active Tasks */}
      {tasks.length > 0 && (
        <div className="panel glass" style={{ marginTop: 24 }}>
          <div className="panel-header">
            <h3 className="panel-title">📋 My Active Tasks <span className="panel-badge">{tasks.length}</span></h3>
          </div>
          <div className="task-list">
            {tasks.map((task) => (
              <div key={task._id} className="task-item">
                <div className={`task-status-dot ${task.status}`} />
                <div className="task-item-body">
                  <div className="task-item-title">{task.action || task.title}</div>
                  <div className="task-item-meta">{task.status} · {timeAgo(task.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
