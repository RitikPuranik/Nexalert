import { io } from 'socket.io-client';
import { getToken } from './api';

let socket = null;

export function getSocket(hotelId) {
  if (socket?.connected) return socket;

  const url = import.meta.env.VITE_API_URL || window.location.origin;

  socket = io(url, {
    auth: {
      token: getToken(),
      hotel_id: hotelId,
      role: 'manager',
    },
    transports: ['websocket', 'polling'],
    reconnectionDelay: 2000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => console.log('[Socket.IO] Connected:', socket.id));
  socket.on('disconnect', (reason) => console.log('[Socket.IO] Disconnected:', reason));
  socket.on('connect_error', (err) => console.warn('[Socket.IO] Error:', err.message));

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
