import { useState, useEffect, useRef } from 'react';
import { auth } from './firebase.js';

// All named event types the backend can emit
const SSE_EVENT_TYPES = [
  'incident:created',
  'incident:updated',
  'incident:resolved',
  'task:updated',
  'guest:response',
  'triage:complete',
  'sensor:alert',
  'deadman:missed',
  'deadman:escalated',
  'warroom:chat',
  'all_clear',
];

/**
 * SSE hook — fixes the EventSource named-event problem.
 *
 * The backend sends:   event: incident:created\ndata: {...}\n\n
 * Named events are IGNORED by es.onmessage — they need addEventListener.
 *
 * Fix: listen to every named event type explicitly, AND listen to onmessage
 * for any unnamed events. Both paths push into the same events array.
 */
export function useSSE(hotelId) {
  const [events,    setEvents]    = useState([]);
  const [connected, setConnected] = useState(false);
  const esRef  = useRef(null);
  const retry  = useRef(null);

  function pushEvent(evt) {
    try {
      const parsed = typeof evt === 'string' ? JSON.parse(evt) : evt;
      setEvents(prev => [
        { ...parsed, _id: Date.now() + Math.random() },
        ...prev,
      ].slice(0, 200));
    } catch { /* ignore malformed */ }
  }

  useEffect(() => {
    if (!hotelId) return;

    async function connect() {
      try {
        const token = await auth.currentUser?.getIdToken(false);
        if (!token) {
          retry.current = setTimeout(connect, 3000);
          return;
        }

        esRef.current?.close();

        const url = `/api/realtime/sse?hotel_id=${hotelId}&token=${encodeURIComponent(token)}`;
        const es  = new EventSource(url);
        esRef.current = es;

        // ── named event listeners (fires for   event: incident:created  etc.) ──
        es.addEventListener('connected', () => setConnected(true));

        for (const type of SSE_EVENT_TYPES) {
          es.addEventListener(type, (e) => pushEvent(e.data));
        }

        // ── unnamed fallback (fires for lines that have no "event:" prefix) ──
        es.onmessage = (e) => pushEvent(e.data);

        es.onerror = () => {
          setConnected(false);
          es.close();
          esRef.current = null;
          // Back-off 5 s before reconnect
          retry.current = setTimeout(connect, 5000);
        };
      } catch {
        retry.current = setTimeout(connect, 5000);
      }
    }

    connect();

    return () => {
      clearTimeout(retry.current);
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [hotelId]);

  return { events, connected };
}
