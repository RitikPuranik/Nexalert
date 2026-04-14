/**
 * Smart Triage Priority Queue Module
 *
 * When multiple guests need help simultaneously, AI ranks them by risk.
 * Produces a dispatch queue for responders — they get the next
 * highest-priority room to visit.
 *
 * Priority scoring:
 *   P1 — Accessibility needs + on fire floor + deadman escalated
 *   P2 — Deadman escalated (guest stopped responding)
 *   P3 — Guest manually reported "needs help"
 *   P4 — Unreachable (notification failed)
 *   P5 — No response yet
 *
 * Routes:
 *   GET /api/incidents/[id]/priority   Get the ranked priority queue
 */

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/core/db'
import { getRequestUser, hasRole, AuthError } from '@/core/auth'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriorityGuest {
  rank: number
  priority_level: 1 | 2 | 3 | 4 | 5
  priority_label: string
  risk_score: number
  room_number: string
  floor: number
  zone: string
  guest_name: string | null
  language: string | null
  needs_accessibility: boolean
  guest_response: string | null
  notification_status: string | null
  deadman_status: string | null
  deadman_missed_pings: number | null
  time_since_last_contact_seconds: number | null
  reason: string
}

export interface PriorityQueueResult {
  incident_id: string
  hotel_id: string
  computed_at: string
  total_guests_needing_help: number
  queue: PriorityGuest[]
  summary: {
    critical: number   // P1
    urgent: number     // P2
    high: number       // P3
    medium: number     // P4
    monitoring: number // P5
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function computePriorityQueue(
  incidentId: string,
  hotelId: string
): Promise<PriorityQueueResult> {
  // Load all data in parallel
  const [
    { data: incident },
    { data: guests },
    { data: notifs },
    { data: deadmanSessions },
  ] = await Promise.all([
    adminDb
      .from('incidents')
      .select('id, floor, zone, type, severity')
      .eq('id', incidentId)
      .single(),
    adminDb
      .from('guest_locations')
      .select('id, room_number, floor, zone, guest_name, language, needs_accessibility_assistance, guest_response, responded_at, notification_status, last_seen_at')
      .eq('hotel_id', hotelId),
    adminDb
      .from('guest_notifications')
      .select('guest_location_id, status, sent_at, delivered_at, guest_response')
      .eq('incident_id', incidentId),
    adminDb
      .from('deadman_sessions')
      .select('room_number, floor, status, missed_pings, last_ping_at, escalated_at, guest_location_id')
      .eq('hotel_id', hotelId)
      .in('status', ['active', 'escalated']),
  ])

  if (!incident) throw new Error('Incident not found')

  const now = Date.now()
  const incidentFloor = incident.floor as number
  const incidentZone = incident.zone as string

  // Build lookup maps
  const notifByGuestId = new Map(
    (notifs ?? []).map((n: { guest_location_id: string; status: string; guest_response: string | null; sent_at: string | null }) =>
      [n.guest_location_id, n])
  )
  const deadmanByRoom = new Map(
    (deadmanSessions ?? []).map((d: {
      room_number: string; status: string; missed_pings: number
      last_ping_at: string; escalated_at: string | null; guest_location_id: string | null
    }) => [d.room_number, d])
  )

  // Score and rank guests who need attention
  const scoredGuests: PriorityGuest[] = []

  for (const guest of (guests ?? []) as {
    id: string; room_number: string; floor: number; zone: string
    guest_name: string; language: string
    needs_accessibility_assistance: boolean; guest_response: string | null
    responded_at: string | null; notification_status: string | null
    last_seen_at: string | null
  }[]) {
    // Skip guests who are already confirmed safe
    if (guest.guest_response === 'safe') continue

    const notif = notifByGuestId.get(guest.id) as { status: string; guest_response: string | null; sent_at: string | null } | undefined
    const deadman = deadmanByRoom.get(guest.room_number) as {
      status: string; missed_pings: number; last_ping_at: string
      escalated_at: string | null
    } | undefined

    const isOnIncidentFloor = guest.floor === incidentFloor
    const isInIncidentZone = guest.zone === incidentZone
    const hasAccessibility = guest.needs_accessibility_assistance
    const deadmanEscalated = deadman?.status === 'escalated'
    const needsHelp = guest.guest_response === 'needs_help'
    const notifFailed = notif?.status === 'failed' || guest.notification_status === 'failed'
    const noResponse = !guest.guest_response && (notif?.status === 'sent' || notif?.status === 'delivered')

    // Calculate risk score (higher = more urgent)
    let riskScore = 0
    let priorityLevel: 1 | 2 | 3 | 4 | 5 = 5
    let priorityLabel = 'Monitoring'
    let reason = ''

    // P1: Critical — accessibility + fire floor + deadman escalated
    if (hasAccessibility && isOnIncidentFloor && deadmanEscalated) {
      riskScore = 100
      priorityLevel = 1
      priorityLabel = 'CRITICAL'
      reason = `Accessibility needs + on incident floor + stopped responding to deadman switch (${deadman?.missed_pings ?? 0} missed pings)`
    }
    // P1: Critical — accessibility + fire floor + needs help
    else if (hasAccessibility && isOnIncidentFloor && needsHelp) {
      riskScore = 95
      priorityLevel = 1
      priorityLabel = 'CRITICAL'
      reason = 'Accessibility needs + on incident floor + manually reported needs help'
    }
    // P1: Critical — incident zone + deadman escalated
    else if (isInIncidentZone && deadmanEscalated) {
      riskScore = 92
      priorityLevel = 1
      priorityLabel = 'CRITICAL'
      reason = `In incident zone + stopped responding (${deadman?.missed_pings ?? 0} missed pings)`
    }
    // P2: Urgent — deadman escalated anywhere
    else if (deadmanEscalated) {
      riskScore = 80
      priorityLevel = 2
      priorityLabel = 'URGENT'
      reason = `Guest stopped responding to deadman switch — ${deadman?.missed_pings ?? 0} missed pings`
      // Boost score if on incident floor
      if (isOnIncidentFloor) riskScore += 10
      if (hasAccessibility) riskScore += 5
    }
    // P2: Urgent — accessibility + on incident floor + no contact
    else if (hasAccessibility && isOnIncidentFloor && (noResponse || notifFailed)) {
      riskScore = 75
      priorityLevel = 2
      priorityLabel = 'URGENT'
      reason = 'Accessibility needs + on incident floor + no contact established'
    }
    // P3: High — guest explicitly needs help
    else if (needsHelp) {
      riskScore = 60
      priorityLevel = 3
      priorityLabel = 'HIGH'
      reason = 'Guest manually reported needs help'
      if (isOnIncidentFloor) riskScore += 10
      if (hasAccessibility) riskScore += 5
    }
    // P4: Medium — unreachable (notification failed)
    else if (notifFailed) {
      riskScore = 40
      priorityLevel = 4
      priorityLabel = 'MEDIUM'
      reason = 'Notification delivery failed — cannot confirm guest safety'
      if (isOnIncidentFloor) riskScore += 10
      if (hasAccessibility) riskScore += 5
    }
    // P5: Monitoring — notified but no response yet
    else if (noResponse) {
      riskScore = 20
      priorityLevel = 5
      priorityLabel = 'MONITORING'
      reason = 'Notification delivered but no response yet'
      if (isOnIncidentFloor) riskScore += 10
      if (hasAccessibility) riskScore += 5
    }
    // Skip everyone else (no notification sent yet, empty rooms, etc.)
    else {
      continue
    }

    // Time penalty: longer silence = higher urgency
    let timeSinceContact: number | null = null
    if (deadman?.last_ping_at) {
      timeSinceContact = Math.floor((now - new Date(deadman.last_ping_at).getTime()) / 1000)
    } else if (guest.responded_at) {
      timeSinceContact = Math.floor((now - new Date(guest.responded_at).getTime()) / 1000)
    } else if (guest.last_seen_at) {
      timeSinceContact = Math.floor((now - new Date(guest.last_seen_at).getTime()) / 1000)
    }

    // Add time-based urgency bonus (up to +15 for 10+ minutes of silence)
    if (timeSinceContact && timeSinceContact > 120) {
      riskScore += Math.min(15, Math.floor(timeSinceContact / 60))
    }

    scoredGuests.push({
      rank: 0, // will be set after sorting
      priority_level: priorityLevel,
      priority_label: priorityLabel,
      risk_score: Math.min(100, riskScore),
      room_number: guest.room_number,
      floor: guest.floor,
      zone: guest.zone,
      guest_name: guest.guest_name,
      language: guest.language,
      needs_accessibility: hasAccessibility,
      guest_response: guest.guest_response,
      notification_status: notif?.status ?? guest.notification_status,
      deadman_status: deadman?.status ?? null,
      deadman_missed_pings: deadman?.missed_pings ?? null,
      time_since_last_contact_seconds: timeSinceContact,
      reason,
    })
  }

  // Sort by risk score descending
  scoredGuests.sort((a, b) => b.risk_score - a.risk_score)

  // Assign ranks
  scoredGuests.forEach((g, i) => { g.rank = i + 1 })

  return {
    incident_id: incidentId,
    hotel_id: hotelId,
    computed_at: new Date().toISOString(),
    total_guests_needing_help: scoredGuests.length,
    queue: scoredGuests,
    summary: {
      critical: scoredGuests.filter(g => g.priority_level === 1).length,
      urgent: scoredGuests.filter(g => g.priority_level === 2).length,
      high: scoredGuests.filter(g => g.priority_level === 3).length,
      medium: scoredGuests.filter(g => g.priority_level === 4).length,
      monitoring: scoredGuests.filter(g => g.priority_level === 5).length,
    },
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

/** GET /api/incidents/[id]/priority — ranked dispatch queue for responders */
export async function GET_PRIORITY(req: NextRequest, incidentId: string) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager', 'staff', 'responder'])) return AuthError.forbidden()

  const result = await computePriorityQueue(incidentId, user.profile.hotel_id)

  return NextResponse.json<ApiResponse<PriorityQueueResult>>({
    success: true,
    data: result,
  })
}
