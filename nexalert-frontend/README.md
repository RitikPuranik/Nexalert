# NexAlert Frontend

## Stack
- React 18 + Vite
- React Router v6
- Tailwind CSS v3
- Socket.io-client

## Setup
```bash
npm install
npm run dev
```

## Required: Backend running at http://localhost:3001

The Vite dev server proxies `/api` and `/socket.io` to `http://localhost:3001`.

## Pages
- `/login` — Demo mode login (seeds backend data automatically)
- `/dashboard` — Overview with live incident feed
- `/dashboard/incidents` — Incident list + create modal
- `/dashboard/warroom/:id` — Real-time war room per incident
- `/dashboard/staff` — Staff on/off duty management
- `/dashboard/audit` — Immutable event log
- `/dashboard/health` — Sensor and system health
