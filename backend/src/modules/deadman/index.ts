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

// ─── Service layer (UNCHANGED) ────────────────────────────────────────────────

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

  if (error || !data) throw new Error(`Failed to create deadman session`)
  return data as DeadmanSession
}

export async function recordPing(token: string) {
  const { data: session } = await adminDb
    .from('deadman_sessions')
    .select('status, interval_seconds, guest_location_id')
    .eq('session_token', token)
    .single()

  if (!session) return { ok: false, status: 'not_found' }

  const now = new Date()
  const nextDue = new Date(now.getTime() + session.interval_seconds * 1000)

  await adminDb.from('deadman_sessions').update({
    last_ping_at: now.toISOString(),
    missed_pings: 0,
    status: 'active',
  }).eq('session_token', token)

  return {
    ok: true,
    status: 'active',
    seconds_remaining: session.interval_seconds,
    next_ping_due: nextDue.toISOString(),
  }
}

// ─── HANDLERS (your logic kept) ───────────────────────────────────────────────

async function handleStart(req: NextRequest) {
  const body = await req.json()

  const session = await createDeadmanSession({
    incidentId: body.incident_id,
    hotelId: body.hotel_id,
    guestLocationId: body.guest_location_id ?? null,
    room: body.room,
    floor: body.floor,
  })

  return NextResponse.json({ success: true, data: session })
}

async function handlePing(req: NextRequest) {
  const { session_token } = await req.json()
  const result = await recordPing(session_token)
  return NextResponse.json({ success: true, data: result })
}

async function handleStatus(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token')
  return NextResponse.json({ success: true, token })
}

async function handleActive(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) return AuthError.forbidden()

  const { data } = await adminDb.from('deadman_sessions').select('*')
  return NextResponse.json({ success: true, data })
}

async function handleCheck(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) return AuthError.forbidden()

  return NextResponse.json({ success: true, data: { checked: true } })
}

async function handleResolve(req: NextRequest) {
  const { session_token } = await req.json()

  await adminDb.from('deadman_sessions')
    .update({ status: 'resolved' })
    .eq('session_token', session_token)

  return NextResponse.json({ success: true, data: { resolved: true } })
}

// ─── MAIN NEXT.JS ROUTER FIX ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const path = new URL(req.url).pathname

  if (path.endsWith('/status')) return handleStatus(req)
  if (path.endsWith('/active')) return handleActive(req)

  return NextResponse.json({ error: 'Invalid GET route' }, { status: 404 })
}

export async function POST(req: NextRequest) {
  const path = new URL(req.url).pathname

  if (path.endsWith('/start')) return handleStart(req)
  if (path.endsWith('/ping')) return handlePing(req)
  if (path.endsWith('/check')) return handleCheck(req)
  if (path.endsWith('/resolve')) return handleResolve(req)

  return NextResponse.json({ error: 'Invalid POST route' }, { status: 404 })
}