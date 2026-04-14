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
import { emitCrisisEvent } from '@/core/events'
import type { SensorEvent, ApiResponse } from '@/types'
import { rateLimit } from '@/core/rate-limit'

export const dynamic = 'force-dynamic'

// Valid sensor types
const VALID_SENSOR_TYPES = ['smoke', 'heat', 'gas', 'motion']

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
  if (!secret || !process.env.SENSOR_SECRET) return false
  // Constant-time comparison to prevent timing attacks
  if (secret.length !== process.env.SENSOR_SECRET.length) return false
  let mismatch = 0
  for (let i = 0; i < secret.length; i++) {
    mismatch |= secret.charCodeAt(i) ^ process.env.SENSOR_SECRET.charCodeAt(i)
  }
  return mismatch === 0
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

  // Rate limit: max 60 sensor events per minute per sensor
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'Invalid JSON body', code: 'INVALID_BODY' },
      { status: 400 }
    )
  }

  const sensor_id = body.sensor_id as string
  const hotel_id = body.hotel_id as string
  const type = body.type as SensorEvent['type']
  const value = body.value as number
  const threshold = body.threshold as number
  const floor = body.floor as number
  const zone = body.zone as string
  const room = (body.room as string) ?? null
  const timestamp = (body.timestamp as string) ?? new Date().toISOString()

  // Validate required fields
  if (!sensor_id || !hotel_id || !type || value === undefined || threshold === undefined || !floor || !zone) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'Missing required fields: sensor_id, hotel_id, type, value, threshold, floor, zone', code: 'MISSING_FIELDS' },
      { status: 400 }
    )
  }

  // Validate sensor type
  if (!VALID_SENSOR_TYPES.includes(type)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: `Invalid sensor type. Must be one of: ${VALID_SENSOR_TYPES.join(', ')}`, code: 'INVALID_TYPE' },
      { status: 400 }
    )
  }

  // Validate numeric values
  if (typeof value !== 'number' || typeof threshold !== 'number' || value < 0 || threshold < 0) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'value and threshold must be non-negative numbers', code: 'INVALID_VALUES' },
      { status: 400 }
    )
  }

  // Rate limit per sensor
  const limit = rateLimit(`sensor:${sensor_id}`, 60)
  if (!limit.allowed) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'Too many events from this sensor', code: 'RATE_LIMITED' },
      { status: 429 }
    )
  }

  // Verify sensor exists and is active
  const { data: sensor } = await adminDb
    .from('sensors')
    .select('id, is_active')
    .eq('id', sensor_id)
    .single()

  if (!sensor) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: `Sensor ${sensor_id} not registered`, code: 'UNKNOWN_SENSOR' },
      { status: 404 }
    )
  }

  if (!sensor.is_active) {
    return NextResponse.json<ApiResponse<{ triggered: false; reason: string }>>({
      success: true, data: { triggered: false, reason: 'Sensor is deactivated' }
    })
  }

  // Build typed event object from validated fields
  const event: SensorEvent & { hotel_id: string } = {
    sensor_id, hotel_id, type, value, threshold, floor, zone, room, timestamp,
  }

  // Log every reading regardless of threshold
  await logSensorEvent(event)

  // If below threshold — just an update ping, no incident
  if (value <= threshold) {
    return NextResponse.json<ApiResponse<{ triggered: boolean }>>({
      success: true, data: { triggered: false }
    })
  }

  // Above threshold — create incident and run full pipeline
  const { incident, isDuplicate } = await createSensorIncident(event)

  if (isDuplicate) {
    // ─── SENSOR AUTO-ESCALATION ────────────────────────────────────────────
    // If the new reading is significantly higher than what triggered the
    // incident, auto-escalate severity. This handles rising danger levels
    // (e.g., smoke 500 → 800 → 1200) instead of silently ignoring repeats.
    const escalation = await checkSensorEscalation(incident.id, event)

    return NextResponse.json<ApiResponse<{
      incident_id: string
      duplicate: boolean
      escalated: boolean
      new_severity: number | null
      previous_value: number | null
      current_value: number
    }>>({
      success: true,
      data: {
        incident_id: incident.id,
        duplicate: true,
        escalated: escalation.escalated,
        new_severity: escalation.newSeverity,
        previous_value: escalation.previousValue,
        current_value: value,
      },
    })
  }

  // Fire triage pipeline async — response confirms detection immediately
  runTriagePipeline(incident).catch(console.error)

  return NextResponse.json<ApiResponse<{ incident_id: string; status: string; triggered: boolean }>>({
    success: true,
    data: { incident_id: incident.id, status: 'detecting', triggered: true }
  }, { status: 201 })
}

// ─── Sensor Auto-Escalation ──────────────────────────────────────────────────
// When subsequent sensor readings during an active incident show rising danger
// levels, automatically re-triage severity upward. This prevents the critical
// gap where a fire growing from 500→800→1200 PPM was being silently ignored.

/** Escalation thresholds — new reading must be this many times higher to trigger */
const ESCALATION_MULTIPLIER = 1.5  // 50% increase triggers escalation
const CRITICAL_MULTIPLIER = 2.5    // 150% increase → jump straight to severity 1

async function checkSensorEscalation(
  incidentId: string,
  newEvent: SensorEvent & { hotel_id: string }
): Promise<{
  escalated: boolean
  newSeverity: number | null
  previousValue: number | null
}> {
  // Get current incident state
  const { data: incident } = await adminDb
    .from('incidents')
    .select('id, severity, sensor_value, hotel_id, floor, zone, type')
    .eq('id', incidentId)
    .single()

  if (!incident) return { escalated: false, newSeverity: null, previousValue: null }

  const originalValue = incident.sensor_value as number | null
  if (!originalValue || originalValue <= 0) {
    return { escalated: false, newSeverity: null, previousValue: originalValue }
  }

  const currentSeverity = incident.severity as number | null ?? 3
  const ratio = newEvent.value / originalValue

  // Not a significant increase — no escalation needed
  if (ratio < ESCALATION_MULTIPLIER) {
    // Still log the updated peak reading
    await adminDb.from('incidents').update({
      sensor_value: Math.max(newEvent.value, originalValue),
    }).eq('id', incidentId)

    return { escalated: false, newSeverity: null, previousValue: originalValue }
  }

  // Calculate new severity based on ratio
  let newSeverity: number
  if (ratio >= CRITICAL_MULTIPLIER || currentSeverity <= 1) {
    newSeverity = 1  // Maximum severity
  } else if (currentSeverity === 3) {
    newSeverity = 2  // Bump from 3 → 2
  } else {
    newSeverity = Math.max(1, currentSeverity - 1)  // Bump up one level
  }

  // Only escalate if severity is actually increasing (numerically decreasing)
  if (newSeverity >= currentSeverity) {
    // Update peak value but don't change severity
    await adminDb.from('incidents').update({
      sensor_value: newEvent.value,
    }).eq('id', incidentId)

    return { escalated: false, newSeverity: null, previousValue: originalValue }
  }

  // ESCALATE — update incident severity and peak reading
  const escalationNote = `Auto-escalated: ${incident.type} sensor reading rose from ${originalValue} to ${newEvent.value} (${Math.round(ratio * 100)}% of original). Severity ${currentSeverity} → ${newSeverity}.`

  await adminDb.from('incidents').update({
    severity: newSeverity,
    sensor_value: newEvent.value,
    ai_severity_reason: escalationNote,
  }).eq('id', incidentId)

  // Emit crisis event for SSE subscribers
  emitCrisisEvent('incident:updated', incident.hotel_id, {
    incident_id: incidentId,
    action: 'sensor_auto_escalation',
    previous_severity: currentSeverity,
    new_severity: newSeverity,
    previous_sensor_value: originalValue,
    new_sensor_value: newEvent.value,
    ratio: Math.round(ratio * 100) / 100,
    sensor_type: newEvent.type,
    floor: newEvent.floor,
    zone: newEvent.zone,
    note: escalationNote,
  }, incidentId)

  console.log(
    `[SENSOR ESCALATION] Incident ${incidentId}: ${incident.type} reading ${originalValue} → ${newEvent.value} (${ratio.toFixed(1)}x). Severity ${currentSeverity} → ${newSeverity}`
  )

  return { escalated: true, newSeverity, previousValue: originalValue }
}
