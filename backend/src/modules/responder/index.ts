/**
 * Responder Module
 *
 * Owns: first responder portal (public, no-auth), real-time
 * situational briefing for fire dept / ambulance.
 *
 * Route: GET /api/responder/portal?incident_id=
 */

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/core/db'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

// ─── Service ──────────────────────────────────────────────────────────────────

export async function buildResponderPortal(incidentId: string) {
  const { data: incident, error } = await adminDb
    .from('incidents')
    .select(`
      id, type, severity, status, is_drill, floor, zone, room,
      sensor_type, sensor_value, sensor_threshold,
      ai_responder_briefing, ai_briefing, ai_recommend_911,
      detected_at, confirmed_at, updated_at, hotel_id
    `)
    .eq('id', incidentId)
    .single()

  if (error || !incident) return null

  const hotelId = incident.hotel_id

  const [hotelResult, tasksResult, floorPlanResult, guestLocsResult] = await Promise.all([
    adminDb.from('hotels')
      .select('name, address, access_codes, emergency_contacts, total_floors')
      .eq('id', hotelId).single(),
    adminDb.from('staff_tasks')
      .select('assigned_to_role, task_text, status, priority, completed_at')
      .eq('incident_id', incidentId).order('priority', { ascending: true }),
    adminDb.from('floor_plans')
      .select('svg_url, exits, muster_points, aed_locations, hazard_zones')
      .eq('hotel_id', hotelId).eq('floor', incident.floor).single(),
    adminDb.from('guest_locations')
      .select('room_number, guest_response, needs_accessibility_assistance, notification_status')
      .eq('hotel_id', hotelId).eq('floor', incident.floor),
  ])

  const guests = guestLocsResult.data ?? []
  const tasks = tasksResult.data ?? []
  const elapsed = Math.round((Date.now() - new Date(incident.detected_at).getTime()) / 1000)

  return {
    incident: {
      id: incident.id,
      type: incident.type,
      severity: incident.severity,
      status: incident.status,
      is_drill: incident.is_drill,
      floor: incident.floor,
      zone: incident.zone,
      room: incident.room,
      sensor: incident.sensor_value != null ? {
        type: incident.sensor_type,
        value: incident.sensor_value,
        threshold: incident.sensor_threshold,
      } : null,
      briefing: incident.ai_responder_briefing ?? incident.ai_briefing ?? 'Incident in progress.',
      detected_at: incident.detected_at,
      elapsed_seconds: elapsed,
    },
    hotel: hotelResult.data ?? null,
    guest_summary: {
      total_on_floor:       guests.length,
      confirmed_safe:       guests.filter((g: { guest_response: string }) => g.guest_response === 'safe').length,
      needs_help:           guests.filter((g: { guest_response: string }) => g.guest_response === 'needs_help').length,
      not_responded:        guests.filter((g: { guest_response: string | null }) => !g.guest_response).length,
      needs_accessibility:  guests.filter((g: { needs_accessibility_assistance: boolean }) => g.needs_accessibility_assistance).length,
      rooms_needing_help:   guests.filter((g: { guest_response: string }) => g.guest_response === 'needs_help').map((g: { room_number: string }) => g.room_number),
      rooms_not_responded:  guests.filter((g: { guest_response: string | null }) => !g.guest_response).map((g: { room_number: string }) => g.room_number),
    },
    task_summary: {
      total:       tasks.length,
      completed:   tasks.filter((t: { status: string }) => t.status === 'completed').length,
      in_progress: tasks.filter((t: { status: string }) => t.status === 'in_progress').length,
      pending:     tasks.filter((t: { status: string }) => t.status === 'pending').length,
      list:        tasks,
    },
    floor_plan: floorPlanResult.data ?? null,
    generated_at: new Date().toISOString(),
  }
}

// ─── API Route ────────────────────────────────────────────────────────────────

/** GET /api/responder/portal?incident_id=xxx  — public, no auth */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const incidentId = searchParams.get('incident_id')

  if (!incidentId) {
    return NextResponse.json({ success: false, error: 'incident_id required' }, { status: 400 })
  }

  const data = await buildResponderPortal(incidentId)
  if (!data) {
    return NextResponse.json({ success: false, error: 'Incident not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  return NextResponse.json<ApiResponse<typeof data>>({ success: true, data })
}
