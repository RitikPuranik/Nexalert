/**
 * Dead Man's Switch Module
 *
 * After a guest submits SOS they get a token and a big "I'M OKAY" button.
 * They must tap it every 2 minutes.
 * A background checker (called by the frontend every 30 s) scans active
 * sessions and escalates any that miss 2 consecutive windows.
 *
 * Routes (all in this file, wired by thin App Router files):
 *   POST   /api/deadman/start    Create session (no auth — from SOS flow)
 *   POST   /api/deadman/ping     Guest taps "I'm okay" (no auth — uses token)
 *   GET    /api/deadman/status   Guest polls remaining time (no auth — uses token)
 *   POST   /api/deadman/check    Escalation checker (manager/staff auth)
 *   POST   /api/deadman/resolve  Staff marks guest found (manager/staff auth)
 *   GET    /api/deadman/active   Manager sees all live sessions (manager/staff auth)
 */

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/core/db'
import { getRequestUser, hasRole, AuthError } from '@/core/auth'
import { emitCrisisEvent } from '@/core/events'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeadmanSession {
  id: string
  incident_id: string
  hotel_id: string
  guest_location_id: string | null
  room_number: string
  floor: number
  session_token: string
  status: 'active' | 'escalated' | 'resolved' | 'expired'
  interval_seconds: number
  missed_pings: number
  escalate_after: number
  last_ping_at: string
  escalated_at: string | null
  resolved_at: string | null
  created_at: string
}

// ─── Service layer ────────────────────────────────────────────────────────────

export async function createDeadmanSession(payload: {
  incidentId: string
  hotelId: string
  guestLocationId: string | null
  room: string
  floor: number
  intervalSeconds?: number
}): Promise<DeadmanSession> {
  const token = crypto.randomUUID()

  const { data, error } = await adminDb
    .from('deadman_sessions')
    .insert({
      incident_id: payload.incidentId,
      hotel_id: payload.hotelId,
      guest_location_id: payload.guestLocationId,
      room_number: payload.room,
      floor: payload.floor,
      session_token: token,
      status: 'active',
      interval_seconds: payload.intervalSeconds ?? 120,
      missed_pings: 0,
      escalate_after: 2,
      last_ping_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to create deadman session: ${error?.message}`)
  return data as DeadmanSession
}

export async function recordPing(token: string): Promise<{
  ok: boolean
  status: string
  seconds_remaining: number
  next_ping_due: string
}> {
  const { data: session } = await adminDb
    .from('deadman_sessions')
    .select('id, status, interval_seconds, guest_location_id')
    .eq('session_token', token)
    .single()

  if (!session) {
    return { ok: false, status: 'not_found', seconds_remaining: 0, next_ping_due: '' }
  }
  if (session.status === 'resolved' || session.status === 'expired') {
    return { ok: false, status: session.status, seconds_remaining: 0, next_ping_due: '' }
  }

  const now = new Date()
  const nextDue = new Date(now.getTime() + session.interval_seconds * 1000)

  await adminDb
    .from('deadman_sessions')
    .update({
      last_ping_at: now.toISOString(),
      missed_pings: 0,
      status: 'active',
      escalated_at: null,
    })
    .eq('session_token', token)

  // Reset guest location response when they ping (they're clearly alive)
  if (session.guest_location_id) {
    await adminDb
      .from('guest_locations')
      .update({ guest_response: 'safe', responded_at: now.toISOString() })
      .eq('id', session.guest_location_id)
  }

  return {
    ok: true,
    status: 'active',
    seconds_remaining: session.interval_seconds,
    next_ping_due: nextDue.toISOString(),
  }
}

export async function checkSessions(hotelId: string): Promise<{
  checked: number
  escalated: number
  escalated_rooms: string[]
}> {
  const { data: sessions } = await adminDb
    .from('deadman_sessions')
    .select('id, room_number, floor, last_ping_at, interval_seconds, missed_pings, escalate_after, guest_location_id, status')
    .eq('hotel_id', hotelId)
    .in('status', ['active'])

  if (!sessions?.length) return { checked: 0, escalated: 0, escalated_rooms: [] }

  const now = Date.now()
  let escalatedCount = 0
  const escalatedRooms: string[] = []

  for (const s of sessions) {
    const elapsed = (now - new Date(s.last_ping_at).getTime()) / 1000
    const window = s.interval_seconds + 30 // 30 s grace period

    if (elapsed > window) {
      const newMissed = s.missed_pings + 1

      if (newMissed >= s.escalate_after) {
        // ESCALATE
        await adminDb
          .from('deadman_sessions')
          .update({ status: 'escalated', missed_pings: newMissed, escalated_at: new Date().toISOString() })
          .eq('id', s.id)

        // Mark guest as needing help
        if (s.guest_location_id) {
          await adminDb
            .from('guest_locations')
            .update({ guest_response: 'needs_help', responded_at: new Date().toISOString() })
            .eq('id', s.guest_location_id)
        }

        escalatedCount++
        escalatedRooms.push(`Room ${s.room_number} (Floor ${s.floor})`)

        emitCrisisEvent('deadman:escalated', hotelId, {
          room: s.room_number, floor: s.floor,
          missed_pings: newMissed, session_id: s.id,
        })
      } else {
        await adminDb
          .from('deadman_sessions')
          .update({ missed_pings: newMissed })
          .eq('id', s.id)
      }
    }
  }

  return { checked: sessions.length, escalated: escalatedCount, escalated_rooms: escalatedRooms }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/** POST /api/deadman/start — no auth, called right after SOS */
export async function POST_START(req: NextRequest) {
  const body = await req.json() as {
    incident_id: string
    hotel_id: string
    guest_location_id?: string
    room: string
    floor: number
    interval_seconds?: number
  }

  const { incident_id, hotel_id, room, floor } = body
  if (!incident_id || !hotel_id || !room || !floor) {
    return NextResponse.json(
      { success: false, error: 'incident_id, hotel_id, room, floor are required' },
      { status: 400 }
    )
  }

  const session = await createDeadmanSession({
    incidentId: incident_id,
    hotelId: hotel_id,
    guestLocationId: body.guest_location_id ?? null,
    room,
    floor,
    intervalSeconds: body.interval_seconds ?? 120,
  })

  return NextResponse.json<ApiResponse<{
    session_token: string
    interval_seconds: number
    next_ping_due: string
    message: string
  }>>({
    success: true,
    data: {
      session_token: session.session_token,
      interval_seconds: session.interval_seconds,
      next_ping_due: new Date(Date.now() + session.interval_seconds * 1000).toISOString(),
      message: `Tap "I'm okay" every ${Math.round(session.interval_seconds / 60)} minutes so help knows you're safe.`,
    },
  }, { status: 201 })
}

/** POST /api/deadman/ping — no auth, guest taps the button */
export async function POST_PING(req: NextRequest) {
  const { session_token } = await req.json() as { session_token: string }
  if (!session_token) {
    return NextResponse.json({ success: false, error: 'session_token required' }, { status: 400 })
  }

  const result = await recordPing(session_token)
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: `Session is ${result.status}` },
      { status: 410 }
    )
  }

  return NextResponse.json<ApiResponse<typeof result>>({ success: true, data: result })
}

/** GET /api/deadman/status?token= — no auth, guest polls */
export async function GET_STATUS(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) {
    return NextResponse.json({ success: false, error: 'token required' }, { status: 400 })
  }

  const { data: session } = await adminDb
    .from('deadman_sessions')
    .select('status, interval_seconds, missed_pings, last_ping_at, escalated_at')
    .eq('session_token', token)
    .single()

  if (!session) {
    return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 })
  }

  const elapsed = Math.floor((Date.now() - new Date(session.last_ping_at).getTime()) / 1000)
  const remaining = Math.max(0, session.interval_seconds - elapsed)

  return NextResponse.json<ApiResponse<{
    status: string
    seconds_remaining: number
    missed_pings: number
    escalated: boolean
  }>>({
    success: true,
    data: {
      status: session.status,
      seconds_remaining: remaining,
      missed_pings: session.missed_pings,
      escalated: session.status === 'escalated',
    },
  })
}

/** POST /api/deadman/check — manager/staff, periodic staleness check */
export async function POST_CHECK(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager', 'staff'])) return AuthError.forbidden()

  const result = await checkSessions(user.profile.hotel_id)
  return NextResponse.json<ApiResponse<typeof result>>({ success: true, data: result })
}

/** POST /api/deadman/resolve — staff marks guest found */
export async function POST_RESOLVE(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager', 'staff'])) return AuthError.forbidden()

  const { session_token } = await req.json() as { session_token: string }
  if (!session_token) {
    return NextResponse.json({ success: false, error: 'session_token required' }, { status: 400 })
  }

  await adminDb
    .from('deadman_sessions')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('session_token', session_token)
    .eq('hotel_id', user.profile.hotel_id)

  emitCrisisEvent('deadman:resolved', user.profile.hotel_id, {
    session_token, resolved_by: user.id,
  })

  return NextResponse.json<ApiResponse<{ resolved: boolean }>>({ success: true, data: { resolved: true } })
}

/** GET /api/deadman/active — manager sees all live sessions */
export async function GET_ACTIVE(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager', 'staff', 'responder'])) return AuthError.forbidden()

  const { data } = await adminDb
    .from('deadman_sessions')
    .select('id, room_number, floor, status, interval_seconds, missed_pings, last_ping_at, escalated_at, incident_id')
    .eq('hotel_id', user.profile.hotel_id)
    .in('status', ['active', 'escalated'])
    .order('escalated_at', { ascending: false, nullsFirst: false })

  const now = Date.now()
  const enriched = (data ?? []).map((s: {
    last_ping_at: string
    interval_seconds: number
    room_number: string
    floor: number
    status: string
    missed_pings: number
    id: string
    escalated_at: string | null
    incident_id: string
  }) => {
    const elapsed = Math.floor((now - new Date(s.last_ping_at).getTime()) / 1000)
    return {
      ...s,
      seconds_since_last_ping: elapsed,
      seconds_until_overdue: Math.max(0, s.interval_seconds - elapsed),
      is_overdue: elapsed > s.interval_seconds,
    }
  })

  return NextResponse.json<ApiResponse<typeof enriched>>({ success: true, data: enriched })
}
