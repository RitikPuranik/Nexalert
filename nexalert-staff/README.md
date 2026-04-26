# NexAlert Staff App

## Stack
React 18 · Vite · Tailwind CSS · Firebase Auth · Socket.io · SSE

## Setup

### 1. Firebase
- Create Firebase project → Authentication → Enable Email/Password
- Copy config values below

### 2. Create .env file
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 3. Run
```bash
npm install
npm run dev   # http://localhost:5173
```
Backend must run at http://localhost:3001

### 4. First manager account
1. Create user in Firebase Console → Authentication → Users
2. Copy the UID
3. POST http://localhost:3001/api/staff/register with:
   { "firebase_uid": "...", "name": "Manager", "role": "manager", "hotel_id": "..." }

## Roles
- manager → Full access (all pages)
- security / maintenance / medical / staff → Limited (Overview, Incidents, My Tasks)
