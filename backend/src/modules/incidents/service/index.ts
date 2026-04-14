/**
 * Incidents Module — Service Layer
 *
 * Owns: incident lifecycle, triage pipeline orchestration,
 * 911 packet generation, all-clear dispatch, multi-floor escalation.
 */

import { adminDb } from '@/core/db'
import { runTriage, buildEvacuationInstruction } from '@/core/ai'
import { emitCrisisEvent } from '@/core/events'
import type { Incident, SensorEvent } from '@/types'

// ─── Create incident from sensor trigger ────────────────────────────────────
export async function createSensorIncident(
  event: SensorEvent & { hotel_id: string }
): Promise<{ incident: Incident; isDuplicate: boolean }> {
  // Deduplicate by hotel_id + floor + zone (not just floor)
  const { data: existing } = await adminDb
    .from('incidents')
    .select('id, status')
    .eq('hotel_id', event.hotel_id)
    .eq('floor', event.floor)
    .eq('zone', event.zone)
    .in('status', ['detecting', 'triaging', 'active', 'investigating'])
    .limit(1)
    .single()

  if (existing) return { incident: existing as Incident, isDuplicate: true }

  const { data: incident, error } = await adminDb
    .from('incidents')
    .insert({
      hotel_id: event.hotel_id,
      type: event.type,
      status: 'detecting',
      source: 'sensor',
      is_drill: false,
      floor: event.floor,
      zone: event.zone,
      room: event.room ?? null,
      sensor_id: event.sensor_id,
      sensor_type: event.type,
      sensor_value: event.value,
      sensor_threshold: event.threshold,
      detected_at: event.timestamp,
    })
    .select()
    .single()

  if (error || !incident) throw new Error(`Failed to create incident: ${error?.message}`)

  emitCrisisEvent('incident:created', event.hotel_id, {
    incident_id: incident.id, type: event.type, floor: event.floor,
    zone: event.zone, source: 'sensor', severity: null,
  }, incident.id)

  return { incident: incident as Incident, isDuplicate: false }
}

// ─── Create incident from guest SOS ─────────────────────────────────────────
export async function createGuestIncident(payload: {
  hotelId: string
  type: string
  floor: number
  zone: string
  room: string
  reporterId: string | null
  reporterLanguage: string
  isDrill?: boolean
}): Promise<Incident> {
  const { data, error } = await adminDb
    .from('incidents')
    .insert({
      hotel_id: payload.hotelId,
      type: payload.type,
      status: 'detecting',
      source: payload.isDrill ? 'drill' : 'guest_sos',
      is_drill: payload.isDrill ?? false,
      floor: payload.floor,
      zone: payload.zone,
      room: payload.room,
      reporter_id: payload.reporterId,
      reporter_role: 'guest',
      reporter_language: payload.reporterLanguage,
      detected_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to create incident: ${error?.message}`)
  return data as Incident
}

// ─── Create drill incident ────────────────────────────────────────────────────
export async function createDrillIncident(payload: {
  hotelId: string
  type: string
  floor: number
  zone: string
  room: string | null
  managerId: string
}): Promise<Incident> {
  const { data, error } = await adminDb
    .from('incidents')
    .insert({
      hotel_id: payload.hotelId,
      type: payload.type,
      status: 'detecting',
      source: 'drill',
      is_drill: true,
      floor: payload.floor,
      zone: payload.zone,
      room: payload.room,
      reporter_id: payload.managerId,
      reporter_role: 'manager',
      detected_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to create drill: ${error?.message}`)
  return data as Incident
}

// ─── Core triage + dispatch pipeline ────────────────────────────────────────
// This is the master orchestrator — called after any incident is created.
// Runs AI triage, creates tasks, dispatches notifications, all async.
// Now with failure recovery: if triage fails, incident moves to 'active' with
// fallback data instead of being stuck in 'triaging' forever.
export async function runTriagePipeline(incident: Incident) {
  // Import modules lazily to avoid circular dependencies
  const { getGuestsOnFloor, getFloorExits } = await import('@/modules/guests/service')
  const { createTasksFromTriage } = await import('@/modules/staff')
  const { buildFloorRoutes } = await import('@/modules/guests/service')
  const { dispatchFloorAlerts, notifyStaff } = await import('@/modules/guests/service')

  // Mark as triaging
  await adminDb.from('incidents').update({ status: 'triaging' }).eq('id', incident.id)

  try {
    // Load context
    const [{ hotel }, guestLocations, exits] = await Promise.all([
      getHotelContext(incident.hotel_id),
      getGuestsOnFloor(incident.hotel_id, incident.floor),
      getFloorExits(incident.hotel_id, incident.floor),
    ])

    // Run AI triage (includes its own fallback if AI fails)
    const triage = await runTriage({
      incidentId: incident.id,
      type: incident.type as never,
      floor: incident.floor,
      zone: incident.zone,
      room: incident.room,
      source: incident.source,
      isDrill: incident.is_drill,
      sensorValue: incident.sensor_value ?? undefined,
      sensorThreshold: incident.sensor_threshold ?? undefined,
      sensorType: incident.sensor_type ?? undefined,
      guestsOnFloor: guestLocations.map(g => ({
        room: g.room_number,
        name: g.guest_name,
        language: g.language,
        needsAccessibility: g.needs_accessibility_assistance,
      })),
      guestLanguages: [...new Set(guestLocations.map(g => g.language))],
      hotelName: hotel?.name ?? 'Hotel',
      totalFloors: hotel?.total_floors ?? 10,
      accessCodes: hotel?.access_codes ?? {},
      floorExits: exits,
      musterPoints: [{ id: 'default', label: 'Car park', location_description: 'Car park Level B1' }],
    })

    // Create staff tasks
    await createTasksFromTriage(incident.id, incident.hotel_id, triage.tasks)

    // Build personalized exit routes + evacuation instructions for all guests
    const routeMap = await buildFloorRoutes(incident.hotel_id, {
      floor: incident.floor,
      zone: incident.zone,
      avoidZones: [incident.zone],
      evacuationTemplate: triage.evacuation_instruction_template,
      templateTranslations: triage.guest_alert_translations,
    }, guestLocations)

    // Persist AI outputs + activate incident
    await adminDb.from('incidents').update({
      severity: triage.severity,
      status: 'active',
      ai_severity_reason: triage.severity_reason,
      ai_briefing: triage.briefing,
      ai_responder_briefing: triage.responder_briefing,
      ai_guest_alert_en: triage.guest_alert_en,
      ai_guest_alert_translations: triage.guest_alert_translations,
      ai_tasks: triage.tasks,
      ai_recommend_911: triage.recommend_911,
      ai_triage_completed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    }).eq('id', incident.id)

    emitCrisisEvent('triage:complete', incident.hotel_id, {
      incident_id: incident.id, severity: triage.severity,
      recommend_911: triage.recommend_911, tasks_count: triage.tasks.length,
      guests_on_floor: guestLocations.length,
    }, incident.id)

    // Dispatch guest alerts + staff notifications concurrently
    await Promise.all([
      dispatchFloorAlerts({
        incidentId: incident.id,
        hotelId: incident.hotel_id,
        guestLocations,
        alertByLanguage: { en: triage.guest_alert_en, ...triage.guest_alert_translations },
        evacuationByGuestId: routeMap,
        isDrill: incident.is_drill,
      }),
      notifyStaff(incident.hotel_id, incident.id),
    ])

    // Auto-escalate to adjacent floors for severity 1 (fire/evacuation)
    if (triage.severity === 1 && !incident.is_drill) {
      escalateToAdjacentFloors(incident, hotel?.total_floors ?? 10).catch(console.error)
    }

  } catch (err) {
    // CRITICAL: Don't leave incident stuck in 'triaging'
    // Move to 'active' with error note so staff can still respond
    console.error(`[TRIAGE PIPELINE FAILED] Incident ${incident.id}:`, err)

    await adminDb.from('incidents').update({
      status: 'active',
      severity: ['fire', 'smoke'].includes(incident.type) ? 1 : 2,
      ai_briefing: `TRIAGE FAILED — Manual response required. ${incident.type} reported on Floor ${incident.floor}, Zone ${incident.zone}.`,
      ai_severity_reason: 'Automatic assessment failed — defaulting to urgent response',
      ai_recommend_911: ['fire', 'smoke', 'gas_leak'].includes(incident.type),
      confirmed_at: new Date().toISOString(),
    }).eq('id', incident.id)
  }
}

// ─── Multi-floor escalation ──────────────────────────────────────────────────
// For severity-1 incidents (fire, explosion), automatically alert adjacent floors.
async function escalateToAdjacentFloors(incident: Incident, totalFloors: number) {
  const { getGuestsOnFloor } = await import('@/modules/guests/service')
  const { dispatchFloorAlerts } = await import('@/modules/guests/service')

  const adjacentFloors = [incident.floor - 1, incident.floor + 1]
    .filter(f => f >= 1 && f <= totalFloors)

  for (const floor of adjacentFloors) {
    const guests = await getGuestsOnFloor(incident.hotel_id, floor)
    if (!guests.length) continue

    const prefix = incident.is_drill ? '[DRILL] ' : ''
    const alert = `${prefix}⚠ Emergency on Floor ${incident.floor}. As a precaution, prepare to evacuate. Gather personal items and await further instructions.`

    await dispatchFloorAlerts({
      incidentId: incident.id,
      hotelId: incident.hotel_id,
      guestLocations: guests,
      alertByLanguage: { en: alert },
      evacuationByGuestId: {},
      isDrill: incident.is_drill,
    })
  }
}

// ─── Update incident status ───────────────────────────────────────────────────
export async function updateIncidentStatus(
  incidentId: string,
  action: 'confirm' | 'investigate' | 'dismiss' | 'resolve' | 'escalate_911'
): Promise<Incident> {
  const statusMap = {
    confirm: 'active', investigate: 'investigating',
    dismiss: 'false_alarm', resolve: 'resolved', escalate_911: 'active',
  }
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { status: statusMap[action] }
  if (action === 'confirm' || action === 'investigate') updates.confirmed_at = now
  if (action === 'resolve') updates.resolved_at = now

  const { data, error } = await adminDb
    .from('incidents').update(updates).eq('id', incidentId).select().single()

  if (error || !data) throw new Error(error?.message ?? 'Update failed')

  // Emit AFTER successful DB update — use real hotel_id from the record
  emitCrisisEvent(
    action === 'resolve' ? 'incident:resolved' : 'incident:updated',
    data.hotel_id,
    { action, status: statusMap[action], severity: data.severity },
    incidentId
  )

  // On resolve: send all-clear to guests AND expire deadman sessions
  if (action === 'resolve') {
    const { sendAllClear } = await import('@/modules/guests/service')
    sendAllClear(incidentId, data.hotel_id, data.floor).catch(console.error)

    // Auto-expire all active deadman sessions for this incident
    Promise.resolve(
      adminDb.from('deadman_sessions')
        .update({ status: 'resolved', resolved_at: now })
        .eq('incident_id', incidentId)
        .in('status', ['active', 'escalated'])
    ).catch(console.error)
  }

  return data as Incident
}

// ─── Build 911 data packet ────────────────────────────────────────────────────
export async function build911Packet(incidentId: string, hotelId: string) {
  const [{ data: incident }, { hotel }, { data: tasks }, { data: guests }] = await Promise.all([
    adminDb.from('incidents').select('*').eq('id', incidentId).single(),
    getHotelContext(hotelId),
    adminDb.from('staff_tasks').select('task_text, status, assigned_to_role').eq('incident_id', incidentId),
    adminDb.from('guest_locations').select('floor, guest_response, needs_accessibility_assistance').eq('hotel_id', hotelId),
  ])

  const floorGuests = (guests ?? []).filter((g: { floor: number }) => g.floor === incident?.floor)

  return {
    incident_type: incident?.type,
    severity: incident?.severity,
    location: `${hotel?.name}, Floor ${incident?.floor}, Zone ${incident?.zone}${incident?.room ? `, Room ${incident.room}` : ''}`,
    address: hotel?.address,
    sensor_reading: incident?.sensor_value
      ? `${incident.sensor_type}: ${incident.sensor_value} (threshold: ${incident.sensor_threshold})`
      : 'Human-reported',
    elapsed_seconds: incident?.detected_at
      ? Math.round((Date.now() - new Date(incident.detected_at).getTime()) / 1000)
      : null,
    guests_on_floor: floorGuests.length,
    guests_needing_assistance: floorGuests.filter((g: { needs_accessibility_assistance: boolean }) => g.needs_accessibility_assistance).length,
    guests_confirmed_safe: floorGuests.filter((g: { guest_response: string }) => g.guest_response === 'safe').length,
    guests_needing_help: floorGuests.filter((g: { guest_response: string }) => g.guest_response === 'needs_help').length,
    guests_not_responded: floorGuests.filter((g: { guest_response: string | null }) => !g.guest_response).length,
    staff_tasks_completed: (tasks ?? []).filter((t: { status: string }) => t.status === 'completed').length,
    staff_tasks_total: (tasks ?? []).length,
    access_codes: hotel?.access_codes,
    emergency_contacts: hotel?.emergency_contacts,
    ai_briefing: incident?.ai_responder_briefing,
    is_drill: incident?.is_drill,
    generated_at: new Date().toISOString(),
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
async function getHotelContext(hotelId: string) {
  const { data: hotel } = await adminDb
    .from('hotels')
    .select('name, address, total_floors, access_codes, emergency_contacts')
    .eq('id', hotelId)
    .single()
  return { hotel }
}

export { buildEvacuationInstruction }
