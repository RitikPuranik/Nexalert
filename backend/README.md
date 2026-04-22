# NexAlert Backend v2 — Hotel Emergency Response System

A fully modular Express.js + MongoDB backend. Monitors a hotel for crises, automatically triages them with AI, coordinates staff, communicates with guests in their own language, and tracks every person in the building until the incident is resolved.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | MongoDB (Mongoose ODM) |
| Auth | Firebase Admin SDK (JWT) |
| AI | Google Gemini 2.5 Flash |
| SMS | Twilio (optional — falls back to in-app) |
| Realtime | Custom SSE pub/sub (no third-party socket service) |
| Deploy | Vercel (serverless) |

---

## Module Structure

Each domain is **fully self-contained** — model, service, and routes live together.

```
src/
├── index.js                          ← Express app entry point
├── config/
│   ├── db.js                         ← MongoDB lazy connection (serverless-safe)
│   └── firebase.js                   ← Firebase Admin SDK singleton
├── lib/
│   ├── eventBus.js                   ← In-process SSE pub/sub singleton
│   ├── tokens.js                     ← UUID-based deadman token generator
│   └── asyncHandler.js               ← Async route error wrapper (no try/catch boilerplate)
├── middleware/
│   └── auth.js                       ← JWT, requireRole, sensor/cron secrets
└── modules/
    ├── hotel/                        ← Hotel, ExitRoute, FloorPlan
    │   ├── model/
    │   │   ├── hotel.model.js
    │   │   ├── exitRoute.model.js
    │   │   └── floorPlan.model.js
    │   ├── service/hotel.service.js
    │   └── routes/hotel.routes.js
    ├── sensor/                       ← Sensor, SensorEvent + ESP32 ingestion
    │   ├── model/
    │   │   ├── sensor.model.js
    │   │   └── sensorEvent.model.js
    │   ├── service/sensor.service.js
    │   └── routes/sensor.routes.js
    ├── staff/                        ← UserProfile, StaffPresence
    │   ├── model/
    │   │   ├── userProfile.model.js
    │   │   └── staffPresence.model.js
    │   ├── service/staff.service.js
    │   └── routes/staff.routes.js
    ├── guest/                        ← GuestLocation, GuestNotification, DeadmanSession
    │   ├── model/
    │   │   ├── guestLocation.model.js
    │   │   ├── guestNotification.model.js
    │   │   └── deadmanSession.model.js
    │   ├── service/
    │   │   ├── guest.service.js
    │   │   └── deadman.service.js
    │   └── routes/guest.routes.js
    ├── incident/                     ← Incident, StaffTask + full triage pipeline
    │   ├── model/
    │   │   ├── incident.model.js
    │   │   └── staffTask.model.js
    │   ├── service/
    │   │   ├── gemini.service.js     ← Gemini 2.5 Flash AI calls
    │   │   ├── triage.service.js     ← 8-step triage pipeline
    │   │   └── incident.service.js   ← Lifecycle + task management
    │   └── routes/incident.routes.js
    ├── report/                       ← IncidentReport + drill scoring
    │   ├── model/incidentReport.model.js
    │   ├── service/report.service.js
    │   └── routes/report.routes.js
    └── realtime/                     ← SSE stream, War Room, Responder portal, Cron
        ├── service/
        │   ├── twilio.service.js
        │   ├── warroom.service.js
        │   └── cron.service.js
        └── routes/realtime.routes.js
```

---

## Quick Start

```bash
npm install
cp .env.example .env   # fill in all values
npm run dev            # starts on http://localhost:3001
```

---

## Environment Variables

```env
# Server
PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000

# MongoDB
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/nexalert

# Firebase Admin SDK — paste your serviceAccount JSON as a single-line string
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}

# Google Gemini
GEMINI_API_KEY=your_gemini_api_key

# Twilio (optional — falls back to in-app alerts if unset)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890

# Internal secrets
SENSOR_SECRET=change_me_sensor_secret
CRON_SECRET=change_me_cron_secret
```

---

## API Reference

### Authentication

| Who | Method |
|---|---|
| Staff / Manager | `Authorization: Bearer <firebase_jwt>` |
| Sensors (ESP32) | `x-sensor-secret: <SENSOR_SECRET>` header |
| Cron job | `x-cron-secret: <CRON_SECRET>` header OR manager JWT |
| Guests | No auth — QR-scanned URL parameters |
| Responders | No auth — public read-only portal |

---

### Hotel Module — `/api/hotels`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/` | Any auth | Create hotel |
| `GET` | `/me` | Any auth | Get own hotel |
| `PATCH` | `/me` | Manager | Update hotel settings |
| `GET` | `/exit-routes` | Any auth | List exit routes (filter by `?floor=`) |
| `POST` | `/exit-routes` | Manager | Add exit route |
| `PATCH` | `/exit-routes/:id` | Manager | Update exit route |
| `DELETE` | `/exit-routes/:id` | Manager | Delete exit route |
| `GET` | `/floor-plans/:floor` | Any auth | Get floor plan |
| `POST` | `/floor-plans` | Manager | Upsert floor plan |

---

### Sensor Module — `/api/sensors`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/event` | Sensor secret | Ingest ESP32 reading (rate-limited 60/min per sensor) |
| `GET` | `/` | Manager/Staff | List hotel sensors |
| `POST` | `/` | Manager | Register new sensor |
| `PATCH` | `/:id` | Manager | Update sensor settings |
| `GET` | `/events` | Manager | Recent sensor event log |

**Sensor event body:**
```json
{ "sensor_id": "SMOKE_F3_A", "value": 87, "threshold": 50 }
```

---

### Incident Module — `/api/incidents`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/sos/:hotel_id` | Public | Guest QR portal HTML page |
| `POST` | `/sos` | Public | Guest reports emergency (rate-limited 10/min) |
| `GET` | `/sos/status` | Public | Guest portal polls for incident status |
| `POST` | `/` | Manager/Staff | Create incident manually |
| `GET` | `/` | Manager/Staff | List incidents |
| `GET` | `/:id` | Any auth | Single incident |
| `PATCH` | `/:id` | Manager | Apply manager action |
| `GET` | `/:id/tasks` | Any auth | Incident task list |
| `PATCH` | `/:id/tasks?task_id=` | Manager/Staff | Accept / start / complete / skip a task |

**Manager actions (`PATCH /:id`):**
```json
{ "action": "confirm" }       // → active
{ "action": "investigate" }   // → investigating
{ "action": "false_alarm" }   // → false_alarm
{ "action": "resolve" }       // → resolved + all-clear SMS sent
{ "action": "escalate_911" }  // builds responder packet
```

**Task actions (`PATCH /:id/tasks`):**
```json
{ "action": "accept" }
{ "action": "start" }
{ "action": "complete", "notes": "Area cleared" }
{ "action": "skip",    "notes": "Not applicable" }
```

---

### Guest Module — `/api/guests`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/locations` | Public | Check in a guest |
| `PATCH` | `/locations/coordinates` | Public | Push GPS position (called every 15s by QR page) |
| `PATCH` | `/locations/respond` | Public | "I'm Safe" or "I Need Help" |
| `PATCH` | `/locations/checkout` | Manager/Staff | Check out guest |
| `GET` | `/locations` | Manager/Staff | All checked-in guests with GPS |
| `GET` | `/notifications` | Manager/Staff | Per-guest notification records for an incident |
| `POST` | `/deadman/ping` | Public (token) | Guest taps heartbeat button |
| `POST` | `/deadman/resolve` | Manager/Staff | Resolve deadman session after welfare check |
| `GET` | `/deadman/sessions` | Manager/Staff | Active / escalated sessions |

---

### Staff Module — `/api/staff`

| Method | Path | Auth | Description |
|---|---|---|---|
| `PATCH` | `/duty` | Manager/Staff | Toggle on/off duty |
| `POST` | `/presence/ping` | Manager/Staff | Heartbeat + GPS during incident |
| `GET` | `/presence` | Manager/Staff | Active presence records for incident |
| `GET` | `/my-tasks` | Manager/Staff | Own pending/active tasks |
| `GET` | `/profile` | Any auth | Own profile |
| `PATCH` | `/profile` | Any auth | Update name / phone / FCM token |
| `POST` | `/register` | Manager | Register new staff member |
| `GET` | `/team` | Manager | All staff for hotel |
| `GET` | `/guest-locations` | Manager/Staff | Real-time guest GPS (staff = own floor, manager = all) |

---

### Report Module — `/api/reports`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/` | Manager | Generate post-incident report (cached on repeat calls) |
| `GET` | `/` | Manager | List all reports |
| `GET` | `/drills/score?incident_id=` | Manager | Drill evaluation score |
| `GET` | `/:id` | Manager | Single report |

---

### Realtime Module — `/api/realtime`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/sse?hotel_id=` | Bearer JWT | Persistent SSE event stream for staff/manager |
| `GET` | `/sse?hotel_id=&role=responder` | Public | Responder read-only SSE stream |
| `GET` | `/warroom?incident_id=` | Manager/Responder | Full war room dashboard (7 parallel queries) |
| `GET` | `/responder/portal?incident_id=` | **Public** | Complete packet for fire dept / ambulance |
| `POST` | `/cron/check` | Cron secret / Manager | Run deadman + staff presence checks |

---

## The AI Triage Pipeline

Every new incident triggers `runTriagePipeline()` **asynchronously** (non-blocking):

```
Step 1  status → "triaging"
Step 2  Load hotel + floor guests + exit routes  (3 parallel DB queries)
Step 3  Call Gemini 2.5 Flash (temp=0.2)
        → severity (1=CRITICAL / 2=URGENT / 3=MONITOR)
        → manager briefing, responder briefing
        → recommend_911 flag
        → staff tasks with role + priority
        → guest alert in English + all floor languages
        → evacuation template with {{room}} {{exit_label}} {{muster_point}}
        → FALLBACK: hardcoded triage if Gemini fails (never blocks incident)
Step 4  Bulk-insert staff tasks
Step 5  Build personalised exit per guest
        → avoids incident zone
        → prefers accessible route for guests with accessibility needs
Step 6  Persist all AI outputs, status → "active"
Step 7  Dispatch guest alerts (SMS via Twilio or in-app) + deadman sessions  [parallel]
Step 8  If severity=1 (CRITICAL): precautionary alerts to floors above & below
```

---

## Dead Man's Switch

```
Guest SOS / AI triage → DeadmanSession created (token issued to guest)
    ↓
Guest taps 💓 every 2 min → POST /api/guests/deadman/ping
    ↓
Cron runs every 30s → checkSessions()
    ↓ (if missed_pings ≥ escalate_after = 2)
Session → "escalated" + deadman:escalated event on SSE bus
    ↓
Manager sees room flagged red in war room
    ↓
Staff physically checks → POST /api/guests/deadman/resolve
    ↓
On incident resolve → all sessions auto-expired
```

---

## SSE Event Types

All events are emitted via `emitCrisisEvent(hotelId, type, payload)`:

`incident:created` `incident:updated` `incident:resolved` `triage:complete`
`deadman:escalated` `deadman:resolved` `deadman:ping`
`staff:silent` `staff:ping`
`task:updated` `guest:response` `heatmap:change` `sensor:escalation` `cron:check`

---

## War Room Endpoint

`GET /api/realtime/warroom?incident_id=` runs **7 parallel queries** and returns:

- Full incident record + AI outputs
- Per-room heatmap for affected floor (green/amber/red/gray)
- Heatmaps for adjacent floors (severity 1 only)
- Guest accountability counts (safe / needs help / no response / not notified)
- Task completion progress
- Notification delivery rates
- All active/escalated deadman sessions
- Staff presence (active + silent)
- Floor plan

---

## Deployment on Vercel

```bash
npm install -g vercel
vercel login
vercel env add MONGODB_URI
vercel env add FIREBASE_SERVICE_ACCOUNT
vercel env add GEMINI_API_KEY
vercel env add SENSOR_SECRET
vercel env add CRON_SECRET
# add Twilio vars if using SMS
vercel --prod
```

The `vercel.json` configures a cron job running every 1 minute. For 30-second deadman checks, also configure [UptimeRobot](https://uptimerobot.com) to POST `/api/realtime/cron/check` every 30 seconds with header `x-cron-secret: <your_secret>`.

---

## Running Tests

```bash
node tests/run_all.js
```

194 assertions across 24 test categories covering syntax, file structure, module architecture, endpoint completeness, auth guards, rate limiters, schema enums, business logic, and unit tests for EventBus, tokens, asyncHandler, triage, heatmap, report scoring, and deadman timing.

---

## Database Indexes

Key indexes are defined directly on each model:
- `hotel_id` indexed on all collections (fast per-hotel queries)
- `DeadmanSession.token` — unique index (fast token lookup for pings)
- `StaffPresence` — compound unique index `{incident_id, staff_id}`
- `FloorPlan` — compound unique index `{hotel_id, floor}`
- `GuestLocation` — compound index `{hotel_id, floor}` and `{hotel_id, room}`
