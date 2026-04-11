/**
 * Incidents Module — Service Layer
 *
 * Owns: incident lifecycle, triage pipeline orchestration,
 * 911 packet generation, all-clear dispatch.
 */

import { adminDb } from '@/core/db'
import { runTriage, buildEvacuationInstruction } from '@/core/ai'
import type { Incident, SensorEvent } from '@/types'

// ─── Create incident from sensor trigger ────────────────────────────────────
export async function createSensorIncident(
  event: SensorEvent & { hotel_id: string }
): Promise<{ incident: Incident; isDuplicate: boolean }> {
  // Check for existing active incident on this floor
  const { data: existing } = await adminDb
    .from('incidents')
    .select('id, status')
    .eq('hotel_id', event.hotel_id)
    .eq('floor', event.floor)
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
// Runs Claude triage, creates tasks, dispatches notifications, all async.
export async function runTriagePipeline(incident: Incident) {
  // Import modules lazily to avoid circular dependencies
  const { getGuestsOnFloor, getFloorExits } = await import('@/modules/guests/service')
  const { createTasksFromTriage } = await import('@/modules/staff')
  const { buildFloorRoutes } = await import('@/modules/guests/service')
  const { dispatchFloorAlerts, notifyStaff } = await import('@/modules/guests/service')

  // Mark as triaging
  await adminDb.from('incidents').update({ status: 'triaging' }).eq('id', incident.id)

  // Load context
  const [{ hotel }, guestLocations, exits] = await Promise.all([
    getHotelContext(incident.hotel_id),
    getGuestsOnFloor(incident.hotel_id, incident.floor),
    getFloorExits(incident.hotel_id, incident.floor),
  ])

  // Run AI triage
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

  if (action === 'resolve') {
    const { sendAllClear } = await import('@/modules/guests/service')
    sendAllClear(incidentId, data.hotel_id, data.floor).catch(console.error)
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
    location: `${hotel?.name}, Floor ${incident?.floor}, Zone ${incident?.zone}`,
    address: hotel?.address,
    sensor_reading: incident?.sensor_value
      ? `${incident.sensor_type}: ${incident.sensor_value} (threshold: ${incident.sensor_threshold})`
      : 'Human-reported',
    guests_on_floor: floorGuests.length,
    guests_needing_assistance: floorGuests.filter((g: { needs_accessibility_assistance: boolean }) => g.needs_accessibility_assistance).length,
    guests_confirmed_safe: floorGuests.filter((g: { guest_response: string }) => g.guest_response === 'safe').length,
    guests_needing_help: floorGuests.filter((g: { guest_response: string }) => g.guest_response === 'needs_help').length,
    staff_tasks_completed: (tasks ?? []).filter((t: { status: string }) => t.status === 'completed').length,
    staff_tasks_total: (tasks ?? []).length,
    access_codes: hotel?.access_codes,
    emergency_contacts: hotel?.emergency_contacts,
    ai_briefing: incident?.ai_responder_briefing,
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
