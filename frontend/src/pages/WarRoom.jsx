import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { get, patch } from '../lib/api';
import { getSocket } from '../lib/socket';
import { INCIDENT_ICONS, SEVERITY_LABELS, STATUS_LABELS, timeAgo, formatTime, initials } from '../lib/utils';

export default function WarRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const hotelId = user?.profile?.hotel_id;

  const [warroom, setWarroom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const chatEndRef = useRef(null);
  const socketRef = useRef(null);

  // Load war room data
  useEffect(() => {
    if (!id || !hotelId) return;
    setLoading(true);
    get(`/api/realtime/warroom?incident_id=${id}`)
      .then(setWarroom)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, hotelId]);

  // Socket.IO for chat
  useEffect(() => {
    if (!hotelId || !id) return;
    const socket = getSocket(hotelId);
    socketRef.current = socket;

    socket.emit('join:incident', id);

    socket.emit('warroom:chat:history', { incident_id: id }, (history) => {
      if (Array.isArray(history)) setMessages(history);
    });

    socket.on('warroom:chat', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.off('warroom:chat');
      socket.emit('leave:incident', id);
    };
  }, [hotelId, id]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-refresh war room every 15s
  useEffect(() => {
    if (!id || !hotelId) return;
    const interval = setInterval(() => {
      get(`/api/realtime/warroom?incident_id=${id}`)
        .then(setWarroom)
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [id, hotelId]);

  function sendMessage() {
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit('warroom:chat', {
      incident_id: id,
      text: chatInput.trim(),
      sender_name: user?.profile?.name || 'Manager',
      sender_role: user?.profile?.role || 'manager',
    });
    setChatInput('');
  }

  async function handleAction(action) {
    setActionLoading(action);
    try {
      await patch(`/api/incidents/${id}`, { action });
      const updated = await get(`/api/realtime/warroom?incident_id=${id}`);
      setWarroom(updated);
    } catch (err) {
      console.error('Action failed:', err);
    }
    setActionLoading(null);
  }

  async function handleTaskAction(taskId, action) {
    try {
      await patch(`/api/incidents/${id}/tasks?task_id=${taskId}`, { action });
      const updated = await get(`/api/realtime/warroom?incident_id=${id}`);
      setWarroom(updated);
    } catch (err) {
      console.error('Task action failed:', err);
    }
  }

  if (loading) return <div className="loading-page"><div className="loading-spinner" /><span>Loading war room…</span></div>;
  if (error) return <div className="loading-page"><span>❌ {error}</span><button className="btn" onClick={() => navigate('/dashboard')}>Back to Dashboard</button></div>;
  if (!warroom) return null;

  const { incident, floor_heatmap, guest_accountability, task_progress, staff_presence, tasks, deadman_sessions } = warroom;
  const heatmapEntries = Object.values(floor_heatmap || {});

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {INCIDENT_ICONS[incident.type] || '❓'} War Room
            {incident.severity && <span className={`severity-badge s${incident.severity}`}>{SEVERITY_LABELS[incident.severity]}</span>}
            <span className={`status-badge ${incident.status}`}>{STATUS_LABELS[incident.status]}</span>
            {incident.is_cascade && <span className="severity-badge s1">⚡ CASCADE</span>}
          </h1>
          <p>
            {incident.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} — Floor {incident.floor}
            {incident.zone && ` · ${incident.zone}`}
            {incident.room && ` · Room ${incident.room}`}
            {' · '}{timeAgo(incident.createdAt)}
          </p>
        </div>
        <button className="btn" onClick={() => navigate('/dashboard')}>← Back</button>
      </div>

      {/* 3-Column Layout */}
      <div className="warroom-layout">
        {/* LEFT: Incident Details + Actions */}
        <div className="warroom-col">
          {/* AI Briefing */}
          <div className="panel glass">
            <h3 className="panel-title" style={{ marginBottom: 12 }}>🧠 AI Briefing</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {incident.manager_briefing || 'AI triage pending…'}
            </p>
            {incident.severity_reason && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 8 }}>
                Severity reason: {incident.severity_reason}
              </p>
            )}
            {incident.recommend_911 && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.85rem', color: 'var(--severity-1)' }}>
                ⚠️ 911 Recommended: {incident.recommend_911_reason || 'Critical severity'}
              </div>
            )}
            {incident.correlation_reason && (
              <p style={{ fontSize: '0.8rem', color: 'var(--accent-light)', marginTop: 8 }}>
                🔗 {incident.correlation_reason}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="panel glass">
            <h3 className="panel-title" style={{ marginBottom: 12 }}>⚡ Actions</h3>
            <div className="btn-group" style={{ flexDirection: 'column' }}>
              {incident.status === 'detecting' && (
                <button className="btn btn-primary" onClick={() => handleAction('confirm')} disabled={!!actionLoading}>
                  {actionLoading === 'confirm' ? '⏳' : '✅'} Confirm Incident
                </button>
              )}
              {['detecting', 'active', 'investigating'].includes(incident.status) && (
                <button className="btn btn-success" onClick={() => handleAction('resolve')} disabled={!!actionLoading}>
                  {actionLoading === 'resolve' ? '⏳' : '✅'} Resolve
                </button>
              )}
              {!incident.escalated_to_911_at && incident.status !== 'resolved' && (
                <button className="btn btn-danger" onClick={() => handleAction('escalate_911')} disabled={!!actionLoading}>
                  {actionLoading === 'escalate_911' ? '⏳' : '🚨'} Escalate to 911
                </button>
              )}
              {incident.status !== 'resolved' && (
                <button className="btn" onClick={() => handleAction('false_alarm')} disabled={!!actionLoading}>
                  {actionLoading === 'false_alarm' ? '⏳' : '🚫'} False Alarm
                </button>
              )}
              {incident.escalated_to_911_at && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--severity-1)' }}>
                  🚨 911 Escalated at {formatTime(incident.escalated_to_911_at)}
                </div>
              )}
            </div>
          </div>

          {/* Staff Presence */}
          <div className="panel glass">
            <h3 className="panel-title" style={{ marginBottom: 12 }}>
              👥 Staff on Scene <span className="panel-badge">{staff_presence?.active?.length || 0}</span>
            </h3>
            {(staff_presence?.active || []).length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No staff on scene yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {staff_presence.active.map((sp) => (
                  <div key={sp._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: '0.85rem' }}>
                    <div className="sidebar-user-avatar" style={{ width: 28, height: 28, fontSize: '0.65rem' }}>
                      {initials(sp.staff_id?.name)}
                    </div>
                    <span>{sp.staff_id?.name || 'Unknown'}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {sp.staff_id?.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {(staff_presence?.silent || []).length > 0 && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(245,158,11,0.1)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--warning)' }}>
                ⚠️ {staff_presence.silent.length} staff unresponsive
              </div>
            )}
          </div>
        </div>

        {/* CENTER: Floor Heatmap + Guest Accountability */}
        <div className="warroom-col">
          {/* Guest Accountability */}
          <div className="panel glass">
            <h3 className="panel-title" style={{ marginBottom: 12 }}>
              🏨 Guest Accountability — Floor {incident.floor}
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 16, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>{guest_accountability?.safe || 0}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Safe</div>
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)' }}>{guest_accountability?.needs_help || 0}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Need Help</div>
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--warning)' }}>{guest_accountability?.no_response || 0}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No Response</div>
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-muted)' }}>{guest_accountability?.not_notified || 0}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Not Notified</div>
              </div>
            </div>

            {/* Accountability bar */}
            {guest_accountability && guest_accountability.total > 0 && (
              <>
                <div className="accountability-bar">
                  <div className="accountability-bar-seg safe" style={{ width: `${(guest_accountability.safe / guest_accountability.total) * 100}%` }} />
                  <div className="accountability-bar-seg needs-help" style={{ width: `${(guest_accountability.needs_help / guest_accountability.total) * 100}%` }} />
                  <div className="accountability-bar-seg no-resp" style={{ width: `${(guest_accountability.no_response / guest_accountability.total) * 100}%` }} />
                  <div className="accountability-bar-seg unknown" style={{ width: `${(guest_accountability.not_notified / guest_accountability.total) * 100}%` }} />
                </div>
                <div className="accountability-legend">
                  <div className="accountability-legend-item"><div className="accountability-legend-dot" style={{ background: 'var(--success)' }} /> Safe</div>
                  <div className="accountability-legend-item"><div className="accountability-legend-dot" style={{ background: 'var(--danger)' }} /> Help</div>
                  <div className="accountability-legend-item"><div className="accountability-legend-dot" style={{ background: 'var(--warning)' }} /> No Response</div>
                  <div className="accountability-legend-item"><div className="accountability-legend-dot" style={{ background: 'var(--text-muted)' }} /> Unknown</div>
                </div>
              </>
            )}
          </div>

          {/* Floor Heatmap */}
          <div className="panel glass">
            <h3 className="panel-title" style={{ marginBottom: 12 }}>
              🗺️ Floor {incident.floor} Heatmap
              <span className="panel-badge">{heatmapEntries.length} rooms</span>
            </h3>
            {heatmapEntries.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>
                <p className="empty-state-text">No guest data for this floor</p>
              </div>
            ) : (
              <div className="heatmap-grid">
                {heatmapEntries.map((cell) => (
                  <div key={cell.room} className={`heatmap-cell ${cell.color}`} title={`${cell.guest_name || 'Guest'} — ${cell.status}`}>
                    <div className="heatmap-cell-room">{cell.room}</div>
                    <div className="heatmap-cell-status">{cell.status?.replace(/_/g, ' ')}</div>
                    {cell.deadman?.status === 'escalated' && (
                      <div style={{ fontSize: '0.6rem', marginTop: 2 }}>💀</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dead Man's Switch */}
          {deadman_sessions && deadman_sessions.length > 0 && (
            <div className="panel glass">
              <h3 className="panel-title" style={{ marginBottom: 12 }}>
                💀 Dead Man's Switch <span className="panel-badge">{deadman_sessions.length}</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {deadman_sessions.map((dm) => (
                  <div key={dm._id} style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                    background: dm.status === 'escalated' ? 'rgba(239,68,68,0.1)' : 'var(--bg-input)',
                    border: `1px solid ${dm.status === 'escalated' ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                    color: dm.status === 'escalated' ? 'var(--danger)' : 'var(--text-secondary)',
                  }}>
                    Room {dm.room} · Floor {dm.floor} · Missed: {dm.missed_pings} · {dm.status}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Tasks + Chat */}
        <div className="warroom-col">
          {/* Task Progress */}
          <div className="panel glass">
            <h3 className="panel-title" style={{ marginBottom: 12 }}>
              📋 Tasks
              <span className="panel-badge">{task_progress?.completed || 0}/{task_progress?.total || 0}</span>
            </h3>
            {task_progress && task_progress.total > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{ width: `${task_progress.completion_rate}%` }} />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {task_progress.completion_rate}% complete
                </div>
              </div>
            )}
            <div className="task-list">
              {(tasks || []).length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>
                  Tasks will appear after AI triage
                </p>
              ) : (
                tasks.map((task) => (
                  <div key={task._id} className="task-item">
                    <div className={`task-status-dot ${task.status}`} />
                    <div className="task-item-body">
                      <div className="task-item-title">{task.action || task.title || 'Task'}</div>
                      <div className="task-item-meta">
                        {task.assigned_to?.name || 'Unassigned'} · {task.status}
                      </div>
                    </div>
                    {task.status === 'pending' && (
                      <button className="task-item-btn" onClick={() => handleTaskAction(task._id, 'accept')}>Accept</button>
                    )}
                    {['accepted', 'in_progress'].includes(task.status) && (
                      <button className="task-item-btn" onClick={() => handleTaskAction(task._id, 'complete')}>Done</button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* War Room Chat */}
          <div className="panel glass chat-panel">
            <div className="panel-header" style={{ padding: '12px 16px 0' }}>
              <h3 className="panel-title">
                💬 War Room Chat
                <span className="panel-badge">{messages.length}</span>
              </h3>
            </div>
            <div className="chat-messages">
              {messages.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
                  No messages yet. Start the coordination.
                </p>
              ) : (
                messages.map((msg, i) => (
                  <div key={msg._id || i} className="chat-msg">
                    <div className="chat-msg-avatar">{initials(msg.sender_name)}</div>
                    <div className="chat-msg-content">
                      <div className="chat-msg-header">
                        <span className="chat-msg-name">{msg.sender_name}</span>
                        <span className="chat-msg-role">{msg.sender_role}</span>
                        {msg.createdAt && <span className="chat-msg-time">{formatTime(msg.createdAt)}</span>}
                      </div>
                      <div className="chat-msg-text">{msg.text}</div>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="chat-input-area">
              <input
                className="chat-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message…"
              />
              <button className="chat-send-btn" onClick={sendMessage} disabled={!chatInput.trim()}>
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
