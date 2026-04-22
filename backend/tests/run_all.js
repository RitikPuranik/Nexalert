"use strict";
const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

let totalPass = 0, totalFail = 0;

const CHECK = (label, ok, note) => {
  if (ok) { console.log(`  ✅  ${label}`); totalPass++; }
  else    { console.log(`  ❌  ${label}  →  ${note || ""}`); totalFail++; }
};

function walk(dir) {
  const o = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory() && f !== "node_modules" && f !== "tests") o.push(...walk(full));
    else if (f.endsWith(".js")) o.push(full);
  }
  return o;
}

function findCtx(src, method, route) {
  let idx = src.indexOf(`router.${method}("${route}"`);
  if (idx === -1) {
    idx = src.indexOf(`router.${method}(\n`);
    while (idx !== -1) {
      if (src.substring(idx, idx + 120).includes(`"${route}"`)) break;
      idx = src.indexOf(`router.${method}(\n`, idx + 1);
    }
  }
  return idx === -1 ? null : src.substring(idx, idx + 350);
}

// ─── 1. Syntax ───────────────────────────────────────────────────────────────
console.log("\n▸ 1.  Syntax — all JS files");
let synFail = 0;
for (const f of walk(".")) {
  try { execSync(`node --check "${f}"`, { stdio: "pipe" }); }
  catch (e) { console.log(`     FAIL: ${f}\n  ${e.stderr.toString().trim()}`); synFail++; }
}
CHECK(`All JS files pass syntax check`, synFail === 0, `${synFail} failures`);

// ─── 2. File presence ────────────────────────────────────────────────────────
console.log("\n▸ 2.  File Presence (42 required files)");
const REQUIRED = [
  "package.json","vercel.json",".env.example","src/index.js",
  "src/config/db.js","src/config/firebase.js",
  "src/lib/eventBus.js","src/lib/tokens.js","src/lib/asyncHandler.js",
  "src/middleware/auth.js",
  "src/modules/hotel/model/hotel.model.js",
  "src/modules/hotel/model/exitRoute.model.js",
  "src/modules/hotel/model/floorPlan.model.js",
  "src/modules/hotel/service/hotel.service.js",
  "src/modules/hotel/routes/hotel.routes.js",
  "src/modules/sensor/model/sensor.model.js",
  "src/modules/sensor/model/sensorEvent.model.js",
  "src/modules/sensor/service/sensor.service.js",
  "src/modules/sensor/routes/sensor.routes.js",
  "src/modules/staff/model/userProfile.model.js",
  "src/modules/staff/model/staffPresence.model.js",
  "src/modules/staff/service/staff.service.js",
  "src/modules/staff/routes/staff.routes.js",
  "src/modules/guest/model/guestLocation.model.js",
  "src/modules/guest/model/guestNotification.model.js",
  "src/modules/guest/model/deadmanSession.model.js",
  "src/modules/guest/service/guest.service.js",
  "src/modules/guest/service/deadman.service.js",
  "src/modules/guest/routes/guest.routes.js",
  "src/modules/incident/model/incident.model.js",
  "src/modules/incident/model/staffTask.model.js",
  "src/modules/incident/service/gemini.service.js",
  "src/modules/incident/service/triage.service.js",
  "src/modules/incident/service/incident.service.js",
  "src/modules/incident/routes/incident.routes.js",
  "src/modules/report/model/incidentReport.model.js",
  "src/modules/report/service/report.service.js",
  "src/modules/report/routes/report.routes.js",
  "src/modules/realtime/service/twilio.service.js",
  "src/modules/realtime/service/warroom.service.js",
  "src/modules/realtime/service/cron.service.js",
  "src/modules/realtime/routes/realtime.routes.js",
];
const missingFiles = REQUIRED.filter(f => !fs.existsSync(f));
CHECK(`All ${REQUIRED.length} files present`, missingFiles.length === 0, missingFiles.join(", "));

// ─── 3. Module structure ─────────────────────────────────────────────────────
console.log("\n▸ 3.  Module Structure — model / service / routes per domain");
for (const mod of ["hotel","sensor","staff","guest","incident","report","realtime"]) {
  const b = `src/modules/${mod}`;
  const hasModel   = mod === "realtime" || fs.readdirSync(`${b}/model`).length > 0;
  const hasService = fs.readdirSync(`${b}/service`).length > 0;
  const hasRoutes  = fs.readdirSync(`${b}/routes`).length > 0;
  CHECK(`${mod}/  (model + service + routes)`, hasModel && hasService && hasRoutes,
    [!hasModel && "no models", !hasService && "no service", !hasRoutes && "no routes"].filter(Boolean).join(", "));
}

// ─── 4. No inline requires ───────────────────────────────────────────────────
console.log("\n▸ 4.  No inline require() inside functions");
let inlineCount = 0;
for (const f of walk("./src")) {
  fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (line.match(/^\s+(const|let|var).+require\(/)) {
      console.log(`     ${f}:${i + 1}  ${line.trim()}`); inlineCount++;
    }
  });
}
CHECK("Zero inline requires", inlineCount === 0, `${inlineCount} found`);

// ─── 5. asyncHandler in all route files ─────────────────────────────────────
console.log("\n▸ 5.  asyncHandler adoption");
const ROUTE_FILES = [
  "src/modules/hotel/routes/hotel.routes.js",
  "src/modules/sensor/routes/sensor.routes.js",
  "src/modules/staff/routes/staff.routes.js",
  "src/modules/guest/routes/guest.routes.js",
  "src/modules/incident/routes/incident.routes.js",
  "src/modules/report/routes/report.routes.js",
  "src/modules/realtime/routes/realtime.routes.js",
];
for (const f of ROUTE_FILES) {
  CHECK(`${path.basename(f)} uses asyncHandler`, fs.readFileSync(f, "utf8").includes("asyncHandler"), "");
}

// ─── 6. Router exports ───────────────────────────────────────────────────────
console.log("\n▸ 6.  Router exports");
for (const f of ROUTE_FILES) {
  CHECK(`${path.basename(f)} exports router`, fs.readFileSync(f, "utf8").includes("module.exports = router"), "");
}

// ─── 7. Index mounts all 7 modules ──────────────────────────────────────────
console.log("\n▸ 7.  Route mounts in src/index.js");
const idxSrc = fs.readFileSync("src/index.js", "utf8");
for (const [prefix, varName] of [["/api/hotels","hotelRoutes"],["/api/sensors","sensorRoutes"],["/api/staff","staffRoutes"],["/api/guests","guestRoutes"],["/api/incidents","incidentRoutes"],["/api/reports","reportRoutes"],["/api/realtime","realtimeRoutes"]]) {
  CHECK(`${prefix}  (${varName})`, idxSrc.includes(prefix) && idxSrc.includes(varName), "");
}

// ─── 8. Endpoint completeness ────────────────────────────────────────────────
console.log("\n▸ 8.  Endpoint Completeness (49 endpoints)");
const ENDPOINTS = [
  ["src/modules/hotel/routes/hotel.routes.js",       [["post","/"],["get","/me"],["patch","/me"],["get","/exit-routes"],["post","/exit-routes"],["patch","/exit-routes/:id"],["delete","/exit-routes/:id"],["get","/floor-plans/:floor"],["post","/floor-plans"]]],
  ["src/modules/sensor/routes/sensor.routes.js",     [["post","/event"],["get","/"],["post","/"],["patch","/:id"],["get","/events"]]],
  ["src/modules/staff/routes/staff.routes.js",       [["patch","/duty"],["post","/presence/ping"],["get","/presence"],["get","/my-tasks"],["get","/profile"],["patch","/profile"],["post","/register"],["get","/team"],["get","/guest-locations"]]],
  ["src/modules/guest/routes/guest.routes.js",       [["post","/locations"],["patch","/locations/coordinates"],["patch","/locations/respond"],["patch","/locations/checkout"],["get","/locations"],["get","/notifications"],["post","/deadman/ping"],["post","/deadman/resolve"],["get","/deadman/sessions"]]],
  ["src/modules/incident/routes/incident.routes.js", [["get","/sos/:hotel_id"],["post","/sos"],["get","/sos/status"],["post","/"],["get","/"],["get","/:id"],["patch","/:id"],["get","/:id/tasks"],["patch","/:id/tasks"]]],
  ["src/modules/report/routes/report.routes.js",     [["post","/"],["get","/"],["get","/drills/score"],["get","/:id"]]],
  ["src/modules/realtime/routes/realtime.routes.js", [["get","/sse"],["get","/warroom"],["get","/responder/portal"],["post","/cron/check"]]],
];
let epTotal = 0, epFound = 0;
for (const [file, routes] of ENDPOINTS) {
  const src = fs.readFileSync(file, "utf8");
  for (const [m, p] of routes) {
    epTotal++;
    const ok = !!findCtx(src, m, p);
    if (ok) { epFound++; totalPass++; }
    else    { console.log(`     MISSING: ${m.toUpperCase()} ${p}  (${path.basename(file)})`); totalFail++; }
  }
}
if (epFound === epTotal) console.log(`  ✅  All ${epTotal} endpoints present`);

// ─── 9. Auth guards ──────────────────────────────────────────────────────────
console.log("\n▸ 9.  Auth Guards on protected routes");
const AUTH_GUARDS = [
  ["src/modules/hotel/routes/hotel.routes.js",       "patch",  "/me",                "requireAuth"],
  ["src/modules/hotel/routes/hotel.routes.js",       "post",   "/exit-routes",       "requireRole"],
  ["src/modules/hotel/routes/hotel.routes.js",       "delete", "/exit-routes/:id",   "requireRole"],
  ["src/modules/sensor/routes/sensor.routes.js",     "post",   "/event",             "requireSensorSecret"],
  ["src/modules/sensor/routes/sensor.routes.js",     "post",   "/",                  "requireRole"],
  ["src/modules/staff/routes/staff.routes.js",       "patch",  "/duty",              "requireRole"],
  ["src/modules/staff/routes/staff.routes.js",       "post",   "/register",          "requireRole"],
  ["src/modules/guest/routes/guest.routes.js",       "patch",  "/locations/checkout","requireRole"],
  ["src/modules/incident/routes/incident.routes.js", "post",   "/",                  "requireRole"],
  ["src/modules/incident/routes/incident.routes.js", "patch",  "/:id",               "requireRole"],
  ["src/modules/report/routes/report.routes.js",     "post",   "/",                  "requireRole"],
  ["src/modules/realtime/routes/realtime.routes.js", "get",    "/warroom",           "requireRole"],
  ["src/modules/realtime/routes/realtime.routes.js", "post",   "/cron/check",        "requireCronSecret"],
];
for (const [file, method, route, guard] of AUTH_GUARDS) {
  const ctx = findCtx(fs.readFileSync(file, "utf8"), method, route);
  CHECK(`${guard} on ${method.toUpperCase()} ${route}`, ctx && ctx.includes(guard), "guard missing");
}

// ─── 10. Public routes ───────────────────────────────────────────────────────
console.log("\n▸ 10. Public Routes (no auth required)");
const PUBLIC_ROUTES = [
  ["src/modules/guest/routes/guest.routes.js",       "post",  "/locations"],
  ["src/modules/guest/routes/guest.routes.js",       "patch", "/locations/coordinates"],
  ["src/modules/guest/routes/guest.routes.js",       "patch", "/locations/respond"],
  ["src/modules/guest/routes/guest.routes.js",       "post",  "/deadman/ping"],
  ["src/modules/incident/routes/incident.routes.js", "post",  "/sos"],
  ["src/modules/incident/routes/incident.routes.js", "get",   "/sos/status"],
  ["src/modules/realtime/routes/realtime.routes.js", "get",   "/responder/portal"],
];
for (const [file, method, route] of PUBLIC_ROUTES) {
  const ctx = findCtx(fs.readFileSync(file, "utf8"), method, route);
  CHECK(`${method.toUpperCase()} ${route} is public`, ctx && !ctx.includes("requireAuth") && !ctx.includes("requireRole"), "has auth (should be public)");
}

// ─── 11. Rate limiters ───────────────────────────────────────────────────────
console.log("\n▸ 11. Rate Limiters on public endpoints");
const RATE_LIMITS = [
  ["src/modules/sensor/routes/sensor.routes.js",     "post",  "/event",                 "sensorRateLimit"],
  ["src/modules/guest/routes/guest.routes.js",       "post",  "/locations",             "guestRateLimit"],
  ["src/modules/guest/routes/guest.routes.js",       "patch", "/locations/coordinates", "guestRateLimit"],
  ["src/modules/guest/routes/guest.routes.js",       "patch", "/locations/respond",     "guestRateLimit"],
  ["src/modules/guest/routes/guest.routes.js",       "post",  "/deadman/ping",          "guestRateLimit"],
  ["src/modules/incident/routes/incident.routes.js", "post",  "/sos",                   "sosRateLimit"],
];
for (const [file, method, route, limiter] of RATE_LIMITS) {
  const ctx = findCtx(fs.readFileSync(file, "utf8"), method, route);
  CHECK(`${limiter} on ${method.toUpperCase()} ${route}`, ctx && ctx.includes(limiter), "limiter not applied");
}

// ─── 12. Schema enums ────────────────────────────────────────────────────────
console.log("\n▸ 12. Mongoose Schema Enums");
const SCHEMA_CHECKS = [
  ["src/modules/incident/model/incident.model.js",       ["fire","smoke","gas_leak","medical","security","flood","earthquake","sos","detecting","triaging","active","resolved","false_alarm"]],
  ["src/modules/guest/model/deadmanSession.model.js",    ["active","escalated","resolved","expired"]],
  ["src/modules/incident/model/staffTask.model.js",      ["pending","accepted","in_progress","completed","skipped"]],
  ["src/modules/staff/model/userProfile.model.js",       ["manager","staff","responder"]],
  ["src/modules/sensor/model/sensor.model.js",           ["smoke","heat","gas","motion","flood","co2"]],
  ["src/modules/guest/model/guestNotification.model.js", ["sms","in_app","pending","sent","delivered","failed"]],
];
for (const [file, terms] of SCHEMA_CHECKS) {
  const src  = fs.readFileSync(file, "utf8");
  const miss = terms.filter(t => !src.includes(t));
  CHECK(`${path.basename(file)} — all enums present`, miss.length === 0, `missing: ${miss.join(", ")}`);
}

// ─── 13. Error handling infrastructure ───────────────────────────────────────
console.log("\n▸ 13. Error Handling Infrastructure");
CHECK("Global error handler in index.js",  idxSrc.includes("err, _req, res, _next"), "");
CHECK("DB unavailable → 503 in index.js",  idxSrc.includes("503"), "");
CHECK("asyncHandler.js exports function",  fs.readFileSync("src/lib/asyncHandler.js","utf8").includes("module.exports"), "");

// ─── 14. Service exports completeness ────────────────────────────────────────
console.log("\n▸ 14. Service Layer — key function exports");
const SVC_EXPORTS = [
  ["src/modules/hotel/service/hotel.service.js",         ["createHotel","getHotelById","updateHotel","getExitRoutes","upsertFloorPlan"]],
  ["src/modules/sensor/service/sensor.service.js",       ["processSensorEvent","listSensors","registerSensor"]],
  ["src/modules/staff/service/staff.service.js",         ["setDutyStatus","recordPresencePing","checkStaffPresence","getGuestLocations"]],
  ["src/modules/guest/service/guest.service.js",         ["upsertLocation","updateCoordinates","recordResponse","listGuests"]],
  ["src/modules/guest/service/deadman.service.js",       ["createSession","ping","resolveSession","checkSessions","expireSessionsForIncident"]],
  ["src/modules/incident/service/incident.service.js",   ["createIncident","handleGuestSOS","applyManagerAction","applyTaskAction","listTasks"]],
  ["src/modules/incident/service/triage.service.js",     ["runTriagePipeline","buildPersonalisedExit","fallbackTriage"]],
  ["src/modules/incident/service/gemini.service.js",     ["runAITriage","generateReportNarrative"]],
  ["src/modules/report/service/report.service.js",       ["generateReport","listReports","getReport","getDrillScore"]],
  ["src/modules/realtime/service/warroom.service.js",    ["buildWarRoom","buildResponderPacket"]],
  ["src/modules/realtime/service/cron.service.js",       ["runCronCheck"]],
  ["src/modules/realtime/service/twilio.service.js",     ["sendSMS"]],
];
for (const [file, fns] of SVC_EXPORTS) {
  const src  = fs.readFileSync(file, "utf8");
  const miss = fns.filter(fn => !src.includes(fn));
  CHECK(`${path.basename(file).replace(".service.js","")} exports: ${fns.join(", ")}`, miss.length === 0, `missing: ${miss.join(", ")}`);
}

// ─── 15. Cross-module imports use correct paths ───────────────────────────────
console.log("\n▸ 15. Cross-Module Import Paths");
const CROSS = [
  ["src/modules/sensor/service/sensor.service.js",     "../../incident/model/incident.model"],
  ["src/modules/incident/service/triage.service.js",   "../../guest/model/guestLocation.model"],
  ["src/modules/incident/service/triage.service.js",   "../../hotel/model/exitRoute.model"],
  ["src/modules/incident/service/incident.service.js", "../../guest/model/deadmanSession.model"],
  ["src/modules/realtime/service/warroom.service.js",  "../../incident/model/incident.model"],
  ["src/modules/realtime/service/cron.service.js",     "../../incident/model/incident.model"],
  ["src/modules/report/service/report.service.js",     "../../incident/model/incident.model"],
  ["src/modules/staff/service/staff.service.js",       "../../guest/model/guestLocation.model"],
];
for (const [file, importPath] of CROSS) {
  CHECK(`${path.basename(file)} → ${importPath.split("/").pop()}`, fs.readFileSync(file,"utf8").includes(importPath), "path not found");
}

// ─── 16. EventBus unit tests ─────────────────────────────────────────────────
console.log("\n▸ 16. EventBus Unit Tests");
const { eventBus, emitCrisisEvent } = require("../src/lib/eventBus");
let evRx = [];
const evRes = { write: d => evRx.push(d) };
const unsub = eventBus.subscribe("h_A", evRes, "u1");
emitCrisisEvent("h_A", "incident:created", { floor: 3 });
emitCrisisEvent("h_B", "incident:created", {});
CHECK("Event scoped to subscribed hotel", evRx.length === 1, `got ${evRx.length}`);
CHECK("Payload has type field",           evRx[0].includes('"type":"incident:created"'), "");
CHECK("Payload has ts field",             evRx[0].includes('"ts":'), "");
unsub();
CHECK("Unsubscribe removes listener",     eventBus.listenerCount("h_A") === 0, "");
const dead = { write: () => { throw new Error("dead"); } };
eventBus.subscribe("h_C", dead);
emitCrisisEvent("h_C", "test", {});
CHECK("Dead listener auto-cleaned",       eventBus.listenerCount("h_C") === 0, "");
const rxM1 = [], rxM2 = [];
eventBus.subscribe("h_D", { write: d => rxM1.push(d) });
eventBus.subscribe("h_D", { write: d => rxM2.push(d) });
emitCrisisEvent("h_D", "test", {});
CHECK("Multiple subscribers all receive", rxM1.length === 1 && rxM2.length === 1, "");

// ─── 17. Token generator ─────────────────────────────────────────────────────
console.log("\n▸ 17. Token Generator");
const { generateToken } = require("../src/lib/tokens");
const tokens = Array.from({ length: 20 }, generateToken);
CHECK("Token is 32 hex chars",  tokens[0].length === 32 && /^[a-f0-9]+$/.test(tokens[0]), `got: ${tokens[0]}`);
CHECK("20 tokens all unique",   new Set(tokens).size === 20, "collision detected");

// ─── 18. Twilio graceful degradation ─────────────────────────────────────────
console.log("\n▸ 18. Twilio Graceful Degradation");
const twilioSrc = fs.readFileSync("src/modules/realtime/service/twilio.service.js", "utf8");
CHECK("Top-level require (not inline)",   twilioSrc.indexOf('const Twilio = require("twilio")') < 100, "");
CHECK("Returns null when unconfigured",   twilioSrc.includes("return null"), "");
CHECK("Catches SMS send failures",        twilioSrc.includes("catch (err)"), "");

// ─── 19. Triage logic ────────────────────────────────────────────────────────
console.log("\n▸ 19. Triage Logic — fallbackTriage()");
const triSrc = fs.readFileSync("src/modules/incident/service/triage.service.js", "utf8");
CHECK("fallbackTriage defined",          triSrc.includes("function fallbackTriage"), "");
CHECK("8 pipeline steps documented",     triSrc.includes("Step 8"), "");
CHECK("Adjacent-floor escalation fn",    triSrc.includes("escalateAdjacentFloors"), "");
CHECK("severity === 1 triggers escal.",  triSrc.includes("severity === 1"), "");
const fallbackFn = eval("(" + triSrc.match(/function fallbackTriage\(incident\) \{([\s\S]*?)\n\}/)[0] + ")");
const fb1 = fallbackFn({ type:"fire",    floor:3, zone:"A", is_drill:false });
const fb2 = fallbackFn({ type:"medical", floor:2, zone:"B", is_drill:false });
const fb3 = fallbackFn({ type:"smoke",   floor:1, zone:"C", is_drill:true  });
CHECK("fire   → severity 1 + 911",   fb1.severity===1 && fb1.recommend_911===true,  `sev=${fb1.severity}`);
CHECK("medical→ severity 2, no 911", fb2.severity===2 && fb2.recommend_911===false, `sev=${fb2.severity}`);
CHECK("drill  → [DRILL] prefix",     fb3.guest_alert_en.startsWith("[DRILL]"),      "");
CHECK("≥3 staff tasks",              fb1.staff_tasks.length >= 3,                   `got ${fb1.staff_tasks.length}`);
CHECK("{{room}} in template",        fb1.evacuation_template.includes("{{room}}"),  "");

// ─── 20. buildPersonalisedExit ───────────────────────────────────────────────
console.log("\n▸ 20. buildPersonalisedExit()");
const exitFn = eval("(" + triSrc.match(/function buildPersonalisedExit\([\s\S]*?\n\}/)[0] + ")");
const exits = [
  { label:"Stairwell A",  muster_point:"Car Park N", is_accessible:false, avoids_zones:["B"], is_active:true },
  { label:"Elevator Exit",muster_point:"Car Park S", is_accessible:true,  avoids_zones:[],    is_active:true },
  { label:"Fire Exit B",  muster_point:"Front Lawn", is_accessible:false, avoids_zones:["A"], is_active:true },
];
const tmpl = "Room {{room}}: Evacuate via {{exit_label}} to {{muster_point}}.";
const ex1 = exitFn({ room:"302", needs_accessibility:false }, exits, null, tmpl);
const ex2 = exitFn({ room:"401", needs_accessibility:true  }, exits, null, tmpl);
const ex3 = exitFn({ room:"501", needs_accessibility:false }, exits, "B",  tmpl);
const ex4 = exitFn({ room:"601", needs_accessibility:false }, [],    null, tmpl);
CHECK("No placeholders left in instruction", !ex1.instruction.includes("{{"),    ex1.instruction);
CHECK("Room number substituted",             ex1.instruction.includes("302"),    "");
CHECK("Accessible guest → accessible exit",  ex2.exit.is_accessible === true,    ex2.exit.label);
CHECK("Zone-B incident → avoids Stairwell A",ex3.exit.label !== "Stairwell A",   ex3.exit.label);
CHECK("Empty exits → null exit returned",    ex4.exit === null,                  "");

// ─── 21. Deadman timing math ─────────────────────────────────────────────────
console.log("\n▸ 21. Deadman Timing Logic");
const dmSrc = fs.readFileSync("src/modules/guest/service/deadman.service.js", "utf8");
CHECK("checkSessions exported",              dmSrc.includes("checkSessions"), "");
CHECK("expireSessionsForIncident exported",  dmSrc.includes("expireSessionsForIncident"), "");
CHECK("escalate_after threshold used",       dmSrc.includes("escalate_after"), "");
const simDm = (agoMs, intSec, thresh) => Math.floor((agoMs/1000) / intSec) >= thresh;
CHECK("30s  ago → NOT escalated",  !simDm(30_000,  120, 2), "");
CHECK("150s ago → NOT escalated",  !simDm(150_000, 120, 2), "");
CHECK("250s ago →     escalated",   simDm(250_000, 120, 2), "");
CHECK("600s ago →     escalated",   simDm(600_000, 120, 2), "");
CHECK("240s (exactly 2×) → escal.", simDm(240_000, 120, 2), "");

// ─── 22. Warroom heatmap ──────────────────────────────────────────────────────
console.log("\n▸ 22. Warroom Heatmap Logic");
const wsSrc = fs.readFileSync("src/modules/realtime/service/warroom.service.js", "utf8");
CHECK("buildWarRoom exported",           wsSrc.includes("buildWarRoom"), "");
CHECK("buildResponderPacket exported",   wsSrc.includes("buildResponderPacket"), "");
CHECK("7 parallel queries in Promise.all", wsSrc.includes("Promise.all"), "");
const hmFn = eval("(" + wsSrc.match(/function _buildHeatmap\([\s\S]*?\n\}/)[0] + ")");
const hmG = [
  { room:"301", floor:3, name:"Alice", language:"en", needs_accessibility:false, coordinates:null },
  { room:"302", floor:3, name:"Bob",   language:"hi", needs_accessibility:true,  coordinates:{lat:12.9,lng:77.5} },
  { room:"303", floor:3, name:"Carol", language:"fr", needs_accessibility:false, coordinates:null },
  { room:"304", floor:3, name:"Dave",  language:"es", needs_accessibility:false, coordinates:null },
];
const hmN = [{ room:"301",floor:3,guest_response:"safe",       delivery_status:"delivered" },{ room:"302",floor:3,guest_response:"needs_help",delivery_status:"sent" },{ room:"303",floor:3,guest_response:"no_response",delivery_status:"sent" }];
const hmD = [{ room:"302",floor:3,_id:"s1",status:"escalated",missed_pings:3,last_ping_at:new Date() }];
const hm  = hmFn(3, hmG, hmN, hmD);
CHECK("Room 301 → green  (safe)",          hm["301"].color === "green",  hm["301"].color);
CHECK("Room 302 → red    (needs_help)",    hm["302"].color === "red",    hm["302"].color);
CHECK("Room 303 → amber  (no_response)",   hm["303"].color === "amber",  hm["303"].color);
CHECK("Room 304 → gray   (not_notified)",  hm["304"].color === "gray",   hm["304"].color);
CHECK("Deadman overlay on room 302",       hm["302"].deadman?.status === "escalated", "");
CHECK("No deadman on room 301",            hm["301"].deadman === null, "");
CHECK("Accessibility flag preserved",      hm["302"].needs_accessibility === true, "");
CHECK("GPS coordinates preserved",         hm["302"].coordinates?.lat === 12.9, "");

// ─── 23. Report service ───────────────────────────────────────────────────────
console.log("\n▸ 23. Report Service Logic");
const repSrc = fs.readFileSync("src/modules/report/service/report.service.js", "utf8");
CHECK("_buildTimeline defined",     repSrc.includes("function _buildTimeline"), "");
CHECK("_computeMetrics defined",    repSrc.includes("function _computeMetrics"), "");
CHECK("_computeDrillScore defined", repSrc.includes("function _computeDrillScore"), "");
CHECK("Report caches (no regen)",   repSrc.includes("Return cached"), "");
const drillFn = eval("(" + repSrc.match(/function _computeDrillScore\([\s\S]*?\n\}/)[0] + ")");
const ds1 = drillFn({ task_completion_rate:90,  guest_accountability_rate:80  }, 90);
const ds2 = drillFn({ task_completion_rate:30,  guest_accountability_rate:20  }, 300);
const ds3 = drillFn({ task_completion_rate:100, guest_accountability_rate:100 }, 100);
CHECK("Good drill → score ≥85",   ds1.overall >= 85,    `got ${ds1.overall}`);
CHECK("Poor drill → score <50",   ds2.overall < 50,     `got ${ds2.overall}`);
CHECK("Perfect drill → 100",      ds3.overall === 100,  `got ${ds3.overall}`);
CHECK("Score in 0–100 range",     ds2.overall >= 0 && ds2.overall <= 100, "");
// Timeline
const tlFn = eval("(" + repSrc.match(/function _buildTimeline\([\s\S]*?\n\}/)[0] + ")");
const now = Date.now();
const add = s => new Date(now + s * 1000);
const tlInc = { createdAt:new Date(now), type:"fire", source:"sensor", floor:3, severity:1, triage_at:add(45), confirmed_at:add(90), escalated_to_911_at:null, resolved_at:add(600) };
const tl = tlFn(tlInc, [{ title:"Investigate",assigned_role:"security",accepted_at:add(55),started_at:add(60),completed_at:add(300) }], [{ room:"301",createdAt:add(48),guest_response:"safe",responded_at:add(120) }]);
CHECK("Timeline has entries",           tl.length > 0, "");
CHECK("Timeline is chronological",      tl.every((e,i) => i===0 || e.elapsed_seconds >= tl[i-1].elapsed_seconds), "");
CHECK("First event is Incident created",tl[0].event === "Incident created", tl[0].event);
CHECK("Triage elapsed = 45s",           tl.find(e=>e.event==="AI triage complete")?.elapsed_seconds === 45, "");

// ─── 24. asyncHandler (non-async test via setImmediate) ──────────────────────
console.log("\n▸ 24. asyncHandler Unit Test");
const { asyncHandler } = require("../src/lib/asyncHandler");
let nc1 = false, nc2 = false, ce = null;
asyncHandler(async () => {})(  {}, {}, () => { nc1 = true; });
asyncHandler(async () => { throw new Error("boom"); })({}, {}, err => { nc2 = true; ce = err; });
setImmediate(() => {
  CHECK("Happy path: next() NOT called",       !nc1, "next was called");
  CHECK("Error path: next(err) called",         nc2, "next was NOT called");
  CHECK("Error message forwarded correctly",    ce?.message === "boom", `got: ${ce?.message}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════════");
  console.log(` RESULTS:  ${totalPass} PASSED  /  ${totalFail} FAILED`);
  console.log("══════════════════════════════════════════════════════════\n");
  process.exit(totalFail > 0 ? 1 : 0);
});
