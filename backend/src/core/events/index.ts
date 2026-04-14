/**
 * In-Process Event Bus
 *
 * Lightweight pub/sub for real-time events. All modules publish here,
 * the SSE endpoint subscribes and streams to connected clients.
 *
 * Events are scoped by hotel_id so clients only receive relevant data.
 */

export type CrisisEventType =
    | 'incident:created'
    | 'incident:updated'
    | 'incident:resolved'
    | 'incident:chat'
    | 'triage:complete'
    | 'deadman:escalated'
    | 'deadman:resolved'
    | 'heatmap:change'
    | 'staff:silent'
    | 'staff:ping'
    | 'task:created'
    | 'task:updated'
    | 'guest:response'
    | 'notification:sent'
    | 'sensor:escalation'
    | 'cron:check'

export interface CrisisEvent {
    type: CrisisEventType
    hotel_id: string
    incident_id?: string
    timestamp: string
    payload: Record<string, unknown>
}

type Listener = (event: CrisisEvent) => void

class EventBus {
    private listeners = new Map<string, Set<Listener>>()
    private globalListeners = new Set<Listener>()

    /**
     * Subscribe to events for a specific hotel.
     * Returns an unsubscribe function.
     */
    subscribe(hotelId: string, listener: Listener): () => void {
        if (!this.listeners.has(hotelId)) {
            this.listeners.set(hotelId, new Set())
        }
        this.listeners.get(hotelId)!.add(listener)
        this.globalListeners.add(listener)

        return () => {
            this.listeners.get(hotelId)?.delete(listener)
            this.globalListeners.delete(listener)
            if (this.listeners.get(hotelId)?.size === 0) {
                this.listeners.delete(hotelId)
            }
        }
    }

    /**
     * Publish an event. All listeners for the hotel_id receive it.
     */
    emit(event: CrisisEvent): void {
        const hotelListeners = this.listeners.get(event.hotel_id)
        if (hotelListeners) {
            for (const listener of hotelListeners) {
                try {
                    listener(event)
                } catch (err) {
                    console.error('[EventBus] Listener error:', err)
                }
            }
        }
    }

    /** Number of active connections for a hotel */
    connectionCount(hotelId: string): number {
        return this.listeners.get(hotelId)?.size ?? 0
    }

    /** Total active connections across all hotels */
    totalConnections(): number {
        return this.globalListeners.size
    }
}

/** Singleton event bus — shared across all modules */
export const eventBus = new EventBus()

/** Helper to emit an event with timestamp */
export function emitCrisisEvent(
    type: CrisisEventType,
    hotelId: string,
    payload: Record<string, unknown>,
    incidentId?: string
): void {
    eventBus.emit({
        type,
        hotel_id: hotelId,
        incident_id: incidentId,
        timestamp: new Date().toISOString(),
        payload,
    })
}
