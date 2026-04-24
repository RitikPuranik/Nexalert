import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { get, post } from '../lib/api';
import { useSSE } from '../lib/useSSE';
import { INCIDENT_ICONS, SEVERITY_LABELS, timeAgo, eventCategory, formatTime } from '../lib/utils';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hotelId = user?.profile?.hotel_id;
  const { events } = useSSE(hotelId);

  const [incidents, setIncidents] = useState([]);
  const [team, setTeam] = useState([]);
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    if (!hotelId) return;
    Promise.all([
      get('/api/incidents?status=detecting,triaging,active,investigating').catch(() => []),
      get('/api/staff/team').catch(() => []),
      get('/api/guests/locations').catch(() => []),
    ]).then(([inc, t, g]) => {
      setIncidents(Array.isArray(inc) ? inc : []);
      setTeam(Array.isArray(t) ? t : []);
      setGuests(Array.isArray(g) ? g : []);
    }).finally(() => setLoading(false));
  }, [hotelId]);

  // Auto-refresh incidents from SSE events
  useEffect(() => {
    if (events.length > 0 && events[0]?.type?.startsWith('incident')) {
      get('/api/incidents?status=detecting,triaging,active,investigating')
        .then(inc => setIncidents(Array.isArray(inc) ? inc : []))
        .catch(() => {});
    }
  }, [events]);

  const activeIncidents = incidents.filter(i => !['resolved', 'false_alarm'].includes(i.status));
  const onDutyStaff = team.filter(s => s.is_on_duty);
  const criticalCount = activeIncidents.filter(i => i.severity === 1).length;

  async function handleSimulation() {
    setSimulating(true);
    try {
      await post('/api/simulate/cascading-failure', { hotel_id: hotelId });
      // Refresh after simulation
      setTimeout(() => {
        get('/api/incidents?status=detecting,triaging,active,investigating')
          .then(inc => setIncidents(Array.isArray(inc) ? inc : []))
          .catch(() => {});
        setSimulating(false);
      }, 3000);
    } catch (err) {
      console.error('Simulation failed:', err);
      setSimulating(false);
    }
  }

  if (loading) {
    return <div className="loading-page"><div className="loading-spinner" /><span>Loading dashboard…</span></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Real-time crisis monitoring for {user?.profile?.name || 'Manager'}</p>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card glass">
          <div className="stat-card-info">
            <div className="stat-card-label">Active Incidents</div>
            <div className="stat-card-value" style={{ color: activeIncidents.length > 0 ? 'var(--severity-1)' : 'var(--success)' }}>
              {activeIncidents.length}
            </div>
            <div className="stat-card-change" style={{ color: 'var(--text-muted)' }}>
              {criticalCount > 0 ? `${criticalCount} critical` : 'All clear'}
            </div>
          </div>
          <div className="stat-card-icon red">🚨</div>
        </div>

        <div className="stat-card glass">
          <div className="stat-card-info">
            <div className="stat-card-label">Staff On Duty</div>
            <div className="stat-card-value">{onDutyStaff.length}</div>
            <div className="stat-card-change" style={{ color: 'var(--text-muted)' }}>
              of {team.length} total
            </div>
          </div>
          <div className="stat-card-icon blue">👥</div>
        </div>

        <div className="stat-card glass">
          <div className="stat-card-info">
            <div className="stat-card-label">Guests Checked In</div>
            <div className="stat-card-value">{guests.length}</div>
            <div className="stat-card-change" style={{ color: 'var(--text-muted)' }}>
              across all floors
            </div>
          </div>
          <div className="stat-card-icon green">🏨</div>
        </div>

        <div className="stat-card glass">
          <div className="stat-card-info">
            <div className="stat-card-label">System Status</div>
            <div className="stat-card-value" style={{ color: 'var(--success)', fontSize: '1.5rem' }}>HEALTHY</div>
            <div className="stat-card-change" style={{ color: 'var(--text-muted)' }}>
              All systems operational
            </div>
          </div>
          <div className="stat-card-icon purple">💚</div>
        </div>
      </div>

      <div className="grid-2-1">
        {/* Active Incidents */}
        <div className="panel glass">
          <div className="panel-header">
            <h3 className="panel-title">
              🔴 Active Incidents
              <span className="panel-badge">{activeIncidents.length}</span>
            </h3>
            <button className="btn btn-danger btn-sm" onClick={handleSimulation} disabled={simulating}>
              {simulating ? '⏳ Running…' : '🧪 Simulate Crisis'}
            </button>
          </div>

          {activeIncidents.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <p className="empty-state-text">No active incidents. Everything is secure.</p>
            </div>
          ) : (
            <div className="incident-list">
              {activeIncidents.map((inc) => (
                <div
                  key={inc._id}
                  className="incident-card glass"
                  onClick={() => navigate(`/dashboard/warroom/${inc._id}`)}
                >
                  <div className="incident-card-icon" style={{ background: `rgba(239,68,68,0.1)` }}>
                    {INCIDENT_ICONS[inc.type] || '❓'}
                  </div>
                  <div className="incident-card-body">
                    <div className="incident-card-title">
                      {inc.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      {inc.is_cascade && <span style={{ color: 'var(--danger)', marginLeft: 8, fontSize: '0.7rem' }}>⚡ CASCADE</span>}
                    </div>
                    <div className="incident-card-meta">
                      <span>Floor {inc.floor}</span>
                      {inc.zone && <span>· {inc.zone}</span>}
                      <span>· {inc.source}</span>
                      <span>· {timeAgo(inc.createdAt)}</span>
                    </div>
                  </div>
                  <div className="incident-card-right">
                    {inc.severity && (
                      <span className={`severity-badge s${inc.severity}`}>
                        {SEVERITY_LABELS[inc.severity]}
                      </span>
                    )}
                    <span className={`status-badge ${inc.status}`}>{inc.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Event Feed */}
        <div className="panel glass">
          <div className="panel-header">
            <h3 className="panel-title">
              ⚡ Live Feed
              <span className="panel-badge">{events.length}</span>
            </h3>
          </div>
          <div className="timeline">
            {events.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📡</div>
                <p className="empty-state-text">Waiting for events…</p>
              </div>
            ) : (
              events.slice(0, 20).map((evt) => (
                <div key={evt._id} className="timeline-item">
                  <div className={`timeline-dot ${eventCategory(evt.type)}`} />
                  <div>
                    <div className="timeline-text">
                      <strong>{evt.type.replace(/:/g, ' → ')}</strong>
                      {evt.floor && <span> · Floor {evt.floor}</span>}
                      {evt.room && <span> · Room {evt.room}</span>}
                    </div>
                    <div className="timeline-time">{evt.ts ? formatTime(evt.ts) : ''}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
