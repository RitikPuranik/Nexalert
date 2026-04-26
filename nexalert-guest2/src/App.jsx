import { useState, useEffect, useRef, useCallback } from 'react';

// ── Read EVERYTHING from the QR URL params ────────────────────────────────────
// QR format: http://GUEST_APP/?h=&r=ROOM&f=FLOOR
// hotel_id is NEVER shown to the guest — it's invisible in the URL
function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    hotel_id: p.get('h') || p.get('hotel_id') || '',
    room:     p.get('r') || p.get('room')     || '',
    floor:    p.get('f') || p.get('floor')    || '',
  };
}

// ── API helpers (all public — no auth) ───────────────────────────────────────
async function gPost(url, body) {
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}
async function gPatch(url, body) {
  const r = await fetch(url, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}
async function gGet(url) {
  const r = await fetch(url);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

// ── Screens ───────────────────────────────────────────────────────────────────
const S = {
  ROOM_ENTRY: 'room_entry',  // only shown if QR has no room — guest types room number
  IDLE:       'idle',         // main safety dashboard
  CONFIRM:    'confirm',      // hold-to-send confirmation
  ACTIVE:     'active',       // SOS sent, waiting for response buttons
  RESPONDED:  'responded',    // guest responded safe/help
  RESOLVED:   'resolved',     // incident closed by staff
};

function Spin() {
  return <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0"/>;
}

// ── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const { hotel_id, room: qrRoom, floor: qrFloor } = getParams();

  // If QR has room+floor → skip room entry. If not → guest types their room.
  const hasRoom = !!(qrRoom && qrFloor);

  const [screen,     setScreen]     = useState(hasRoom ? S.IDLE : S.ROOM_ENTRY);
  const [room,       setRoom]       = useState(qrRoom);
  const [floor,      setFloor]      = useState(qrFloor);
  const [roomInput,  setRoomInput]  = useState('');
  const [floorInput, setFloorInput] = useState('');
  const [roomErr,    setRoomErr]    = useState('');

  const [incidentId, setIncidentId] = useState(null);
  const [dmToken,    setDmToken]    = useState(null);
  const [dmInterval, setDmInterval] = useState(120);
  const [dmLeft,     setDmLeft]     = useState(120);
  const [dmMissed,   setDmMissed]   = useState(0);
  const [evacMsg,    setEvacMsg]    = useState('');
  const [guestAlert, setGuestAlert] = useState('');
  const [response,   setResponse]   = useState(null);
  const [incStatus,  setIncStatus]  = useState(null);
  const [sosLoading, setSosLoading] = useState(false);
  const [sosErr,     setSosErr]     = useState('');

  const dmCountRef = useRef(null);
  const dmPingRef  = useRef(null);
  const pollRef    = useRef(null);
  const geoRef     = useRef(null);

  // ── Auto check-in silently when QR has room ──────────────────────────────
  useEffect(() => {
    if (!hotel_id) return;
    const r = room || qrRoom;
    const f = floor || qrFloor;
    if (!r || !f) return;
    gPost('/api/guests/locations', { hotel_id, room: r, floor: parseInt(f) }).catch(() => {});
    startGeo(r);
  }, []);

  // ── Geo ──────────────────────────────────────────────────────────────────
  const startGeo = useCallback((r) => {
    if (!navigator.geolocation || !hotel_id) return;
    geoRef.current = navigator.geolocation.watchPosition(pos => {
      gPatch('/api/guests/locations/coordinates', {
        hotel_id, room: r,
        coordinates: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
      }).catch(() => {});
    }, () => {}, { enableHighAccuracy: true, maximumAge: 30000 });
  }, [hotel_id]);

  const stopGeo = useCallback(() => {
    if (geoRef.current != null) { navigator.geolocation.clearWatch(geoRef.current); geoRef.current = null; }
  }, []);

  // ── Dead Man Switch ──────────────────────────────────────────────────────
  const startDMS = useCallback((token, intSec) => {
    setDmToken(token); setDmInterval(intSec); setDmLeft(intSec); setDmMissed(0);
    dmCountRef.current = setInterval(() => {
      setDmLeft(l => { if (l <= 1) { setDmMissed(m => m + 1); return intSec; } return l - 1; });
    }, 1000);
    dmPingRef.current = setInterval(() => {
      gPost('/api/guests/deadman/ping', { token }).catch(() => setDmMissed(m => m + 1));
    }, intSec * 1000);
  }, []);

  const stopDMS = useCallback(() => {
    clearInterval(dmCountRef.current); clearInterval(dmPingRef.current);
  }, []);

  // ── Poll incident status ─────────────────────────────────────────────────
  const startPoll = useCallback((hId, fl) => {
    pollRef.current = setInterval(async () => {
      try {
        const d = await gGet(`/api/incidents/sos/status?hotel_id=${hId}&floor=${fl}`);
        const incs = d.incidents || [];
        if (incs.length > 0) {
          setIncStatus(incs[0].status);
          if (['resolved','false_alarm'].includes(incs[0].status)) {
            clearInterval(pollRef.current); stopDMS(); stopGeo();
            setScreen(S.RESOLVED);
          }
        }
      } catch { /* silent */ }
    }, 12000);
  }, [stopDMS, stopGeo]);

  useEffect(() => () => { stopDMS(); clearInterval(pollRef.current); stopGeo(); }, []);

  // ── Manual heartbeat ─────────────────────────────────────────────────────
  async function manualPing() {
    if (!dmToken) return;
    try { await gPost('/api/guests/deadman/ping', { token: dmToken }); setDmLeft(dmInterval); setDmMissed(0); }
    catch { /* ignore */ }
  }

  // ── Room entry submit (only for generic QR without room) ─────────────────
  async function handleRoomEntry(e) {
    e.preventDefault();
    if (!roomInput.trim()) { setRoomErr('Please enter your room number'); return; }
    if (!floorInput)       { setRoomErr('Please enter your floor'); return; }
    if (!hotel_id)         { setRoomErr('Invalid QR code — please contact the front desk'); return; }
    setRoomErr('');
    const r = roomInput.trim();
    const f = floorInput;
    setRoom(r); setFloor(f);
    try {
      await gPost('/api/guests/locations', { hotel_id, room: r, floor: parseInt(f) });
      startGeo(r);
      setScreen(S.IDLE);
    } catch(err) { setRoomErr(err.message); }
  }

  // ── SOS ──────────────────────────────────────────────────────────────────
  async function confirmSOS() {
    setSosLoading(true); setSosErr('');
    try {
      const d = await gPost('/api/incidents/sos', { hotel_id, room, floor: parseInt(floor), type:'sos' });
      setIncidentId(d.incident_id);
      if (d.deadman_token)    startDMS(d.deadman_token, d.deadman_interval || 120);
      if (d.exit_instruction) setEvacMsg(d.exit_instruction);
      if (d.guest_alert_en)   setGuestAlert(d.guest_alert_en);
      startPoll(hotel_id, floor);
      setScreen(S.ACTIVE);
    } catch(err) { setSosErr(err.message); setScreen(S.IDLE); }
    setSosLoading(false);
  }

  // ── Respond ──────────────────────────────────────────────────────────────
  async function respond(type) {
    try {
      await gPatch('/api/guests/locations/respond', { hotel_id, room, floor: parseInt(floor), response: type, incident_id: incidentId });
      setResponse(type); setScreen(S.RESPONDED);
    } catch { /* silent */ }
  }

  async function changeResponse(type) {
    try {
      await gPatch('/api/guests/locations/respond', { hotel_id, room, floor: parseInt(floor), response: type, incident_id: incidentId });
      setResponse(type);
    } catch { /* silent */ }
  }

  // ── No hotel_id means invalid QR ─────────────────────────────────────────
  if (!hotel_id) return <InvalidQR/>;

  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col items-center px-4 pt-10 pb-16">
      <div className="w-full max-w-sm mx-auto space-y-4">

        {screen === S.ROOM_ENTRY && (
          <RoomEntry
            hotelId={hotel_id}
            roomInput={roomInput} setRoomInput={setRoomInput}
            floorInput={floorInput} setFloorInput={setFloorInput}
            error={roomErr} onSubmit={handleRoomEntry}
          />
        )}

        {screen === S.IDLE && (
          <Idle room={room} floor={floor} onSOS={() => setScreen(S.CONFIRM)}/>
        )}

        {screen === S.CONFIRM && (
          <Confirm loading={sosLoading} error={sosErr}
            onConfirm={confirmSOS} onCancel={() => setScreen(S.IDLE)}/>
        )}

        {screen === S.ACTIVE && (
          <Active
            room={room} floor={floor}
            evacMsg={evacMsg} guestAlert={guestAlert} incStatus={incStatus}
            dmToken={dmToken} dmLeft={dmLeft} dmInterval={dmInterval} dmMissed={dmMissed}
            onSafe={() => respond('safe')} onHelp={() => respond('needs_help')} onPing={manualPing}
          />
        )}

        {screen === S.RESPONDED && (
          <Responded
            response={response} room={room} floor={floor} incStatus={incStatus}
            dmToken={dmToken} dmLeft={dmLeft} dmInterval={dmInterval} dmMissed={dmMissed}
            onPing={manualPing} onChangeResponse={changeResponse}
          />
        )}

        {screen === S.RESOLVED && (
          <Resolved onReset={() => { setResponse(null); setIncidentId(null); setIncStatus(null); setScreen(S.IDLE); }}/>
        )}

      </div>
    </div>
  );
}

// ─── InvalidQR ───────────────────────────────────────────────────────────────
function InvalidQR() {
  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex items-center justify-center px-6">
      <div className="text-center space-y-4">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-xl font-bold text-white">Invalid QR Code</h1>
        <p className="text-[#666] text-sm leading-relaxed">
          This QR code is missing required hotel information.<br/>Please contact the front desk for a new QR code.
        </p>
      </div>
    </div>
  );
}

// ─── RoomEntry — only shown when QR has no room/floor encoded ────────────────
// e.g. a hotel lobby QR: http://guest-app/?h=HOTEL_ID
function RoomEntry({ roomInput, setRoomInput, floorInput, setFloorInput, error, onSubmit }) {
  return (
    <>
      <div className="text-center pb-2">
        <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/20 flex items-center justify-center text-3xl mx-auto mb-4">🚨</div>
        <h1 className="text-2xl font-black text-white">NexAlert</h1>
        <p className="text-[#555] text-sm mt-1">Hotel Emergency System</p>
      </div>

      <div className="bg-[#111] border border-white/8 rounded-3xl p-6">
        <h2 className="font-bold text-white text-base mb-1">Enter your room</h2>
        <p className="text-[#555] text-xs mb-5">This activates your personal emergency dashboard</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-[#555] uppercase tracking-widest mb-2">Room Number</label>
            <input
              required autoFocus inputMode="numeric"
              value={roomInput} onChange={e => setRoomInput(e.target.value)}
              className="w-full bg-black/50 border border-white/10 focus:border-red-500/50 focus:outline-none text-white placeholder-[#333] rounded-2xl px-4 py-4 text-2xl font-bold text-center tracking-widest"
              placeholder="301"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#555] uppercase tracking-widest mb-2">Floor</label>
            <input
              required inputMode="numeric" type="number" min="1" max="99"
              value={floorInput} onChange={e => setFloorInput(e.target.value)}
              className="w-full bg-black/50 border border-white/10 focus:border-red-500/50 focus:outline-none text-white placeholder-[#333] rounded-2xl px-4 py-4 text-2xl font-bold text-center tracking-widest"
              placeholder="3"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-2xl text-center">{error}</div>
          )}

          <button type="submit"
            className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-4 rounded-2xl transition-all active:scale-[0.98] text-base mt-2">
            Activate Emergency System →
          </button>
        </form>
      </div>

      <p className="text-center text-[10px] text-[#2a2a2a]">Location data used only for emergency response</p>
    </>
  );
}

// ─── Idle ─────────────────────────────────────────────────────────────────────
function Idle({ room, floor, onSOS }) {
  const [held,    setHeld]    = useState(false);
  const [holdPct, setHoldPct] = useState(0);
  const timerRef  = useRef(null);
  const animRef   = useRef(null);
  const startRef  = useRef(null);

  function startHold() {
    setHeld(true);
    startRef.current = Date.now();
    const tick = () => {
      const pct = Math.min(((Date.now() - startRef.current) / 1500) * 100, 100);
      setHoldPct(pct);
      if (pct < 100) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    timerRef.current = setTimeout(() => { setHeld(false); setHoldPct(0); onSOS(); }, 1500);
  }

  function cancelHold() {
    setHeld(false); setHoldPct(0);
    clearTimeout(timerRef.current);
    cancelAnimationFrame(animRef.current);
  }

  const r = 90, circ = 2 * Math.PI * r;

  return (
    <>
      {/* Room badge */}
      <div className="flex items-center justify-between bg-[#111] border border-white/8 rounded-2xl px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
          <div>
            <p className="text-emerald-400 text-sm font-semibold">Safety System Active</p>
            <p className="text-[#555] text-xs">Room {room} · Floor {floor}</p>
          </div>
        </div>
        <span className="text-xl">🏨</span>
      </div>

      {/* SOS Button */}
      <div className="flex flex-col items-center gap-5 py-2">
        <p className="text-[#444] text-sm text-center">Hold for 1.5 seconds to trigger emergency alert</p>

        <div className="relative">
          {/* Outer glow rings when held */}
          {held && <>
            <div className="absolute inset-0 rounded-full bg-red-500/25 scale-[1.15] animate-ping"/>
            <div className="absolute inset-0 rounded-full bg-red-500/12 scale-[1.3] animate-ping" style={{animationDelay:'0.2s'}}/>
          </>}

          <button
            onMouseDown={startHold}     onMouseUp={cancelHold}    onMouseLeave={cancelHold}
            onTouchStart={e => { e.preventDefault(); startHold(); }}
            onTouchEnd={e => { e.preventDefault(); cancelHold(); }}
            className={`relative w-52 h-52 rounded-full flex flex-col items-center justify-center gap-2 font-black text-white transition-transform duration-150 select-none ${
              held ? 'scale-95' : 'scale-100'
            }`}
            style={{ userSelect:'none', WebkitUserSelect:'none', background: held ? '#dc2626' : '#991b1b',
              boxShadow: held ? '0 0 60px rgba(220,38,38,0.5)' : '0 0 30px rgba(153,27,27,0.4)' }}
          >
            {/* Progress ring */}
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 208 208">
              <circle cx="104" cy="104" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5"/>
              <circle cx="104" cy="104" r={r} fill="none" stroke="rgba(255,255,255,0.9)"
                strokeWidth="5" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={circ * (1 - holdPct / 100)}/>
            </svg>
            <span className="text-6xl relative z-10">🆘</span>
            <span className="text-xl font-black relative z-10 tracking-wider">{held ? 'HOLD…' : 'SOS'}</span>
          </button>
        </div>

        <p className="text-[#333] text-xs text-center">
          For emergencies only — fire, flood, gas, medical, security
        </p>
      </div>

      {/* Emergency tips */}
      <div className="bg-[#111] border border-white/6 rounded-2xl p-4 space-y-2.5">
        <p className="text-[10px] font-bold text-[#444] uppercase tracking-widest mb-3">Emergency Guidelines</p>
        <p className="text-[#888] text-sm">🔥 <strong className="text-white">Fire</strong> — Do not use elevators. Take stairwell.</p>
        <p className="text-[#888] text-sm">💧 <strong className="text-white">Flood</strong> — Move to higher floors immediately.</p>
        <p className="text-[#888] text-sm">☁️ <strong className="text-white">Gas</strong> — Leave room. Do not use light switches.</p>
        <p className="text-[#888] text-sm">🏥 <strong className="text-white">Medical</strong> — Press SOS for immediate response.</p>
        <p className="text-[#888] text-sm">🔒 <strong className="text-white">Security</strong> — Lock your door. Press SOS.</p>
      </div>
    </>
  );
}

// ─── Confirm ──────────────────────────────────────────────────────────────────
function Confirm({ loading, error, onConfirm, onCancel }) {
  return (
    <div className="flex flex-col items-center gap-6 pt-4">
      <div className="w-24 h-24 rounded-3xl bg-red-500/15 border-2 border-red-500/25 flex items-center justify-center text-5xl animate-pulse">
        🚨
      </div>
      <div className="text-center px-2">
        <h2 className="text-2xl font-black text-white">Confirm Emergency</h2>
        <p className="text-[#666] text-sm mt-2 leading-relaxed">
          This immediately alerts hotel security and on-duty staff.<br/>
          <strong className="text-red-400">Only press in a real emergency.</strong>
        </p>
      </div>

      {error && <div className="w-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-2xl text-center">{error}</div>}

      <div className="w-full space-y-3">
        <button onClick={onConfirm} disabled={loading}
          className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black py-5 rounded-2xl text-lg transition-all active:scale-[0.98] flex items-center justify-center gap-3"
          style={{boxShadow:'0 0 40px rgba(220,38,38,0.3)'}}>
          {loading ? <><Spin/>Alerting emergency staff…</> : '🆘 YES — SEND ALERT NOW'}
        </button>
        <button onClick={onCancel} disabled={loading}
          className="w-full bg-white/5 hover:bg-white/8 border border-white/10 text-[#777] font-semibold py-4 rounded-2xl transition-all text-sm">
          Cancel — Not an Emergency
        </button>
      </div>
    </div>
  );
}

// ─── DMS Widget ───────────────────────────────────────────────────────────────
function DMS({ dmLeft, dmInterval, dmMissed, onPing }) {
  const urgent = dmLeft <= 20;
  const pct    = dmInterval > 0 ? dmLeft / dmInterval : 0;
  const r = 38, circ = 2 * Math.PI * r;

  return (
    <div className={`rounded-2xl p-4 border-2 transition-all ${urgent ? 'bg-red-500/10 border-red-500/40' : 'bg-[#1a0d2e] border-purple-500/25'}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className={`font-bold text-sm ${urgent ? 'text-red-400' : 'text-purple-400'}`}>💜 Dead Man's Switch</p>
          <p className="text-[#444] text-xs mt-0.5">Tap to confirm you're conscious</p>
        </div>
        {dmMissed > 0 && (
          <div className="bg-red-500/15 text-red-400 text-xs font-bold px-2.5 py-1 rounded-xl">{dmMissed} missed</div>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5"/>
            <circle cx="48" cy="48" r={r} fill="none"
              stroke={urgent ? '#f87171' : '#a78bfa'}
              strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct)}
              style={{transition:'stroke-dashoffset 1s linear'}}/>
          </svg>
          <div className={`absolute inset-0 flex items-center justify-center font-black text-sm ${urgent ? 'text-red-400' : 'text-purple-300'}`}>
            {dmLeft}s
          </div>
        </div>
        <button onClick={onPing}
          className={`flex-1 py-5 rounded-2xl font-bold text-base transition-all active:scale-95 ${
            urgent ? 'bg-red-500 hover:bg-red-400 text-white' : 'bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/30 text-purple-300'
          }`}>
          {urgent ? '⚡ TAP NOW!' : '💜 I\'m Conscious'}
        </button>
      </div>
    </div>
  );
}

// ─── Active ───────────────────────────────────────────────────────────────────
function Active({ room, floor, evacMsg, guestAlert, incStatus, dmToken, dmLeft, dmInterval, dmMissed, onSafe, onHelp, onPing }) {
  return (
    <>
      {/* Alert header */}
      <div className="bg-red-500/8 border-2 border-red-500/25 rounded-3xl p-5 text-center"
        style={{boxShadow:'0 0 40px rgba(239,68,68,0.1)'}}>
        <div className="text-4xl mb-2 animate-bounce">🚨</div>
        <h2 className="text-xl font-black text-red-400">Alert Sent!</h2>
        <p className="text-[#888] text-sm mt-1">Room {room} · Floor {floor}</p>
        <p className="text-[#555] text-xs mt-1">Emergency staff have been notified and are responding</p>
        {incStatus && (
          <div className="mt-3 inline-block bg-red-500/15 border border-red-500/20 text-red-300 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider">
            Incident: {incStatus.replace(/_/g,' ')}
          </div>
        )}
      </div>

      {guestAlert && (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl px-4 py-3">
          <p className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-1">Hotel Notice</p>
          <p className="text-amber-300/80 text-sm">{guestAlert}</p>
        </div>
      )}

      {evacMsg && (
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-2xl p-4 flex gap-3">
          <span className="text-2xl shrink-0">🚪</span>
          <div>
            <p className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-1">Evacuation Route</p>
            <p className="text-amber-300/80 text-sm leading-relaxed">{evacMsg}</p>
          </div>
        </div>
      )}

      {/* Response buttons */}
      <div>
        <p className="text-[#444] text-sm text-center mb-3 font-medium">Tell rescue teams your status:</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onSafe}
            className="flex flex-col items-center gap-2.5 bg-emerald-500/8 hover:bg-emerald-500/15 border-2 border-emerald-500/25 hover:border-emerald-500/50 text-emerald-400 font-bold py-7 rounded-2xl transition-all active:scale-[0.97]">
            <span className="text-4xl">✅</span>
            <span className="text-base">I'm Safe</span>
          </button>
          <button onClick={onHelp}
            className="flex flex-col items-center gap-2.5 bg-red-500/8 hover:bg-red-500/15 border-2 border-red-500/25 hover:border-red-500/50 text-red-400 font-bold py-7 rounded-2xl transition-all active:scale-[0.97]">
            <span className="text-4xl">🆘</span>
            <span className="text-base">Need Help</span>
          </button>
        </div>
      </div>

      {dmToken && (
        <DMS dmLeft={dmLeft} dmInterval={dmInterval} dmMissed={dmMissed} onPing={onPing}/>
      )}
    </>
  );
}

// ─── Responded ────────────────────────────────────────────────────────────────
function Responded({ response, room, floor, incStatus, dmToken, dmLeft, dmInterval, dmMissed, onPing, onChangeResponse }) {
  const safe = response === 'safe';
  return (
    <>
      <div className={`rounded-3xl p-6 text-center border-2 ${safe ? 'bg-emerald-500/8 border-emerald-500/25' : 'bg-red-500/8 border-red-500/30'}`}>
        <div className="text-5xl mb-3">{safe ? '✅' : '🆘'}</div>
        <h2 className={`text-2xl font-black ${safe ? 'text-emerald-400' : 'text-red-400'}`}>
          {safe ? 'Status: Safe' : 'Help Is Coming'}
        </h2>
        <p className="text-[#777] text-sm mt-1">Room {room} · Floor {floor}</p>
        {!safe && (
          <div className="mt-3 bg-red-500/15 border border-red-500/20 text-red-200 text-sm font-semibold px-4 py-2.5 rounded-xl">
            Stay where you are. Rescue team is on its way.
          </div>
        )}
        {incStatus && (
          <p className={`mt-2 text-[10px] font-bold uppercase tracking-wider opacity-60 ${safe ? 'text-emerald-400' : 'text-red-400'}`}>
            {incStatus.replace(/_/g,' ')}
          </p>
        )}
      </div>

      {/* Change status */}
      <div>
        <p className="text-[#333] text-xs text-center mb-3">Update if your situation changes:</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onChangeResponse('safe')}
            className={`py-4 rounded-xl font-bold text-sm border-2 transition-all active:scale-95 ${
              safe ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-white/3 border-white/8 text-[#555] hover:border-emerald-500/30 hover:text-emerald-400'
            }`}>✅ I'm Safe</button>
          <button onClick={() => onChangeResponse('needs_help')}
            className={`py-4 rounded-xl font-bold text-sm border-2 transition-all active:scale-95 ${
              !safe ? 'bg-red-500/15 border-red-500/30 text-red-400'
              : 'bg-white/3 border-white/8 text-[#555] hover:border-red-500/30 hover:text-red-400'
            }`}>🆘 Need Help</button>
        </div>
      </div>

      {dmToken && (
        <DMS dmLeft={dmLeft} dmInterval={dmInterval} dmMissed={dmMissed} onPing={onPing}/>
      )}

      {!safe && (
        <div className="bg-[#111] border border-white/6 rounded-2xl p-4 space-y-2 text-sm">
          <p className="font-semibold text-white mb-2">While you wait:</p>
          <p className="text-[#777]">🚪 Stay near your door if possible</p>
          <p className="text-[#777]">📱 Keep your phone on and charged</p>
          <p className="text-[#777]">🔦 Use flashlight if lights are out</p>
          <p className="text-[#777]">🗣 Shout or bang if you hear rescuers nearby</p>
        </div>
      )}
    </>
  );
}

// ─── Resolved ─────────────────────────────────────────────────────────────────
function Resolved({ onReset }) {
  return (
    <div className="flex flex-col items-center gap-6 pt-6 text-center">
      <div className="w-24 h-24 rounded-3xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center text-5xl">🎉</div>
      <div>
        <h2 className="text-2xl font-black text-emerald-400">All Clear</h2>
        <p className="text-[#777] text-sm mt-2 leading-relaxed">
          The emergency has been resolved by hotel staff.<br/>
          You may resume normal activities.
        </p>
      </div>
      <div className="w-full bg-[#111] border border-white/6 rounded-2xl p-4 text-sm text-[#666] space-y-2 text-left">
        <p>✅ All systems returned to normal</p>
        <p>✅ Staff available at the front desk</p>
        <p>✅ Emergency services stood down</p>
      </div>
      <button onClick={onReset}
        className="w-full bg-emerald-800 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl transition-all active:scale-[0.98]">
        Back to Safety Dashboard
      </button>
    </div>
  );
}
