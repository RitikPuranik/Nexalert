/**
 * Server-Sent Events (SSE) — GET /api/sse
 *
 * Real-time event stream for crisis dashboards.
 * Replaces polling with instant push delivery.
 *
 * Usage:
 *   const es = new EventSource('/api/sse?hotel_id=xxx&incident_id=yyy')
 *   es.addEventListener('incident:updated', e => { ... })
 *   es.addEventListener('deadman:escalated', e => { ... })
 *   es.addEventListener('staff:silent', e => { ... })
 *
 * No auth required — scoped by hotel_id. In production, add auth.
 */

import { NextRequest } from 'next/server'
import { eventBus, type CrisisEvent } from '@/core/events'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const hotelId = searchParams.get('hotel_id')
    const incidentFilter = searchParams.get('incident_id')

    if (!hotelId) {
        return new Response(JSON.stringify({ success: false, error: 'hotel_id required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    const encoder = new TextEncoder()
    let unsubscribe: (() => void) | null = null
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null

    const stream = new ReadableStream({
        start(controller) {
            // Send initial connection event
            const connectEvent = `event: connected\ndata: ${JSON.stringify({
                hotel_id: hotelId,
                incident_filter: incidentFilter,
                connected_at: new Date().toISOString(),
                connections: eventBus.connectionCount(hotelId) + 1,
            })}\n\n`
            controller.enqueue(encoder.encode(connectEvent))

            // Subscribe to hotel events
            unsubscribe = eventBus.subscribe(hotelId, (event: CrisisEvent) => {
                // Filter by incident if specified
                if (incidentFilter && event.incident_id && event.incident_id !== incidentFilter) {
                    return
                }

                try {
                    const sseMessage = `event: ${event.type}\ndata: ${JSON.stringify({
                        type: event.type,
                        incident_id: event.incident_id,
                        timestamp: event.timestamp,
                        ...event.payload,
                    })}\n\n`
                    controller.enqueue(encoder.encode(sseMessage))
                } catch {
                    // Client disconnected — cleanup happens in cancel()
                }
            })

            // Keep-alive every 15 seconds to prevent proxy timeouts
            keepAliveTimer = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': keepalive\n\n'))
                } catch {
                    // Stream closed
                }
            }, 15_000)
        },

        cancel() {
            // Cleanup on client disconnect
            if (unsubscribe) unsubscribe()
            if (keepAliveTimer) clearInterval(keepAliveTimer)
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
        },
    })
}
