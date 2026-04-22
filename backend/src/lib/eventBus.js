"use strict";

/**
 * In-process SSE pub/sub singleton.
 * Maps hotelId → Set<{ res, userId }>
 * No third-party library needed.
 */
class EventBus {
  constructor() {
    /** @type {Map<string, Set<{res: import('express').Response, userId: string}>>} */
    this._listeners = new Map();
  }

  /** Subscribe an SSE response. Returns an unsubscribe function. */
  subscribe(hotelId, res, userId = "anon") {
    const key = String(hotelId);
    if (!this._listeners.has(key)) this._listeners.set(key, new Set());
    const entry = { res, userId };
    this._listeners.get(key).add(entry);
    return () => {
      const set = this._listeners.get(key);
      if (set) {
        set.delete(entry);
        if (set.size === 0) this._listeners.delete(key);
      }
    };
  }

  /** Emit a named event to all SSE clients of a hotel. */
  emit(hotelId, eventType, payload = {}) {
    const key = String(hotelId);
    const listeners = this._listeners.get(key);
    if (!listeners || listeners.size === 0) return;

    const data = JSON.stringify({ type: eventType, ...payload, ts: Date.now() });
    const dead = new Set();

    for (const entry of listeners) {
      try {
        entry.res.write(`event: ${eventType}\ndata: ${data}\n\n`);
      } catch {
        dead.add(entry);
      }
    }
    for (const d of dead) listeners.delete(d);
    if (listeners.size === 0) this._listeners.delete(key);
  }

  listenerCount(hotelId) {
    return this._listeners.get(String(hotelId))?.size ?? 0;
  }
}

const eventBus = new EventBus();

/**
 * Convenience wrapper used by every module.
 * Dual-emits to both SSE clients and Socket.IO rooms.
 * 
 * Uses lazy require to avoid circular dependency with socketManager.
 */
function emitCrisisEvent(hotelId, type, payload = {}) {
  // SSE emit (original)
  eventBus.emit(hotelId, type, payload);

  // Socket.IO emit (lazy-loaded to avoid circular dependency)
  try {
    const { emitToHotelRoom } = require("./socketManager");
    emitToHotelRoom(String(hotelId), type, payload);
  } catch {
    // Socket.IO not available — SSE will still work
  }
}

module.exports = { eventBus, emitCrisisEvent };
