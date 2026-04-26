import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { initials, timeAgo, ROLE_ICONS, buildGuestQR } from '../lib/utils.js';

const ROLE_S = {
  manager:    'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  security:   'bg-red-500/15 text-red-400 border-red-500/25',
  maintenance:'bg-amber-500/15 text-amber-400 border-amber-500/25',
  medical:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  concierge:  'bg-blue-500/15 text-blue-400 border-blue-500/25',
  staff:      'bg-slate-500/15 text-slate-400 border-slate-500/25',
};

export default function Staff() {
  const [team,    setTeam]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating,setUpdating]= useState(null);
  const [qrModal, setQrModal] = useState(null); // {room, floor}
  const [qrRoom,  setQrRoom]  = useState('');
  const [qrFloor, setQrFloor] = useState('');
  const [hotelId, setHotelId] = useState('');
  const [showReg, setShowReg] = useState(false);
  const [regForm, setRegForm] = useState({ firebase_uid:'', name:'', role:'staff', email:'' });
  const [regLoading, setRegLoading] = useState(false);
  const [regErr, setRegErr] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([
        api.get('/api/staff/team'),
        api.get('/api/staff/profile'),
      ]);
      setTeam(Array.isArray(t) ? t : []);
      setHotelId(p?.hotel_id || '');
    } catch { setTeam([]); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleDuty(staffId, current) {
    setUpdating(staffId);
    try {
      await api.patch(`/api/staff/${staffId}`, { is_on_duty: !current });
      await load();
    } catch(e) { alert(e.message); }
    setUpdating(null);
  }

  async function registerStaff(e) {
    e.preventDefault();
    setRegLoading(true); setRegErr('');
    try {
      await api.post('/api/staff/register', { ...regForm, hotel_id: hotelId });
      setShowReg(false);
      setRegForm({ firebase_uid:'', name:'', role:'staff', email:'' });
      load();
    } catch(e) { setRegErr(e.message); }
    setRegLoading(false);
  }

  const guestQRUrl = qrRoom && qrFloor && hotelId ? buildGuestQR(hotelId, qrRoom, qrFloor) : '';

  const onDuty  = team.filter(s => s.is_on_duty);
  const offDuty = team.filter(s => !s.is_on_duty);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Team</h1>
          <p className="text-slate-600 text-xs mt-0.5">{onDuty.length} on duty · {offDuty.length} off duty</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setQrModal(true)}
            className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
            📱 Guest QR
          </button>
          <button onClick={() => setShowReg(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/20">
            + Add Staff
          </button>
        </div>
      </div>

      {/* Role summary */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {['manager','security','maintenance','medical','concierge','staff'].map(role => {
          const c = team.filter(s => s.role === role).length;
          return (
            <div key={role} className="glass rounded-xl p-3 text-center">
              <div className="text-xl mb-1">{ROLE_ICONS[role] || '👤'}</div>
              <div className="text-lg font-bold text-white">{c}</div>
              <div className="text-[10px] text-slate-600 capitalize">{role}</div>
            </div>
          );
        })}
      </div>

      {/* On Duty */}
      <div className="glass rounded-2xl">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
          <span className="font-semibold text-white text-sm">On Duty</span>
          <span className="bg-emerald-500/12 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full">{onDuty.length}</span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {onDuty.length === 0
            ? <p className="text-slate-600 text-sm col-span-full text-center py-8">No staff on duty</p>
            : onDuty.map(s => <StaffCard key={s._id} staff={s} updating={updating===s._id} onToggle={toggleDuty}/>)
          }
        </div>
      </div>

      {/* Off Duty */}
      <div className="glass rounded-2xl">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/5">
          <div className="w-2 h-2 rounded-full bg-slate-600"/>
          <span className="font-semibold text-white text-sm">Off Duty</span>
          <span className="bg-slate-500/12 text-slate-400 border border-slate-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full">{offDuty.length}</span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {offDuty.length === 0
            ? <p className="text-slate-600 text-sm col-span-full text-center py-8">Everyone is on duty</p>
            : offDuty.map(s => <StaffCard key={s._id} staff={s} updating={updating===s._id} onToggle={toggleDuty}/>)
          }
        </div>
      </div>

      {/* Guest QR Modal */}
      {qrModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setQrModal(false)}>
          <div className="glass rounded-3xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <h2 className="font-bold text-white">📱 Generate Guest QR</h2>
              <button onClick={() => setQrModal(false)} className="text-slate-600 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-all text-lg">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Room Number</label>
                  <input value={qrRoom} onChange={e => setQrRoom(e.target.value)}
                    className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2.5 text-sm"
                    placeholder="301"/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Floor</label>
                  <input type="number" min="1" value={qrFloor} onChange={e => setQrFloor(e.target.value)}
                    className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2.5 text-sm"
                    placeholder="3"/>
                </div>
              </div>

              {guestQRUrl && (
                <div className="space-y-3">
                  <div className="bg-white rounded-2xl p-4 flex items-center justify-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(guestQRUrl)}`}
                      alt="Guest QR Code"
                      className="w-48 h-48"
                    />
                  </div>
                  <div className="bg-void-800 border border-white/8 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Guest URL</p>
                    <p className="text-xs text-indigo-300 font-mono break-all">{guestQRUrl}</p>
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(guestQRUrl); }}
                    className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-all"
                  >
                    📋 Copy URL
                  </button>
                </div>
              )}

              <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 text-xs text-amber-400/80">
                💡 Print this QR code and place it inside room {qrRoom || '___'}. Guests scan it to access their emergency dashboard.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Register Staff Modal */}
      {showReg && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowReg(false)}>
          <div className="glass rounded-3xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <h2 className="font-bold text-white">Add Staff Member</h2>
              <button onClick={() => setShowReg(false)} className="text-slate-600 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-all text-lg">×</button>
            </div>
            <form onSubmit={registerStaff} className="p-6 space-y-4">
              <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-3 text-xs text-indigo-400/80">
                ℹ️ First create this person's account in Firebase Console (Authentication → Users), then copy their UID here.
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Firebase UID *</label>
                <input required value={regForm.firebase_uid} onChange={e => setRegForm({...regForm, firebase_uid:e.target.value})}
                  className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono"
                  placeholder="abc123xyz..."/>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Full Name *</label>
                <input required value={regForm.name} onChange={e => setRegForm({...regForm, name:e.target.value})}
                  className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2.5 text-sm"
                  placeholder="Jane Smith"/>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Role *</label>
                <select value={regForm.role} onChange={e => setRegForm({...regForm, role:e.target.value})}
                  className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white rounded-xl px-3 py-2.5 text-sm">
                  {['manager','security','maintenance','medical','concierge','staff'].map(r => (
                    <option key={r} value={r}>{ROLE_ICONS[r]} {r}</option>
                  ))}
                </select>
              </div>
              {regErr && <div className="text-red-400 text-xs bg-red-500/8 border border-red-500/15 rounded-xl px-3 py-2">{regErr}</div>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowReg(false)}
                  className="flex-1 bg-white/4 hover:bg-white/8 border border-white/8 text-slate-400 font-semibold py-2.5 rounded-xl text-sm transition-all">Cancel</button>
                <button type="submit" disabled={regLoading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2">
                  {regLoading ? <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"/>Adding…</> : 'Add Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffCard({ staff, updating, onToggle }) {
  const roleStyle = ROLE_S[staff.role] || 'bg-slate-500/15 text-slate-400 border-slate-500/25';
  return (
    <div className={`p-4 rounded-xl border transition-all ${staff.is_on_duty?'bg-white/3 border-white/8':'bg-white/1 border-white/4 opacity-70'}`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${staff.is_on_duty?'bg-indigo-500/15 text-indigo-300':'bg-slate-500/10 text-slate-500'}`}>
          {initials(staff.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="font-semibold text-white text-sm truncate">{staff.name}</span>
            <div className={`w-2 h-2 rounded-full shrink-0 ${staff.is_on_duty?'bg-emerald-400':'bg-slate-700'}`}/>
          </div>
          <span className={`inline-block text-[9px] font-bold border px-1.5 py-0.5 rounded mt-1 capitalize ${roleStyle}`}>{staff.role}</span>
          {staff.floor && <p className="text-[10px] text-slate-600 mt-1.5">Floor {staff.floor}{staff.zone?` · ${staff.zone}`:''}</p>}
          {staff.last_seen && <p className="text-[10px] text-slate-700 mt-0.5">Seen {timeAgo(staff.last_seen)}</p>}
        </div>
      </div>
      <button onClick={() => onToggle(staff._id, staff.is_on_duty)} disabled={updating}
        className={`w-full text-xs font-semibold py-2 rounded-xl border transition-all disabled:opacity-50 ${
          staff.is_on_duty
            ? 'bg-slate-500/8 hover:bg-red-500/10 border-slate-500/15 hover:border-red-500/20 text-slate-500 hover:text-red-400'
            : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-400'
        }`}>
        {updating
          ? <span className="flex items-center justify-center gap-1.5"><div className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin"/>Updating…</span>
          : staff.is_on_duty ? 'Mark Off Duty' : 'Mark On Duty'}
      </button>
    </div>
  );
}

const ROLE_S = {
  manager:    'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  security:   'bg-red-500/15 text-red-400 border-red-500/25',
  maintenance:'bg-amber-500/15 text-amber-400 border-amber-500/25',
  medical:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  concierge:  'bg-blue-500/15 text-blue-400 border-blue-500/25',
  staff:      'bg-slate-500/15 text-slate-400 border-slate-500/25',
};
