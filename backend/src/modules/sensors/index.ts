/**
 * Sensors Module
 *
 * Owns: sensor event ingestion, deduplication, threshold checks.
 * The only entry point from hardware (ESP32) or the simulator panel.
 *
 * Route: POST /api/sensors/event
 */

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/core/db'
import { createSensorIncident, runTriagePipeline } from '@/modules/incidents/service'
import type { SensorEvent, ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

// ─── Service ─────────────────────────────────────────────────────────────────

/** Logs a raw sensor reading and returns whether it triggered. */
export async function logSensorEvent(
  event: SensorEvent & { hotel_id: string },
  incidentId: string | null = null
) {
  await adminDb.from('sensor_events').insert({
    sensor_id: event.sensor_id,
    hotel_id: event.hotel_id,
    value: event.value,
    threshold: event.threshold,
    triggered: event.value > event.threshold,
    incident_id: incidentId,
    recorded_at: event.timestamp ?? new Date().toISOString(),
  })

  await adminDb
    .from('sensors')
    .update({ last_ping: new Date().toISOString() })
    .eq('id', event.sensor_id)
}

/** Validates the sensor secret from request headers. */
export function validateSensorSecret(req: Request): boolean {
  const secret = req.headers.get('x-sensor-secret')
  return !!secret && secret === process.env.SENSOR_SECRET
}

// ─── API Route ────────────────────────────────────────────────────────────────

/**
 * POST /api/sensors/event
 * Called by: ESP32 hardware OR simulator panel in admin UI.
 * Auth: x-sensor-secret header (shared secret, not user JWT).
 */
export async function POST(req: NextRequest) {
  if (!validateSensorSecret(req)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'Unauthorized', code: 'INVALID_SECRET' },
      { status: 401 }
    )
  }

  const body = await req.json() as SensorEvent & { hotel_id: string }
  const { sensor_id, hotel_id, type, value, threshold, floor, zone, room, timestamp } = body

  if (!sensor_id || !hotel_id || !type || value === undefined || threshold === undefined || !floor || !zone) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'Missing required fields', code: 'MISSING_FIELDS' },
      { status: 400 }
    )
  }

  // Log every reading regardless of threshold
  await logSensorEvent(body)

  // If below threshold — just an update ping, no incident
  if (value <= threshold) {
    return NextResponse.json<ApiResponse<{ triggered: boolean }>>({
      success: true, data: { triggered: false }
    })
  }

  // Above threshold — create incident and run full pipeline
  const { incident, isDuplicate } = await createSensorIncident(body)

  if (isDuplicate) {
    return NextResponse.json<ApiResponse<{ incident_id: string; duplicate: boolean }>>({
      success: true, data: { incident_id: incident.id, duplicate: true }
    })
  }

  // Fire triage pipeline async — response confirms detection immediately
  runTriagePipeline(incident).catch(console.error)

  return NextResponse.json<ApiResponse<{ incident_id: string; status: string; triggered: boolean }>>({
    success: true,
    data: { incident_id: incident.id, status: 'detecting', triggered: true }
  }, { status: 201 })
}
