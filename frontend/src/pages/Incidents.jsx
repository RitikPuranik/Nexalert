import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../lib/api';
import { INCIDENT_ICONS, SEVERITY_LABELS, STATUS_LABELS, timeAgo } from '../lib/utils';

export default function Incidents() {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: 'fire', floor: 1, zone: '', room: '' });

  useEffect(() => {
    loadIncidents();
  }, [filter]);

  async function loadIncidents() {
    setLoading(true);
    try {
      const query = filter === 'all' ? '' : `?status=${filter}`;
      const data = await get(`/api/incidents${query}`);
      setIncidents(Array.isArray(data) ? data : []);
    } catch { setIncidents([]); }
    setLoading(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await post('/api/incidents', form);
      setShowCreate(false);
      setForm({ type: 'fire', floor: 1, zone: '', room: '' });
      loadIncidents();
    } catch (err) {
      console.error('Create failed:', err);
    }
    setCreating(false);
  }

  const filters = [
    { value: 'all', label: 'All' },
    { value: 'detecting,triaging,active,investigating', label: 'Active' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'false_alarm', label: 'False Alarms' },
  ];

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Incidents</h1>
          <p>All incidents across your hotel</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          ➕ Create Incident
        </button>
      </div>

      {/* Filters */}
      <div className="btn-group" style={{ marginBottom: 20 }}>
        {filters.map((f) => (
          <button
            key={f.value}
            className={`btn btn-sm ${filter === f.value ? 'btn-primary' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-page"><div className="loading-spinner" /></div>
      ) : incidents.length === 0 ? (
        <div className="empty-state glass" style={{ padding: 48, borderRadius: 'var(--radius-lg)' }}>
          <div className="empty-state-icon">📭</div>
          <p className="empty-state-text">No incidents matching this filter</p>
        </div>
      ) : (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Floor</th>
                <th>Severity</th>
                <th>Source</th>
                <th>Status</th>
                <th>Tasks</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <tr key={inc._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/dashboard/warroom/${inc._id}`)}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{INCIDENT_ICONS[inc.type] || '❓'}</span>
                    <span style={{ fontWeight: 600 }}>{inc.type.replace(/_/g, ' ')}</span>
                    {inc.is_cascade && <span style={{ fontSize: '0.65rem', color: 'var(--danger)' }}>⚡</span>}
                  </td>
                  <td>{inc.floor}{inc.zone ? ` · ${inc.zone}` : ''}</td>
                  <td>
                    {inc.severity ? (
                      <span className={`severity-badge s${inc.severity}`}>{SEVERITY_LABELS[inc.severity]}</span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{inc.source}</td>
                  <td><span className={`status-badge ${inc.status}`}>{STATUS_LABELS[inc.status]}</span></td>
                  <td>
                    {inc.tasks_total > 0 ? (
                      <span style={{ fontSize: '0.8rem' }}>
                        {inc.tasks_completed}/{inc.tasks_total}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{timeAgo(inc.createdAt)}</td>
                  <td>
                    <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/warroom/${inc._id}`); }}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">🚨 Create Incident</h2>
              <button className="modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    {['fire', 'smoke', 'gas_leak', 'medical', 'security', 'flood', 'earthquake', 'sos'].map((t) => (
                      <option key={t} value={t}>{INCIDENT_ICONS[t]} {t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Floor</label>
                    <input className="form-input" type="number" min="1" max="99" value={form.floor}
                           onChange={(e) => setForm({ ...form, floor: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Zone (optional)</label>
                    <input className="form-input" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })}
                           placeholder="e.g. east_wing" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Room (optional)</label>
                  <input className="form-input" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}
                         placeholder="e.g. 301" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? '⏳ Creating…' : '🚨 Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
