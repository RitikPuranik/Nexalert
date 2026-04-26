import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { useSSE } from '../lib/useSSE.js';
import { api } from '../lib/api.js';
import { INCIDENT_ICONS, SEVERITY_LABELS, STATUS_LABELS, timeAgo, formatTime, eventCategory } from '../lib/utils.js';

const SEV = {
  1:'bg-red-500/12 text-red-400 border-red-500/20',
  2:'bg-amber-500/12 text-amber-400 border-amber-500/20',
  3:'bg-blue-500/12 text-blue-400 border-blue-500/20',
};
const STA = {
  detecting:'bg-blue-500/10 text-blue-400 border-blue-500/15',
  triaging:'bg-purple-500/10 text-purple-400 border-purple-500/15',
  active:'bg-red-500/10 text-red-400 border-red-500/15',
  investigating:'bg-amber-500/10 text-amber-400 border-amber-500/15',
  resolved:'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',
  false_alarm:'bg-slate-500/10 text-slate-400 border-slate-500/15',
};
const EVT_DOT = {incident:'bg-red-400',task:'bg-amber-400',guest:'bg-blue-400',sensor:'bg-purple-400',staff:'bg-emerald-400',system:'bg-slate-500'};

function Stat({ label, value, icon, color }) {
  return (
    <div className="glass rounded-2xl p-5 flex items-center justify-between">
      <div>
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1">{label}</p>
        <p className={`text-3xl font-bold ${color||'text-white'}`}>{value}</p>
      </div>
      <span className="text-2xl opacity-60">{icon}</span>
    </div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { events, connected } = useSSE(profile?.hotel_id);
  const [incidents, setIncidents] = useState([]);
  const [team,      setTeam]      = useState([]);
  const [loading,   setLoading]   = useState(true);

  async function load() {
    try {
      const [inc, t] = await Promise.all([
        api.get('/api/incidents?status=detecting,triaging,active,investigating'),
        profile?.role === 'manager' ? api.get('/api/staff/team') : Promise.resolve([]),
      ]);
      setIncidents(Array.isArray(inc) ? inc : []);
      setTeam(Array.isArray(t) ? t : []);
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { if (profile) load(); }, [profile]);
  useEffect(() => {
    if (events.length && events[0]?.type?.startsWith('incident')) load();
  }, [events]);

  const active   = incidents.filter(i => !['resolved','false_alarm'].includes(i.status));
  const critical = active.filter(i => i.severity === 1);
  const onDuty   = team.filter(s => s.is_on_duty);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Overview</h1>
        <p className="text-slate-600 text-sm mt-0.5">{profile?.name} · {new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Active Incidents" value={active.length} icon="🚨" color={active.length>0?'text-red-400':'text-emerald-400'}/>
        <Stat label="Critical" value={critical.length} icon="🔴" color={critical.length>0?'text-red-400':'text-white'}/>
        {profile?.role==='manager' && <Stat label="On Duty" value={onDuty.length} icon="👥"/>}
        <Stat label="Live Feed" value={connected?'LIVE':'OFFLINE'} icon={connected?'📡':'⚠️'} color={connected?'text-emerald-400':'text-red-400'}/>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        {/* Active Incidents */}
        <div className="glass rounded-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              {active.length>0 && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>}
              <span className="font-semibold text-white text-sm">Active Incidents</span>
              {active.length>0 && <span className="bg-red-500/12 text-red-400 border border-red-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full">{active.length}</span>}
            </div>
            <button onClick={() => navigate('/dashboard/incidents')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
              View all →
            </button>
          </div>
          <div className="p-3 space-y-1.5 max-h-[460px] overflow-y-auto">
            {active.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/8 flex items-center justify-center text-xl">✅</div>
                <p className="text-slate-600 text-sm">No active incidents</p>
              </div>
            ) : active.map(inc => (
              <div key={inc._id}
                onClick={() => navigate(`/dashboard/warroom/${inc._id}`)}
                className="flex items-center gap-3 p-3.5 bg-white/2 hover:bg-white/4 border border-white/4 hover:border-white/8 rounded-xl cursor-pointer transition-all group"
              >
                <span className="text-xl">{INCIDENT_ICONS[inc.type]||'❓'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white capitalize">{inc.type.replace(/_/g,' ')}</span>
                    {inc.is_cascade && <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1 rounded">⚡CASCADE</span>}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">Floor {inc.floor}{inc.zone?` · ${inc.zone}`:''} · {inc.source} · {timeAgo(inc.createdAt)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {inc.severity && <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded ${SEV[inc.severity]}`}>{SEVERITY_LABELS[inc.severity]}</span>}
                  <span className={`text-[9px] font-semibold border px-1.5 py-0.5 rounded capitalize ${STA[inc.status]||'bg-slate-500/10 text-slate-400 border-slate-500/15'}`}>{STATUS_LABELS[inc.status]||inc.status}</span>
                </div>
                <span className="text-slate-700 group-hover:text-slate-400 text-xs transition-colors">→</span>
              </div>
            ))}
          </div>
        </div>

        {/* Live Event Feed */}
        <div className="glass rounded-2xl flex flex-col max-h-[560px]">
          <div className="px-5 py-4 border-b border-white/5 flex items-center gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"/>
            <span className="font-semibold text-white text-sm">Live Feed</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <div className="text-2xl">📡</div>
                <p className="text-slate-600 text-xs">Awaiting events…</p>
              </div>
            ) : events.slice(0,50).map((evt,i) => {
              const cat = eventCategory(evt.type);
              return (
                <div key={i} className="flex items-start gap-2.5 py-2 border-b border-white/3 last:border-0">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${EVT_DOT[cat]||'bg-slate-500'}`}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 font-medium leading-snug">
                      {evt.type?.replace(/:/g,' → ')}
                      {evt.floor && <span className="text-slate-600"> · F{evt.floor}</span>}
                      {evt.room  && <span className="text-slate-600"> · R{evt.room}</span>}
                    </p>
                    {evt.ts && <p className="text-[9px] text-slate-700 font-mono mt-0.5">{formatTime(evt.ts)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
