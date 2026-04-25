import { useState, useEffect } from 'react';
import { get, patch } from '../lib/api';
import { initials, timeAgo } from '../lib/utils';

const ROLE_STYLES = {
  manager:    'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  security:   'bg-red-500/15 text-red-400 border-red-500/25',
  maintenance:'bg-amber-500/15 text-amber-400 border-amber-500/25',
  medical:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  concierge:  'bg-blue-500/15 text-blue-400 border-blue-500/25',
};

const ROLE_ICONS = {
  manager: '👔', security: '🛡', maintenance: '🔧', medical: '🩺', concierge: '🛎',
};

export default function Staff() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  useEffect(() => { loadTeam(); }, []);

  async function loadTeam() {
    setLoading(true);
    try {
      const data = await get('/api/staff/team');
      setTeam(Array.isArray(data) ? data : []);
    } catch { setTeam([]); }
    setLoading(false);
  }

  async function toggleDuty(staffId, current) {
    setUpdating(staffId);
    try {
      await patch(`/api/staff/${staffId}`, { is_on_duty: !current });
      await loadTeam();
    } catch (err) { console.error(err); }
    setUpdating(null);
  }

  const onDuty = team.filter(s => s.is_on_duty);
  const offDuty = team.filter(s => !s.is_on_duty);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Staff</h1>
        <p className="text-slate-500 text-sm mt-1">{onDuty.length} on duty · {offDuty.length} off duty</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {['manager','security','maintenance','medical'].map(role => {
          const count = team.filter(s => s.role === role).length;
          return (
            <div key={role} className="bg-[#0c1325]/80 border border-white/6 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-2xl">{ROLE_ICONS[role]}</span>
              <div>
                <div className="text-xl font-bold text-white">{count}</div>
                <div className="text-xs text-slate-500 capitalize">{role}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* On Duty */}
      <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="font-semibold text-white">On Duty</h3>
          <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-xs font-bold px-2 py-0.5 rounded-full">
            {onDuty.length}
          </span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {onDuty.length === 0 ? (
            <p className="text-slate-500 text-sm col-span-full text-center py-8">No staff on duty</p>
          ) : onDuty.map(s => (
            <StaffCard key={s._id} staff={s} updating={updating === s._id} onToggle={toggleDuty} />
          ))}
        </div>
      </div>

      {/* Off Duty */}
      <div className="bg-[#0c1325]/80 border border-white/6 backdrop-blur-xl rounded-2xl">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5">
          <div className="w-2 h-2 rounded-full bg-slate-500" />
          <h3 className="font-semibold text-white">Off Duty</h3>
          <span className="bg-slate-500/15 text-slate-400 border border-slate-500/25 text-xs font-bold px-2 py-0.5 rounded-full">
            {offDuty.length}
          </span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {offDuty.length === 0 ? (
            <p className="text-slate-500 text-sm col-span-full text-center py-8">All staff are on duty</p>
          ) : offDuty.map(s => (
            <StaffCard key={s._id} staff={s} updating={updating === s._id} onToggle={toggleDuty} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StaffCard({ staff, updating, onToggle }) {
  const roleStyle = ROLE_STYLES[staff.role] || 'bg-slate-500/15 text-slate-400 border-slate-500/25';
  return (
    <div className={`p-4 rounded-xl border transition-all duration-200 ${
      staff.is_on_duty
        ? 'bg-white/4 border-white/8 hover:border-white/15'
        : 'bg-white/2 border-white/5 opacity-70'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
          staff.is_on_duty ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-500/15 text-slate-400'
        }`}>
          {initials(staff.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-white text-sm truncate">{staff.name}</span>
            <div className={`w-2 h-2 rounded-full shrink-0 ${staff.is_on_duty ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          </div>
          <span className={`inline-block text-[10px] font-bold border px-2 py-0.5 rounded mt-1 capitalize ${roleStyle}`}>
            {staff.role}
          </span>
          {staff.floor && (
            <p className="text-xs text-slate-500 mt-1.5">Floor {staff.floor}{staff.zone ? ` · ${staff.zone}` : ''}</p>
          )}
          {staff.last_seen && (
            <p className="text-[10px] text-slate-600 mt-0.5">Last seen {timeAgo(staff.last_seen)}</p>
          )}
        </div>
      </div>
      <button
        onClick={() => onToggle(staff._id, staff.is_on_duty)}
        disabled={updating}
        className={`mt-3 w-full text-xs font-semibold py-2 rounded-lg border transition-all duration-150 disabled:opacity-50 ${
          staff.is_on_duty
            ? 'bg-slate-500/10 hover:bg-red-500/10 border-slate-500/20 hover:border-red-500/20 text-slate-400 hover:text-red-400'
            : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-400'
        }`}
      >
        {updating ? (
          <span className="flex items-center justify-center gap-1.5">
            <div className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" />Updating…
          </span>
        ) : staff.is_on_duty ? 'Mark Off Duty' : 'Mark On Duty'}
      </button>
    </div>
  );
}
