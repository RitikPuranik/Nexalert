import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { get, patch } from '../lib/api';
import { getSocket } from '../lib/socket';
import { INCIDENT_ICONS, SEVERITY_LABELS, STATUS_LABELS, timeAgo, formatTime, initials } from '../lib/utils';

const SEVERITY_STYLES = {
  1: 'bg-red-500/15 text-red-400 border border-red-500/25',
  2: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  3: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',
};

const MANAGER_ACTIONS = [
  { action: 'confirm',      label: 'Confirm',     icon: '✅', style: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-400' },
  { action: 'resolve',      label: 'Resolve',     icon: '🏁', style: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20 text-blue-400' },
  { action: 'false_alarm',  label: 'False Alarm', icon: '🔕', style: 'bg-slate-500/10 hover:bg-slate-500/20 border-slate-500/20 text-slate-400' },
  { action: 'escalate_911',label: '911',          icon: '📞', style: 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20 text-red-400' },
];

const TASK_ACTIONS = [
  { action: 'accept',   label: 'Accept',   style: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20 text-blue-400' },
  { action: 'start',    label: 'Start',    style: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 text-amber-400' },
  { action: 'complete', label: 'Complete', style: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-400' },
  { action: 'skip',     label: 'Skip',     style: 'bg-slate-500/10 hover:bg-slate-500/20 border-slate-500/20 text-slate-400' },
];

const TASK_STATUS_STYLES = {
  pending:    'bg-slate-500/10 text-slate-400',
  accepted:   'bg-blue-500/10 text-blue-400',
  in_progress:'bg-amber-500/10 text-amber-400',
  completed:  'bg-emerald-500/10 text-emerald-400',
  skipped:    'bg-slate-500/10 text-slate-500 line-through',
};

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

  useEffect(() => {
    if (!id || !hotelId) return;
    setLoading(true);
    get(`/api/realtime/warroom?incident_id=${id}`)
      .then(setWarroom)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, hotelId]);

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

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    if (!id || !hotelId) return;
    const interval = setInterval(() => {
      get(`/api/realtime/warroom?incident_id=${id}`).then(setWarroom).catch(() => {});
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
    } catch (err) { console.error(err); }
    setActionLoading(null);
  }

  async function handleTaskAction(taskId, action) {
    try {
      await patch(`/api/incidents/${id}/tasks?task_id=${taskId}`, { action });
      const updated = await get(`/api/realtime/warroom?incident_id=${id}`);
      setWarroom(updated);
    } catch (err) { console.error(err); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        <span className="text-slate-500 text-sm">Loading war room…</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="text-red-400 text-lg">❌ {error}</div>
      <button onClick={() => navigate('/dashboard/incidents')}
        className="text-sm text-indigo-400 hover:text-indigo-300">← Back to Incidents</button>
    </div>
  );

  const inc = warroom?.incident;
  const tasks = warroom?.tasks || [];
  const guests = warroom?.guests || [];
  const presence = warroom?.presence || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/dashboard/incidents')}
          className="mt-1 text-slate-500 hover:text-white text-sm font-medium transition-colors">← Back</button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-xl">
              {INCIDENT_ICONS[inc?.type] || '❓'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white capitalize">
                {inc?.type?.replace(/_/g, ' ')} — Floor {inc?.floor}
                {inc?.is_cascade && <span className="ml-2 text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded">⚡ CASCADE</span>}
              </h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {inc?.severity && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${SEVERITY_STYLES[inc.severity]}`}>
                    {SEVERITY_LABELS[inc.severity]}
                  </span>
                )}
                <span className="text-xs text-slate-500">Source: {inc?.source}</span>
                <span className="text-xs text-slate-500">{timeAgo(inc?.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
        {inc?.status && (
          <span className={`text-xs font-semibold border px-3 py-1.5 rounded-xl capitalize ${
            inc.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : inc.status === 'active' ? 'bg-red-500/10 text-red-400 border-red-500/20'
            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
          }`}>
            {STATUS_LABELS[inc.status] || inc.status}
          </span>
        )}
      </div>

      {/* AI Summary */}
      {inc?.ai_summary && (
        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl px-6 py-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">🤖 AI Analysis</span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{inc.ai_summary}</p>
        </div>
      )}

      {/* Manager Actions */}
      <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl p-5">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Manager Actions</h3>
        <div className="flex flex-wrap gap-2">
          {MANAGER_ACTIONS.map(({ action, label, icon, style }) => (
            <button
              key={action}
              onClick={() => handleAction(action)}
              disabled={!!actionLoading}
              className={`flex items-center gap-2 border text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-150 disabled:opacity-50 ${style}`}
            >
              {actionLoading === action ? (
                <div className="w-3.5 h-3.5 border border-current/30 border-t-current rounded-full animate-spin" />
              ) : icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        {/* Left column */}
        <div className="space-y-5">
          {/* Tasks */}
          <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h3 className="font-semibold text-white">Response Tasks</h3>
              <span className="text-xs text-slate-500">{tasks.filter(t => t.status === 'completed').length}/{tasks.length} done</span>
            </div>
            <div className="divide-y divide-white/4">
              {tasks.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-sm">No tasks assigned yet</div>
              ) : (
                tasks.map((task) => (
                  <div key={task._id} className="p-4 flex items-start gap-4">
                    <div className={`mt-0.5 px-2 py-1 rounded text-[10px] font-bold uppercase ${TASK_STATUS_STYLES[task.status] || 'bg-slate-500/10 text-slate-400'}`}>
                      {task.status?.replace(/_/g,' ')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{task.title}</p>
                      {task.description && <p className="text-xs text-slate-500 mt-0.5">{task.description}</p>}
                      {task.assigned_to_name && (
                        <p className="text-xs text-indigo-400 mt-1">→ {task.assigned_to_name}</p>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                      {TASK_ACTIONS.map(({ action, label, style }) => (
                        <button
                          key={action}
                          onClick={() => handleTaskAction(task._id, action)}
                          className={`border text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${style}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Guest responses */}
          {guests.length > 0 && (
            <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl">
              <div className="px-6 py-4 border-b border-white/5">
                <h3 className="font-semibold text-white">Guest Responses</h3>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {guests.map((g) => (
                  <div key={g._id} className={`p-3 rounded-xl border text-xs ${
                    g.response === 'safe' ? 'bg-emerald-500/10 border-emerald-500/20'
                    : g.response === 'needs_help' ? 'bg-red-500/10 border-red-500/20'
                    : 'bg-white/5 border-white/10'
                  }`}>
                    <div className="font-semibold text-white mb-0.5">Room {g.room}</div>
                    <div className="text-slate-400">Floor {g.floor}</div>
                    <div className={`mt-1 font-bold uppercase text-[10px] ${
                      g.response === 'safe' ? 'text-emerald-400'
                      : g.response === 'needs_help' ? 'text-red-400'
                      : 'text-slate-500'
                    }`}>
                      {g.response === 'safe' ? '✅ Safe' : g.response === 'needs_help' ? '🆘 Needs Help' : 'No Response'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Staff Presence */}
          {presence.length > 0 && (
            <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl">
              <div className="px-6 py-4 border-b border-white/5">
                <h3 className="font-semibold text-white">Staff On Scene</h3>
              </div>
              <div className="p-4 flex flex-wrap gap-3">
                {presence.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-2 rounded-xl">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300">
                      {initials(p.staff_name || p.name)}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">{p.staff_name || p.name}</div>
                      <div className="text-[10px] text-slate-500">{p.role}</div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* War Room Chat */}
        <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl flex flex-col h-[560px]">
          <div className="px-5 py-4 border-b border-white/5">
            <h3 className="font-semibold text-white">War Room Chat</h3>
            <p className="text-xs text-slate-500 mt-0.5">Real-time incident coordination</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                <div className="text-3xl">💬</div>
                <p className="text-sm">No messages yet</p>
              </div>
            ) : (
              messages.map((msg, i) => {
                const isMe = msg.sender_name === (user?.profile?.name);
                return (
                  <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold text-slate-500">{msg.sender_name}</span>
                      <span className="text-[9px] text-slate-600 capitalize bg-white/5 px-1.5 py-0.5 rounded">{msg.sender_role}</span>
                      {msg.ts && <span className="text-[9px] text-slate-700 font-mono">{formatTime(msg.ts)}</span>}
                    </div>
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                      isMe
                        ? 'bg-indigo-500/20 border border-indigo-500/20 text-white rounded-tr-sm'
                        : 'bg-white/5 border border-white/8 text-slate-200 rounded-tl-sm'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-white/5">
            <div className="flex gap-2">
              <input
                className="flex-1 bg-[#080d1a] border border-white/10 focus:border-indigo-500/50 focus:outline-none text-white placeholder-slate-600 rounded-xl px-4 py-2.5 text-sm"
                placeholder="Type a message…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              />
              <button
                onClick={sendMessage}
                disabled={!chatInput.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl transition-all font-medium text-sm"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
