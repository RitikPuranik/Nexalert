import { io } from 'socket.io-client';
import { auth } from './firebase.js';

let socket = null;

export async function getSocket(hotelId) {
  if (socket?.connected) return socket;
  const token = await auth.currentUser?.getIdToken();
  socket = io('/', {
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
