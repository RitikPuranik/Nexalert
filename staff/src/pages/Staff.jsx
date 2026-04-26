import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import { initials, timeAgo, ROLE_ICONS, buildGuestQR, buildHotelQR } from '../lib/utils.js';
import { useAuth } from '../lib/AuthContext.jsx';

const ROLE_S = {
  manager:    'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
  security:   'bg-red-500/15 text-red-400 border-red-500/25',
  maintenance:'bg-amber-500/15 text-amber-400 border-amber-500/25',
  medical:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  concierge:  'bg-blue-500/15 text-blue-400 border-blue-500/25',
  staff:      'bg-slate-500/15 text-slate-400 border-slate-500/25',
};

const ROOM_STATUS_S = {
  available:   'bg-emerald-500/12 text-emerald-400 border-emerald-500/25',
  occupied:    'bg-blue-500/12 text-blue-400 border-blue-500/25',
  maintenance: 'bg-amber-500/12 text-amber-400 border-amber-500/25',
  reserved:    'bg-purple-500/12 text-purple-400 border-purple-500/25',
};

const TABS = ['Team', 'Rooms', 'QR Codes'];

export default function Staff() {
  const { profile } = useAuth();
  const isManager = profile?.role === 'manager';
  const [activeTab, setActiveTab] = useState('Team');

  return (
    <div className="space-y-5">
      {/* Tab nav */}
      <div className="flex gap-1 bg-white/3 border border-white/8 rounded-2xl p-1">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'text-slate-500 hover:text-slate-300'
            }`}>
            {tab === 'Team' ? '👥 Team' : tab === 'Rooms' ? '🏨 Rooms' : '📱 QR Codes'}
          </button>
        ))}
      </div>

      {activeTab === 'Team'     && <TeamTab isManager={isManager} />}
      {activeTab === 'Rooms'    && <RoomsTab isManager={isManager} />}
      {activeTab === 'QR Codes' && <QRTab isManager={isManager} />}
    </div>
  );
}

// ─── TEAM TAB ─────────────────────────────────────────────────────────────────

function TeamTab({ isManager }) {
  const [team,      setTeam]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [updating,  setUpdating]  = useState(null);
  const [showReg,   setShowReg]   = useState(false);
  const [regForm,   setRegForm]   = useState({ firebase_uid:'', name:'', role:'staff', email:'', phone:'', floor_assignment:'' });
  const [regLoading,setRegLoading]= useState(false);
  const [regErr,    setRegErr]    = useState('');

  async function load() {
    setLoading(true);
    try {
      const t = await api.get('/api/staff/team');
      setTeam(Array.isArray(t) ? t : []);
    } catch { setTeam([]); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleDuty(staffId, current) {
    setUpdating(staffId);
    try {
      // Manager toggles any staff; staff only toggles themselves
      if (isManager) {
        await api.patch(`/api/staff/${staffId}/duty`, { is_on_duty: !current });
      } else {
        await api.patch('/api/staff/duty', { is_on_duty: !current });
      }
      await load();
    } catch(e) { alert(e.message); }
    setUpdating(null);
  }

  async function registerStaff(e) {
    e.preventDefault();
    setRegLoading(true); setRegErr('');
    try {
      const payload = { ...regForm };
      if (payload.floor_assignment) payload.floor_assignment = parseInt(payload.floor_assignment);
      else delete payload.floor_assignment;
      await api.post('/api/staff/register', payload);
      setShowReg(false);
      setRegForm({ firebase_uid:'', name:'', role:'staff', email:'', phone:'', floor_assignment:'' });
      load();
    } catch(e) { setRegErr(e.message); }
    setRegLoading(false);
  }

  const onDuty  = team.filter(s => s.is_on_duty);
  const offDuty = team.filter(s => !s.is_on_duty);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Team</h1>
          <p className="text-slate-600 text-xs mt-0.5">{onDuty.length} on duty · {offDuty.length} off duty</p>
        </div>
        {isManager && (
          <button onClick={() => setShowReg(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/20">
            + Add Staff
          </button>
        )}
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

      {/* Register Staff Modal */}
      {showReg && (
        <Modal title="Add Staff Member" onClose={() => setShowReg(false)}>
          <form onSubmit={registerStaff} className="space-y-4">
            <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-3 text-xs text-indigo-400/80">
              ℹ️ First create this person's account in Firebase Console (Authentication → Users), then copy their UID here.
            </div>
            <Field label="Firebase UID *">
              <input required value={regForm.firebase_uid} onChange={e => setRegForm({...regForm, firebase_uid:e.target.value})}
                className={INPUT} placeholder="abc123xyz..." />
            </Field>
            <Field label="Full Name *">
              <input required value={regForm.name} onChange={e => setRegForm({...regForm, name:e.target.value})}
                className={INPUT} placeholder="Jane Smith" />
            </Field>
            <Field label="Email">
              <input type="email" value={regForm.email} onChange={e => setRegForm({...regForm, email:e.target.value})}
                className={INPUT} placeholder="jane@hotel.com" />
            </Field>
            <Field label="Phone">
              <input value={regForm.phone} onChange={e => setRegForm({...regForm, phone:e.target.value})}
                className={INPUT} placeholder="+1-555-0100" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role *">
                <select value={regForm.role} onChange={e => setRegForm({...regForm, role:e.target.value})} className={INPUT}>
                  {['manager','security','maintenance','medical','concierge','staff'].map(r => (
                    <option key={r} value={r}>{ROLE_ICONS[r]} {r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Floor Assignment">
                <input type="number" min="1" value={regForm.floor_assignment}
                  onChange={e => setRegForm({...regForm, floor_assignment:e.target.value})}
                  className={INPUT} placeholder="3" />
              </Field>
            </div>
            {regErr && <ErrBox msg={regErr}/>}
            <ModalButtons onCancel={() => setShowReg(false)} loading={regLoading} label="Add Staff" />
          </form>
        </Modal>
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
          {staff.floor_assignment && <p className="text-[10px] text-slate-600 mt-1.5">Floor {staff.floor_assignment}{staff.zone_assignment?` · ${staff.zone_assignment}`:''}</p>}
          {staff.email && <p className="text-[10px] text-slate-700 mt-0.5 truncate">{staff.email}</p>}
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

// ─── ROOMS TAB ────────────────────────────────────────────────────────────────

function RoomsTab({ isManager }) {
  const [rooms,     setRooms]     = useState([]);
  const [summary,   setSummary]   = useState(null);
  const [team,      setTeam]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [floorFilter, setFloorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdd,   setShowAdd]   = useState(false);
  const [showBulk,  setShowBulk]  = useState(false);
  const [addForm,   setAddForm]   = useState({ room_number:'', floor:'', type:'single', status:'available', notes:'' });
  const [bulkText,  setBulkText]  = useState('');
  const [addLoading,setAddLoading]= useState(false);
  const [addErr,    setAddErr]    = useState('');
  const [editRoom,  setEditRoom]  = useState(null); // room being edited
  const [qrRoom,    setQrRoom]    = useState(null); // room for QR display
  const [hotelQrToken, setHotelQrToken] = useState('');
  const [hotelId,   setHotelId]   = useState('');

  async function load() {
    setLoading(true);
    try {
      const [r, s, t, p, h] = await Promise.all([
        api.get('/api/rooms'),
        api.get('/api/rooms/summary'),
        api.get('/api/staff/team'),
        api.get('/api/staff/profile'),
        api.get('/api/hotels/qr-token').catch(() => ({ qr_token: null })),
      ]);
      setRooms(Array.isArray(r) ? r : []);
      setSummary(s);
      setTeam(Array.isArray(t) ? t : []);
      setHotelId(p?.hotel_id || '');
      setHotelQrToken(h?.qr_token || '');
    } catch { setRooms([]); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addRoom(e) {
    e.preventDefault();
    setAddLoading(true); setAddErr('');
    try {
      await api.post('/api/rooms', { ...addForm, floor: parseInt(addForm.floor) });
      setShowAdd(false);
      setAddForm({ room_number:'', floor:'', type:'single', status:'available', notes:'' });
      load();
    } catch(e) { setAddErr(e.message); }
    setAddLoading(false);
  }

  async function bulkAdd(e) {
    e.preventDefault();
    setAddLoading(true); setAddErr('');
    try {
      // Parse CSV: room_number,floor,type
      const lines = bulkText.trim().split('\n').filter(Boolean);
      const rooms = lines.map(line => {
        const parts = line.split(',').map(s => s.trim());
        return { room_number: parts[0], floor: parseInt(parts[1]), type: parts[2] || 'single' };
      }).filter(r => r.room_number && r.floor);
      if (!rooms.length) throw new Error('No valid rooms found. Format: room_number,floor,type');
      await api.post('/api/rooms/bulk', { rooms });
      setShowBulk(false);
      setBulkText('');
      load();
    } catch(e) { setAddErr(e.message); }
    setAddLoading(false);
  }

  async function updateRoomStatus(roomId, status) {
    try {
      await api.patch(`/api/rooms/${roomId}`, { status });
      load();
    } catch(e) { alert(e.message); }
  }

  async function assignStaff(roomId, staffId) {
    try {
      await api.patch(`/api/rooms/${roomId}/assign`, { staff_id: staffId || null });
      load();
    } catch(e) { alert(e.message); }
  }

  async function deleteRoom(roomId, roomNum) {
    if (!confirm(`Delete room ${roomNum}?`)) return;
    try {
      await api.delete(`/api/rooms/${roomId}`);
      load();
    } catch(e) { alert(e.message); }
  }

  const floors = [...new Set(rooms.map(r => r.floor))].sort((a,b) => a-b);
  const filtered = rooms.filter(r => {
    if (floorFilter !== 'all' && r.floor !== parseInt(floorFilter)) return false;
    const effectiveStatus = r.guest?.is_checked_in ? 'occupied' : r.status;
    if (statusFilter !== 'all' && effectiveStatus !== statusFilter) return false;
    return true;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Room Management</h1>
          <p className="text-slate-600 text-xs mt-0.5">{rooms.length} total rooms</p>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <button onClick={() => setShowBulk(true)}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-sm font-semibold px-3 py-2.5 rounded-xl transition-all">
              📋 Bulk Add
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all hover:shadow-lg hover:shadow-indigo-500/20">
              + Add Room
            </button>
          </div>
        )}
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label:'Available', count: summary.available, color:'emerald' },
            { label:'Occupied',  count: summary.occupied,  color:'blue' },
            { label:'Reserved',  count: summary.reserved,  color:'purple' },
            { label:'Maintenance',count:summary.maintenance,color:'amber' },
          ].map(({ label, count, color }) => (
            <div key={label} className={`glass rounded-xl p-4 border border-${color}-500/15`}>
              <div className={`text-2xl font-black text-${color}-400`}>{count}</div>
              <div className="text-xs text-slate-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={floorFilter} onChange={e => setFloorFilter(e.target.value)}
          className="bg-white/4 border border-white/8 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500/40">
          <option value="all">All Floors</option>
          {floors.map(f => <option key={f} value={f}>Floor {f}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-white/4 border border-white/8 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500/40">
          <option value="all">All Status</option>
          {['available','occupied','reserved','maintenance'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-slate-600 text-xs self-center ml-1">{filtered.length} rooms</span>
      </div>

      {/* Room grid */}
      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <div className="text-4xl mb-3">🏨</div>
          <p className="text-slate-500">{rooms.length === 0 ? 'No rooms added yet. Add rooms to get started.' : 'No rooms match your filters.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(room => (
            <RoomCard key={room._id} room={room} team={team} isManager={isManager}
              hotelQrToken={hotelQrToken} hotelId={hotelId}
              onStatusChange={updateRoomStatus}
              onAssignStaff={assignStaff}
              onDelete={deleteRoom}
              onShowQR={() => setQrRoom(room)}
            />
          ))}
        </div>
      )}

      {/* Add Room Modal */}
      {showAdd && (
        <Modal title="Add Room" onClose={() => setShowAdd(false)}>
          <form onSubmit={addRoom} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Room Number *">
                <input required value={addForm.room_number} onChange={e => setAddForm({...addForm, room_number:e.target.value})}
                  className={INPUT} placeholder="301" />
              </Field>
              <Field label="Floor *">
                <input required type="number" min="1" value={addForm.floor} onChange={e => setAddForm({...addForm, floor:e.target.value})}
                  className={INPUT} placeholder="3" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select value={addForm.type} onChange={e => setAddForm({...addForm, type:e.target.value})} className={INPUT}>
                  {['single','double','suite','deluxe','penthouse'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={addForm.status} onChange={e => setAddForm({...addForm, status:e.target.value})} className={INPUT}>
                  {['available','reserved','maintenance'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Notes">
              <input value={addForm.notes} onChange={e => setAddForm({...addForm, notes:e.target.value})}
                className={INPUT} placeholder="Optional notes" />
            </Field>
            {addErr && <ErrBox msg={addErr}/>}
            <ModalButtons onCancel={() => setShowAdd(false)} loading={addLoading} label="Add Room" />
          </form>
        </Modal>
      )}

      {/* Bulk Add Modal */}
      {showBulk && (
        <Modal title="Bulk Add Rooms" onClose={() => setShowBulk(false)}>
          <form onSubmit={bulkAdd} className="space-y-4">
            <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-3 text-xs text-indigo-400/80">
              Enter one room per line: <code className="text-indigo-300 font-mono">room_number,floor,type</code>
              <br/>Example: <code className="text-indigo-300 font-mono">301,3,double</code>
            </div>
            <Field label="Rooms (CSV format)">
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={8}
                className={INPUT + ' resize-none font-mono text-xs'}
                placeholder={'101,1,single\n102,1,double\n201,2,suite'} />
            </Field>
            {addErr && <ErrBox msg={addErr}/>}
            <ModalButtons onCancel={() => setShowBulk(false)} loading={addLoading} label="Import Rooms" />
          </form>
        </Modal>
      )}

      {/* Room QR Modal */}
      {qrRoom && (
        <Modal title={`QR Code — Room ${qrRoom.room_number}`} onClose={() => setQrRoom(null)}>
          <QRDisplay
            url={buildGuestQR(hotelId, qrRoom.room_number, qrRoom.floor, hotelQrToken)}
            label={`Room ${qrRoom.room_number} · Floor ${qrRoom.floor}`}
            onClose={() => setQrRoom(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function RoomCard({ room, team, isManager, hotelQrToken, hotelId, onStatusChange, onAssignStaff, onDelete, onShowQR }) {
  const effectiveStatus = room.guest?.is_checked_in ? 'occupied' : room.status;
  const styleClass = ROOM_STATUS_S[effectiveStatus] || ROOM_STATUS_S.available;
  const [assigning, setAssigning] = useState(false);

  async function handleAssign(e) {
    setAssigning(true);
    await onAssignStaff(room._id, e.target.value || null);
    setAssigning(false);
  }

  return (
    <div className={`glass rounded-xl border p-4 space-y-3 ${effectiveStatus === 'occupied' ? 'border-blue-500/20' : effectiveStatus === 'maintenance' ? 'border-amber-500/20' : 'border-white/8'}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-black text-white text-lg">Room {room.room_number}</span>
            <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded-full capitalize ${styleClass}`}>{effectiveStatus}</span>
          </div>
          <p className="text-slate-600 text-xs mt-0.5">Floor {room.floor} · <span className="capitalize">{room.type}</span></p>
        </div>
        <div className="flex gap-1">
          <button onClick={onShowQR} title="Generate QR"
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm transition-all">
            📱
          </button>
          {isManager && (
            <button onClick={() => onDelete(room._id, room.room_number)} title="Delete room"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/8 hover:bg-red-500/15 text-red-500 text-sm transition-all">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Guest info */}
      {room.guest?.is_checked_in ? (
        <div className="bg-blue-500/8 border border-blue-500/15 rounded-xl px-3 py-2">
          <p className="text-blue-400 text-xs font-bold mb-0.5">👤 Guest Checked In</p>
          <p className="text-blue-300/80 text-xs">{room.guest.name || 'Anonymous'}</p>
          {room.guest.check_in && <p className="text-blue-400/50 text-[10px]">Since {new Date(room.guest.check_in).toLocaleDateString()}</p>}
        </div>
      ) : (
        <div className="bg-white/3 border border-white/6 rounded-xl px-3 py-2">
          <p className="text-slate-600 text-xs">No guest checked in</p>
        </div>
      )}

      {/* Staff assignment */}
      {isManager && (
        <div>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">Assigned Staff</p>
          <select value={room.assigned_staff_id?._id || ''} onChange={handleAssign} disabled={assigning}
            className="w-full bg-void-800 border border-white/8 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500/40 disabled:opacity-50">
            <option value="">— Unassigned —</option>
            {team.map(s => <option key={s._id} value={s._id}>{s.name} ({s.role})</option>)}
          </select>
        </div>
      )}

      {/* Status quick-change */}
      {isManager && !room.guest?.is_checked_in && (
        <div className="flex gap-1.5">
          {['available','reserved','maintenance'].map(s => (
            <button key={s} onClick={() => onStatusChange(room._id, s)}
              disabled={room.status === s}
              className={`flex-1 text-[10px] font-semibold py-1.5 rounded-lg border transition-all capitalize disabled:opacity-40 ${
                room.status === s ? ROOM_STATUS_S[s] : 'bg-white/3 border-white/8 text-slate-500 hover:border-white/15'
              }`}>
              {s}
            </button>
          ))}
        </div>
      )}

      {room.notes && <p className="text-[10px] text-slate-600 italic">{room.notes}</p>}
    </div>
  );
}

// ─── QR CODES TAB ─────────────────────────────────────────────────────────────

function QRTab({ isManager }) {
  const [hotelId,    setHotelId]    = useState('');
  const [qrToken,    setQrToken]    = useState('');
  const [hotelName,  setHotelName]  = useState('');
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);
  const [roomQR,     setRoomQR]     = useState({ room:'', floor:'' });
  const [selectedQR, setSelectedQR] = useState(null); // 'hotel' | 'room'

  async function load() {
    setLoading(true);
    try {
      const [p, h, hotel] = await Promise.all([
        api.get('/api/staff/profile'),
        api.get('/api/hotels/qr-token').catch(() => ({ qr_token: null })),
        api.get('/api/hotels/me'),
      ]);
      setHotelId(p?.hotel_id || '');
      setQrToken(h?.qr_token || '');
      setHotelName(hotel?.name || '');
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function generateToken() {
    if (!confirm('Generate a new QR token? The old one will stop working.')) return;
    setGenerating(true);
    try {
      const data = await api.post('/api/hotels/qr-token', {});
      setQrToken(data.qr_token);
    } catch(e) { alert(e.message); }
    setGenerating(false);
  }

  const hotelQRUrl = qrToken ? buildHotelQR(qrToken) : '';
  const roomQRUrl  = (roomQR.room && roomQR.floor && (qrToken || hotelId))
    ? buildGuestQR(hotelId, roomQR.room, roomQR.floor, qrToken)
    : '';

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">QR Code Manager</h1>
        <p className="text-slate-600 text-xs mt-0.5">Generate unique QR codes for your hotel</p>
      </div>

      {/* Hotel-wide QR */}
      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-white">🏨 Hotel QR Code</h2>
            <p className="text-slate-500 text-xs mt-0.5">Guests scan → enter their own room number</p>
          </div>
          {isManager && (
            <button onClick={generateToken} disabled={generating}
              className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-2 rounded-xl transition-all flex items-center gap-1.5">
              {generating ? <><Spin/>Generating…</> : '🔄 ' + (qrToken ? 'Regenerate' : 'Generate')}
            </button>
          )}
        </div>

        {qrToken ? (
          <>
            <QRDisplay url={hotelQRUrl} label={hotelName} />
            <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 text-xs text-amber-400/80">
              💡 Place this QR at the front desk, lobby, or print in every room. Guests enter their room number after scanning.
            </div>
          </>
        ) : (
          <div className="bg-white/3 border border-white/8 rounded-xl p-6 text-center">
            <p className="text-slate-500 text-sm">{isManager ? 'Click "Generate" to create your hotel\'s unique QR code.' : 'No QR token generated yet. Ask your manager to generate one.'}</p>
          </div>
        )}
      </div>

      {/* Per-room QR */}
      <div className="glass rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="font-bold text-white">🚪 Per-Room QR Code</h2>
          <p className="text-slate-500 text-xs mt-0.5">Pre-fills room number — place inside the room</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Room Number">
            <input value={roomQR.room} onChange={e => setRoomQR({...roomQR, room:e.target.value})}
              className={INPUT} placeholder="301" />
          </Field>
          <Field label="Floor">
            <input type="number" min="1" value={roomQR.floor} onChange={e => setRoomQR({...roomQR, floor:e.target.value})}
              className={INPUT} placeholder="3" />
          </Field>
        </div>
        {roomQRUrl ? (
          <QRDisplay url={roomQRUrl} label={`Room ${roomQR.room} · Floor ${roomQR.floor}`} />
        ) : (
          <div className="bg-white/3 border border-white/8 rounded-xl p-4 text-center">
            <p className="text-slate-600 text-xs">{!qrToken && !hotelId ? 'Generate hotel QR first' : 'Enter room number and floor to generate'}</p>
          </div>
        )}
        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 text-xs text-emerald-400/80">
          ✅ This QR is locked to your hotel only — guests from other hotels cannot use it.
        </div>
      </div>
    </div>
  );
}

function QRDisplay({ url, label }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl p-4 flex items-center justify-center">
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`}
          alt="QR Code"
          className="w-52 h-52"
        />
      </div>
      {label && <p className="text-center text-slate-400 text-xs font-medium">{label}</p>}
      <div className="bg-void-800 border border-white/8 rounded-xl p-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">URL</p>
        <p className="text-xs text-indigo-300 font-mono break-all">{url}</p>
      </div>
      <button onClick={copy}
        className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-all">
        {copied ? '✅ Copied!' : '📋 Copy URL'}
      </button>
    </div>
  );
}

// ─── Shared Helpers ────────────────────────────────────────────────────────────

const INPUT = 'w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2.5 text-sm';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{label}</label>
      {children}
    </div>
  );
}

function ErrBox({ msg }) {
  return <div className="text-red-400 text-xs bg-red-500/8 border border-red-500/15 rounded-xl px-3 py-2">{msg}</div>;
}

function Spin() {
  return <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0"/>;
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"/>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass rounded-3xl w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <h2 className="font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-600 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 transition-all text-lg">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalButtons({ onCancel, loading, label }) {
  return (
    <div className="flex gap-3 pt-2">
      <button type="button" onClick={onCancel}
        className="flex-1 bg-white/4 hover:bg-white/8 border border-white/8 text-slate-400 font-semibold py-2.5 rounded-xl text-sm transition-all">Cancel</button>
      <button type="submit" disabled={loading}
        className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2">
        {loading ? <><Spin/>{label.replace(/^Add|^Import/, 'Adding')}…</> : label}
      </button>
    </div>
  );
}
