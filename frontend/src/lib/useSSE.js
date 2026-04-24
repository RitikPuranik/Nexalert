import { useEffect, useRef, useState, useCallback } from 'react';
import { getToken } from './api';

/**
 * SSE hook — subscribes to real-time crisis events for a hotel.
 * @param {string} hotelId
 * @returns {{ events, connected, clearEvents }}
 */
export function useSSE(hotelId) {
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);

  useEffect(() => {
    if (!hotelId) return;

    const token = getToken();
    const baseUrl = import.meta.env.VITE_API_URL || '';
    const url = `${baseUrl}/api/realtime/sse?hotel_id=${hotelId}&role=responder`;

    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('connected', () => setConnected(true));

    // Listen for all event types
    const types = [
      'incident:new', 'incident:triage', 'incident:confirmed', 'incident:resolved',
      'incident:escalated', 'incident:false_alarm',
      'task:assigned', 'task:updated',
      'guest:response', 'guest:notification',
      'sensor:breach', 'sensor:cascade',
      'staff:ping', 'staff:duty',
      'heatmap:change', 'cron:check', 'audit:log',
    ];

    for (const type of types) {
      es.addEventListener(type, (e) => {
        try {
          const data = JSON.parse(e.data);
          setEvents((prev) => [{ type, ...data, _id: Date.now() + Math.random() }, ...prev].slice(0, 100));
        } catch { /* ignore */ }
      });
    }

    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [hotelId]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { events, connected, clearEvents };
}
