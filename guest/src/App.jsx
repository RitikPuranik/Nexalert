import { useState, useEffect, useRef, useCallback } from 'react';

/* ─── URL params ──────────────────────────────────────────────────────────── */
function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    hotel_id:  p.get('h') || p.get('hotel_id') || '',
    qr_token:  p.get('t') || '',
    room:      p.get('r') || p.get('room')     || '',
    floor:     p.get('f') || p.get('floor')    || '',
  };
}

/* ─── API (all public endpoints) ─────────────────────────────────────────── */
async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}
async function patch(url, body) {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}
async function get(url) {
  const r = await fetch(url);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

/* ─── Screens ─────────────────────────────────────────────────────────────── */
const SCR = {
  ENTER: 'enter',       // guest types room number (no room in QR)
  IDLE:  'idle',        // safety dashboard
  HOLD:  'hold',        // SOS hold screen (large confirm)
  ACTIVE:'active',      // SOS sent — safe/help buttons + DMS
  DONE:  'done',        // responded
  CLEAR: 'clear',       // incident resolved
  ERR:   'err',         // invalid QR
};

/* ─── Root ────────────────────────────────────────────────────────────────── */
export default function App() {
  const { hotel_id: paramHotelId, qr_token, room: qrRoom, floor: qrFloor } = getParams();

  const [hotel_id,   setHotelId]   = useState(paramHotelId);
  const [resolving,  setResolving] = useState(!!qr_token && !paramHotelId);
  const [screen,     setScreen]    = useState(
    (!paramHotelId && !qr_token) ? SCR.ERR :
    (qrRoom && qrFloor)          ? SCR.IDLE : SCR.ENTER
  );
  const [room,       setRoom]       = useState(qrRoom);
  const [floor,      setFloor]      = useState(qrFloor);
  const [roomInput,  setRoomInput]  = useState('');
  const [floorInput, setFloorInput] = useState('');
  const [entryErr,   setEntryErr]   = useState('');
  const [entryLoad,  setEntryLoad]  = useState(false);

  const [incidentId, setIncidentId] = useState(null);
  const [incStatus,  setIncStatus]  = useState(null);
  const [evacMsg,    setEvacMsg]    = useState('');
  const [guestAlert, setGuestAlert] = useState('');
  const [dmToken,    setDmToken]    = useState(null);
  const [dmInterval, setDmInterval] = useState(120);
  const [dmLeft,     setDmLeft]     = useState(120);
  const [dmMissed,   setDmMissed]   = useState(0);
  const [response,   setResponse]   = useState(null); // 'safe' | 'needs_help'
  const [sosLoad,    setSosLoad]     = useState(false);
  const [sosErr,     setSosErr]      = useState('');

  /* ── Resolve QR token → hotel_id (runs once on mount if ?t= is present) ── */
  useEffect(() => {
    if (!qr_token || paramHotelId) return;
    get(`/api/hotels/resolve-qr/${qr_token}`)
      .then(data => {
        setHotelId(data.hotel_id);
        setResolving(false);
        setScreen((qrRoom && qrFloor) ? SCR.IDLE : SCR.ENTER);
      })
      .catch(() => {
        setResolving(false);
        setScreen(SCR.ERR);
      });
  }, []);

  const geoRef    = useRef(null);
  const dmCntRef  = useRef(null);
  const dmPingRef = useRef(null);
  const pollRef   = useRef(null);

  /* ── Silent check-in when QR has room (runs after token resolved) ──────── */
  useEffect(() => {
    if (hotel_id && qrRoom && qrFloor) {
      post('/api/guests/locations', {
        hotel_id, room: qrRoom, floor: parseInt(qrFloor),
      }).catch(() => {});
      startGeo(qrRoom);
    }
  }, [hotel_id]);

  /* ── Geolocation ───────────────────────────────────────────────────────── */
  const startGeo = useCallback((r) => {
    if (!navigator.geolocation || !hotel_id || !r) return;
    geoRef.current = navigator.geolocation.watchPosition(
      pos => patch('/api/guests/locations/coordinates', {
        hotel_id, room: r,
        coordinates: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
      }).catch(() => {}),
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000 }
    );
  }, [hotel_id]);

  const stopGeo = useCallback(() => {
    if (geoRef.current != null) { navigator.geolocation.clearWatch(geoRef.current); geoRef.current = null; }
  }, []);

  /* ── Dead Man Switch ───────────────────────────────────────────────────── */
  const startDMS = useCallback((token, intSec) => {
    setDmToken(token); setDmInterval(intSec); setDmLeft(intSec); setDmMissed(0);
    // countdown
    dmCntRef.current = setInterval(() => {
      setDmLeft(l => {
        if (l <= 1) { setDmMissed(m => m + 1); return intSec; }
        return l - 1;
      });
    }, 1000);
    // auto-ping every interval
    dmPingRef.current = setInterval(() => {
      post('/api/guests/deadman/ping', { token }).catch(() => setDmMissed(m => m + 1));
    }, intSec * 1000);
  }, []);

  const stopDMS = useCallback(() => {
    clearInterval(dmCntRef.current);
    clearInterval(dmPingRef.current);
  }, []);

  async function manualPing() {
    if (!dmToken) return;
    try {
      await post('/api/guests/deadman/ping', { token: dmToken });
      setDmLeft(dmInterval);
      setDmMissed(0);
    } catch { /* silent */ }
  }

  /* ── Poll incident status ──────────────────────────────────────────────── */
  const startPoll = useCallback((hId, fl) => {
    pollRef.current = setInterval(async () => {
      try {
        const d = await get(`/api/incidents/sos/status?hotel_id=${hId}&floor=${fl}`);
        const incs = d.incidents || [];
        if (incs.length > 0) {
          setIncStatus(incs[0].status);
          if (['resolved', 'false_alarm'].includes(incs[0].status)) {
            clearInterval(pollRef.current);
            stopDMS(); stopGeo();
            setScreen(SCR.CLEAR);
          }
        }
      } catch { /* silent */ }
    }, 12000);
  }, [stopDMS, stopGeo]);

  useEffect(() => () => {
    stopDMS();
    clearInterval(pollRef.current);
    stopGeo();
  }, []);

  /* ── Room entry submit ─────────────────────────────────────────────────── */
  async function handleEntry(e) {
    e.preventDefault();
    if (!roomInput.trim()) { setEntryErr('Please enter your room number'); return; }
    if (!floorInput)       { setEntryErr('Please enter your floor number'); return; }
    setEntryLoad(true); setEntryErr('');
    const r = roomInput.trim();
    const f = floorInput;
    try {
      await post('/api/guests/locations', {
        hotel_id, room: r, floor: parseInt(f),
      });
      setRoom(r); setFloor(f);
      startGeo(r);
      setScreen(SCR.IDLE);
    } catch (err) { setEntryErr(err.message); }
    setEntryLoad(false);
  }

  /* ── Send SOS ──────────────────────────────────────────────────────────── */
  async function sendSOS() {
    setSosLoad(true); setSosErr('');
    try {
      const d = await post('/api/incidents/sos', {
        hotel_id, room, floor: parseInt(floor), type: 'sos',
      });
      setIncidentId(d.incident_id);
      setIncStatus(d.status);
      if (d.deadman_token) startDMS(d.deadman_token, d.deadman_interval || 120);

      // Use exit instruction from SOS response, or fetch from exit-routes API, or use fallback
      let exitMsg = d.exit_instruction;
      if (!exitMsg) {
        try {
          const routes = await get(`/api/guests/exit-routes?hotel_id=${hotel_id}&floor=${parseInt(floor)}`);
          if (routes && routes.length > 0) {
            exitMsg = `Please evacuate via ${routes[0].label}${routes[0].muster_point ? ` to ${routes[0].muster_point}` : ''}.`;
          }
        } catch { /* ignore */ }
      }
      // Always show SOME evacuation instruction
      setEvacMsg(exitMsg || `Use the nearest stairwell — do NOT use elevators. Proceed to the emergency assembly point.`);

      startPoll(hotel_id, floor);
      setScreen(SCR.ACTIVE);
    } catch (err) { setSosErr(err.message); setScreen(SCR.IDLE); }
    setSosLoad(false);
  }

  /* ── Respond ───────────────────────────────────────────────────────────── */
  async function respond(type) {
    try {
      await patch('/api/guests/locations/respond', {
        hotel_id, room, floor: parseInt(floor),
        response: type, incident_id: incidentId,
      });
      setResponse(type);
      setScreen(SCR.DONE);
    } catch { /* show error inline */ }
  }

  async function changeResponse(type) {
    try {
      await patch('/api/guests/locations/respond', {
        hotel_id, room, floor: parseInt(floor),
        response: type, incident_id: incidentId,
      });
      setResponse(type);
    } catch { /* silent */ }
  }

  /* ── Cancel SOS (false alarm) ─────────────────────────────────────────── */
  async function cancelSOS() {
    stopDMS();
    clearInterval(pollRef.current);
    stopGeo();
    // Notify backend that guest is safe (best-effort, don't block UI)
    try {
      await patch('/api/guests/locations/respond', {
        hotel_id, room, floor: parseInt(floor),
        response: 'safe', incident_id: incidentId,
      });
    } catch { /* silent — staff will see no response */ }
    setResponse(null);
    setIncidentId(null);
    setIncStatus(null);
    setEvacMsg('');
    setScreen(SCR.IDLE);
  }

  /* ─── render ─────────────────────────────────────────────────────────── */
  const commonProps = { room, floor, hotel_id };

  if (resolving) return (
    <div className="min-h-dvh flex flex-col items-center justify-center" style={{background:'#0d0d0d'}}>
      <div style={{width:'36px',height:'36px',borderRadius:'50%',border:'3px solid rgba(255,255,255,0.08)',borderTop:'3px solid rgba(255,255,255,0.5)',animation:'spin 0.8s linear infinite'}}/>
      <p style={{color:'rgba(255,255,255,0.3)',fontSize:'0.8rem',marginTop:'16px',fontFamily:'IBM Plex Mono',letterSpacing:'0.08em'}}>Verifying hotel…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if (screen === SCR.ERR)    return <ErrScreen/>;
  if (screen === SCR.ENTER)  return <EnterScreen roomInput={roomInput} setRoomInput={setRoomInput} floorInput={floorInput} setFloorInput={setFloorInput} error={entryErr} loading={entryLoad} onSubmit={handleEntry}/>;
  if (screen === SCR.IDLE)   return <IdleScreen {...commonProps} onSOS={() => setScreen(SCR.HOLD)}/>;
  if (screen === SCR.HOLD)   return <HoldScreen loading={sosLoad} error={sosErr} onConfirm={sendSOS} onCancel={() => setScreen(SCR.IDLE)}/>;
  if (screen === SCR.ACTIVE) return <ActiveScreen {...commonProps} evacMsg={evacMsg} guestAlert={guestAlert} incStatus={incStatus} dmToken={dmToken} dmLeft={dmLeft} dmInterval={dmInterval} dmMissed={dmMissed} onSafe={() => respond('safe')} onHelp={() => respond('needs_help')} onPing={manualPing} onCancel={cancelSOS}/>;
  if (screen === SCR.DONE)   return <DoneScreen {...commonProps} evacMsg={evacMsg} response={response} incStatus={incStatus} dmToken={dmToken} dmLeft={dmLeft} dmInterval={dmInterval} dmMissed={dmMissed} onPing={manualPing} onChangeResponse={changeResponse}/>;
  if (screen === SCR.CLEAR)  return <ClearScreen onReset={() => { setResponse(null); setIncidentId(null); setIncStatus(null); setScreen(SCR.IDLE); }}/>;
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCREEN COMPONENTS
═══════════════════════════════════════════════════════════════════════════ */

/* ─── Invalid QR ────────────────────────────────────────────────────────── */
function ErrScreen() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center" style={{background:'#0d0d0d'}}>
      <div style={{fontSize:'3rem', marginBottom:'1rem'}}>⚠️</div>
      <h1 style={{fontFamily:'Sora',fontWeight:700,fontSize:'1.3rem',color:'#f0f0f0',marginBottom:'0.5rem'}}>Invalid QR Code</h1>
      <p style={{color:'rgba(255,255,255,0.35)',fontSize:'0.9rem',lineHeight:1.6}}>This QR code is missing hotel information.<br/>Please contact the front desk for a new one.</p>
    </div>
  );
}

/* ─── Enter Room (lobby QR) ─────────────────────────────────────────────── */
function EnterScreen({ roomInput, setRoomInput, floorInput, setFloorInput, error, loading, onSubmit }) {
  return (
    <div className="min-h-dvh flex flex-col" style={{background:'#0d0d0d',padding:'0 20px 40px'}}>
      {/* Top stripe */}
      <div style={{background:'#ef4444',height:'4px',borderRadius:'0 0 4px 4px',margin:'0 -20px 0'}}/>

      <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'center',maxWidth:'400px',width:'100%',margin:'0 auto',gap:'28px'}}>
        {/* Header */}
        <div className="anim-slide-up">
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'8px'}}>
            <div style={{width:'42px',height:'42px',borderRadius:'12px',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem'}}>🚨</div>
            <span style={{fontWeight:700,fontSize:'1.1rem',color:'#f0f0f0',letterSpacing:'-0.02em'}}>NexAlert</span>
          </div>
          <h1 style={{fontWeight:800,fontSize:'1.8rem',color:'#f0f0f0',letterSpacing:'-0.03em',lineHeight:1.1}}>Enter your<br/>room number</h1>
          <p style={{color:'rgba(255,255,255,0.35)',fontSize:'0.85rem',marginTop:'8px'}}>This activates your personal emergency dashboard</p>
        </div>

        {/* Form */}
        <form onSubmit={onSubmit} style={{display:'flex',flexDirection:'column',gap:'12px'}} className="anim-slide-up" style={{animationDelay:'0.1s',display:'flex',flexDirection:'column',gap:'12px'}}>
          <div>
            <label style={{display:'block',fontSize:'0.7rem',fontWeight:600,color:'rgba(255,255,255,0.3)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:'8px'}}>Room Number</label>
            <input
              className="input"
              required autoFocus inputMode="numeric"
              value={roomInput} onChange={e => setRoomInput(e.target.value)}
              placeholder="301"
              style={{fontSize:'2rem',fontWeight:700,textAlign:'center',letterSpacing:'0.2em',padding:'18px'}}
            />
          </div>
          <div>
            <label style={{display:'block',fontSize:'0.7rem',fontWeight:600,color:'rgba(255,255,255,0.3)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:'8px'}}>Floor</label>
            <input
              className="input"
              required inputMode="numeric" type="number" min="1" max="99"
              value={floorInput} onChange={e => setFloorInput(e.target.value)}
              placeholder="3"
              style={{fontSize:'2rem',fontWeight:700,textAlign:'center',letterSpacing:'0.2em',padding:'18px'}}
            />
          </div>

          {error && (
            <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:'12px',padding:'12px 14px',color:'#fca5a5',fontSize:'0.85rem'}} className="anim-shake">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{marginTop:'4px',background:'#ef4444',border:'none',borderRadius:'16px',color:'#fff',fontFamily:'Sora',fontWeight:700,fontSize:'1rem',padding:'18px',cursor:'pointer',opacity:loading?0.6:1,display:'flex',alignItems:'center',justifyContent:'center',gap:'10px',transition:'background 0.2s,transform 0.1s',boxShadow:'0 4px 24px rgba(239,68,68,0.35)'}}>
            {loading
              ? <><MiniSpinner/> Activating…</>
              : <>Activate Emergency System <span style={{fontSize:'1.1rem'}}>→</span></>
            }
          </button>
        </form>

        <p style={{textAlign:'center',color:'rgba(255,255,255,0.12)',fontSize:'0.72rem'}}>Location data used only for emergency response</p>
      </div>
    </div>
  );
}

/* ─── Idle / Safety Dashboard ───────────────────────────────────────────── */
function IdleScreen({ room, floor, onSOS }) {
  const [held, setHeld] = useState(false);
  const timerRef = useRef(null);
  const animRef  = useRef(null);
  const startRef = useRef(null);
  const [pct, setPct] = useState(0);

  const HOLD_MS = 1500;

  function startHold() {
    setHeld(true);
    startRef.current = Date.now();
    const tick = () => {
      const p = Math.min(((Date.now() - startRef.current) / HOLD_MS) * 100, 100);
      setPct(p);
      if (p < 100) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    timerRef.current = setTimeout(() => { setHeld(false); setPct(0); onSOS(); }, HOLD_MS);
  }
  function cancelHold() {
    setHeld(false); setPct(0);
    clearTimeout(timerRef.current);
    cancelAnimationFrame(animRef.current);
  }

  const r = 88;
  const circ = 2 * Math.PI * r;

  return (
    <div className="min-h-dvh flex flex-col" style={{background:'#0d0d0d',padding:'0 20px 40px'}}>
      <div style={{background:'#22c55e',height:'3px',borderRadius:'0 0 3px 3px',margin:'0 -20px 0'}}/>

      <div style={{maxWidth:'400px',width:'100%',margin:'0 auto',flex:1,display:'flex',flexDirection:'column',gap:'20px',paddingTop:'24px'}}>

        {/* Status bar */}
        <div className="anim-slide-up" style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.18)',borderRadius:'14px',padding:'12px 16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 8px #22c55e',animation:'breathe 2.5s ease-in-out infinite'}}/>
            <div>
              <p style={{fontWeight:600,fontSize:'0.85rem',color:'#86efac'}}>Emergency System Active</p>
              <p style={{fontSize:'0.72rem',color:'rgba(134,239,172,0.6)',marginTop:'1px',fontFamily:'IBM Plex Mono'}}>ROOM {room} · FLOOR {floor}</p>
            </div>
          </div>
          <span style={{fontSize:'1.3rem'}}>🏨</span>
        </div>

        {/* SOS button */}
        <div className="anim-slide-up" style={{animationDelay:'0.08s',display:'flex',flexDirection:'column',alignItems:'center',gap:'16px',padding:'24px 0'}}>
          <p style={{color:'rgba(255,255,255,0.3)',fontSize:'0.78rem',textAlign:'center',letterSpacing:'0.05em'}}>HOLD FOR 1.5 SECONDS TO SEND EMERGENCY ALERT</p>

          <div style={{position:'relative',display:'flex',alignItems:'center',justifyContent:'center',width:'260px',height:'260px'}}>
            {/* Animated rings when held */}
            {held && <>
              <div className="pulse-ring"/>
              <div className="pulse-ring"/>
              <div className="pulse-ring"/>
            </>}

            {/* Progress SVG ring */}
            <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',transform:'rotate(-90deg)',pointerEvents:'none'}}>
              <circle cx="130" cy="130" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4"/>
              <circle cx="130" cy="130" r={r} fill="none"
                stroke={held ? '#fff' : 'rgba(255,255,255,0.2)'}
                strokeWidth="4" strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - pct/100)}
                style={{transition: held ? 'none' : 'stroke-dashoffset 0.3s'}}/>
            </svg>

            <button
              className={`sos-btn${held ? ' held' : ''}`}
              onMouseDown={startHold} onMouseUp={cancelHold} onMouseLeave={cancelHold}
              onTouchStart={e => { e.preventDefault(); startHold(); }}
              onTouchEnd={e => { e.preventDefault(); cancelHold(); }}
            >
              <span style={{fontSize:'3.5rem',lineHeight:1}}>{held ? '⏳' : '🆘'}</span>
              <span>{held ? 'HOLD…' : 'SOS'}</span>
            </button>
          </div>

          <p style={{color:'rgba(255,255,255,0.18)',fontSize:'0.72rem',textAlign:'center'}}>For genuine emergencies only</p>
        </div>

        {/* Info cards */}
        <div className="anim-slide-up" style={{animationDelay:'0.15s',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
          <InfoCard icon="🚪" title="Exit Routes" body="Use stairwells — never elevators during emergencies" color="#f59e0b"/>
          <InfoCard icon="📞" title="Front Desk" body="Dial 0 from your room phone for immediate assistance" color="#60a5fa"/>
        </div>

        <div className="anim-slide-up" style={{animationDelay:'0.2s'}}>
          <div className="card" style={{padding:'16px 18px'}}>
            <p style={{fontSize:'0.68rem',fontWeight:600,color:'rgba(255,255,255,0.25)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:'12px'}}>Emergency Guide</p>
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {[
                ['🔥','Fire','Do not use elevators. Take the nearest stairwell and go to the assembly point.'],
                ['💧','Flood','Move to higher floors immediately. Avoid ground floor areas.'],
                ['☁️','Gas Leak','Leave the room. Do not switch lights on or off. Use stairwells only.'],
                ['🏥','Medical','Press SOS. Stay calm. Keep airways clear. Door unlocked for responders.'],
                ['🔒','Security','Lock your door. Call front desk via phone or press SOS.'],
              ].map(([ico, title, body]) => (
                <div key={title} style={{display:'flex',gap:'10px',alignItems:'flex-start'}}>
                  <span style={{fontSize:'1rem',flexShrink:0,marginTop:'1px'}}>{ico}</span>
                  <p style={{fontSize:'0.8rem',color:'rgba(255,255,255,0.5)',lineHeight:1.5}}><strong style={{color:'rgba(255,255,255,0.75)',fontWeight:600}}>{title} — </strong>{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Hold / Confirm ─────────────────────────────────────────────────────── */
function HoldScreen({ loading, error, onConfirm, onCancel }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center" style={{background:'#0d0d0d',padding:'0 24px 48px'}}>
      <div style={{maxWidth:'380px',width:'100%',display:'flex',flexDirection:'column',alignItems:'center',gap:'28px'}}>

        {/* Pulsing alert icon */}
        <div className="anim-breathe" style={{width:'90px',height:'90px',borderRadius:'24px',background:'rgba(239,68,68,0.12)',border:'2px solid rgba(239,68,68,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'2.8rem'}}>🚨</div>

        <div style={{textAlign:'center'}}>
          <h1 style={{fontWeight:800,fontSize:'1.9rem',color:'#f0f0f0',letterSpacing:'-0.03em',lineHeight:1.1}}>Confirm<br/>Emergency Alert</h1>
          <p style={{color:'rgba(255,255,255,0.35)',fontSize:'0.88rem',marginTop:'12px',lineHeight:1.6}}>
            This will <strong style={{color:'rgba(255,255,255,0.65)'}}>immediately notify</strong> hotel security and all on-duty emergency staff.
          </p>
          <p style={{color:'rgba(239,68,68,0.6)',fontSize:'0.8rem',marginTop:'6px',fontWeight:600}}>Only proceed if this is a genuine emergency.</p>
        </div>

        {error && (
          <div style={{width:'100%',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:'14px',padding:'14px',color:'#fca5a5',fontSize:'0.85rem',textAlign:'center'}}>
            {error}
          </div>
        )}

        <div style={{width:'100%',display:'flex',flexDirection:'column',gap:'10px'}}>
          <button onClick={onConfirm} disabled={loading}
            style={{background:'#ef4444',border:'none',borderRadius:'18px',color:'#fff',fontFamily:'Sora',fontWeight:800,fontSize:'1.05rem',padding:'20px',cursor:'pointer',opacity:loading?0.6:1,boxShadow:'0 0 40px rgba(239,68,68,0.3)',display:'flex',alignItems:'center',justifyContent:'center',gap:'10px',transition:'transform 0.1s'}}
            onMouseDown={e => e.currentTarget.style.transform='scale(0.97)'}
            onMouseUp={e => e.currentTarget.style.transform='scale(1)'}
          >
            {loading ? <><MiniSpinner/> Alerting staff…</> : '🆘 YES — SEND EMERGENCY ALERT'}
          </button>
          <button onClick={onCancel} disabled={loading}
            style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'18px',color:'rgba(255,255,255,0.45)',fontFamily:'Sora',fontWeight:600,fontSize:'0.9rem',padding:'16px',cursor:'pointer',transition:'all 0.2s'}}>
            Cancel — Not an Emergency
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Active SOS ─────────────────────────────────────────────────────────── */
function ActiveScreen({ room, floor, evacMsg, guestAlert, incStatus, dmToken, dmLeft, dmInterval, dmMissed, onSafe, onHelp, onPing, onCancel }) {
  const [showCancel, setShowCancel] = useState(false);
  return (
    <div className="min-h-dvh flex flex-col" style={{background:'#0d0d0d',padding:'0 20px 48px'}}>
      <div style={{background:'#ef4444',height:'4px',margin:'0 -20px'}}/>

      <div style={{maxWidth:'400px',width:'100%',margin:'0 auto',flex:1,display:'flex',flexDirection:'column',gap:'16px',paddingTop:'24px'}}>

        {/* Alert header */}
        <div className="anim-slide-up card-danger" style={{padding:'20px',textAlign:'center'}}>
          <div className="anim-breathe" style={{fontSize:'2.5rem',marginBottom:'8px'}}>🚨</div>
          <h2 style={{fontWeight:800,fontSize:'1.4rem',color:'#f87171',letterSpacing:'-0.02em'}}>Alert Sent!</h2>
          <p style={{color:'rgba(255,255,255,0.45)',fontSize:'0.85rem',marginTop:'4px',fontFamily:'IBM Plex Mono'}}>ROOM {room} · FLOOR {floor}</p>
          <p style={{color:'rgba(255,255,255,0.3)',fontSize:'0.8rem',marginTop:'6px'}}>Emergency staff notified and responding</p>
          {incStatus && (
            <div style={{marginTop:'10px',display:'inline-block',background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:'100px',padding:'4px 14px'}}>
              <span style={{fontFamily:'IBM Plex Mono',fontSize:'0.7rem',color:'#fca5a5',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.1em'}}>{incStatus.replace(/_/g,' ')}</span>
            </div>
          )}
        </div>

        {/* Evacuation */}
        {evacMsg && (
          <div className="anim-slide-up" style={{animationDelay:'0.08s',background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:'16px',padding:'16px',display:'flex',gap:'12px',alignItems:'flex-start'}}>
            <span style={{fontSize:'1.5rem',flexShrink:0}}>🚪</span>
            <div>
              <p style={{fontSize:'0.68rem',fontWeight:600,color:'rgba(245,158,11,0.7)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:'4px'}}>Evacuation Route</p>
              <p style={{fontSize:'0.88rem',color:'rgba(251,191,36,0.85)',lineHeight:1.5}}>{evacMsg}</p>
            </div>
          </div>
        )}

        {/* Hotel alert */}
        {guestAlert && (
          <div className="anim-slide-up" style={{background:'rgba(245,158,11,0.06)',border:'1px solid rgba(245,158,11,0.15)',borderRadius:'16px',padding:'14px 16px'}}>
            <p style={{fontSize:'0.68rem',fontWeight:600,color:'rgba(245,158,11,0.6)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:'4px'}}>Hotel Notice</p>
            <p style={{fontSize:'0.85rem',color:'rgba(251,191,36,0.75)',lineHeight:1.5}}>{guestAlert}</p>
          </div>
        )}

        {/* Respond section */}
        <div className="anim-slide-up" style={{animationDelay:'0.12s'}}>
          <p style={{textAlign:'center',color:'rgba(255,255,255,0.3)',fontSize:'0.78rem',marginBottom:'12px',letterSpacing:'0.05em',textTransform:'uppercase'}}>Tell rescue teams your status</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
            <BigRespond icon="✅" label="I'm Safe" sub="No immediate danger" color="#22c55e" onClick={onSafe}/>
            <BigRespond icon="🆘" label="Need Help" sub="I require assistance" color="#ef4444" onClick={onHelp}/>
          </div>
        </div>

        {/* Dead Man Switch */}
        {dmToken && (
          <div className="anim-slide-up" style={{animationDelay:'0.18s'}}>
            <DMS dmLeft={dmLeft} dmInterval={dmInterval} dmMissed={dmMissed} onPing={onPing}/>
          </div>
        )}

        {/* What to do */}
        <div className="anim-slide-up card" style={{padding:'16px 18px',animationDelay:'0.22s'}}>
          <p style={{fontSize:'0.68rem',fontWeight:600,color:'rgba(255,255,255,0.25)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:'10px'}}>While You Wait</p>
          {[
            ['🚪','Stay near your door so rescuers can find you'],
            ['📱','Keep phone on, screen visible, volume up'],
            ['🔦','Use flashlight app if lights are out'],
            ['🗣','Shout or knock if you hear responders nearby'],
          ].map(([ico, txt]) => (
            <div key={txt} style={{display:'flex',gap:'10px',marginBottom:'8px',alignItems:'flex-start'}}>
              <span style={{fontSize:'0.95rem',flexShrink:0,marginTop:'1px'}}>{ico}</span>
              <p style={{fontSize:'0.8rem',color:'rgba(255,255,255,0.4)',lineHeight:1.5}}>{txt}</p>
            </div>
          ))}
        </div>

        {/* False alarm / cancel */}
        <div className="anim-slide-up" style={{animationDelay:'0.28s'}}>
          {!showCancel ? (
            <button onClick={() => setShowCancel(true)}
              style={{width:'100%',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'14px',padding:'12px',color:'rgba(255,255,255,0.25)',fontSize:'0.78rem',fontFamily:'IBM Plex Mono',cursor:'pointer',letterSpacing:'0.05em',transition:'all 0.2s'}}>
              This was a false alarm
            </button>
          ) : (
            <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'16px',padding:'16px',textAlign:'center'}}>
              <p style={{color:'rgba(255,255,255,0.7)',fontSize:'0.88rem',fontWeight:600,marginBottom:'6px'}}>Cancel emergency alert?</p>
              <p style={{color:'rgba(255,255,255,0.3)',fontSize:'0.75rem',marginBottom:'14px',lineHeight:1.5}}>Staff will be notified it was a false alarm. Only cancel if you are completely safe.</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <button onClick={() => setShowCancel(false)}
                  style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'12px',padding:'12px',color:'rgba(255,255,255,0.5)',fontSize:'0.85rem',fontWeight:600,cursor:'pointer'}}>
                  ← Keep Alert
                </button>
                <button onClick={onCancel}
                  style={{background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'12px',padding:'12px',color:'#fca5a5',fontSize:'0.85rem',fontWeight:700,cursor:'pointer'}}>
                  ✓ Cancel SOS
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

/* ─── Responded ──────────────────────────────────────────────────────────── */
function DoneScreen({ room, floor, evacMsg, response, incStatus, dmToken, dmLeft, dmInterval, dmMissed, onPing, onChangeResponse }) {
  const safe = response === 'safe';
  return (
    <div className="min-h-dvh flex flex-col" style={{background:'#0d0d0d',padding:'0 20px 48px'}}>
      <div style={{background: safe ? '#22c55e' : '#ef4444', height:'4px',margin:'0 -20px'}}/>

      <div style={{maxWidth:'400px',width:'100%',margin:'0 auto',flex:1,display:'flex',flexDirection:'column',gap:'16px',paddingTop:'24px'}}>

        {/* Status card */}
        <div className={`anim-slide-up ${safe ? 'card-safe' : 'card-danger'}`} style={{padding:'24px',textAlign:'center'}}>
          <div style={{fontSize:'3rem',marginBottom:'10px'}}>{safe ? '✅' : '🆘'}</div>
          <h2 style={{fontWeight:800,fontSize:'1.5rem',letterSpacing:'-0.02em',color: safe ? '#86efac' : '#fca5a5'}}>
            {safe ? 'Status: Safe' : 'Help Is Coming'}
          </h2>
          <p style={{fontFamily:'IBM Plex Mono',fontSize:'0.75rem',color:'rgba(255,255,255,0.3)',marginTop:'6px'}}>ROOM {room} · FLOOR {floor}</p>
          {!safe && (
            <div style={{marginTop:'14px',background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'12px',padding:'12px 16px'}}>
              <p style={{fontSize:'0.88rem',fontWeight:600,color:'#fca5a5',lineHeight:1.5}}>Stay where you are.<br/>Rescue team is on its way.</p>
            </div>
          )}
          {incStatus && (
            <div style={{marginTop:'10px',display:'inline-block',background:'rgba(255,255,255,0.06)',borderRadius:'100px',padding:'4px 14px'}}>
              <span style={{fontFamily:'IBM Plex Mono',fontSize:'0.68rem',color:'rgba(255,255,255,0.35)',textTransform:'uppercase',letterSpacing:'0.1em'}}>{incStatus.replace(/_/g,' ')}</span>
            </div>
          )}
        </div>

        {/* Evacuation route — always show during active emergency */}
        {evacMsg && (
          <div className="anim-slide-up" style={{animationDelay:'0.05s',background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',borderRadius:'16px',padding:'16px',display:'flex',gap:'12px',alignItems:'flex-start'}}>
            <span style={{fontSize:'1.5rem',flexShrink:0}}>🚪</span>
            <div>
              <p style={{fontSize:'0.68rem',fontWeight:600,color:'rgba(245,158,11,0.7)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:'4px'}}>Evacuation Route</p>
              <p style={{fontSize:'0.88rem',color:'rgba(251,191,36,0.85)',lineHeight:1.5}}>{evacMsg}</p>
            </div>
          </div>
        )}

        {/* Change status */}
        <div className="anim-slide-up" style={{animationDelay:'0.08s'}}>
          <p style={{textAlign:'center',color:'rgba(255,255,255,0.25)',fontSize:'0.72rem',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'10px'}}>Update if situation changes</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
            <button onClick={() => onChangeResponse('safe')}
              style={{background: safe ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',border:`1.5px solid ${safe ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.08)'}`,borderRadius:'16px',padding:'14px',color: safe ? '#86efac' : 'rgba(255,255,255,0.35)',fontFamily:'Sora',fontWeight:700,fontSize:'0.9rem',cursor:'pointer',transition:'all 0.2s'}}>
              ✅ I'm Safe
            </button>
            <button onClick={() => onChangeResponse('needs_help')}
              style={{background: !safe ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',border:`1.5px solid ${!safe ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.08)'}`,borderRadius:'16px',padding:'14px',color: !safe ? '#fca5a5' : 'rgba(255,255,255,0.35)',fontFamily:'Sora',fontWeight:700,fontSize:'0.9rem',cursor:'pointer',transition:'all 0.2s'}}>
              🆘 Need Help
            </button>
          </div>
        </div>

        {/* DMS */}
        {dmToken && (
          <div className="anim-slide-up" style={{animationDelay:'0.14s'}}>
            <DMS dmLeft={dmLeft} dmInterval={dmInterval} dmMissed={dmMissed} onPing={onPing}/>
          </div>
        )}

        {!safe && (
          <div className="anim-slide-up card" style={{padding:'16px 18px',animationDelay:'0.18s'}}>
            <p style={{fontSize:'0.68rem',fontWeight:600,color:'rgba(255,255,255,0.25)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:'10px'}}>Stay Safe</p>
            {[
              ['🚪','Stay near your door — rescuers will come to you'],
              ['📱','Keep phone charged and screen on'],
              ['🔦','Use flashlight if lights are out'],
              ['🗣','Shout or knock if you hear responders'],
            ].map(([ico, txt]) => (
              <div key={txt} style={{display:'flex',gap:'10px',marginBottom:'8px'}}>
                <span style={{fontSize:'0.9rem',flexShrink:0}}>{ico}</span>
                <p style={{fontSize:'0.8rem',color:'rgba(255,255,255,0.4)',lineHeight:1.5}}>{txt}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Resolved / All Clear ───────────────────────────────────────────────── */
function ClearScreen({ onReset }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center" style={{background:'#0d0d0d',padding:'0 24px 48px'}}>
      <div style={{maxWidth:'380px',width:'100%',display:'flex',flexDirection:'column',alignItems:'center',gap:'24px',textAlign:'center'}}>
        <div className="anim-slide-up" style={{width:'90px',height:'90px',borderRadius:'24px',background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'2.8rem'}}>✅</div>
        <div className="anim-slide-up" style={{animationDelay:'0.08s'}}>
          <h1 style={{fontWeight:800,fontSize:'2rem',color:'#86efac',letterSpacing:'-0.03em',lineHeight:1.1}}>All Clear</h1>
          <p style={{color:'rgba(255,255,255,0.35)',fontSize:'0.88rem',marginTop:'10px',lineHeight:1.7}}>The emergency has been resolved by hotel staff. You may resume normal activities. Thank you for your cooperation.</p>
        </div>
        <div className="anim-slide-up card" style={{width:'100%',padding:'16px 18px',textAlign:'left',animationDelay:'0.14s'}}>
          {[
            '✅ All systems returned to normal',
            '✅ Staff available at the front desk',
            '✅ Emergency services stood down',
          ].map(t => <p key={t} style={{fontSize:'0.83rem',color:'rgba(134,239,172,0.5)',marginBottom:'6px'}}>{t}</p>)}
        </div>
        <button onClick={onReset} className="anim-slide-up"
          style={{animationDelay:'0.18s',width:'100%',background:'rgba(34,197,94,0.12)',border:'1.5px solid rgba(34,197,94,0.25)',borderRadius:'16px',color:'#86efac',fontFamily:'Sora',fontWeight:700,fontSize:'0.95rem',padding:'16px',cursor:'pointer',transition:'all 0.2s'}}>
          Back to Safety Dashboard
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
═══════════════════════════════════════════════════════════════════════════ */

/* Dead Man Switch widget */
function DMS({ dmLeft, dmInterval, dmMissed, onPing }) {
  const urgent = dmLeft <= 20;
  const pct    = dmInterval > 0 ? dmLeft / dmInterval : 0;
  const r = 34;
  const circ = 2 * Math.PI * r;

  return (
    <div style={{
      background: urgent ? 'rgba(239,68,68,0.08)' : 'rgba(139,92,246,0.07)',
      border: `1.5px solid ${urgent ? 'rgba(239,68,68,0.3)' : 'rgba(139,92,246,0.2)'}`,
      borderRadius:'18px', padding:'16px',
    }}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
        <div>
          <p style={{fontWeight:700,fontSize:'0.85rem',color: urgent ? '#fca5a5' : '#c4b5fd'}}>💜 Dead Man's Switch</p>
          <p style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.3)',marginTop:'2px'}}>Tap regularly to confirm you're conscious</p>
        </div>
        {dmMissed > 0 && (
          <div style={{background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.25)',borderRadius:'8px',padding:'4px 10px'}}>
            <span style={{fontSize:'0.72rem',color:'#fca5a5',fontWeight:600,fontFamily:'IBM Plex Mono'}}>{dmMissed} missed</span>
          </div>
        )}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
        {/* SVG countdown */}
        <div style={{position:'relative',width:'76px',height:'76px',flexShrink:0}}>
          <svg style={{width:'76px',height:'76px',transform:'rotate(-90deg)'}} viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"/>
            <circle cx="40" cy="40" r={r} fill="none"
              stroke={urgent ? '#f87171' : '#a78bfa'}
              strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - pct)}
              style={{transition:'stroke-dashoffset 1s linear'}}/>
          </svg>
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'IBM Plex Mono',fontSize:'0.85rem',fontWeight:600,color: urgent ? '#f87171' : '#c4b5fd'}}>
            {dmLeft}s
          </div>
        </div>
        <button onClick={onPing}
          style={{flex:1,padding:'18px 12px',borderRadius:'14px',border:'none',fontFamily:'Sora',fontWeight:700,fontSize:'0.95rem',cursor:'pointer',transition:'all 0.15s',
            background: urgent ? '#ef4444' : 'rgba(139,92,246,0.15)',
            color: urgent ? '#fff' : '#c4b5fd',
            boxShadow: urgent ? '0 0 20px rgba(239,68,68,0.3)' : 'none',
          }}>
          {urgent ? '⚡ TAP NOW!' : '💜 I\'m Conscious'}
        </button>
      </div>
    </div>
  );
}

/* Response button (big) */
function BigRespond({ icon, label, sub, color, onClick }) {
  return (
    <button onClick={onClick}
      style={{background:`${color}10`,border:`2px solid ${color}28`,borderRadius:'18px',padding:'22px 12px',display:'flex',flexDirection:'column',alignItems:'center',gap:'8px',cursor:'pointer',transition:'all 0.15s',fontFamily:'Sora'}}
      onMouseDown={e => e.currentTarget.style.transform='scale(0.96)'}
      onMouseUp={e => e.currentTarget.style.transform='scale(1)'}
      onTouchStart={e => e.currentTarget.style.transform='scale(0.96)'}
      onTouchEnd={e => e.currentTarget.style.transform='scale(1)'}
    >
      <span style={{fontSize:'2.5rem',lineHeight:1}}>{icon}</span>
      <span style={{fontWeight:700,fontSize:'1rem',color:`${color}ee`}}>{label}</span>
      <span style={{fontSize:'0.72rem',color:`${color}66`,textAlign:'center',lineHeight:1.4}}>{sub}</span>
    </button>
  );
}

/* Info card */
function InfoCard({ icon, title, body, color }) {
  return (
    <div className="card" style={{padding:'14px'}}>
      <span style={{fontSize:'1.4rem',display:'block',marginBottom:'8px'}}>{icon}</span>
      <p style={{fontWeight:600,fontSize:'0.83rem',color:'rgba(255,255,255,0.7)',marginBottom:'4px'}}>{title}</p>
      <p style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.3)',lineHeight:1.5}}>{body}</p>
    </div>
  );
}

function MiniSpinner() {
  return (
    <div style={{width:'18px',height:'18px',border:'2px solid rgba(255,255,255,0.2)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.8s linear infinite',flexShrink:0}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
