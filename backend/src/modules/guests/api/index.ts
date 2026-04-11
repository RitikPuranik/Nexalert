/**
 * Guests Module — API Routes
 *
 * Routes:
 *   GET   /api/guests/locations          All guest locations (manager/staff/responder)
 *   PATCH /api/guests/locations/respond  Guest confirms safe or needs help
 *   GET   /api/guests/exit-route         Personalized exit route for a room
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser, hasRole, AuthError } from '@/core/auth'
import { adminDb } from '@/core/db'
import {
  getAllGuestLocations,
  getExitRouteForRoom,
  recordGuestResponse,
} from '@/modules/guests/service'
import type { ApiResponse, GuestLocation } from '@/types'

export const dynamic = 'force-dynamic'

// ─── GET /api/guests/locations ────────────────────────────────────────────────
export async function GET_LOCATIONS(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) return AuthError.unauthorized()

  const { searchParams } = new URL(req.url)
  const floor = searchParams.get('floor')
  const incidentId = searchParams.get('incident_id')
  const hotelId = user.profile.hotel_id

  // Guests can only see their own location
  if (user.profile.role === 'guest') {
    const { data } = await adminDb
      .from('guest_locations').select('*')
      .eq('guest_id', user.id).eq('hotel_id', hotelId).single()
    return NextResponse.json<ApiResponse<GuestLocation | null>>({ success: true, data: data as GuestLocation })
  }

  // Manager / Staff / Responder: all guests
  const locations = await getAllGuestLocations(hotelId, floor ? parseInt(floor) : undefined)

  // Enrich with per-incident notification status if requested
  if (incidentId && locations.length) {
    const { data: notifs } = await adminDb
      .from('guest_notifications')
      .select('guest_location_id, status, guest_response, responded_at, evacuation_instruction')
      .eq('incident_id', incidentId)

    const notifMap = new Map(notifs?.map(n => [n.guest_location_id, n]) ?? [])
    const enriched = locations.map(g => ({ ...g, incident_notification: notifMap.get(g.id) ?? null }))
    return NextResponse.json<ApiResponse<unknown[]>>({ success: true, data: enriched })
  }

  return NextResponse.json<ApiResponse<GuestLocation[]>>({ success: true, data: locations })
}

// ─── PATCH /api/guests/locations/respond ──────────────────────────────────────
export async function PATCH_RESPOND(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) return AuthError.unauthorized()

  const { incident_id, response } = await req.json() as {
    incident_id: string
    response: 'safe' | 'needs_help'
  }

  if (!incident_id || !response) {
    return NextResponse.json({ success: false, error: 'incident_id and response required' }, { status: 400 })
  }

  await recordGuestResponse(user.profile.hotel_id, user.id, incident_id, response)

  return NextResponse.json<ApiResponse<{ response: string }>>({ success: true, data: { response } })
}

// ─── GET /api/guests/exit-route ───────────────────────────────────────────────
// Public — no auth required. Works from QR scan.
export async function GET_EXIT_ROUTE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const hotelId = searchParams.get('hotel_id')
  const floor = searchParams.get('floor')
  const room = searchParams.get('room')
  const zone = searchParams.get('zone') ?? 'main'
  const language = searchParams.get('lang') ?? 'en'
  const accessible = searchParams.get('accessible') === 'true'
  const incidentId = searchParams.get('incident_id')

  if (!hotelId || !floor || !room) {
    return NextResponse.json({ success: false, error: 'hotel_id, floor, room required' }, { status: 400 })
  }

  let avoidZones: string[] = []
  let incidentContext = null

  if (incidentId) {
    const { data: incident } = await adminDb
      .from('incidents').select('zone, type, severity, ai_briefing')
      .eq('id', incidentId).single()
    if (incident) {
      avoidZones = [incident.zone]
      incidentContext = incident
    }
  }

  const { route, instruction, pathCoordinates } = await getExitRouteForRoom(
    hotelId, parseInt(floor), room, zone, language, accessible, avoidZones
  )

  return NextResponse.json<ApiResponse<unknown>>({
    success: true,
    data: {
      room, floor: parseInt(floor), instruction, path_coordinates: pathCoordinates,
      route: route ? {
        id: route.id, label: route.label,
        label_translated: route.label_translations?.[language] ?? route.label,
        estimated_seconds: route.estimated_time_seconds,
        is_accessible: route.is_accessible, uses_elevator: route.uses_elevator,
        muster_point: route.muster_point,
      } : null,
      incident: incidentContext,
    },
  })
}
