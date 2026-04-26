# NexAlert Guest App

Mobile-first emergency SOS — no login, no hotel ID field ever shown to guest.

## QR URL Formats

### Room-specific QR (recommended — place inside each room):
```
http://YOUR_IP:5174/?h=HOTEL_ID&r=301&f=3
```
Guest scans → instantly sees their Safety Dashboard. Zero typing.

### Lobby QR (guest types their room number):
```
http://YOUR_IP:5174/?h=HOTEL_ID
```
Guest scans → sees a large room number input → then Safety Dashboard.

## Setup
```bash
npm install
npm run dev   # http://localhost:5174
```
Backend must run at http://localhost:3001

## Guest Flow
- Room QR → Idle (no steps skipped)
- Lobby QR → Enter room number → Idle
- Hold SOS 1.5s → Confirm → Active
- I'm Safe / Need Help buttons
- Dead Man's Switch (tap every 2 min)
- Auto-notified when staff resolves incident
