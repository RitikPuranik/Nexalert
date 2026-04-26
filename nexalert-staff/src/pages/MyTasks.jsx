import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { INCIDENT_ICONS, timeAgo } from '../lib/utils.js';

const TASK_S = {
  pending:    'bg-slate-500/10 text-slate-400 border-slate-500/20',
  accepted:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
  in_progress:'bg-amber-500/10 text-amber-400 border-amber-500/20',
  completed:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  skipped:    'bg-slate-500/8 text-slate-600 border-slate-500/10',
};

const ACTIONS = [
  { a:'accept',   l:'Accept',   s:'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20 text-blue-400' },
  { a:'start',    l:'Start',    s:'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 text-amber-400' },
  { a:'complete', l:'Complete', s:'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-400' },
  { a:'skip',     l:'Skip',     s:'bg-slate-500/10 hover:bg-slate-500/20 border-slate-500/20 text-slate-400' },
];

export default function MyTasks() {
  const navigate = useNavigate();
  const [tasks,   setTasks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('active');

  async function load() {
    setLoading(true);
    try {
      const data = await api.get('/api/staff/my-tasks');
      setTasks(Array.isArray(data) ? data : []);
    } catch { setTasks([]); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function doAction(incidentId, taskId, action) {
    try {
      await api.patch(`/api/incidents/${incidentId}/tasks?task_id=${taskId}`, { action });
      load();
    } catch(e) { alert(e.message); }
  }

  const filtered = tasks.filter(t => {
    if (filter === 'active') return !['completed','skipped'].includes(t.status);
    if (filter === 'done')   return ['completed','skipped'].includes(t.status);
    return true;
  });

  const pendingCount = tasks.filter(t => t.status === 'pending').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">My Tasks</h1>
        <p className="text-slate-600 text-xs mt-0.5">
          {tasks.length} total · {pendingCount > 0 ? <span className="text-amber-400">{pendingCount} pending</span> : 'all clear'}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-0.5 bg-void-900 border border-white/5 p-1 rounded-xl w-fit">
        {[{v:'active',l:'Active'},{v:'done',l:'Done'},{v:'all',l:'All'}].map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter===f.v ? 'bg-indigo-500/15 text-white border border-indigo-500/20' : 'text-slate-500 hover:text-slate-300'
            }`}>{f.l}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-7 h-7 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl flex flex-col items-center justify-center py-20 gap-3">
          <div className="text-3xl">✅</div>
          <p className="text-slate-600 text-sm">No tasks in this view</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(task => (
            <div key={task._id} className="glass rounded-2xl p-5">
              <div className="flex items-start gap-4">
                {/* Incident info */}
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/10 flex items-center justify-center text-xl shrink-0">
                  {INCIDENT_ICONS[task.incident_type] || '❓'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-white text-sm">{task.title}</span>
                    <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded ${TASK_S[task.status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                      {task.status?.replace(/_/g,' ')}
                    </span>
                  </div>
                  {task.description && <p className="text-xs text-slate-500 mb-2">{task.description}</p>}
                  <div className="flex items-center gap-3 text-[10px] text-slate-600">
                    <span className="capitalize">{task.incident_type?.replace(/_/g,' ')} · Floor {task.incident_floor}</span>
                    {task.priority && <span className="text-amber-500">Priority {task.priority}</span>}
                    {task.due_at && <span>Due {timeAgo(task.due_at)}</span>}
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/dashboard/warroom/${task.incident_id}`)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium shrink-0 transition-colors"
                >
                  War Room →
                </button>
              </div>

              {/* Action buttons */}
              {!['completed','skipped'].includes(task.status) && (
                <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
                  {ACTIONS.filter(act => {
                    if (task.status === 'pending'    && act.a === 'start')    return false;
                    if (task.status === 'accepted'   && act.a === 'accept')   return false;
                    if (task.status === 'in_progress'&& act.a === 'accept')   return false;
                    if (task.status === 'in_progress'&& act.a === 'start')    return false;
                    return true;
                  }).map(({ a, l, s }) => (
                    <button key={a}
                      onClick={() => doAction(task.incident_id, task._id, a)}
                      className={`flex-1 border text-xs font-semibold py-2 rounded-xl transition-all ${s}`}>
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
