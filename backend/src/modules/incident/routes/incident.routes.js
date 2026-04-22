"use strict";
const express   = require("express");
const rateLimit = require("express-rate-limit");
const { requireAuth, requireRole } = require("../../../middleware/auth");
const { asyncHandler } = require("../../../lib/asyncHandler");
const svc = require("../service/incident.service");

const router = express.Router();

const sosRateLimit = rateLimit({ windowMs: 60_000, max: 10, message: { error: "Too many SOS requests" } });

// ── Guest QR portal HTML page ────────────────────────────────────────────────

/**
 * GET /api/incidents/sos/:hotel_id
 * Returns the guest-facing HTML page. Served when a QR code is scanned.
 */
router.get(
  "/sos/:hotel_id",
  asyncHandler(async (req, res) => {
    const { hotel_id } = req.params;
    const { room = "?", floor = "?", lang = "en" } = req.query;

    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>NexAlert Emergency</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#111;color:#fff;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
    .card{background:#1a1a1a;border-radius:16px;padding:32px;max-width:400px;width:100%;text-align:center}
    h1{font-size:1.5rem;margin-bottom:8px}
    .sub{color:#aaa;margin-bottom:24px;font-size:.9rem}
    .sos-btn{background:#dc2626;color:#fff;border:none;border-radius:12px;padding:20px 40px;font-size:1.2rem;font-weight:700;cursor:pointer;width:100%;margin-bottom:16px}
    .sos-btn:active{opacity:.8}
    .sos-btn:disabled{opacity:.5;cursor:not-allowed}
    .resp{display:none;gap:12px;margin-top:16px}
    .safe{background:#16a34a;color:#fff;border:none;border-radius:10px;padding:14px;flex:1;font-size:1rem;cursor:pointer}
    .help{background:#ea580c;color:#fff;border:none;border-radius:10px;padding:14px;flex:1;font-size:1rem;cursor:pointer}
    .hb{display:none;margin-top:24px}
    .hb-btn{background:#7c3aed;color:#fff;border:none;border-radius:50%;width:100px;height:100px;font-size:2rem;cursor:pointer;display:block;margin:0 auto}
    .cd{color:#aaa;font-size:.85rem;margin-top:8px}
    .alert{display:none;background:#991b1b;border-radius:10px;padding:16px;margin-bottom:16px;animation:pulse 2s infinite}
    .clear{display:none;background:#14532d;border-radius:10px;padding:16px}
    .evac{display:none;margin-top:12px;background:#1e293b;border-radius:8px;padding:12px;font-size:.85rem;text-align:left;color:#93c5fd}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}
  </style>
</head>
<body>
<div class="card">
  <div id="alert" class="alert"></div>
  <div id="clear" class="clear">✅ All Clear — the emergency has been resolved.</div>
  <h1>🚨 NexAlert</h1>
  <p class="sub">Room ${room} · Floor ${floor}</p>
  <button class="sos-btn" id="sosBtn" onclick="reportEmergency()">🆘 Report Emergency</button>
  <div id="evac" class="evac"></div>
  <div class="resp" id="resp">
    <button class="safe" onclick="respond('safe')">✅ I'm Safe</button>
    <button class="help" onclick="respond('needs_help')">🆘 I Need Help</button>
  </div>
  <div class="hb" id="hb">
    <p style="color:#aaa;font-size:.85rem;margin-bottom:12px">Tap every 2 min to confirm you're okay</p>
    <button class="hb-btn" onclick="ping()">💓</button>
    <p class="cd" id="cd">Next ping in: 2:00</p>
  </div>
</div>
<script>
const HOTEL_ID='${hotel_id}',ROOM='${room}',FLOOR='${floor}',LANG='${lang}';
let incidentId=null,dmToken=null,pollId=null,cdId=null,pingSeconds=120;

async function reportEmergency(){
  const btn=document.getElementById('sosBtn');
  btn.disabled=true;btn.textContent='Sending...';
  try{
    const r=await fetch('/api/incidents/sos',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({hotel_id:HOTEL_ID,room:ROOM,floor:parseInt(FLOOR),type:'sos',language:LANG})});
    const d=await r.json();
    incidentId=d.incident_id;dmToken=d.deadman_token;
    btn.style.display='none';
    document.getElementById('resp').style.display='flex';
    if(d.exit_instruction){document.getElementById('evac').style.display='block';document.getElementById('evac').textContent='🚪 '+d.exit_instruction;}
    if(dmToken)startHeartbeat();
    startPolling();
  }catch(e){btn.disabled=false;btn.textContent='🆘 Report Emergency';alert('Failed. Please call the front desk.');}
}

async function respond(type){
  if(!incidentId)return;
  await fetch('/api/guests/locations/respond',{method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({hotel_id:HOTEL_ID,room:ROOM,floor:parseInt(FLOOR),response:type,incident_id:incidentId})});
  document.getElementById('resp').style.display='none';
}

function startHeartbeat(){
  document.getElementById('hb').style.display='block';pingSeconds=120;
  cdId=setInterval(()=>{pingSeconds--;
    const m=Math.floor(pingSeconds/60),s=pingSeconds%60;
    document.getElementById('cd').textContent='Next ping in: '+m+':'+(s<10?'0'+s:s);
    if(pingSeconds<=0)ping();
  },1000);
}

async function ping(){
  pingSeconds=120;
  await fetch('/api/guests/deadman/ping',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:dmToken})}).catch(()=>{});
}

function startPolling(){
  pollId=setInterval(async()=>{
    try{
      const r=await fetch('/api/incidents/sos/status?hotel_id='+HOTEL_ID+'&floor='+FLOOR);
      const d=await r.json();
      const inc=d.incidents?.find(i=>i._id===incidentId);
      if(inc){
        const banner=document.getElementById('alert');
        banner.style.display='block';
        banner.textContent='⚠️ '+(inc.guest_alert_en||'Emergency in progress. Follow staff instructions.');
        if(inc.status==='resolved'){
          clearInterval(pollId);clearInterval(cdId);
          document.getElementById('alert').style.display='none';
          document.getElementById('clear').style.display='block';
          document.getElementById('hb').style.display='none';
        }
      }
    }catch(e){}
  },15000);
}
</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  })
);

// ── Guest SOS submission (public) ────────────────────────────────────────────

/** POST /api/incidents/sos */
router.post(
  "/sos",
  sosRateLimit,
  asyncHandler(async (req, res) => {
    const { hotel_id, room, floor } = req.body;
    if (!hotel_id || !room || !floor)
      return res.status(400).json({ error: "hotel_id, room, floor required" });
    const result = await svc.handleGuestSOS(hotel_id, req.body);
    res.status(201).json(result);
  })
);

/** GET /api/incidents/sos/status  — guest portal polls this every 15 s */
router.get(
  "/sos/status",
  asyncHandler(async (req, res) => {
    const { hotel_id, floor } = req.query;
    if (!hotel_id || !floor) return res.status(400).json({ error: "hotel_id and floor required" });
    const incidents = await svc.getSOSStatus(hotel_id, floor);
    res.json({ incidents });
  })
);

// ── Staff / manager incident management ──────────────────────────────────────

/** POST /api/incidents  — create incident manually */
router.post(
  "/",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    const { type, floor } = req.body;
    if (!type || !floor) return res.status(400).json({ error: "type and floor required" });
    const incident = await svc.createIncident(req.user.profile.hotel_id, req.body);
    res.status(201).json(incident);
  })
);

/** GET /api/incidents  — list incidents */
router.get(
  "/",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    res.json(await svc.listIncidents(req.user.profile.hotel_id, req.query));
  })
);

/** GET /api/incidents/:id  — single incident */
router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const incident = await svc.getIncident(req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    if (String(incident.hotel_id) !== String(req.user.profile.hotel_id))
      return res.status(403).json({ error: "Access denied" });
    res.json(incident);
  })
);

/** PATCH /api/incidents/:id  — manager actions */
router.patch(
  "/:id",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { action } = req.body;
    if (!action) return res.status(400).json({ error: "action required" });

    // Verify hotel scope BEFORE applying the action
    const existing = await svc.getIncident(req.params.id);
    if (!existing) return res.status(404).json({ error: "Incident not found" });
    if (String(existing.hotel_id) !== String(req.user.profile.hotel_id))
      return res.status(403).json({ error: "Access denied" });

    const incident = await svc.applyManagerAction(req.params.id, action);
    res.json(incident);
  })
);

/** GET /api/incidents/:id/tasks  — task list for incident */
router.get(
  "/:id/tasks",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Verify hotel scope before returning task data
    const incident = await svc.getIncident(req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    if (String(incident.hotel_id) !== String(req.user.profile.hotel_id))
      return res.status(403).json({ error: "Access denied" });
    res.json(await svc.listTasks(req.params.id));
  })
);

/** PATCH /api/incidents/:id/tasks  — accept/start/complete/skip a task */
router.patch(
  "/:id/tasks",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    const { action, notes } = req.body;
    const { task_id } = req.query;
    if (!task_id) return res.status(400).json({ error: "task_id query param required" });
    const task = await svc.applyTaskAction(
      req.params.id, task_id,
      req.user.profile._id, req.user.profile.hotel_id,
      action, notes
    );
    res.json(task);
  })
);

module.exports = router;
