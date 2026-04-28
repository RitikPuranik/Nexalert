import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, timeAgo, eventCategory } from '../lib/utils.js';

const CAT_S = {
  incident:{ dot:'bg-red-400',    badge:'bg-red-500/10 text-red-400 border-red-500/15',        icon:'🚨' },
  task:    { dot:'bg-amber-400',  badge:'bg-amber-500/10 text-amber-400 border-amber-500/15',  icon:'✅' },
  guest:   { dot:'bg-blue-400',   badge:'bg-blue-500/10 text-blue-400 border-blue-500/15',     icon:'👤' },
  sensor:  { dot:'bg-purple-400', badge:'bg-purple-500/10 text-purple-400 border-purple-500/15',icon:'📡' },
  staff:   { dot:'bg-emerald-400',badge:'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',icon:'👥' },
  deadman: { dot:'bg-pink-400',   badge:'bg-pink-500/10 text-pink-400 border-pink-500/15',     icon:'💜' },
  system:  { dot:'bg-slate-500',  badge:'bg-slate-500/10 text-slate-400 border-slate-500/15',  icon:'⚙' },
};

const CATS  = ['all','incident','task','guest','sensor','staff','deadman','system'];
const LIMIT = 50;

export default function Audit() {
  const [logs,     setLogs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [page,     setPage]     = useState(1);
  const [total,    setTotal]    = useState(0);
  const [hasMore,  setHasMore]  = useState(false);
  const [cat,      setCat]      = useState('all');
  const [search,   setSearch]   = useState('');
  const [chain,    setChain]    = useState(null);
  const [verifying,setVerifying]= useState(false);

  useEffect(() => { setPage(1); setLogs([]); }, [cat]);
  useEffect(() => { load(page, page === 1); }, [page, cat]);

  async function load(p, reset = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: LIMIT });
      if (cat !== 'all') params.set('resource_type', cat);
      const data = await api.get(`/api/audit?${params}`);
      const items = Array.isArray(data) ? data : (data.events || []);
      const more  = Array.isArray(data) ? items.length === LIMIT : (data.hasMore ?? false);
      const tot   = Array.isArray(data) ? items.length : (data.total || items.length);
      if (reset) setLogs(items);
      else       setLogs(prev => [...prev, ...items]);
      setHasMore(more);
      setTotal(tot);
    } catch { setHasMore(false); }
    setLoading(false);
  }

  async function verifyChain() {
    setVerifying(true);
    try {
      const result = await api.get('/api/audit/verify');
      setChain(result);
    } catch(e) { setChain({ valid: false, error: e.message }); }
    setVerifying(false);
  }

  const visible = search
    ? logs.filter(e =>
        (e.type          || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.actor         || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.resource_type || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.action        || '').toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Audit Trail</h1>
          <p className="text-slate-600 text-xs mt-0.5">
            Immutable event log · {total.toLocaleString()} total records
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {chain && (
            <div className={`flex items-center gap-1.5 text-xs font-bold border px-3 py-1.5 rounded-xl ${
              chain.valid
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}>
              {chain.valid ? '✅ Chain Valid' : '❌ Chain Broken'}
            </div>
          )}
          <button onClick={verifyChain} disabled={verifying}
            className="flex items-center gap-2 bg-white/4 hover:bg-white/8 border border-white/8 text-slate-400 hover:text-white text-xs font-medium px-4 py-2 rounded-xl transition-all disabled:opacity-50">
            {verifying
              ? <><div className="w-3 h-3 border-2 border-slate-400/20 border-t-slate-400 rounded-full animate-spin"/>Verifying…</>
              : '🔐 Verify Integrity'}
          </button>
          <button onClick={() => { setPage(1); load(1, true); }}
            className="flex items-center gap-2 bg-white/4 hover:bg-white/8 border border-white/8 text-slate-400 hover:text-white text-xs font-medium px-4 py-2 rounded-xl transition-all">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-void-900 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2 text-sm"
          placeholder="🔍 Search events, actors…"
        />
        <div className="flex gap-0.5 bg-void-900 border border-white/5 p-1 rounded-xl flex-wrap">
          {CATS.map(c => {
            const cs = CAT_S[c];
            return (
              <button key={c} onClick={() => setCat(c)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                  cat === c
                    ? 'bg-indigo-500/15 text-white border border-indigo-500/20'
                    : 'text-slate-500 hover:text-slate-300'
                }`}>
                {cs && <span>{cs.icon}</span>}
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* Log table */}
      <div className="glass rounded-2xl overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"/>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="text-3xl">📭</div>
            <p className="text-slate-600 text-sm">No events found</p>
            <p className="text-slate-700 text-xs">Try changing the filter or search term</p>
          </div>
        ) : (
          <div className="divide-y divide-white/3">
            {visible.map((evt, i) => {
              const c = eventCategory(evt.type || evt.action || '');
              const s = CAT_S[c] || CAT_S.system;
              return (
                <div key={evt._id || i} className="flex items-start gap-4 px-5 py-3.5 hover:bg-white/2 transition-colors">
                  <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`}/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">
                        {(evt.type || evt.action)?.replace(/[_:]/g, ' ')}
                      </span>
                      <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded capitalize ${s.badge}`}>
                        {evt.resource_type || c}
                      </span>
                      {evt.action && evt.action !== evt.type && (
                        <span className="text-[9px] bg-white/4 border border-white/6 px-1.5 py-0.5 rounded text-slate-500">
                          {evt.action}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-0.5 text-[10px] text-slate-600">
                      {evt.floor       && <span>Floor {evt.floor}</span>}
                      {evt.room        && <span>Room {evt.room}</span>}
                      {evt.zone        && <span>{evt.zone}</span>}
                      {evt.actor       && <span>👤 {evt.actor}</span>}
                      {evt.staff_name  && <span>👤 {evt.staff_name}</span>}
                      {evt.incident_id && <span className="font-mono">INC:{String(evt.incident_id).slice(-6)}</span>}
                      {evt.resource_id && <span className="font-mono text-[9px]">{String(evt.resource_id).slice(-8)}</span>}
                    </div>
                    {evt.meta && Object.keys(evt.meta).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {Object.entries(evt.meta).slice(0, 6).map(([k, v]) => (
                          <span key={k} className="text-[9px] bg-white/4 border border-white/6 px-1.5 py-0.5 rounded font-mono text-slate-500">
                            {k}:{typeof v === 'object' ? JSON.stringify(v) : String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-slate-600 font-mono">{formatDateTime(evt.ts || evt.createdAt)}</p>
                    <p className="text-[9px] text-slate-700 mt-0.5">{timeAgo(evt.ts || evt.createdAt)}</p>
                  </div>
                </div>
              );
            })}

            {hasMore && (
              <div className="px-5 py-4 flex justify-center">
                <button onClick={() => setPage(p => p + 1)} disabled={loading}
                  className="flex items-center gap-2 bg-white/4 hover:bg-white/8 border border-white/8 text-slate-400 hover:text-white text-xs font-medium px-5 py-2.5 rounded-xl transition-all disabled:opacity-50">
                  {loading
                    ? <><div className="w-3.5 h-3.5 border-2 border-slate-400/20 border-t-slate-400 rounded-full animate-spin"/>Loading…</>
                    : `Load more (${total - logs.length} remaining)`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
