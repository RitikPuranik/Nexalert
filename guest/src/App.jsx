import { useState, useEffect, useRef, useCallback } from 'react';

// ── URL params ────────────────────────────────────────────────────────────────
function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    hotel_id:  p.get('hotel_id') || p.get('h') || '',
    qr_token:  p.get('t') || '',
    room:      p.get('room')     || p.get('r') || '',
    floor:     p.get('floor')    || p.get('f') || '',
  };
}

// ── API helpers (no auth — guest endpoints are public) ────────────────────────
async function gPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function gPatch(url, body) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function gGet(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Screens ───────────────────────────────────────────────────────────────────
const S = { SETUP:'setup', IDLE:'idle', CONFIRM:'confirm', ACTIVE:'active', RESPONDED:'responded', RESOLVED:'resolved' };

function Spin() {
  return <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0"/>;
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const params = getParams();
  const hasParams = !!((params.hotel_id || params.qr_token) && params.room && params.floor);

  const [screen,      setScreen]      = useState(hasParams ? S.IDLE : S.SETUP);
  const [hotelId,     setHotelId]     = useState(params.hotel_id);
  const [qrToken,     setQrToken]     = useState(params.qr_token);
  const [hotelName,   setHotelName]   = useState('');
  const [room,        setRoom]        = useState(params.room);
  const [floor,       setFloor]       = useState(params.floor);
  const [guestName,   setGuestName]   = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [incidentId,  setIncidentId]  = useState(null);
  const [dmToken,     setDmToken]     = useState(null);
  const [dmInterval,  setDmInterval]  = useState(120);
  const [dmLeft,      setDmLeft]      = useState(120);
  const [dmMissed,    setDmMissed]    = useState(0);
  const [evacMsg,     setEvacMsg]     = useState('');
  const [guestAlert,  setGuestAlert]  = useState('');
  const [response,    setResponse]    = useState(null);
  const [incStatus,   setIncStatus]   = useState(null);
  const [checkedIn,   setCheckedIn]   = useState(hasParams);

  const dmCountRef  = useRef(null);
  const dmPingRef   = useRef(null);
  const pollRef     = useRef(null);
  const geoRef      = useRef(null);

  // ── Auto check-in when QR params present ────────────────────────────────
  useEffect(() => {
    if (hasParams) checkIn();
  }, []);

  async function checkIn() {
    try {
      const data = await gPost('/api/guests/locations', {
        hotel_id: hotelId || undefined,
        qr_token: qrToken || undefined,
        room, floor: parseInt(floor),
        name: guestName || undefined,
      });
      if (data.hotel_id) setHotelId(data.hotel_id);
      if (data.hotel_name) setHotelName(data.hotel_name);
      setCheckedIn(true);
      startGeo();
    } catch(err) {
      setError(err.message);
      setScreen(S.SETUP);
    }
  }

  // ── Geolocation ──────────────────────────────────────────────────────────
  const startGeo = useCallback(() => {
    if (!navigator.geolocation) return;
    geoRef.current = navigator.geolocation.watchPosition(
      pos => {
        gPatch('/api/guests/locations/coordinates', {
          hotel_id: hotelId, room,
          coordinates: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        }).catch(() => {});
      },
      () => {}, { enableHighAccuracy: true, maximumAge: 30000 }
    );
  }, [hotelId, room]);

  const stopGeo = useCallback(() => {
    if (geoRef.current != null) {
      navigator.geolocation.clearWatch(geoRef.current);
      geoRef.current = null;
    }
  }, []);

  // ── Dead Man Switch ──────────────────────────────────────────────────────
  const startDMS = useCallback((token, intervalSec) => {
    setDmToken(token);
    setDmInterval(intervalSec);
    setDmLeft(intervalSec);
    setDmMissed(0);

    dmCountRef.current = setInterval(() => {
      setDmLeft(l => {
        if (l <= 1) {
          setDmMissed(m => m + 1);
          return intervalSec;
        }
        return l - 1;
      });
    }, 1000);

    dmPingRef.current = setInterval(() => {
      gPost('/api/guests/deadman/ping', { token }).catch(() => setDmMissed(m => m + 1));
    }, intervalSec * 1000);
  }, []);

  const stopDMS = useCallback(() => {
    clearInterval(dmCountRef.current);
    clearInterval(dmPingRef.current);
  }, []);

  // ── Poll incident status ─────────────────────────────────────────────────
  const startPoll = useCallback((hId, fl) => {
    pollRef.current = setInterval(async () => {
      try {
        const data = await gGet(`/api/incidents/sos/status?hotel_id=${hId}&floor=${fl}`);
        const incs = data.incidents || [];
        if (incs.length > 0) {
          setIncStatus(incs[0].status);
          if (['resolved','false_alarm'].includes(incs[0].status)) {
            clearInterval(pollRef.current);
            stopDMS(); stopGeo();
            setScreen(S.RESOLVED);
          }
        }
      } catch { /* ignore */ }
    }, 12000);
  }, [stopDMS, stopGeo]);

  const stopPoll = useCallback(() => clearInterval(pollRef.current), []);

  useEffect(() => () => { stopDMS(); stopPoll(); stopGeo(); }, []);

  // ── Manual heartbeat ─────────────────────────────────────────────────────
  async function manualPing() {
    if (!dmToken) return;
    try {
      await gPost('/api/guests/deadman/ping', { token: dmToken });
      setDmLeft(dmInterval);
      setDmMissed(0);
    } catch { /* ignore */ }
  }

  // ── Setup submit ─────────────────────────────────────────────────────────
  async function handleSetup(e) {
    e.preventDefault();
    if ((!hotelId && !qrToken) || !room || !floor) { setError('All fields required'); return; }
    setLoading(true); setError('');
    try {
      const data = await gPost('/api/guests/locations', {
        hotel_id: hotelId || undefined,
        qr_token: qrToken || undefined,
        room, floor: parseInt(floor),
        name: guestName || undefined,
      });
      if (data.hotel_id) setHotelId(data.hotel_id);
      if (data.hotel_name) setHotelName(data.hotel_name);
      setCheckedIn(true);
      startGeo();
      setScreen(S.IDLE);
    } catch(err) { setError(err.message); }
    setLoading(false);
  }

  // ── SOS confirm ──────────────────────────────────────────────────────────
  async function confirmSOS() {
    setLoading(true); setError('');
    try {
      const data = await gPost('/api/incidents/sos', {
        hotel_id: hotelId, room, floor: parseInt(floor), type: 'sos',
      });
      setIncidentId(data.incident_id);
      if (data.deadman_token) startDMS(data.deadman_token, data.deadman_interval || 120);
      if (data.exit_instruction) setEvacMsg(data.exit_instruction);
      if (data.guest_alert_en)   setGuestAlert(data.guest_alert_en);
      startPoll(hotelId, floor);
      setScreen(S.ACTIVE);
    } catch(err) { setError(err.message); setScreen(S.IDLE); }
    setLoading(false);
  }

  // ── Respond (safe / needs help) ──────────────────────────────────────────
  async function respond(type) {
    setLoading(true);
    try {
      await gPatch('/api/guests/locations/respond', {
        hotel_id: hotelId, room, floor: parseInt(floor),
        response: type, incident_id: incidentId,
      });
      setResponse(type);
      setScreen(S.RESPONDED);
    } catch(err) { setError(err.message); }
    setLoading(false);
  }

  async function changeResponse(type) {
    try {
      await gPatch('/api/guests/locations/respond', {
        hotel_id: hotelId, room, floor: parseInt(floor),
        response: type, incident_id: incidentId,
      });
      setResponse(type);
    } catch { /* ignore */ }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-[#080808] flex flex-col items-center px-4 py-8 pb-12">
      <div className="w-full max-w-sm mx-auto space-y-4">

        {screen === S.SETUP && (
          <SetupScreen
            hotelId={hotelId} setHotelId={setHotelId}
            qrToken={qrToken}
            room={room} setRoom={setRoom}
            floor={floor} setFloor={setFloor}
            guestName={guestName} setGuestName={setGuestName}
            loading={loading} error={error}
            onSubmit={handleSetup}
          />
        )}

        {screen === S.IDLE && (
          <IdleScreen
            room={room} floor={floor} guestName={guestName} checkedIn={checkedIn}
            hotelName={hotelName}
            onSOS={() => setScreen(S.CONFIRM)}
          />
        )}

        {screen === S.CONFIRM && (
          <ConfirmScreen loading={loading} error={error}
            onConfirm={confirmSOS} onCancel={() => setScreen(S.IDLE)}/>
        )}

        {screen === S.ACTIVE && (
          <ActiveScreen
            room={room} floor={floor}
            evacMsg={evacMsg} guestAlert={guestAlert}
            incStatus={incStatus}
            dmToken={dmToken} dmLeft={dmLeft} dmInterval={dmInterval} dmMissed={dmMissed}
            loading={loading} error={error}
            onSafe={() => respond('safe')}
            onNeedHelp={() => respond('needs_help')}
            onPing={manualPing}
          />
        )}

        {screen === S.RESPONDED && (
          <RespondedScreen
            response={response} room={room} floor={floor} incStatus={incStatus}
            dmToken={dmToken} dmLeft={dmLeft} dmInterval={dmInterval} dmMissed={dmMissed}
            onPing={manualPing} onChangeResponse={changeResponse}
          />
        )}

        {screen === S.RESOLVED && (
          <ResolvedScreen onReset={() => { setResponse(null); setIncidentId(null); setScreen(S.IDLE); }}/>
        )}

      </div>
    </div>
  );
}

// ─── Screen Components ────────────────────────────────────────────────────────

function SetupScreen({ hotelId, setHotelId, qrToken, room, setRoom, floor, setFloor, guestName, setGuestName, loading, error, onSubmit }) {
  return (
    <>
      <div className="text-center pt-2 pb-2">
        <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/20 flex items-center justify-center text-3xl mx-auto mb-4">🚨</div>
        <h1 className="text-2xl font-black text-white">NexAlert</h1>
        <p className="text-[#666] text-sm mt-1">Hotel Emergency System</p>
      </div>

      <div className="bg-[#111] border border-white/8 rounded-3xl p-6">
        <h2 className="font-bold text-white text-base mb-5">Check in to your room</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          {!qrToken && (
          <div>
            <label className="block text-[10px] font-bold text-[#555] uppercase tracking-widest mb-1.5">Hotel ID *</label>
            <input required={!qrToken} value={hotelId} onChange={e => setHotelId(e.target.value)}
              className="w-full bg-black/60 border border-white/8 focus:border-red-500/40 focus:outline-none text-white placeholder-[#333] rounded-2xl px-4 py-3 text-sm"
              placeholder="Provided at front desk"/>
          </div>
          )}
          {qrToken && (
          <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-2xl px-4 py-3 flex items-center gap-2">
            <span className="text-emerald-400 text-lg">✅</span>
            <div>
              <p className="text-emerald-400 text-xs font-bold">Hotel Verified via QR Code</p>
              <p className="text-emerald-400/60 text-[10px]">Your hotel has been automatically identified</p>
            </div>
          </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-[#555] uppercase tracking-widest mb-1.5">Room *</label>
              <input required value={room} onChange={e => setRoom(e.target.value)}
                className="w-full bg-black/60 border border-white/8 focus:border-red-500/40 focus:outline-none text-white placeholder-[#333] rounded-2xl px-4 py-3 text-sm"
                placeholder="301"/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#555] uppercase tracking-widest mb-1.5">Floor *</label>
              <input required type="number" min="1" value={floor} onChange={e => setFloor(e.target.value)}
                className="w-full bg-black/60 border border-white/8 focus:border-red-500/40 focus:outline-none text-white placeholder-[#333] rounded-2xl px-4 py-3 text-sm"
                placeholder="3"/>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#555] uppercase tracking-widest mb-1.5">Your Name (optional)</label>
            <input value={guestName} onChange={e => setGuestName(e.target.value)}
              className="w-full bg-black/60 border border-white/8 focus:border-red-500/40 focus:outline-none text-white placeholder-[#333] rounded-2xl px-4 py-3 text-sm"
              placeholder="Jane Smith"/>
          </div>
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-2xl">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-base mt-2">
            {loading ? <><Spin/>Checking in…</> : '🏨 Activate Emergency System'}
          </button>
        </form>
      </div>
      <p className="text-center text-[10px] text-[#333] px-4">Your location is used only for emergency response</p>
    </>
  );
}

function IdleScreen({ room, floor, guestName, checkedIn, hotelName, onSOS }) {
  const [held, setHeld] = useState(false);
  const timerRef = useRef(null);
  const [holdPct, setHoldPct] = useState(0);
  const holdStart = useRef(null);
  const animRef = useRef(null);

  function startHold() {
    setHeld(true);
    holdStart.current = Date.now();
    function tick() {
      const elapsed = Date.now() - holdStart.current;
      const pct = Math.min((elapsed / 1500) * 100, 100);
      setHoldPct(pct);
      if (pct < 100) animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    timerRef.current = setTimeout(() => { setHeld(false); setHoldPct(0); onSOS(); }, 1500);
  }

  function cancelHold() {
    setHeld(false);
    setHoldPct(0);
    clearTimeout(timerRef.current);
    cancelAnimationFrame(animRef.current);
  }

  return (
    <>
      {/* Status */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${
        checkedIn ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-[#111] border-white/8'
      }`}>
        <div className={`w-2 h-2 rounded-full shrink-0 ${checkedIn ? 'bg-emerald-400 animate-pulse' : 'bg-[#333]'}`}/>
        <div>
          <p className={`text-sm font-semibold ${checkedIn ? 'text-emerald-400' : 'text-white'}`}>
            {checkedIn ? 'Emergency System Active' : 'Not Checked In'}
          </p>
          <p className={`text-xs ${checkedIn ? 'text-emerald-400/60' : 'text-[#444]'}`}>
            {hotelName ? `${hotelName} · ` : ''}{guestName ? `${guestName} · ` : ''}Room {room} · Floor {floor}
          </p>
        </div>
      </div>

      {/* SOS Button */}
      <div className="flex flex-col items-center gap-5 py-4">
        <p className="text-[#555] text-sm text-center">Hold 1.5 seconds to trigger emergency alert</p>
        <div className="relative">
          <div className={`absolute inset-0 rounded-full bg-red-500/20 scale-110 ${held ? 'animate-ping' : 'opacity-0'} transition-opacity duration-300`}/>
          <div className={`absolute inset-0 rounded-full bg-red-500/10 scale-125 ${held ? 'animate-ping' : 'opacity-0'} transition-opacity duration-300`} style={{animationDelay:'0.15s'}}/>
          <button
            onMouseDown={startHold} onMouseUp={cancelHold} onMouseLeave={cancelHold}
            onTouchStart={e => { e.preventDefault(); startHold(); }}
            onTouchEnd={e => { e.preventDefault(); cancelHold(); }}
            className={`relative w-48 h-48 rounded-full flex flex-col items-center justify-center gap-3 font-black text-white transition-all duration-150 select-none ${
              held ? 'bg-red-500 scale-95 shadow-2xl shadow-red-500/40' : 'bg-red-700 hover:bg-red-600 shadow-2xl shadow-red-900/40'
            }`}
            style={{userSelect:'none',WebkitUserSelect:'none'}}
          >
            {/* Progress ring */}
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 192 192">
              <circle cx="96" cy="96" r="90" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4"/>
              <circle cx="96" cy="96" r="90" fill="none" stroke="white" strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 90}`}
                strokeDashoffset={`${2 * Math.PI * 90 * (1 - holdPct/100)}`}
                style={{transition: held ? 'none' : 'stroke-dashoffset 0.2s'}}/>
            </svg>
            <span className="text-5xl relative z-10">🆘</span>
            <span className="text-xl font-black relative z-10">{held ? 'HOLD…' : 'SOS'}</span>
          </button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#111] border border-white/6 rounded-2xl p-4">
          <div className="text-xl mb-2">🚪</div>
          <p className="text-white text-sm font-semibold">Exit Routes</p>
          <p className="text-[#555] text-xs mt-0.5">Use stairwells only — never elevators</p>
        </div>
        <div className="bg-[#111] border border-white/6 rounded-2xl p-4">
          <div className="text-xl mb-2">📞</div>
          <p className="text-white text-sm font-semibold">Emergency</p>
          <p className="text-[#555] text-xs mt-0.5">Press SOS for immediate response</p>
        </div>
      </div>

      <div className="bg-[#111] border border-white/6 rounded-2xl p-4 space-y-2 text-sm">
        <p className="text-[#555] text-[10px] font-bold uppercase tracking-widest mb-3">Emergency Procedures</p>
        <p className="text-[#aaa]">🔥 <strong className="text-white">Fire:</strong> Do not use elevators. Take the stairwell.</p>
        <p className="text-[#aaa]">💧 <strong className="text-white">Flood:</strong> Move to higher floors immediately.</p>
        <p className="text-[#aaa]">☁️ <strong className="text-white">Gas:</strong> Leave, do not use switches or open flame.</p>
        <p className="text-[#aaa]">🏥 <strong className="text-white">Medical:</strong> Press SOS to alert staff immediately.</p>
      </div>
    </>
  );
}

function ConfirmScreen({ loading, error, onConfirm, onCancel }) {
  return (
    <div className="flex flex-col items-center gap-6 pt-6">
      <div className="w-24 h-24 rounded-3xl bg-red-500/15 border-2 border-red-500/30 flex items-center justify-center text-5xl animate-pulse">🚨</div>
      <div className="text-center">
        <h2 className="text-2xl font-black text-white">Confirm SOS Alert</h2>
        <p className="text-[#888] text-sm mt-2 leading-relaxed">This will immediately alert hotel security and emergency responders. Only press if this is a real emergency.</p>
      </div>
      {error && <div className="w-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-2xl text-center">{error}</div>}
      <div className="w-full space-y-3">
        <button onClick={onConfirm} disabled={loading}
          className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black py-5 rounded-2xl text-lg transition-all active:scale-[0.98] flex items-center justify-center gap-3">
          {loading ? <><Spin/>Alerting emergency staff…</> : '🆘 YES — SEND EMERGENCY ALERT'}
        </button>
        <button onClick={onCancel} disabled={loading}
          className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-[#888] font-semibold py-4 rounded-2xl transition-all text-sm">
          Cancel — False Alarm
        </button>
      </div>
    </div>
  );
}

function DMSWidget({ dmToken, dmLeft, dmInterval, dmMissed, onPing }) {
  const urgent = dmLeft <= 20;
  const pct = dmInterval > 0 ? dmLeft / dmInterval : 0;
  const r = 42;
  const circ = 2 * Math.PI * r;

  return (
    <div className={`rounded-2xl p-4 border-2 transition-all ${urgent ? 'bg-red-500/10 border-red-500/40' : 'bg-purple-500/8 border-purple-500/25'}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className={`font-bold text-sm ${urgent ? 'text-red-400' : 'text-purple-400'}`}>💜 Dead Man's Switch</p>
          <p className="text-[#555] text-xs mt-0.5">Tap to confirm you're conscious</p>
        </div>
        {dmMissed > 0 && (
          <div className="bg-red-500/15 text-red-400 text-xs font-bold px-2 py-1 rounded-lg">{dmMissed} missed</div>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"/>
            <circle cx="50" cy="50" r={r} fill="none"
              stroke={urgent ? '#f87171' : '#c084fc'}
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
          className={`flex-1 py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 ${
            urgent ? 'bg-red-500 hover:bg-red-400 text-white' : 'bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300'
          }`}>
          {urgent ? '⚡ TAP NOW!' : '💜 I\'m Conscious'}
        </button>
      </div>
    </div>
  );
}

function ActiveScreen({ room, floor, evacMsg, guestAlert, incStatus, dmToken, dmLeft, dmInterval, dmMissed, loading, error, onSafe, onNeedHelp, onPing }) {
  return (
    <>
      <div className="bg-red-500/8 border-2 border-red-500/30 rounded-3xl p-5 text-center">
        <div className="text-4xl mb-2">🚨</div>
        <h2 className="text-xl font-black text-red-400">SOS Alert Sent!</h2>
        <p className="text-[#888] text-sm mt-1">Room {room} · Floor {floor}</p>
        <p className="text-[#666] text-xs mt-1.5">Emergency team notified and responding</p>
        {incStatus && (
          <div className="mt-3 inline-block bg-red-500/15 text-red-300 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            Status: {incStatus}
          </div>
        )}
      </div>

      {guestAlert && (
        <div className="bg-amber-500/8 border border-amber-500/25 rounded-2xl px-4 py-3">
          <p className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-1">Hotel Alert</p>
          <p className="text-amber-300/80 text-sm">{guestAlert}</p>
        </div>
      )}

      {evacMsg && (
        <div className="bg-amber-500/8 border border-amber-500/25 rounded-2xl px-4 py-3 flex gap-3">
          <span className="text-2xl shrink-0">🚪</span>
          <div>
            <p className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-1">Evacuation Route</p>
            <p className="text-amber-300/80 text-sm">{evacMsg}</p>
          </div>
        </div>
      )}

      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-2xl">{error}</div>}

      <div>
        <p className="text-[#555] text-sm text-center mb-3">Let rescue teams know your status:</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onSafe} disabled={loading}
            className="flex flex-col items-center gap-2 bg-emerald-500/8 hover:bg-emerald-500/15 border-2 border-emerald-500/25 hover:border-emerald-500/50 text-emerald-400 font-bold py-6 rounded-2xl transition-all active:scale-95 disabled:opacity-50">
            <span className="text-3xl">✅</span>
            <span>I'm Safe</span>
          </button>
          <button onClick={onNeedHelp} disabled={loading}
            className="flex flex-col items-center gap-2 bg-red-500/8 hover:bg-red-500/15 border-2 border-red-500/25 hover:border-red-500/50 text-red-400 font-bold py-6 rounded-2xl transition-all active:scale-95 disabled:opacity-50">
            <span className="text-3xl">🆘</span>
            <span>Need Help</span>
          </button>
        </div>
      </div>

      {dmToken && (
        <DMSWidget dmToken={dmToken} dmLeft={dmLeft} dmInterval={dmInterval} dmMissed={dmMissed} onPing={onPing}/>
      )}
    </>
  );
}

function RespondedScreen({ response, room, floor, incStatus, dmToken, dmLeft, dmInterval, dmMissed, onPing, onChangeResponse }) {
  const isSafe = response === 'safe';
  return (
    <>
      <div className={`rounded-3xl p-6 text-center border-2 ${isSafe ? 'bg-emerald-500/8 border-emerald-500/30' : 'bg-red-500/8 border-red-500/40'}`}>
        <div className="text-5xl mb-3">{isSafe ? '✅' : '🆘'}</div>
        <h2 className={`text-xl font-black ${isSafe ? 'text-emerald-400' : 'text-red-400'}`}>
          {isSafe ? 'Status: Safe' : 'Help Is Coming!'}
        </h2>
        <p className="text-[#888] text-sm mt-1">Room {room} · Floor {floor}</p>
        {!isSafe && (
          <div className="mt-3 bg-red-500/15 text-red-300 text-sm font-semibold px-4 py-2 rounded-xl">
            Stay where you are. Rescue team en route.
          </div>
        )}
        {incStatus && (
          <p className={`mt-2 text-xs font-bold uppercase tracking-wider opacity-60 ${isSafe?'text-emerald-400':'text-red-400'}`}>
            Incident: {incStatus}
          </p>
        )}
      </div>

      <div>
        <p className="text-[#444] text-xs text-center mb-3">Update your status if situation changes:</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => onChangeResponse('safe')}
            className={`py-3 rounded-xl font-bold text-sm border transition-all active:scale-95 ${
              isSafe ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-white/4 border-white/8 text-[#666] hover:border-emerald-500/30 hover:text-emerald-400'
            }`}>✅ I'm Safe</button>
          <button onClick={() => onChangeResponse('needs_help')}
            className={`py-3 rounded-xl font-bold text-sm border transition-all active:scale-95 ${
              !isSafe ? 'bg-red-500/15 border-red-500/30 text-red-400'
              : 'bg-white/4 border-white/8 text-[#666] hover:border-red-500/30 hover:text-red-400'
            }`}>🆘 Need Help</button>
        </div>
      </div>

      {dmToken && (
        <DMSWidget dmToken={dmToken} dmLeft={dmLeft} dmInterval={dmInterval} dmMissed={dmMissed} onPing={onPing}/>
      )}

      {!isSafe && (
        <div className="bg-[#111] border border-white/6 rounded-2xl p-4 space-y-2 text-sm">
          <p className="font-semibold text-white mb-1">While you wait:</p>
          <p className="text-[#888]">🚪 Stay near your door if possible</p>
          <p className="text-[#888]">📱 Keep your phone on and charged</p>
          <p className="text-[#888]">🔦 Use flashlight if lights are out</p>
          <p className="text-[#888]">🗣 Call out if you hear rescuers</p>
        </div>
      )}
    </>
  );
}

function ResolvedScreen({ onReset }) {
  return (
    <div className="flex flex-col items-center gap-6 pt-6 text-center">
      <div className="w-24 h-24 rounded-3xl bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center text-5xl">🎉</div>
      <div>
        <h2 className="text-2xl font-black text-emerald-400">Incident Resolved</h2>
        <p className="text-[#888] text-sm mt-2 leading-relaxed">The emergency has been resolved by hotel staff. You may resume normal activities. Thank you for your cooperation.</p>
      </div>
      <div className="w-full bg-[#111] border border-white/6 rounded-2xl p-4 text-sm text-[#888] space-y-1.5 text-left">
        <p>✅ All systems returned to normal</p>
        <p>✅ Staff available at the front desk</p>
        <p>✅ Emergency services stood down</p>
      </div>
      <button onClick={onReset}
        className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl transition-all active:scale-95">
        Return to Safety Dashboard
      </button>
    </div>
  );
}
