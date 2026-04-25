import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../lib/api';
import { INCIDENT_ICONS, SEVERITY_LABELS, STATUS_LABELS, timeAgo } from '../lib/utils';

const SEVERITY_STYLES = {
  1: 'bg-red-500/15 text-red-400 border border-red-500/25',
  2: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  3: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',
};
const STATUS_STYLES = {
  detecting:     'bg-blue-500/10 text-blue-400 border-blue-500/20',
  triaging:      'bg-purple-500/10 text-purple-400 border-purple-500/20',
  active:        'bg-red-500/10 text-red-400 border-red-500/20',
  investigating: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  resolved:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  false_alarm:   'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const INCIDENT_TYPES = ['fire','smoke','gas_leak','medical','security','flood','earthquake','sos'];
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'detecting,triaging,active,investigating', label: 'Active' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'false_alarm', label: 'False Alarms' },
];

export default function Incidents() {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ type: 'fire', floor: 1, zone: '', room: '' });

  useEffect(() => { loadIncidents(); }, [filter]);

  async function loadIncidents() {
    setLoading(true);
    try {
      const q = filter === 'all' ? '' : `?status=${filter}`;
      const data = await get(`/api/incidents${q}`);
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
    } catch (err) { console.error(err); }
    setCreating(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Incidents</h1>
          <p className="text-slate-500 text-sm mt-1">All incidents across your hotel</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95"
        >
          + Create Incident
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-[#080d1a] border border-white/5 p-1 rounded-xl w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              filter === f.value
                ? 'bg-indigo-500/20 text-white border border-indigo-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 bg-[#0c1325]/60 border border-white/5 rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center text-2xl">📭</div>
          <p className="text-slate-500 text-sm">No incidents matching this filter</p>
        </div>
      ) : (
        <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Type', 'Floor', 'Severity', 'Source', 'Status', 'Tasks', 'Created', ''].map((h) => (
                  <th key={h} className="text-left text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-4 py-3 first:pl-6 last:pr-6">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
                <tr
                  key={inc._id}
                  onClick={() => navigate(`/dashboard/warroom/${inc._id}`)}
                  className="border-b border-white/3 hover:bg-white/3 cursor-pointer transition-colors duration-100 group"
                >
                  <td className="px-4 py-3 pl-6">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{INCIDENT_ICONS[inc.type] || '❓'}</span>
                      <span className="text-sm font-semibold text-white capitalize">{inc.type.replace(/_/g, ' ')}</span>
                      {inc.is_cascade && <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1 py-0.5 rounded">⚡</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {inc.floor}{inc.zone ? ` · ${inc.zone}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    {inc.severity ? (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${SEVERITY_STYLES[inc.severity]}`}>
                        {SEVERITY_LABELS[inc.severity]}
                      </span>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{inc.source}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold border px-2 py-0.5 rounded capitalize ${STATUS_STYLES[inc.status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                      {STATUS_LABELS[inc.status] || inc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {inc.tasks_total > 0 ? `${inc.tasks_completed}/${inc.tasks_total}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 font-mono">{timeAgo(inc.createdAt)}</td>
                  <td className="px-4 py-3 pr-6">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/warroom/${inc._id}`); }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Open →
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-[#0c1325] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h2 className="text-lg font-bold text-white">🚨 Create Incident</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all">×</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Type</label>
                <select
                  className="w-full bg-[#080d1a] border border-white/10 focus:border-indigo-500/50 focus:outline-none text-white rounded-xl px-4 py-2.5 text-sm"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  {INCIDENT_TYPES.map((t) => (
                    <option key={t} value={t}>{INCIDENT_ICONS[t]} {t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Floor</label>
                  <input
                    type="number" min="1" max="99"
                    className="w-full bg-[#080d1a] border border-white/10 focus:border-indigo-500/50 focus:outline-none text-white rounded-xl px-4 py-2.5 text-sm"
                    value={form.floor}
                    onChange={(e) => setForm({ ...form, floor: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Zone (optional)</label>
                  <input
                    className="w-full bg-[#080d1a] border border-white/10 focus:border-indigo-500/50 focus:outline-none text-white rounded-xl px-4 py-2.5 text-sm placeholder-slate-600"
                    placeholder="e.g. east_wing"
                    value={form.zone}
                    onChange={(e) => setForm({ ...form, zone: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Room (optional)</label>
                <input
                  className="w-full bg-[#080d1a] border border-white/10 focus:border-indigo-500/50 focus:outline-none text-white rounded-xl px-4 py-2.5 text-sm placeholder-slate-600"
                  placeholder="e.g. 301"
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-semibold py-2.5 rounded-xl transition-all text-sm"
                >
                  Cancel
                </button>
                <button type="submit" disabled={creating}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
                >
                  {creating ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating…</> : '🚨 Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
