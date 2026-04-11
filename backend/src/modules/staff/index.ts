/**
 * Staff Module
 *
 * Owns: task creation from triage output, duty status management.
 * Task READ and UPDATE are in incidents/api/tasks.ts (incident-scoped).
 */

import { adminDb } from '@/core/db'

// ─── Service ──────────────────────────────────────────────────────────────────

export async function createTasksFromTriage(
  incidentId: string,
  hotelId: string,
  tasks: { role: string; text: string; priority: number; protocol_id: string | null }[]
) {
  if (!tasks.length) return

  const rows = tasks.map(t => ({
    incident_id: incidentId,
    hotel_id: hotelId,
    assigned_to_role: t.role,
    task_text: t.text,
    priority: t.priority,
    protocol_id: t.protocol_id,
    status: 'pending',
  }))

  const { error } = await adminDb.from('staff_tasks').insert(rows)
  if (error) throw new Error(`Failed to create tasks: ${error.message}`)
}

export async function setStaffDutyStatus(
  userId: string,
  isOnDuty: boolean
) {
  return adminDb
    .from('user_profiles')
    .update({ is_on_duty: isOnDuty })
    .eq('id', userId)
}

export async function getOnDutyStaff(hotelId: string) {
  const { data } = await adminDb
    .from('user_profiles')
    .select('id, name, staff_role, floor_assignment, zone_assignment, is_on_duty')
    .eq('hotel_id', hotelId)
    .eq('role', 'staff')
    .eq('is_on_duty', true)
  return data ?? []
}

export async function getStaffProfile(userId: string) {
  const { data } = await adminDb
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

// ─── API Route ────────────────────────────────────────────────────────────────
// PATCH /api/staff/duty  — staff toggles their on-duty status

import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser, hasRole, AuthError } from '@/core/auth'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['staff', 'manager'])) return AuthError.forbidden()

  const { is_on_duty } = await req.json() as { is_on_duty: boolean }
  await setStaffDutyStatus(user.id, is_on_duty)

  return NextResponse.json<ApiResponse<{ is_on_duty: boolean }>>({
    success: true, data: { is_on_duty }
  })
}

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager'])) return AuthError.forbidden()

  const staff = await getOnDutyStaff(user.profile.hotel_id)
  return NextResponse.json<ApiResponse<unknown[]>>({ success: true, data: staff })
}
