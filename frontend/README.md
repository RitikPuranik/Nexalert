# NexAlert Frontend

**Next.js 14 · TypeScript · Tailwind CSS · App Router**

Dark military ops command center UI for hotel crisis response — fully integrated with the NexAlert backend.

## File Structure

```
src/
├── app/
│   ├── page.tsx                    # Login page
│   ├── layout.tsx                  # Root layout + AuthProvider
│   ├── globals.css                 # Dark theme, Space Mono + DM Sans
│   ├── dashboard/
│   │   ├── layout.tsx              # Auth guard + Navbar
│   │   ├── page.tsx                # Command dashboard (overview)
│   │   ├── incidents/
│   │   │   ├── page.tsx            # Incidents list + filter
│   │   │   └── [id]/page.tsx       # Full incident detail
│   │   ├── staff/page.tsx          # Staff management
│   │   ├── drills/page.tsx         # Drill management
│   │   └── reports/page.tsx        # Incident reports
│   ├── sos/page.tsx                # Guest SOS (mobile, no auth)
│   └── responder/page.tsx          # First responder portal (no auth)
├── components/
│   ├── ui/index.tsx                # Button, Card, Badge, Stat…
│   ├── Navbar.tsx                  # Top navigation
│   ├── IncidentCard.tsx            # Card + row variants
│   ├── FloorHeatmap.tsx            # Room status grid
│   ├── TaskList.tsx                # Task accept/complete UI
│   ├── StaffPresence.tsx           # Live staff tracker
│   └── DeadmanWidget.tsx           # Guest check-in countdown
├── context/AuthContext.tsx         # Auth state + mock users
├── hooks/index.ts                  # Polling data hooks
├── lib/
│   ├── api.ts                      # Full backend API client
│   └── utils.ts                    # Helpers + formatters
└── types/index.ts                  # All types matching backend
```

## Quick Start

```bash
npm install
cp .env.local.example .env.local
# set NEXT_PUBLIC_API_URL to your backend
npm run dev
# → http://localhost:3000
```

## Demo Logins

| Email | Role |
|---|---|
| manager@nexalert.demo | Full dashboard |
| security@nexalert.demo | Staff tasks |
| frontdesk@nexalert.demo | Guest view |

## Routes

| Path | Auth | Purpose |
|---|---|---|
| / | No | Login |
| /dashboard | Yes | Command overview |
| /dashboard/incidents | Yes | Incident list |
| /dashboard/incidents/[id] | Yes | Full detail |
| /dashboard/staff | Yes | Staff management |
| /dashboard/drills | Manager | Drill control |
| /dashboard/reports | Manager | AI reports |
| /sos | No | Guest SOS form |
| /responder | No | First responder portal |
