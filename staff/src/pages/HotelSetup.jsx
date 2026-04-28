import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */
const CELL = 40; // grid cell px
const GRID_W = 20;
const GRID_H = 14;

const ELEMENTS = [
  { type: 'room',    icon: '🛏', label: 'Room',     color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  { type: 'stairs',  icon: '🪜', label: 'Stairs',   color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  { type: 'lift',    icon: '🛗', label: 'Lift',     color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  { type: 'exit',    icon: '🚪', label: 'Exit',     color: '#22c55e', bg: 'rgba(34,197,94,0.15)'  },
  { type: 'hazard',  icon: '⚠️', label: 'Hazard',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)'  },
  { type: 'assembly',icon: '⛺', label: 'Assembly', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)'  },
  { type: 'wall',    icon: '▬',  label: 'Wall',     color: '#64748b', bg: 'rgba(100,116,139,0.25)' },
];

const TYPE_MAP = Object.fromEntries(ELEMENTS.map(e => [e.type, e]));

/* ═══════════════════════════════════════════════════════════════
   FLOOR PLAN CANVAS
═══════════════════════════════════════════════════════════════ */
function FloorCanvas({ cells, onCellClick, onCellHover, hoveredCell, selectedType, tool }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${GRID_W}, ${CELL}px)`,
        gridTemplateRows: `repeat(${GRID_H}, ${CELL}px)`,
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: tool === 'erase' ? 'crosshair' : 'cell',
        userSelect: 'none',
        background: '#0a0a0f',
      }}
    >
      {Array.from({ length: GRID_H }, (_, row) =>
        Array.from({ length: GRID_W }, (_, col) => {
          const key = `${col}_${row}`;
          const cell = cells[key];
          const meta = cell ? TYPE_MAP[cell.type] : null;
          const isHov = hoveredCell === key;
          const placingMeta = tool === 'place' && isHov ? TYPE_MAP[selectedType] : null;

          return (
            <div
              key={key}
              onMouseDown={() => onCellClick(col, row)}
              onMouseEnter={() => onCellHover(col, row)}
              style={{
                width: CELL, height: CELL,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem',
                border: '1px solid rgba(255,255,255,0.04)',
                background: placingMeta
                  ? placingMeta.bg
                  : cell
                    ? meta?.bg
                    : isHov
                      ? 'rgba(255,255,255,0.03)'
                      : 'transparent',
                position: 'relative',
                transition: 'background 0.08s',
                boxShadow: cell ? `inset 0 0 0 1px ${meta?.color}40` : 'none',
              }}
            >
              {cell && (
                <>
                  <span style={{ fontSize: '1rem', lineHeight: 1 }}>{meta?.icon}</span>
                  {cell.label && (
                    <span style={{
                      position: 'absolute', bottom: 1, left: 0, right: 0,
                      fontSize: '7px', color: meta?.color, textAlign: 'center',
                      fontFamily: 'IBM Plex Mono', fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      padding: '0 2px',
                    }}>
                      {cell.label}
                    </span>
                  )}
                </>
              )}
              {placingMeta && !cell && (
                <span style={{ fontSize: '1rem', opacity: 0.5 }}>{placingMeta.icon}</span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN HOTEL SETUP PAGE
═══════════════════════════════════════════════════════════════ */
export default function HotelSetup() {
  const { profile } = useAuth();
  const [hotel,       setHotel]       = useState(null);
  const [floor,       setFloor]       = useState(1);
  const [floors,      setFloors]      = useState([]);
  const [cells,       setCells]       = useState({});   // { "col_row": { type, label } }
  const [selectedType,setSelectedType]= useState('room');
  const [tool,        setTool]        = useState('place'); // 'place' | 'erase'
  const [hoveredCell, setHoveredCell] = useState(null);
  const [labelInput,  setLabelInput]  = useState('');
  const [painting,    setPainting]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [savedMsg,    setSavedMsg]    = useState('');
  const [tab,         setTab]         = useState('floorplan'); // 'floorplan' | 'hotel' | 'exits' | 'qr'
  const [exitRoutes,  setExitRoutes]  = useState([]);
  const [newExit,     setNewExit]     = useState({ floor: 1, label: '', description: '', muster_point: '', is_accessible: false });
  const [hotelForm,   setHotelForm]   = useState({ name:'', address:'', total_floors:5, timezone:'UTC' });
  const [qrCode,      setQrCode]      = useState(null);
  const [hotelSaving, setHotelSaving] = useState(false);
  const [exitSaving,  setExitSaving]  = useState(false);
  const isMouseDown = useRef(false);

  // Load hotel
  useEffect(() => {
    if (!profile?.hotel_id) return;
    api.get('/api/hotels/me').then(h => {
      setHotel(h);
      setHotelForm({ name: h.name || '', address: h.address || '', total_floors: h.total_floors || 5, timezone: h.timezone || 'UTC' });
      const fl = Array.from({ length: h.total_floors || 5 }, (_, i) => i + 1);
      setFloors(fl);
      if (h.qr_token) setQrCode(`${window.location.origin}/api/hotels/resolve-qr/${h.qr_token}`);
    }).catch(() => {});
    loadExitRoutes();
  }, [profile]);

  // Load floor plan when floor changes
  useEffect(() => {
    if (!profile?.hotel_id) return;
    api.get(`/api/hotels/floor-plans/${floor}`).then(fp => {
      if (fp?.grid_cells) setCells(fp.grid_cells);
      else setCells({});
    }).catch(() => setCells({}));
  }, [floor, profile]);

  async function loadExitRoutes() {
    try {
      const routes = await api.get('/api/hotels/exit-routes');
      setExitRoutes(Array.isArray(routes) ? routes : []);
    } catch { setExitRoutes([]); }
  }

  // Paint on drag
  useEffect(() => {
    const up = () => { setPainting(false); isMouseDown.current = false; };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const handleCellClick = useCallback((col, row) => {
    isMouseDown.current = true;
    setPainting(true);
    applyCell(col, row);
  }, [tool, selectedType, labelInput]);

  const handleCellHover = useCallback((col, row) => {
    const key = `${col}_${row}`;
    setHoveredCell(key);
    if (painting && isMouseDown.current) applyCell(col, row);
  }, [painting, tool, selectedType, labelInput]);

  function applyCell(col, row) {
    const key = `${col}_${row}`;
    setCells(prev => {
      if (tool === 'erase') {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      // Auto-label for rooms
      const autoLabel = selectedType === 'room' && labelInput
        ? labelInput
        : selectedType === 'room'
          ? `${floor}${String(Object.keys(prev).filter(k => prev[k]?.type === 'room').length + 1).padStart(2,'0')}`
          : selectedType === 'stairs' ? 'STAIR'
          : selectedType === 'lift'   ? 'LIFT'
          : selectedType === 'exit'   ? 'EXIT'
          : selectedType === 'assembly' ? 'MUSTER'
          : '';
      return { ...prev, [key]: { type: selectedType, label: autoLabel } };
    });
  }

  async function saveFloorPlan() {
    setSaving(true);
    try {
      await api.patch(`/api/hotels/floor-plans/${floor}`, { grid_cells: cells });
      setSavedMsg(`Floor ${floor} saved!`);
      setTimeout(() => setSavedMsg(''), 2500);
    } catch(e) { alert(e.message); }
    setSaving(false);
  }

  async function saveHotel() {
    setHotelSaving(true);
    try {
      await api.patch('/api/hotels/me', hotelForm);
      const fl = Array.from({ length: parseInt(hotelForm.total_floors) || 5 }, (_, i) => i + 1);
      setFloors(fl);
      setSavedMsg('Hotel settings saved!');
      setTimeout(() => setSavedMsg(''), 2500);
    } catch(e) { alert(e.message); }
    setHotelSaving(false);
  }

  async function generateQR() {
    try {
      const d = await api.post('/api/hotels/generate-qr', {});
      const url = `${window.location.origin.replace('5173','5174')}/?t=${d.qr_token}`;
      setQrCode(url);
    } catch(e) { alert(e.message); }
  }

  async function addExitRoute() {
    if (!newExit.label || !newExit.floor) return;
    setExitSaving(true);
    try {
      await api.post('/api/hotels/exit-routes', newExit);
      await loadExitRoutes();
      setNewExit({ floor: 1, label: '', description: '', muster_point: '', is_accessible: false });
    } catch(e) { alert(e.message); }
    setExitSaving(false);
  }

  async function deleteExitRoute(id) {
    try {
      await api.delete(`/api/hotels/exit-routes/${id}`);
      await loadExitRoutes();
    } catch(e) { alert(e.message); }
  }

  const TABS = [
    { id: 'floorplan', icon: '🗺️', label: 'Floor Plans' },
    { id: 'hotel',     icon: '🏨', label: 'Hotel Info'  },
    { id: 'exits',     icon: '🚪', label: 'Exit Routes' },
    { id: 'qr',        icon: '📱', label: 'QR Code'     },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Hotel Setup</h1>
          <p className="text-slate-600 text-xs mt-0.5">Configure floor plans, exit routes & hotel details</p>
        </div>
        {savedMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold px-4 py-2 rounded-xl animate-pulse">
            ✅ {savedMsg}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-void-900 border border-white/5 p-1 rounded-2xl w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === t.id ? 'bg-indigo-500/15 text-white border border-indigo-500/15' : 'text-slate-500 hover:text-slate-300'
            }`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: FLOOR PLAN ── */}
      {tab === 'floorplan' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Floor selector */}
            <div className="flex gap-1 bg-void-900 border border-white/5 p-1 rounded-xl">
              {floors.map(f => (
                <button key={f} onClick={() => setFloor(f)}
                  className={`w-9 h-8 rounded-lg text-sm font-bold transition-all ${
                    floor === f ? 'bg-indigo-500/20 text-white border border-indigo-500/20' : 'text-slate-600 hover:text-slate-400'
                  }`}>
                  {f}
                </button>
              ))}
            </div>

            {/* Tool toggle */}
            <div className="flex gap-1 bg-void-900 border border-white/5 p-1 rounded-xl">
              <button onClick={() => setTool('place')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  tool === 'place' ? 'bg-indigo-500/20 text-white' : 'text-slate-600'
                }`}>✏️ Place</button>
              <button onClick={() => setTool('erase')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  tool === 'erase' ? 'bg-red-500/20 text-red-400' : 'text-slate-600'
                }`}>🗑 Erase</button>
            </div>

            {/* Label input */}
            {tool === 'place' && selectedType === 'room' && (
              <input value={labelInput} onChange={e => setLabelInput(e.target.value)}
                placeholder="Room label (e.g. 301)"
                className="bg-void-900 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-1.5 text-sm w-40"/>
            )}

            <div className="flex-1"/>

            {/* Clear floor */}
            <button onClick={() => setCells({})}
              className="text-xs text-slate-600 hover:text-red-400 border border-white/5 hover:border-red-500/20 px-3 py-1.5 rounded-xl transition-all">
              Clear Floor
            </button>

            {/* Save */}
            <button onClick={saveFloorPlan} disabled={saving}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-all">
              {saving ? <>
                <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"/>
                Saving…
              </> : '💾 Save Floor Plan'}
            </button>
          </div>

          {/* Element palette */}
          <div className="flex flex-wrap gap-2">
            {ELEMENTS.map(el => (
              <button key={el.type} onClick={() => { setSelectedType(el.type); setTool('place'); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                  selectedType === el.type && tool === 'place'
                    ? 'border-opacity-40 text-white'
                    : 'border-white/6 text-slate-500 hover:text-slate-300 hover:border-white/12'
                }`}
                style={selectedType === el.type && tool === 'place' ? {
                  background: el.bg, borderColor: el.color + '60', color: el.color
                } : {}}>
                <span>{el.icon}</span>{el.label}
              </button>
            ))}
          </div>

          {/* Canvas */}
          <div className="glass rounded-2xl p-4 overflow-x-auto">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Floor {floor} Layout</span>
              <span className="text-[10px] text-slate-700">
                {Object.keys(cells).length} cells placed
                · {Object.values(cells).filter(c => c.type === 'room').length} rooms
                · {Object.values(cells).filter(c => c.type === 'stairs').length} stairwells
                · {Object.values(cells).filter(c => c.type === 'lift').length} lifts
                · {Object.values(cells).filter(c => c.type === 'exit').length} exits
              </span>
            </div>
            <FloorCanvas
              cells={cells}
              onCellClick={handleCellClick}
              onCellHover={handleCellHover}
              hoveredCell={hoveredCell}
              selectedType={selectedType}
              tool={tool}
            />
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {ELEMENTS.map(el => (
                <div key={el.type} className="flex items-center gap-1.5 text-[10px]" style={{ color: el.color }}>
                  <span>{el.icon}</span>
                  <span className="text-slate-600">{el.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Legend / Tips */}
          <div className="glass rounded-2xl p-4">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-3">How to use</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-500">
              <p>🖱️ Click to place element</p>
              <p>🖱️ Click + drag to paint</p>
              <p>🗑 Switch to Erase tool to remove</p>
              <p>🛏 Add room label before placing</p>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: HOTEL INFO ── */}
      {tab === 'hotel' && (
        <div className="glass rounded-2xl p-6 max-w-xl space-y-4">
          <p className="text-sm font-semibold text-white">Hotel Details</p>
          {[
            { key: 'name',         label: 'Hotel Name',    type: 'text',   placeholder: 'Grand Hotel' },
            { key: 'address',      label: 'Address',       type: 'text',   placeholder: '123 Main St, City' },
            { key: 'total_floors', label: 'Total Floors',  type: 'number', placeholder: '10' },
            { key: 'timezone',     label: 'Timezone',      type: 'text',   placeholder: 'Asia/Kolkata' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{f.label}</label>
              <input
                type={f.type}
                value={hotelForm[f.key] || ''}
                onChange={e => setHotelForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-4 py-2.5 text-sm"
              />
            </div>
          ))}
          <button onClick={saveHotel} disabled={hotelSaving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all">
            {hotelSaving ? <><div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"/>Saving…</> : '💾 Save Hotel Info'}
          </button>
        </div>
      )}

      {/* ── TAB: EXIT ROUTES ── */}
      {tab === 'exits' && (
        <div className="space-y-4">
          {/* Add form */}
          <div className="glass rounded-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-white">Add Exit Route</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Floor</label>
                <input type="number" min="1" value={newExit.floor}
                  onChange={e => setNewExit(p => ({ ...p, floor: parseInt(e.target.value) }))}
                  className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white rounded-xl px-3 py-2 text-sm"/>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Route Label</label>
                <input value={newExit.label} onChange={e => setNewExit(p => ({ ...p, label: e.target.value }))}
                  placeholder="Stairwell A"
                  className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2 text-sm"/>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Muster Point</label>
                <input value={newExit.muster_point} onChange={e => setNewExit(p => ({ ...p, muster_point: e.target.value }))}
                  placeholder="Main car park"
                  className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2 text-sm"/>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Description</label>
                <input value={newExit.description} onChange={e => setNewExit(p => ({ ...p, description: e.target.value }))}
                  placeholder="Turn left from elevator, push fire door at end of corridor"
                  className="w-full bg-void-800 border border-white/8 focus:border-indigo-500/40 focus:outline-none text-white placeholder-slate-700 rounded-xl px-3 py-2 text-sm"/>
              </div>
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newExit.is_accessible}
                    onChange={e => setNewExit(p => ({ ...p, is_accessible: e.target.checked }))}
                    className="w-4 h-4 rounded"/>
                  <span className="text-xs text-slate-400">♿ Wheelchair accessible</span>
                </label>
              </div>
            </div>
            <button onClick={addExitRoute} disabled={exitSaving || !newExit.label}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all">
              {exitSaving ? <><div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"/>Adding…</> : '+ Add Exit Route'}
            </button>
          </div>

          {/* List */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5">
              <span className="font-semibold text-white text-sm">Exit Routes ({exitRoutes.length})</span>
            </div>
            {exitRoutes.length === 0 ? (
              <div className="py-12 text-center text-slate-600 text-sm">No exit routes configured yet</div>
            ) : (
              <div className="divide-y divide-white/4">
                {exitRoutes.map(r => (
                  <div key={r._id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-sm">🚪</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{r.label}</span>
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 px-1.5 py-0.5 rounded font-bold">Floor {r.floor}</span>
                        {r.is_accessible && <span className="text-[10px] text-amber-400">♿</span>}
                      </div>
                      {r.description && <p className="text-xs text-slate-600 mt-0.5 truncate">{r.description}</p>}
                      {r.muster_point && <p className="text-[10px] text-emerald-600 mt-0.5">→ {r.muster_point}</p>}
                    </div>
                    <button onClick={() => deleteExitRoute(r._id)}
                      className="text-slate-700 hover:text-red-400 transition-colors text-sm px-2 py-1">
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: QR CODE ── */}
      {tab === 'qr' && (
        <div className="space-y-4 max-w-lg">
          <div className="glass rounded-2xl p-6 space-y-4">
            <p className="text-sm font-semibold text-white">Guest QR Code</p>
            <p className="text-xs text-slate-500">Guests scan this QR code to access their emergency dashboard. Place in every room.</p>

            <button onClick={generateQR}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all">
              🔄 Generate New QR Token
            </button>

            {qrCode && (
              <div className="space-y-3">
                <div className="bg-white rounded-2xl p-4 flex items-center justify-center">
                  <QRCode value={qrCode} size={180}/>
                </div>
                <div className="bg-void-800 border border-white/8 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1">Guest URL</p>
                  <p className="text-xs text-indigo-300 font-mono break-all">{qrCode}</p>
                </div>
                <p className="text-[10px] text-slate-600">
                  Print and laminate this QR code for each room. Guests will see their floor's exit routes and emergency dashboard.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* Simple QR code renderer using a public API */
function QRCode({ value, size = 160 }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=000000&margin=2`;
  return <img src={url} width={size} height={size} alt="QR Code" style={{ display: 'block', borderRadius: 8 }}/>;
}
