import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/utils.js';

const STATUS_S = {
  ok:      { dot:'bg-emerald-400',          badge:'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label:'OK' },
  healthy: { dot:'bg-emerald-400',          badge:'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label:'Healthy' },
  warn:    { dot:'bg-amber-400',            badge:'bg-amber-500/10 text-amber-400 border-amber-500/20',       label:'Warning' },
  warning: { dot:'bg-amber-400',            badge:'bg-amber-500/10 text-amber-400 border-amber-500/20',       label:'Warning' },
  critical:{ dot:'bg-red-400 animate-pulse',badge:'bg-red-500/10 text-red-400 border-red-500/20',             label:'Critical' },
  error:   { dot:'bg-red-400 animate-pulse',badge:'bg-red-500/10 text-red-400 border-red-500/20',             label:'Error' },
  offline: { dot:'bg-slate-600',            badge:'bg-slate-500/10 text-slate-500 border-slate-500/20',       label:'Offline' },
};

const TYPE_ICONS = {
  fire_suppression:'🔥', smoke_detector:'💨', motion:'👁', water_leak:'💧',
  gas:'⚗', temperature:'🌡', access_control:'🔒', camera:'📷', sos:'🆘',
};

export default function Health() {
  const [health,   setHealth]   = useState(null);
  const [sensors,  setSensors]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [h, s] = await Promise.all([
        api.get('/api/health').catch(() => null),
        api.get('/api/sensors').catch(() => []),
      ]);
      setHealth(h);
      setSensors(Array.isArray(s) ? s : []);
      setLastRefresh(new Date());
    } catch { /* silent */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const byType = sensors.reduce((acc, s) => {
    acc[s.type] = acc[s.type] || [];
    acc[s.type].push(s);
    return acc;
  }, {});

  const online   = sensors.filter(s => ['ok','active'].includes(s.status));
  const alarm    = sensors.filter(s => ['alarm','critical'].includes(s.status));
  const offline  = sensors.filter(s => s.status === 'offline');

  const services = health ? [
    { name:'API Server',       status: 'ok',                                 latency: health.latency_ms ? `${health.latency_ms}ms` : null },
    { name:'MongoDB',          status: health.db    === 'ok' ? 'ok':'error', latency: null },
    { name:'Redis',            status: health.redis === 'ok' ? 'ok':'warn',  latency: null },
    { name:'Socket.io',        status: 'ok',                                 latency: null },
    { name:'SSE Stream',       status: 'ok',                                 latency: null },
    { name:'AI / LLM',         status: health.llm ?? 'ok',                  latency: null },
    { name:'Dead Man Switch',  status: health.deadman ?? 'ok',               latency: null },
  ] : [];

  const overallOk = alarm.length === 0 && offline.length === 0;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">System Health</h1>
          <p className="text-slate-600 text-xs mt-0.5">{lastRefresh ? `Refreshed ${timeAgo(lastRefresh)}` : '—'}</p>
        </div>
        <button onClick={load}
          className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1.5 bg-white/4 hover:bg-white/8 border border-white/8 px-3 py-2 rounded-xl transition-all">
          ↻ Refresh
        </button>
      </div>

      {/* Overall banner */}
      <div className={`flex items-center gap-4 p-5 rounded-2xl border ${
        overallOk ? 'bg-emerald-500/6 border-emerald-500/15' : 'bg-red-500/6 border-red-500/15'
      }`}>
        <div className={`w-3 h-3 rounded-full ${overallOk?'bg-emerald-400':'bg-red-400 animate-pulse'}`}/>
        <div>
          <p className={`font-bold text-base ${overallOk?'text-emerald-400':'text-red-400'}`}>
            {overallOk ? 'All Systems Operational' : `${alarm.length} sensor${alarm.length!==1?'s':''} in alarm`}
          </p>
          <p className="text-xs text-slate-600 mt-0.5">
            {online.length} online · {alarm.length} alarm · {offline.length} offline
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l:'Total Sensors', v:sensors.length, c:'text-white' },
          { l:'Online',        v:online.length,  c:'text-emerald-400' },
          { l:'In Alarm',      v:alarm.length,   c:alarm.length?'text-red-400':'text-white' },
          { l:'Offline',       v:offline.length, c:offline.length?'text-amber-400':'text-white' },
        ].map(s => (
          <div key={s.l} className="glass rounded-xl p-4">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1">{s.l}</p>
            <p className={`text-2xl font-bold ${s.c}`}>{s.v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Services */}
        <div className="glass rounded-2xl">
          <div className="px-5 py-4 border-b border-white/5">
            <p className="font-semibold text-white text-sm">Backend Services</p>
          </div>
          <div className="divide-y divide-white/3">
            {services.length === 0 ? (
              <div className="py-10 text-center text-slate-600 text-sm">No health data</div>
            ) : services.map(({ name, status, latency }) => {
              const sc = STATUS_S[status] || STATUS_S.ok;
              return (
                <div key={name} className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${sc.dot}`}/>
                    <span className="text-sm font-medium text-white">{name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {latency && <span className="text-[10px] text-slate-600 font-mono">{latency}</span>}
                    <span className={`text-[9px] font-bold border px-2 py-0.5 rounded ${sc.badge}`}>{sc.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sensor type breakdown */}
        <div className="glass rounded-2xl">
          <div className="px-5 py-4 border-b border-white/5">
            <p className="font-semibold text-white text-sm">Sensors by Type</p>
          </div>
          <div className="p-5 space-y-4">
            {Object.entries(byType).map(([type, list]) => {
              const activeCount = list.filter(s => ['ok','active'].includes(s.status)).length;
              const pct = list.length ? Math.round((activeCount / list.length) * 100) : 0;
              const barColor = pct < 50 ? 'bg-red-400' : pct < 80 ? 'bg-amber-400' : 'bg-emerald-400';
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span>{TYPE_ICONS[type] || '📡'}</span>
                      <span className="text-xs font-medium text-white capitalize">{type.replace(/_/g,' ')}</span>
                    </div>
                    <span className="text-[10px] text-slate-600">{activeCount}/{list.length}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{width:`${pct}%`}}/>
                  </div>
                </div>
              );
            })}
            {Object.keys(byType).length === 0 && (
              <p className="text-slate-600 text-sm text-center py-6">No sensors registered</p>
            )}
          </div>
        </div>
      </div>

      {/* All sensors mini-table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <p className="font-semibold text-white text-sm">All Sensors ({sensors.length})</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Type','Floor','Zone','Room','Status','Value','Last Event'].map(h => (
                  <th key={h} className="text-left text-[9px] font-bold text-slate-600 uppercase tracking-widest px-4 py-2.5 first:pl-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sensors.map(s => {
                const sc = STATUS_S[s.status] || STATUS_S.offline;
                return (
                  <tr key={s._id} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                    <td className="px-4 py-2.5 pl-5">
                      <div className="flex items-center gap-2">
                        <span>{TYPE_ICONS[s.type]||'📡'}</span>
                        <span className="text-xs font-medium text-white capitalize">{s.type?.replace(/_/g,' ')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{s.floor}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{s.zone||'—'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{s.room||'—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${sc.dot}`}/>
                        <span className="text-[9px] text-slate-400 capitalize">{s.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 font-mono">{s.value!=null?`${s.value}${s.unit||''}`:'—'}</td>
                    <td className="px-4 py-2.5 text-[10px] text-slate-700 font-mono">{s.last_event?timeAgo(s.last_event):'—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
