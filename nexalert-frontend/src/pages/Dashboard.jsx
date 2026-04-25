import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { get, post } from '../lib/api';
import { useSSE } from '../lib/useSSE';
import { INCIDENT_ICONS, SEVERITY_LABELS, timeAgo, eventCategory, formatTime } from '../lib/utils';

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

const EVENT_DOT = {
  incident: 'bg-red-400',
  task:     'bg-amber-400',
  guest:    'bg-blue-400',
  sensor:   'bg-purple-400',
  system:   'bg-slate-400',
};

function StatCard({ label, value, sub, icon, accent }) {
  const accents = {
    red:    'from-red-500/20 to-red-500/5 border-red-500/15',
    blue:   'from-blue-500/20 to-blue-500/5 border-blue-500/15',
    green:  'from-emerald-500/20 to-emerald-500/5 border-emerald-500/15',
    purple: 'from-purple-500/20 to-purple-500/5 border-purple-500/15',
  };
  const iconBg = {
    red: 'bg-red-500/15 text-red-400',
    blue: 'bg-blue-500/15 text-blue-400',
    green: 'bg-emerald-500/15 text-emerald-400',
    purple: 'bg-purple-500/15 text-purple-400',
  };
  return (
    <div className={`bg-gradient-to-br ${accents[accent]} border backdrop-blur-xl rounded-2xl p-5 flex items-center justify-between`}>
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-3xl font-bold text-white mb-1">{value}</p>
        <p className="text-xs text-slate-500">{sub}</p>
      </div>
      <div className={`w-12 h-12 rounded-2xl ${iconBg[accent]} flex items-center justify-center text-xl shrink-0`}>
        {icon}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hotelId = user?.profile?.hotel_id;
  const { events } = useSSE(hotelId);

  const [incidents, setIncidents] = useState([]);
  const [team, setTeam] = useState([]);
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    if (!hotelId) return;
    Promise.all([
      get('/api/incidents?status=detecting,triaging,active,investigating').catch(() => []),
      get('/api/staff/team').catch(() => []),
      get('/api/guests/locations').catch(() => []),
    ]).then(([inc, t, g]) => {
      setIncidents(Array.isArray(inc) ? inc : []);
      setTeam(Array.isArray(t) ? t : []);
      setGuests(Array.isArray(g) ? g : []);
    }).finally(() => setLoading(false));
  }, [hotelId]);

  useEffect(() => {
    if (events.length > 0 && events[0]?.type?.startsWith('incident')) {
      get('/api/incidents?status=detecting,triaging,active,investigating')
        .then(inc => setIncidents(Array.isArray(inc) ? inc : []))
        .catch(() => {});
    }
  }, [events]);

  const activeIncidents = incidents.filter(i => !['resolved', 'false_alarm'].includes(i.status));
  const onDutyStaff = team.filter(s => s.is_on_duty);
  const criticalCount = activeIncidents.filter(i => i.severity === 1).length;

  async function handleSimulation() {
    setSimulating(true);
    try {
      await post('/api/simulate/cascading-failure', { hotel_id: hotelId });
      setTimeout(() => {
        get('/api/incidents?status=detecting,triaging,active,investigating')
          .then(inc => setIncidents(Array.isArray(inc) ? inc : []))
          .catch(() => {});
        setSimulating(false);
      }, 3000);
    } catch {
      setSimulating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-slate-500 text-sm">Loading dashboard…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-[fadeIn_0.4s_ease-out]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Real-time crisis monitoring · {user?.profile?.name}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Incidents"
          value={activeIncidents.length}
          sub={criticalCount > 0 ? `${criticalCount} critical` : 'All clear'}
          icon="🚨" accent="red"
        />
        <StatCard
          label="Staff On Duty"
          value={onDutyStaff.length}
          sub={`of ${team.length} total`}
          icon="👥" accent="blue"
        />
        <StatCard
          label="Guests Checked In"
          value={guests.length}
          sub="across all floors"
          icon="🏨" accent="green"
        />
        <StatCard
          label="System Status"
          value={<span className="text-2xl">HEALTHY</span>}
          sub="All systems operational"
          icon="💚" accent="purple"
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        {/* Active Incidents Panel */}
        <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h3 className="font-semibold text-white">Active Incidents</h3>
              {activeIncidents.length > 0 && (
                <span className="bg-red-500/15 text-red-400 border border-red-500/25 text-xs font-bold px-2 py-0.5 rounded-full">
                  {activeIncidents.length}
                </span>
              )}
            </div>
            <button
              onClick={handleSimulation}
              disabled={simulating}
              className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all duration-200 disabled:opacity-50"
            >
              {simulating ? (
                <><div className="w-3 h-3 border border-red-400/30 border-t-red-400 rounded-full animate-spin" />Running…</>
              ) : (
                <>🧪 Simulate Crisis</>
              )}
            </button>
          </div>

          <div className="p-4 space-y-2 max-h-[500px] overflow-y-auto">
            {activeIncidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-2xl">✅</div>
                <p className="text-slate-500 text-sm">No active incidents. Everything is secure.</p>
              </div>
            ) : (
              activeIncidents.map((inc) => (
                <div
                  key={inc._id}
                  onClick={() => navigate(`/dashboard/warroom/${inc._id}`)}
                  className="flex items-center gap-4 p-4 bg-white/3 hover:bg-white/5 border border-white/5 hover:border-white/10 rounded-xl cursor-pointer transition-all duration-150 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-lg shrink-0">
                    {INCIDENT_ICONS[inc.type] || '❓'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-white text-sm capitalize">
                        {inc.type.replace(/_/g, ' ')}
                      </span>
                      {inc.is_cascade && (
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">⚡ CASCADE</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>Floor {inc.floor}</span>
                      {inc.zone && <><span>·</span><span>{inc.zone}</span></>}
                      <span>·</span><span>{inc.source}</span>
                      <span>·</span><span>{timeAgo(inc.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {inc.severity && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${SEVERITY_STYLES[inc.severity]}`}>
                        {SEVERITY_LABELS[inc.severity]}
                      </span>
                    )}
                    <span className={`text-[10px] font-semibold border px-2 py-0.5 rounded capitalize ${STATUS_STYLES[inc.status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                      {inc.status}
                    </span>
                  </div>
                  <div className="text-slate-600 group-hover:text-slate-400 transition-colors text-xs ml-1">→</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Event Feed */}
        <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <h3 className="font-semibold text-white">Live Feed</h3>
              {events.length > 0 && (
                <span className="bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 text-xs font-bold px-2 py-0.5 rounded-full">
                  {events.length}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-1 max-h-[500px]">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-2xl">📡</div>
                <p className="text-slate-500 text-sm text-center">Waiting for events…</p>
              </div>
            ) : (
              events.slice(0, 30).map((evt) => {
                const cat = eventCategory(evt.type);
                return (
                  <div key={evt._id} className="flex items-start gap-3 py-2.5 border-b border-white/4 last:border-0">
                    <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${EVENT_DOT[cat] || 'bg-slate-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-300 font-medium">
                        <span className="text-white">{evt.type.replace(/:/g, ' → ')}</span>
                        {evt.floor && <span className="text-slate-500"> · Floor {evt.floor}</span>}
                        {evt.room && <span className="text-slate-500"> · Room {evt.room}</span>}
                      </p>
                      {evt.ts && (
                        <p className="text-[10px] text-slate-600 mt-0.5 font-mono">{formatTime(evt.ts)}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
