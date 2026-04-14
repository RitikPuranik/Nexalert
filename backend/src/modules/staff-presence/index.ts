/**
 * Staff Presence Module
 *
 * Tracks when each staff member last interacted with the app
 * during an active incident. If a staff member accepts a task
 * then goes silent for > 2 minutes, the manager is alerted.
 *
 * Routes:
 *   POST /api/staff/presence/ping    Staff heartbeat every 30 s
 *   GET  /api/staff/presence         Manager: enriched list for incident
 *   POST /api/staff/presence/check   Staleness checker (call every 30 s)
 */

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/core/db'
import { getRequestUser, hasRole, AuthError } from '@/core/auth'
import { emitCrisisEvent } from '@/core/events'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

/** Seconds without ping before a staff member is flagged as silent */
const SILENT_THRESHOLD = 120

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StaffPresenceRow {
  id: string
  user_id: string
  hotel_id: string
  incident_id: string
  last_ping_at: string
  floor: number | null
  zone: string | null
  status: 'active' | 'silent' | 'offline'
  silent_since: string | null
}

export interface EnrichedPresence {
  user_id: string
  name: string
  staff_role: string
  phone: string | null
  floor: number | null
  zone: string | null
  status: 'active' | 'silent' | 'offline'
  last_ping_at: string
  seconds_since_ping: number
  silent_for_seconds: number | null
  assigned_tasks: {
    task_text: string
    status: string
    priority: number
    accepted_at: string | null
  }[]
  /** True when staff is silent AND has an open accepted/in-progress task */
  needs_welfare_check: boolean
}

export interface SilentAlert {
  user_id: string
  name: string
  staff_role: string
  floor: number | null
  zone: string | null
  silent_for_seconds: number
  open_task: string | null
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function upsertPresencePing(payload: {
  userId: string
  hotelId: string
  incidentId: string
  floor?: number | null
  zone?: string | null
}): Promise<void> {
  const now = new Date().toISOString()
  await adminDb
    .from('staff_presence')
    .upsert(
      {
        user_id: payload.userId,
        hotel_id: payload.hotelId,
        incident_id: payload.incidentId,
        last_ping_at: now,
        floor: payload.floor ?? null,
        zone: payload.zone ?? null,
        status: 'active',
        silent_since: null,
        updated_at: now,
      },
      { onConflict: 'user_id,incident_id' }
    )
}

export async function checkStalePresence(
  hotelId: string,
  incidentId: string
): Promise<{ checked: number; alerts: SilentAlert[] }> {
  const { data: rows } = await adminDb
    .from('staff_presence')
    .select('id, user_id, last_ping_at, status, floor, zone')
    .eq('hotel_id', hotelId)
    .eq('incident_id', incidentId)
    .in('status', ['active'])

  if (!rows?.length) return { checked: 0, alerts: [] }

  const now = Date.now()
  const alerts: SilentAlert[] = []

  for (const row of rows) {
    const silentSeconds = Math.floor((now - new Date(row.last_ping_at).getTime()) / 1000)
    if (silentSeconds > SILENT_THRESHOLD) {
      // Flip to silent
      await adminDb
        .from('staff_presence')
        .update({ status: 'silent', silent_since: new Date().toISOString() })
        .eq('id', row.id)

      // Find their open task (if any) for the alert message
      const { data: openTask } = await adminDb
        .from('staff_tasks')
        .select('task_text')
        .eq('incident_id', incidentId)
        .eq('assigned_to_user_id', row.user_id)
        .in('status', ['accepted', 'in_progress'])
        .order('priority', { ascending: true })
        .limit(1)
        .single()

      // Fetch name for the alert
      const { data: profile } = await adminDb
        .from('user_profiles')
        .select('name, staff_role, floor_assignment, zone_assignment')
        .eq('id', row.user_id)
        .single()

      alerts.push({
        user_id: row.user_id,
        name: profile?.name ?? 'Staff',
        staff_role: profile?.staff_role ?? 'staff',
        floor: row.floor ?? profile?.floor_assignment ?? null,
        zone: row.zone ?? profile?.zone_assignment ?? null,
        silent_for_seconds: silentSeconds,
        open_task: openTask?.task_text ?? null,
      })

      emitCrisisEvent('staff:silent', hotelId, {
        user_id: row.user_id,
        name: profile?.name ?? 'Staff',
        staff_role: profile?.staff_role ?? 'staff',
        floor: row.floor, zone: row.zone,
        silent_for_seconds: silentSeconds,
        open_task: openTask?.task_text ?? null,
      }, incidentId)
    }
  }

  return { checked: rows.length, alerts }
}

export async function getIncidentPresence(
  hotelId: string,
  incidentId: string
): Promise<EnrichedPresence[]> {
  const { data: presenceRows } = await adminDb
    .from('staff_presence')
    .select('user_id, last_ping_at, status, floor, zone, silent_since')
    .eq('hotel_id', hotelId)
    .eq('incident_id', incidentId)
    .order('status', { ascending: true })   // active first, then silent

  if (!presenceRows?.length) return []

  const userIds = presenceRows.map((r: { user_id: string }) => r.user_id)

  // Load profiles for all present staff
  const { data: profiles } = await adminDb
    .from('user_profiles')
    .select('id, name, staff_role, phone, floor_assignment, zone_assignment')
    .in('id', userIds)

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; name: string; staff_role: string; phone: string | null; floor_assignment: number | null; zone_assignment: string | null }) => [p.id, p])
  )

  // Load all tasks assigned to these users for this incident
  const { data: tasks } = await adminDb
    .from('staff_tasks')
    .select('assigned_to_user_id, task_text, status, priority, accepted_at')
    .eq('incident_id', incidentId)
    .in('assigned_to_user_id', userIds)

  const tasksByUser = new Map<string, typeof tasks>()
  for (const t of (tasks ?? [])) {
    const userId = (t as { assigned_to_user_id: string }).assigned_to_user_id
    if (!tasksByUser.has(userId)) tasksByUser.set(userId, [])
    tasksByUser.get(userId)!.push(t)
  }

  const now = Date.now()

  return presenceRows.map((row: {
    user_id: string
    last_ping_at: string
    status: string
    floor: number | null
    zone: string | null
    silent_since: string | null
  }) => {
    const profile = profileMap.get(row.user_id)
    const myTasks = (tasksByUser.get(row.user_id) ?? []) as {
      task_text: string; status: string; priority: number; accepted_at: string | null
    }[]

    const secondsSincePing = Math.floor((now - new Date(row.last_ping_at).getTime()) / 1000)
    const silentForSeconds = row.silent_since
      ? Math.floor((now - new Date(row.silent_since).getTime()) / 1000)
      : null

    const hasOpenTask = myTasks.some(t => ['accepted', 'in_progress'].includes(t.status))

    return {
      user_id: row.user_id,
      name: profile?.name ?? 'Staff member',
      staff_role: profile?.staff_role ?? 'staff',
      phone: profile?.phone ?? null,
      floor: row.floor ?? profile?.floor_assignment ?? null,
      zone: row.zone ?? profile?.zone_assignment ?? null,
      status: row.status as 'active' | 'silent' | 'offline',
      last_ping_at: row.last_ping_at,
      seconds_since_ping: secondsSincePing,
      silent_for_seconds: silentForSeconds,
      assigned_tasks: myTasks.map(t => ({
        task_text: t.task_text,
        status: t.status,
        priority: t.priority,
        accepted_at: t.accepted_at,
      })),
      needs_welfare_check: row.status === 'silent' && hasOpenTask,
    }
  })
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/** POST /api/staff/presence/ping — staff heartbeat */
export async function POST_PING(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['staff', 'manager'])) return AuthError.forbidden()

  const { incident_id, floor, zone } = await req.json() as {
    incident_id: string
    floor?: number
    zone?: string
  }

  if (!incident_id) {
    return NextResponse.json({ success: false, error: 'incident_id required' }, { status: 400 })
  }

  await upsertPresencePing({
    userId: user.id,
    hotelId: user.profile.hotel_id,
    incidentId: incident_id,
    floor: floor ?? user.profile.floor_assignment ?? null,
    zone: zone ?? user.profile.zone_assignment ?? null,
  })

  return NextResponse.json<ApiResponse<{ pinged: boolean; at: string }>>({
    success: true,
    data: { pinged: true, at: new Date().toISOString() },
  })
}

/** GET /api/staff/presence?incident_id= — manager/responder gets full picture */
export async function GET_PRESENCE(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager', 'responder'])) return AuthError.forbidden()

  const incidentId = new URL(req.url).searchParams.get('incident_id')
  if (!incidentId) {
    return NextResponse.json({ success: false, error: 'incident_id required' }, { status: 400 })
  }

  const staff = await getIncidentPresence(user.profile.hotel_id, incidentId)

  const welfareChecks = staff.filter(s => s.needs_welfare_check)

  return NextResponse.json<ApiResponse<{
    staff: EnrichedPresence[]
    welfare_check_needed: { count: number; staff: { name: string; role: string; floor: number | null; zone: string | null; silent_for_seconds: number | null; open_task: string | null }[] }
  }>>({
    success: true,
    data: {
      staff,
      welfare_check_needed: {
        count: welfareChecks.length,
        staff: welfareChecks.map(s => ({
          name: s.name,
          role: s.staff_role,
          floor: s.floor,
          zone: s.zone,
          silent_for_seconds: s.silent_for_seconds,
          open_task: s.assigned_tasks.find(t => ['accepted', 'in_progress'].includes(t.status))?.task_text ?? null,
        })),
      },
    },
  })
}

/** POST /api/staff/presence/check — staleness checker, call every 30 s */
export async function POST_CHECK(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager', 'staff'])) return AuthError.forbidden()

  const { incident_id } = await req.json() as { incident_id: string }
  if (!incident_id) {
    return NextResponse.json({ success: false, error: 'incident_id required' }, { status: 400 })
  }

  const result = await checkStalePresence(user.profile.hotel_id, incident_id)
  return NextResponse.json<ApiResponse<typeof result>>({ success: true, data: result })
}
