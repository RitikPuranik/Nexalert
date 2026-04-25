import { useState, useEffect } from 'react';
import { get } from '../lib/api';
import { timeAgo, formatTime, eventCategory } from '../lib/utils';

const CAT_STYLES = {
  incident: { bg: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-400', text: 'text-red-400' },
  task:     { bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-400', text: 'text-amber-400' },
  guest:    { bg: 'bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-400', text: 'text-blue-400' },
  sensor:   { bg: 'bg-purple-500/10 border-purple-500/20', dot: 'bg-purple-400', text: 'text-purple-400' },
  system:   { bg: 'bg-slate-500/10 border-slate-500/20', dot: 'bg-slate-400', text: 'text-slate-400' },
};

const CAT_ICONS = {
  incident: '🚨', task: '✅', guest: '👤', sensor: '📡', system: '⚙',
};

export default function Audit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filterCat, setFilterCat] = useState('all');
  const PAGE_SIZE = 30;

  useEffect(() => {
    setPage(0);
    setLogs([]);
    setHasMore(true);
  }, [filterCat]);

  useEffect(() => {
    loadLogs(page);
  }, [page, filterCat]);

  async function loadLogs(p) {
    setLoading(true);
    try {
      const skip = p * PAGE_SIZE;
      const data = await get(`/api/audit?limit=${PAGE_SIZE}&skip=${skip}`);
      const items = Array.isArray(data) ? data : (data.events || []);
      const filtered = filterCat === 'all' ? items : items.filter(e => eventCategory(e.type) === filterCat);
      if (p === 0) setLogs(filtered);
      else setLogs(prev => [...prev, ...filtered]);
      setHasMore(filtered.length === PAGE_SIZE);
    } catch { setHasMore(false); }
    setLoading(false);
  }

  const CATS = ['all', 'incident', 'task', 'guest', 'sensor', 'system'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Audit Trail</h1>
        <p className="text-slate-500 text-sm mt-1">Full immutable event log for compliance and review</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-[#080d1a] border border-white/5 p-1 rounded-xl w-fit flex-wrap">
        {CATS.map(cat => (
          <button key={cat}
            onClick={() => setFilterCat(cat)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 capitalize ${
              filterCat === cat
                ? 'bg-indigo-500/20 text-white border border-indigo-500/30'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {cat !== 'all' && <span>{CAT_ICONS[cat]}</span>}
            {cat}
          </button>
        ))}
      </div>

      {/* Log list */}
      <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-500/10 flex items-center justify-center text-2xl">📭</div>
            <p className="text-slate-500 text-sm">No audit events found</p>
          </div>
        ) : (
          <div className="divide-y divide-white/4">
            {logs.map((evt, i) => {
              const cat = eventCategory(evt.type);
              const style = CAT_STYLES[cat] || CAT_STYLES.system;
              return (
                <div key={evt._id || i} className="flex items-start gap-4 px-6 py-4 hover:bg-white/2 transition-colors">
                  {/* Category dot */}
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${style.dot}`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">
                        {evt.type?.replace(/:/g, ' → ')}
                      </span>
                      <span className={`text-[10px] font-bold border px-2 py-0.5 rounded capitalize ${style.bg} ${style.text}`}>
                        {cat}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-500">
                      {evt.floor && <span>Floor {evt.floor}</span>}
                      {evt.room && <span>Room {evt.room}</span>}
                      {evt.zone && <span>{evt.zone}</span>}
                      {evt.incident_id && <span className="font-mono text-slate-600">INC:{String(evt.incident_id).slice(-6)}</span>}
                      {evt.staff_name && <span>👤 {evt.staff_name}</span>}
                    </div>

                    {evt.meta && Object.keys(evt.meta).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {Object.entries(evt.meta).slice(0, 4).map(([k, v]) => (
                          <span key={k} className="text-[10px] bg-white/5 border border-white/8 px-2 py-0.5 rounded text-slate-400 font-mono">
                            {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-slate-600 font-mono">{formatTime(evt.ts)}</div>
                    <div className="text-[10px] text-slate-700 mt-0.5">{timeAgo(evt.ts)}</div>
                  </div>
                </div>
              );
            })}

            {/* Load more */}
            {hasMore && (
              <div className="px-6 py-4 flex justify-center">
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={loading}
                  className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all disabled:opacity-50"
                >
                  {loading
                    ? <><div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />Loading…</>
                    : 'Load more events'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
