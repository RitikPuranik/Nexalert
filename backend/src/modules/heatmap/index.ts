/**
 * Floor Heatmap Module
 *
 * Computes per-room response status for the manager floor plan overlay.
 * No new DB table — reads from guest_locations and guest_notifications.
 *
 * Room status colours:
 *   green  — guest confirmed safe
 *   amber  — notification delivered, no response yet (shows elapsed time)
 *   red    — notification failed OR guest explicitly needs help
 *   gray   — no guest registered / no notification sent yet
 *
 * Route:
 *   GET /api/heatmap?hotel_id=&floor=&incident_id=
 *   Public — used by responder portal too, no auth required for GET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/core/db'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoomStatus = 'safe' | 'needs_help' | 'no_response' | 'unreachable' | 'empty'

export interface RoomHeatmapEntry {
  room_number: string
  floor: number
  zone: string
  status: RoomStatus
  /** CSS colour string for the frontend to apply directly */
  colour: 'green' | 'red' | 'amber' | 'gray'
  guest_name: string | null
  language: string | null
  needs_accessibility: boolean
  notification_sent_at: string | null
  /** Seconds since notification was delivered and still no response */
  seconds_waiting: number | null
  responded_at: string | null
  guest_response: string | null
  /** Dead man's switch status — null if no session, 'active' or 'escalated' */
  deadman_status: string | null
  /** Number of missed pings — null if no session */
  deadman_missed_pings: number | null
}

export interface FloorHeatmapResult {
  floor: number
  hotel_id: string
  incident_id: string
  computed_at: string
  rooms: RoomHeatmapEntry[]
  summary: {
    total: number
    safe: number
    needs_help: number
    no_response: number
    unreachable: number
    empty: number
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function computeFloorHeatmap(
  hotelId: string,
  floor: number,
  incidentId: string
): Promise<FloorHeatmapResult> {
  // Load all guest locations on this floor + deadman sessions in parallel
  const [{ data: guests }, { data: notifs }, { data: floorPlan }, { data: deadmanSessions }] = await Promise.all([
    adminDb
      .from('guest_locations')
      .select('id, room_number, floor, zone, guest_name, language, needs_accessibility_assistance, guest_response, responded_at, notification_status')
      .eq('hotel_id', hotelId)
      .eq('floor', floor),
    adminDb
      .from('guest_notifications')
      .select('guest_location_id, status, sent_at, delivered_at, guest_response, responded_at')
      .eq('incident_id', incidentId),
    adminDb
      .from('floor_plans')
      .select('rooms')
      .eq('hotel_id', hotelId)
      .eq('floor', floor)
      .single(),
    // NEW: deadman sessions for this floor + incident
    adminDb
      .from('deadman_sessions')
      .select('room_number, status, missed_pings, last_ping_at, escalated_at, guest_location_id')
      .eq('hotel_id', hotelId)
      .eq('floor', floor)
      .in('status', ['active', 'escalated']),
  ])

  const now = Date.now()
  const notifByGuestLocation = new Map(
    (notifs ?? []).map((n: {
      guest_location_id: string
      status: string
      sent_at: string | null
      delivered_at: string | null
      guest_response: string | null
      responded_at: string | null
    }) => [n.guest_location_id, n])
  )

  const guestByRoom = new Map(
    (guests ?? []).map((g: {
      id: string
      room_number: string
      floor: number
      zone: string
      guest_name: string
      language: string
      needs_accessibility_assistance: boolean
      guest_response: string | null
      responded_at: string | null
      notification_status: string | null
    }) => [g.room_number, g])
  )

  // Build deadman lookup by room number
  const deadmanByRoom = new Map(
    (deadmanSessions ?? []).map((d: {
      room_number: string
      status: string
      missed_pings: number
      last_ping_at: string
      escalated_at: string | null
      guest_location_id: string | null
    }) => [d.room_number, d])
  )

  // Get all room numbers from floor plan + occupied rooms
  const floorPlanRooms: string[] = floorPlan?.rooms
    ? (floorPlan.rooms as { room_number: string }[]).map(r => r.room_number)
    : []

  const allRoomNumbers = [
    ...new Set([
      ...floorPlanRooms,
      ...(guests ?? []).map((g: { room_number: string }) => g.room_number),
    ])
  ].sort()

  const rooms: RoomHeatmapEntry[] = allRoomNumbers.map(roomNumber => {
    const guest = guestByRoom.get(roomNumber)

    // No guest registered → empty
    if (!guest) {
      return {
        room_number: roomNumber,
        floor,
        zone: '',
        status: 'empty' as RoomStatus,
        colour: 'gray' as const,
        guest_name: null,
        language: null,
        needs_accessibility: false,
        notification_sent_at: null,
        seconds_waiting: null,
        responded_at: null,
        guest_response: null,
        deadman_status: null,
        deadman_missed_pings: null,
      }
    }

    const notif = notifByGuestLocation.get(guest.id)
    const deadman = deadmanByRoom.get(roomNumber)

    // Determine status — deadman escalation takes priority
    let status: RoomStatus
    let colour: RoomHeatmapEntry['colour']
    let secondsWaiting: number | null = null

    // DEADMAN ESCALATION OVERRIDE — highest priority
    if (deadman?.status === 'escalated') {
      status = 'needs_help'
      colour = 'red'
      if (deadman.escalated_at) {
        secondsWaiting = Math.floor((now - new Date(deadman.escalated_at).getTime()) / 1000)
      }
    } else if (guest.guest_response === 'safe') {
      status = 'safe'
      colour = 'green'
    } else if (guest.guest_response === 'needs_help') {
      status = 'needs_help'
      colour = 'red'
    } else if (!notif || notif.status === 'failed') {
      // Couldn't reach them
      status = 'unreachable'
      colour = 'red'
    } else if (notif.status === 'sent' || notif.status === 'delivered') {
      // Notified but no response yet
      status = 'no_response'
      colour = 'amber'
      const sentAt = notif.delivered_at ?? notif.sent_at
      if (sentAt) {
        secondsWaiting = Math.floor((now - new Date(sentAt).getTime()) / 1000)
      }
    } else {
      status = 'no_response'
      colour = 'amber'
    }

    return {
      room_number: roomNumber,
      floor,
      zone: guest.zone,
      status,
      colour,
      guest_name: guest.guest_name,
      language: guest.language,
      needs_accessibility: guest.needs_accessibility_assistance,
      notification_sent_at: notif?.sent_at ?? null,
      seconds_waiting: secondsWaiting,
      responded_at: guest.responded_at,
      guest_response: guest.guest_response,
      deadman_status: deadman?.status ?? null,
      deadman_missed_pings: deadman?.missed_pings ?? null,
    }
  })

  const summary = {
    total: rooms.length,
    safe: rooms.filter(r => r.status === 'safe').length,
    needs_help: rooms.filter(r => r.status === 'needs_help').length,
    no_response: rooms.filter(r => r.status === 'no_response').length,
    unreachable: rooms.filter(r => r.status === 'unreachable').length,
    empty: rooms.filter(r => r.status === 'empty').length,
  }

  return {
    floor,
    hotel_id: hotelId,
    incident_id: incidentId,
    computed_at: new Date().toISOString(),
    rooms,
    summary,
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * GET /api/heatmap?hotel_id=&floor=&incident_id=
 *
 * No auth required — used by manager dashboard AND responder portal.
 * Returns room-by-room status with colours ready for SVG overlay.
 * Frontend polls this every 10 s during active incident.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const hotelId = searchParams.get('hotel_id')
  const floor = searchParams.get('floor')
  const incidentId = searchParams.get('incident_id')

  if (!hotelId || !floor || !incidentId) {
    return NextResponse.json(
      { success: false, error: 'hotel_id, floor, and incident_id are required' },
      { status: 400 }
    )
  }

  const result = await computeFloorHeatmap(hotelId, parseInt(floor), incidentId)

  return NextResponse.json<ApiResponse<FloorHeatmapResult>>({ success: true, data: result })
}
