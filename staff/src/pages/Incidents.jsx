import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { api } from '../lib/api.js';
import { INCIDENT_ICONS, SEVERITY_LABELS, STATUS_LABELS, timeAgo } from '../lib/utils.js';

const SEV_STYLE = {1:'bg-red-500/12 text-red-400 border-red-500/20',2:'bg-amber-500/12 text-amber-400 border-amber-500/20',3:'bg-blue-500/12 text-blue-400 border-blue-500/20'};
const STA_STYLE = {detecting:'bg-blue-500/10 text-blue-400 border-blue-500/15',triaging:'bg-purple-500/10 text-purple-400 border-purple-500/15',active:'bg-red-500/10 text-red-400 border-red-500/15',investigating:'bg-amber-500/10 text-amber-400 border-amber-500/15',resolved:'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',false_alarm:'bg-slate-500/10 text-slate-400 border-slate-500/15'};
const TYPES = ['fire','smoke','gas_leak','medical','security','flood','earthquake','sos'];
const FILTERS = [{v:'',l:'All'},{v:'detecting,triaging,active,investigating',l:'Active'},{v:'resolved',l:'Resolved'},{v:'false_alarm',l:'False Alarms'}];

export default function Incidents() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isManager = profile?.role === 'manager';
  const [incidents, setIncidents] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('');
  const [showModal, setShowModal] = useState(false);
  const [creating,  setCreating]  = useState(false);
  const [form,      setForm]      = useState({type:'fire',floor:'',zone:'',room:'',is_drill:false});
  const [err,       setErr]       = useState('');

  async function load() {
    setLoading(true);
    try {
      const q = filter ? `?status=${filter}` : '';
      const data = await api.get(`/api/incidents${q}`);
      setIncidents(Array.isArray(data) ? data : []);
    } catch { setIncidents([]); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [filter]);

  async function createIncident(e) {
    e.preventDefault();
    if (!form.floor) { setErr('Floor is required'); return; }
    setCreating(true); setErr('');
    try {
      const body = { type:form.type, floor:parseInt(form.floor), is_drill:form.is_drill };
      if (form.zone) body.zone = form.zone;
      if (form.room) body.room = form.room;
      await api.post('/api/incidents', body);
      setShowModal(false);
      setForm({type:'fire',floor:'',zone:'',room:'',is_drill:false});
      load();
    } catch (e) { setErr(e.message); }
    setCreating(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Incidents</h1>
          <p className="text-slate-600 text-xs mt-0.5">{incidents.length} total</p>
        </div>
        {isManager && (
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95">
            + New Incident
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-0.5 bg-void-900 border border-white/5 p-1 rounded-xl w-fit">
        {FILTERS.map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter===f.v ? 'bg-indigo-500/15 text-white border border-indigo-500/20' : 'text-slate-500 hover:text-slate-300'
            }`}>{f.l}</button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-7 h-7 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"/>
        </div>
      ) : incidents.length === 0 ? (
        <div className="glass rounded-2xl flex flex-col items-center justify-center py-20 gap-3">
          <div className="text-3xl">📭</div>
          <p className="text-slate-600 text-sm">No incidents found</p>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Type','Floor/Zone','Severity','Source','Status','Tasks','Created',''].map(h => (
                  <th key={h} className="text-left text-[9px] font-bold text-slate-600 uppercase tracking-widest px-4 py-3 first:pl-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incidents.map(inc => (
                <tr key={inc._id}
                  onClick={() => navigate(`/dashboard/warroom/${inc._id}`)}
                  className="border-b border-white/3 hover:bg-white/2 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3 pl-5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{INCIDENT_ICONS[inc.type]||'❓'}</span>
                      <span className="text-sm font-semibold text-white capitalize">{inc.type.replace(/_/g,' ')}</span>
                      {inc.is_cascade && <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1 rounded">⚡</span>}
                      {inc.is_drill && <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1 rounded">DRILL</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{inc.floor}{inc.zone?` · ${inc.zone}`:''}{inc.room?` · R${inc.room}`:''}</td>
                  <td className="px-4 py-3">{inc.severity
                    ? <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded ${SEV_STYLE[inc.severity]}`}>{SEVERITY_LABELS[inc.severity]}</span>
                    : <span className="text-slate-700">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {inc.source === 'guest_sos'
                      ? <span className="text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">🆘 guest_sos</span>
                      : inc.source}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[9px] font-semibold border px-1.5 py-0.5 rounded capitalize ${STA_STYLE[inc.status]||'bg-slate-500/10 text-slate-400 border-slate-500/15'}`}>
                      {STATUS_LABELS[inc.status]||inc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{inc.tasks_total>0?`${inc.tasks_completed}/${inc.tasks_total}`:'—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-700 font-mono">{timeAgo(inc.createdAt)}</td>
                  <td className="px-4 py-3 text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">Open →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="glass rounded-3xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <h2 className="font-bold text-white">Create Incident</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-600 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-all text-lg">×</button>
            </div>
            <form onSubmit={createIncident} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Type</label>
                <select value={form.type} onChange={e => setForm({...form,type:e.target.value})}
                  className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white rounded-xl px-3 py-2.5 text-sm">
                  {TYPES.map(t => <option key={t} value={t}>{INCIDENT_ICONS[t]} {t.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Floor *</label>
                  <input type="number" min="1" required value={form.floor} onChange={e => setForm({...form,floor:e.target.value})}
                    className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2.5 text-sm"
                    placeholder="3"/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Zone</label>
                  <input value={form.zone} onChange={e => setForm({...form,zone:e.target.value})}
                    className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2.5 text-sm"
                    placeholder="east_wing"/>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Room</label>
                <input value={form.room} onChange={e => setForm({...form,room:e.target.value})}
                  className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2.5 text-sm"
                  placeholder="301"/>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`w-9 h-5 rounded-full border transition-colors relative ${form.is_drill?'bg-amber-500/20 border-amber-500/30':'bg-white/5 border-white/10'}`}
                  onClick={() => setForm({...form,is_drill:!form.is_drill})}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 ${form.is_drill?'left-4':'left-0.5'}`}/>
                </div>
                <span className="text-sm text-slate-400">Mark as drill</span>
              </label>
              {err && <div className="text-red-400 text-xs bg-red-500/8 border border-red-500/15 rounded-xl px-3 py-2">{err}</div>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 bg-white/4 hover:bg-white/8 border border-white/8 text-slate-400 font-semibold py-2.5 rounded-xl transition-all text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={creating}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-all text-sm flex items-center justify-center gap-2">
                  {creating ? <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"/>Creating…</> : '🚨 Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
