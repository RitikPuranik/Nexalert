# NexAlert Guest App

## Mobile-first emergency SOS interface for hotel guests

## Setup
```bash
npm install
npm run dev   # http://localhost:5174
```
Backend must run at http://localhost:3001

## QR Code URL
```
http://YOUR_IP:5174/?hotel_id=HOTEL_ID&room=301&floor=3
```
Generate QR codes from the Staff app → Team → Guest QR button

## Guest Flow
1. Scan QR → Auto-checked in (or manual entry if no params)
2. Idle dashboard with hold-to-trigger SOS button
3. Confirm screen prevents false alarms
4. Active: evacuation instructions + I'm Safe / Need Help buttons
5. Dead Man's Switch: tap every ~2min to confirm consciousness
6. Auto-notified when incident resolved by staff
