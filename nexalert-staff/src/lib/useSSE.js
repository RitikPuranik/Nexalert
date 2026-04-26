import { useState, useEffect, useRef } from 'react';
import { auth } from './firebase.js';

export function useSSE(hotelId) {
  const [events,    setEvents]    = useState([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);

  useEffect(() => {
    if (!hotelId) return;

    async function connect() {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const url = `/api/realtime/sse?hotel_id=${hotelId}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('connected', () => setConnected(true));
      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data);
          setEvents(prev => [evt, ...prev].slice(0, 100));
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        setConnected(false);
        es.close();
        // Reconnect after 5s
        setTimeout(connect, 5000);
      };
    }

    connect();
    return () => { esRef.current?.close(); setConnected(false); };
  }, [hotelId]);

  return { events, connected };
}
