import { io } from 'socket.io-client';
import { auth } from './firebase.js';

// In production set VITE_BACKEND_URL=https://your-backend.com
// In development leave empty — Vite proxy forwards /socket.io → localhost:3001
const BACKEND = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '') || '/';

let socket = null;

export async function getSocket(hotelId) {
  if (socket?.connected) return socket;
  const token = await auth.currentUser?.getIdToken();
  socket = io(BACKEND, {
    auth: { token },
    query: { hotel_id: hotelId },
    transports: ['websocket'],
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
