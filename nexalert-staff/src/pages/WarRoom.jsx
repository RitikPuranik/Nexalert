import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { INCIDENT_ICONS, SEVERITY_LABELS, STATUS_LABELS, timeAgo, formatTime, initials } from '../lib/utils.js';

const SEV = {1:'bg-red-500/12 text-red-400 border-red-500/20',2:'bg-amber-500/12 text-amber-400 border-amber-500/20',3:'bg-blue-500/12 text-blue-400 border-blue-500/20'};
const TASK_S = {pending:'bg-slate-500/10 text-slate-400',accepted:'bg-blue-500/10 text-blue-400',in_progress:'bg-amber-500/10 text-amber-400',completed:'bg-emerald-500/10 text-emerald-400',skipped:'bg-slate-500/8 text-slate-600'};
const MGMT_ACTIONS = [
  {a:'confirm',    l:'Confirm',     s:'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-400'},
  {a:'resolve',    l:'Resolve',     s:'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20 text-blue-400'},
  {a:'false_alarm',l:'False Alarm', s:'bg-slate-500/10 hover:bg-slate-500/20 border-slate-500/20 text-slate-400'},
  {a:'escalate_911',l:'Call 911',   s:'bg-red-500/10 hover:bg-red-500/20 border-red-500/20 text-red-400'},
];
const TASK_ACTIONS = [
  {a:'accept',  l:'Accept',  s:'text-blue-400 border-blue-500/20 hover:bg-blue-500/10'},
  {a:'start',   l:'Start',   s:'text-amber-400 border-amber-500/20 hover:bg-amber-500/10'},
  {a:'complete',l:'Done',    s:'text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10'},
  {a:'skip',    l:'Skip',    s:'text-slate-400 border-slate-500/20 hover:bg-slate-500/10'},
];

export default function WarRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isManager = profile?.role === 'manager';

  const [warroom, setWarroom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [messages,setMessages]= useState([]);
  const [chat,    setChat]    = useState('');
  const [actLoading, setActLoading] = useState(null);
  const chatRef = useRef(null);
  const socketRef = useRef(null);

  async function loadWarRoom() {
    try {
      const data = await api.get(`/api/realtime/warroom?incident_id=${id}`);
      setWarroom(data);
    } catch(e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { if (id && profile) loadWarRoom(); }, [id, profile]);

  useEffect(() => {
    if (!id || !profile?.hotel_id) return;
    let sock;
    getSocket(profile.hotel_id).then(s => {
      sock = s;
      socketRef.current = s;
      s.emit('join:incident', id);
      s.emit('warroom:chat:history', { incident_id: id }, (history) => {
        if (Array.isArray(history)) setMessages(history);
      });
      s.on('warroom:chat', msg => setMessages(p => [...p, msg]));
      s.on('incident:updated', () => loadWarRoom());
    });
    const poll = setInterval(() => loadWarRoom(), 20000);
    return () => {
      clearInterval(poll);
      sock?.off('warroom:chat');
      sock?.off('incident:updated');
      sock?.emit('leave:incident', id);
    };
  }, [id, profile?.hotel_id]);

  useEffect(() => { chatRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  function sendChat() {
    if (!chat.trim() || !socketRef.current) return;
    socketRef.current.emit('warroom:chat', {
      incident_id: id,
      text: chat.trim(),
      sender_name: profile?.name || 'Staff',
      sender_role: profile?.role || 'staff',
    });
    setChat('');
  }

  async function doAction(action) {
    setActLoading(action);
    try {
      await api.patch(`/api/incidents/${id}`, { action });
      await loadWarRoom();
    } catch(e) { alert(e.message); }
    setActLoading(null);
  }

  async function doTaskAction(taskId, action) {
    try {
      await api.patch(`/api/incidents/${id}/tasks?task_id=${taskId}`, { action });
      await loadWarRoom();
    } catch(e) { alert(e.message); }
  }

  async function presencePing() {
    try { await api.post('/api/staff/presence/ping', { incident_id: id }); }
    catch { /* ignore */ }
  }

  useEffect(() => {
    if (!id) return;
    presencePing();
    const i = setInterval(presencePing, 60000);
    return () => clearInterval(i);
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"/>
    </div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-red-400">❌ {error}</p>
      <button onClick={() => navigate('/dashboard/incidents')} className="text-sm text-indigo-400 hover:text-indigo-300">← Back</button>
    </div>
  );

  const inc = warroom?.incident;
  const tasks = warroom?.tasks || [];
  const guests = warroom?.guests || [];
  const presence = warroom?.presence || [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/dashboard/incidents')} className="text-slate-600 hover:text-slate-300 text-sm mt-1 transition-colors">←</button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-2xl">{INCIDENT_ICONS[inc?.type]||'❓'}</span>
            <div>
              <h1 className="text-xl font-bold text-white capitalize flex items-center gap-2">
                {inc?.type?.replace(/_/g,' ')} — Floor {inc?.floor}
                {inc?.is_cascade && <span className="text-xs font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">⚡CASCADE</span>}
                {inc?.is_drill && <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">DRILL</span>}
              </h1>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-600 flex-wrap">
                {inc?.severity && <span className={`font-bold border px-1.5 py-0.5 rounded ${SEV[inc.severity]}`}>{SEVERITY_LABELS[inc.severity]}</span>}
                <span>Source: {inc?.source}</span>
                <span>{timeAgo(inc?.createdAt)}</span>
                {inc?.room && <span>Room {inc.room}</span>}
              </div>
            </div>
          </div>
        </div>
        <span className={`text-xs font-semibold border px-3 py-1.5 rounded-xl capitalize ${
          inc?.status==='resolved'?'bg-emerald-500/10 text-emerald-400 border-emerald-500/15'
          :inc?.status==='active'?'bg-red-500/10 text-red-400 border-red-500/15'
          :'bg-amber-500/10 text-amber-400 border-amber-500/15'
        }`}>{STATUS_LABELS[inc?.status]||inc?.status}</span>
      </div>

      {/* AI Summary */}
      {inc?.ai_summary && (
        <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-2xl px-5 py-4">
          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">🤖 AI Analysis</p>
          <p className="text-sm text-slate-300 leading-relaxed">{inc.ai_summary}</p>
        </div>
      )}

      {/* Guest Alert Banner */}
      {inc?.guest_alert_en && (
        <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl px-5 py-3 flex items-start gap-3">
          <span className="text-lg shrink-0">📢</span>
          <div>
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1">Guest Alert (EN)</p>
            <p className="text-sm text-amber-300/80">{inc.guest_alert_en}</p>
          </div>
        </div>
      )}

      {/* Manager Actions */}
      {isManager && (
        <div className="glass rounded-2xl p-5">
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">Manager Actions</p>
          <div className="flex flex-wrap gap-2">
            {MGMT_ACTIONS.map(({a,l,s}) => (
              <button key={a} onClick={() => doAction(a)} disabled={!!actLoading}
                className={`flex items-center gap-2 border text-sm font-semibold px-4 py-2 rounded-xl transition-all disabled:opacity-50 ${s}`}>
                {actLoading===a
                  ? <div className="w-3.5 h-3.5 border border-current/30 border-t-current rounded-full animate-spin"/>
                  : null}
                {l}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5">
        <div className="space-y-5">
          {/* Tasks */}
          <div className="glass rounded-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <span className="font-semibold text-white text-sm">Response Tasks</span>
              <span className="text-xs text-slate-600">{tasks.filter(t=>t.status==='completed').length}/{tasks.length}</span>
            </div>
            <div className="divide-y divide-white/4">
              {tasks.length===0
                ? <div className="py-10 text-center text-slate-600 text-sm">No tasks yet</div>
                : tasks.map(task => (
                  <div key={task._id} className="p-4 flex items-start gap-3">
                    <span className={`text-[9px] font-bold px-2 py-1 rounded mt-0.5 shrink-0 ${TASK_S[task.status]||'bg-slate-500/10 text-slate-400'}`}>
                      {task.status?.replace(/_/g,' ')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{task.title}</p>
                      {task.description && <p className="text-xs text-slate-600 mt-0.5">{task.description}</p>}
                      {task.assigned_to_name && <p className="text-xs text-indigo-400 mt-1">→ {task.assigned_to_name}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0 flex-wrap">
                      {TASK_ACTIONS.map(({a,l,s}) => (
                        <button key={a} onClick={() => doTaskAction(task._id, a)}
                          className={`border text-[9px] font-bold px-2 py-1 rounded-lg transition-all ${s}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Guest Responses */}
          {guests.length>0 && (
            <div className="glass rounded-2xl">
              <div className="px-5 py-4 border-b border-white/5">
                <span className="font-semibold text-white text-sm">Guest Responses ({guests.length})</span>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {guests.map(g => (
                  <div key={g._id} className={`p-3 rounded-xl border text-xs ${
                    g.response==='safe'?'bg-emerald-500/8 border-emerald-500/15'
                    :g.response==='needs_help'?'bg-red-500/8 border-red-500/15'
                    :'bg-white/3 border-white/8'
                  }`}>
                    <p className="font-semibold text-white">Room {g.room}</p>
                    <p className="text-slate-500">Floor {g.floor}</p>
                    <p className={`mt-1 font-bold text-[10px] uppercase ${g.response==='safe'?'text-emerald-400':g.response==='needs_help'?'text-red-400':'text-slate-600'}`}>
                      {g.response==='safe'?'✅ Safe':g.response==='needs_help'?'🆘 Help':'No Response'}
                    </p>
                    {g.name && <p className="text-[10px] text-slate-600 mt-0.5">{g.name}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Staff Presence */}
          {presence.length>0 && (
            <div className="glass rounded-2xl">
              <div className="px-5 py-4 border-b border-white/5">
                <span className="font-semibold text-white text-sm">On-Scene Staff</span>
              </div>
              <div className="p-4 flex flex-wrap gap-2">
                {presence.map((p,i) => (
                  <div key={i} className="flex items-center gap-2 bg-white/4 border border-white/8 px-3 py-2 rounded-xl">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center text-xs font-bold text-indigo-300">{initials(p.staff_name||p.name)}</div>
                    <div>
                      <p className="text-xs font-semibold text-white">{p.staff_name||p.name}</p>
                      <p className="text-[10px] text-slate-600">{p.role}</p>
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-1"/>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="glass rounded-2xl flex flex-col" style={{height:'560px'}}>
          <div className="px-5 py-4 border-b border-white/5">
            <p className="font-semibold text-white text-sm">War Room Chat</p>
            <p className="text-[10px] text-slate-600 mt-0.5">Real-time coordination</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length===0
              ? <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-700"><span className="text-2xl">💬</span><p className="text-xs">No messages yet</p></div>
              : messages.map((msg,i) => {
                const isMe = msg.sender_name===profile?.name;
                return (
                  <div key={i} className={`flex flex-col ${isMe?'items-end':'items-start'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold text-slate-500">{msg.sender_name}</span>
                      <span className="text-[9px] text-slate-700 bg-white/4 px-1.5 py-0.5 rounded capitalize">{msg.sender_role}</span>
                      {msg.ts && <span className="text-[9px] text-slate-700 font-mono">{formatTime(msg.ts)}</span>}
                    </div>
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                      isMe?'bg-indigo-500/15 border border-indigo-500/15 text-white rounded-tr-sm'
                      :'bg-white/5 border border-white/8 text-slate-200 rounded-tl-sm'
                    }`}>{msg.text}</div>
                  </div>
                );
              })}
            <div ref={chatRef}/>
          </div>
          <div className="p-4 border-t border-white/5">
            <div className="flex gap-2">
              <input value={chat} onChange={e => setChat(e.target.value)} onKeyDown={e => e.key==='Enter'&&!e.shiftKey&&sendChat()}
                className="flex-1 bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2.5 text-sm"
                placeholder="Message…"/>
              <button onClick={sendChat} disabled={!chat.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl transition-all text-sm">→</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
