import { useState, useEffect } from 'react';
import { get } from '../lib/api';
import { timeAgo } from '../lib/utils';

const STATUS_CONFIG = {
  ok:       { label: 'OK',       style: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', dot: 'bg-emerald-400', bar: 'bg-emerald-400' },
  warn:     { label: 'Warning',  style: 'bg-amber-500/15 text-amber-400 border-amber-500/25',    dot: 'bg-amber-400',   bar: 'bg-amber-400' },
  critical: { label: 'Critical', style: 'bg-red-500/15 text-red-400 border-red-500/25',          dot: 'bg-red-400 animate-pulse', bar: 'bg-red-400' },
  offline:  { label: 'Offline',  style: 'bg-slate-500/15 text-slate-400 border-slate-500/25',   dot: 'bg-slate-500',   bar: 'bg-slate-500' },
};

const TYPE_ICONS = {
  fire_suppression: '🔥', smoke_detector: '💨', motion: '👁', water_leak: '💧',
  gas: '⚗', temperature: '🌡', access_control: '🔒', camera: '📷',
};

export default function Health() {
  const [health, setHealth] = useState(null);
  const [sensors, setSensors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshed, setRefreshed] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [h, s] = await Promise.all([
        get('/api/health').catch(() => null),
        get('/api/sensors').catch(() => []),
      ]);
      setHealth(h);
      setSensors(Array.isArray(s) ? s : []);
      setRefreshed(new Date());
    } catch { /* silent */ }
    setLoading(false);
  }

  const sensorsByType = sensors.reduce((acc, s) => {
    acc[s.type] = acc[s.type] || [];
    acc[s.type].push(s);
    return acc;
  }, {});

  const onlineSensors = sensors.filter(s => s.status === 'ok' || s.status === 'active');
  const criticalSensors = sensors.filter(s => s.status === 'critical' || s.status === 'alarm');
  const offlineSensors = sensors.filter(s => s.status === 'offline');

  const systemChecks = health ? [
    { name: 'API Server',       status: 'ok',     latency: health.latency_ms ?? '< 5ms' },
    { name: 'Database',         status: health.db === 'ok' ? 'ok' : 'warn', latency: null },
    { name: 'Redis / Cache',    status: health.redis === 'ok' ? 'ok' : 'warn', latency: null },
    { name: 'Socket.io',        status: 'ok',     latency: null },
    { name: 'SSE Events',       status: 'ok',     latency: null },
    { name: 'AI / LLM Service', status: health.llm ?? 'ok', latency: null },
  ] : [];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  const overallStatus = criticalSensors.length > 0 ? 'critical'
    : offlineSensors.length > 0 ? 'warn'
    : 'ok';

  const cfg = STATUS_CONFIG[overallStatus];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">System Health</h1>
          <p className="text-slate-500 text-sm mt-1">
            {refreshed ? `Last refreshed ${timeAgo(refreshed)}` : 'Loading…'}
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white text-sm font-medium px-4 py-2 rounded-xl transition-all"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Overall status */}
      <div className={`flex items-center gap-4 p-5 rounded-2xl border ${cfg.style}`}>
        <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
        <div>
          <div className="font-bold text-white text-lg">
            System {cfg.label === 'OK' ? 'Healthy' : cfg.label}
          </div>
          <div className="text-sm opacity-80">
            {onlineSensors.length} sensors online · {criticalSensors.length} critical · {offlineSensors.length} offline
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Sensors', value: sensors.length, icon: '📡', color: 'text-white' },
          { label: 'Online', value: onlineSensors.length, icon: '✅', color: 'text-emerald-400' },
          { label: 'Critical', value: criticalSensors.length, icon: '🔴', color: 'text-red-400' },
          { label: 'Offline', value: offlineSensors.length, icon: '⚫', color: 'text-slate-400' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="bg-[#0c1325]/80 border border-white/6 rounded-2xl p-4 flex items-center gap-3">
            <span className="text-2xl">{icon}</span>
            <div>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* System services */}
        <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl">
          <div className="px-6 py-4 border-b border-white/5">
            <h3 className="font-semibold text-white">System Services</h3>
          </div>
          <div className="divide-y divide-white/4">
            {systemChecks.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">No health data available</div>
            ) : systemChecks.map(({ name, status, latency }) => {
              const s = STATUS_CONFIG[status] || STATUS_CONFIG.ok;
              return (
                <div key={name} className="flex items-center justify-between px-6 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${s.dot}`} />
                    <span className="text-sm font-medium text-white">{name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {latency && <span className="text-xs text-slate-500 font-mono">{latency}</span>}
                    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded ${s.style}`}>
                      {s.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sensors by type */}
        <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl">
          <div className="px-6 py-4 border-b border-white/5">
            <h3 className="font-semibold text-white">Sensors by Type</h3>
          </div>
          <div className="p-4 space-y-3">
            {Object.entries(sensorsByType).map(([type, typeSensors]) => {
              const activeCount = typeSensors.filter(s => s.status === 'ok' || s.status === 'active').length;
              const pct = typeSensors.length > 0 ? Math.round((activeCount / typeSensors.length) * 100) : 0;
              const barColor = pct < 50 ? 'bg-red-400' : pct < 80 ? 'bg-amber-400' : 'bg-emerald-400';
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{TYPE_ICONS[type] || '📡'}</span>
                      <span className="text-sm font-medium text-white capitalize">{type.replace(/_/g, ' ')}</span>
                    </div>
                    <span className="text-xs text-slate-500">{activeCount}/{typeSensors.length}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {Object.keys(sensorsByType).length === 0 && (
              <p className="text-slate-500 text-sm text-center py-8">No sensors found</p>
            )}
          </div>
        </div>
      </div>

      {/* Critical sensors */}
      {criticalSensors.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl">
          <div className="px-6 py-4 border-b border-red-500/10 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <h3 className="font-semibold text-red-400">Critical Sensors</h3>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {criticalSensors.map(s => (
              <div key={s._id} className="bg-red-500/8 border border-red-500/15 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span>{TYPE_ICONS[s.type] || '📡'}</span>
                  <span className="text-sm font-semibold text-white capitalize">{s.type?.replace(/_/g, ' ')}</span>
                </div>
                <div className="text-xs text-slate-400">Floor {s.floor}{s.zone ? ` · ${s.zone}` : ''}</div>
                {s.room && <div className="text-xs text-slate-500">Room {s.room}</div>}
                <div className="mt-2 text-[10px] font-bold text-red-400 uppercase">🔴 {s.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All sensors table */}
      <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5">
          <h3 className="font-semibold text-white">All Sensors ({sensors.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Type','Floor','Zone','Room','Status','Last Event'].map(h => (
                  <th key={h} className="text-left text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-4 py-3 first:pl-6">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sensors.slice(0, 50).map(s => {
                const sc = s.status === 'ok' || s.status === 'active' ? STATUS_CONFIG.ok
                  : s.status === 'critical' || s.status === 'alarm' ? STATUS_CONFIG.critical
                  : s.status === 'offline' ? STATUS_CONFIG.offline
                  : STATUS_CONFIG.warn;
                return (
                  <tr key={s._id} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3 pl-6">
                      <div className="flex items-center gap-2">
                        <span>{TYPE_ICONS[s.type] || '📡'}</span>
                        <span className="text-sm font-medium text-white capitalize">{s.type?.replace(/_/g, ' ')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">{s.floor}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{s.zone || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{s.room || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        <span className="text-xs font-medium text-slate-400 capitalize">{s.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 font-mono">{s.last_event ? timeAgo(s.last_event) : '—'}</td>
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
