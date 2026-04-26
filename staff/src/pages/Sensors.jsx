import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/utils.js';

const TYPE_ICONS = {
  fire_suppression:'🔥', smoke_detector:'💨', motion:'👁', water_leak:'💧',
  gas:'⚗', temperature:'🌡', access_control:'🔒', camera:'📷', sos:'🆘',
};

const STATUS_S = {
  ok:      { dot:'bg-emerald-400', badge:'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  active:  { dot:'bg-emerald-400', badge:'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  alarm:   { dot:'bg-red-400 animate-pulse', badge:'bg-red-500/10 text-red-400 border-red-500/20' },
  critical:{ dot:'bg-red-400 animate-pulse', badge:'bg-red-500/10 text-red-400 border-red-500/20' },
  warning: { dot:'bg-amber-400', badge:'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  offline: { dot:'bg-slate-600', badge:'bg-slate-500/10 text-slate-500 border-slate-500/20' },
};

export default function Sensors() {
  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType,   setFilterType]   = useState('all');

  async function load() {
    setLoading(true);
    try {
      const data = await api.get('/api/sensors');
      setSensors(Array.isArray(data) ? data : []);
    } catch { setSensors([]); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const types    = [...new Set(sensors.map(s => s.type).filter(Boolean))];
  const statuses = [...new Set(sensors.map(s => s.status).filter(Boolean))];

  const filtered = sensors.filter(s => {
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    if (filterType   !== 'all' && s.type   !== filterType)   return false;
    if (search) {
      const q = search.toLowerCase();
      return (s.type||'').includes(q) || String(s.floor||'').includes(q) || (s.zone||'').toLowerCase().includes(q) || (s.room||'').includes(q);
    }
    return true;
  });

  const alarm   = sensors.filter(s => ['alarm','critical'].includes(s.status));
  const offline = sensors.filter(s => s.status === 'offline');
  const ok      = sensors.filter(s => ['ok','active'].includes(s.status));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Sensors</h1>
          <p className="text-slate-600 text-xs mt-0.5">{sensors.length} total · {alarm.length} in alarm</p>
        </div>
        <button onClick={load}
          className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1.5 bg-white/4 hover:bg-white/8 border border-white/8 px-3 py-2 rounded-xl transition-all">
          ↻ Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Online', value:ok.length, dot:'bg-emerald-400', val:'text-emerald-400' },
          { label:'Alarm',  value:alarm.length, dot:'bg-red-400 animate-pulse', val:'text-red-400' },
          { label:'Offline',value:offline.length, dot:'bg-slate-600', val:'text-slate-400' },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-4 flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`}/>
            <div>
              <div className={`text-2xl font-bold ${s.val}`}>{s.value}</div>
              <div className="text-[10px] text-slate-600">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Alarm banner */}
      {alarm.length > 0 && (
        <div className="bg-red-500/6 border border-red-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse"/>
            <span className="text-sm font-semibold text-red-400">Active Alarms ({alarm.length})</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {alarm.map(s => (
              <div key={s._id} className="bg-red-500/8 border border-red-500/15 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{TYPE_ICONS[s.type] || '📡'}</span>
                  <span className="text-xs font-semibold text-white capitalize">{s.type?.replace(/_/g,' ')}</span>
                </div>
                <p className="text-[10px] text-slate-400">Floor {s.floor}{s.zone?` · ${s.zone}`:''}{s.room?` · R${s.room}`:''}</p>
                <p className="text-[10px] font-bold text-red-400 uppercase mt-1">🔴 {s.status}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="bg-void-900 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2 text-sm"
          placeholder="🔍 Search sensors…"/>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-void-900 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white rounded-xl px-3 py-2 text-sm">
          <option value="all">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-void-900 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white rounded-xl px-3 py-2 text-sm">
          <option value="all">All Types</option>
          {types.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {['Type','Floor','Zone','Room','Status','Last Event',''].map(h => (
                <th key={h} className="text-left text-[9px] font-bold text-slate-600 uppercase tracking-widest px-4 py-3 first:pl-5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-slate-600 text-sm py-12">No sensors match</td></tr>
            ) : filtered.map(s => {
              const sc = STATUS_S[s.status] || STATUS_S.offline;
              return (
                <tr key={s._id} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3 pl-5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{TYPE_ICONS[s.type] || '📡'}</span>
                      <span className="text-sm font-medium text-white capitalize">{s.type?.replace(/_/g,' ')}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{s.floor}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{s.zone || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{s.room || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${sc.dot}`}/>
                      <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded capitalize ${sc.badge}`}>{s.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 font-mono">{s.last_event ? timeAgo(s.last_event) : '—'}</td>
                  <td className="px-4 py-3">
                    {s.value != null && (
                      <span className="text-xs font-mono text-slate-500">{s.value}{s.unit||''}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
