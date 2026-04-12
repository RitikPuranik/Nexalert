import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser, hasRole, AuthError } from '@/core/auth'
import { adminDb } from '@/core/db'
import type { ApiResponse, StaffTask } from '@/types'
import { upsertPresencePing } from '@/modules/staff-presence'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, incidentId: string) {
  const user = await getRequestUser(req)
  if (!user) return AuthError.unauthorized()

  let query = adminDb
    .from('staff_tasks')
    .select('*')
    .eq('incident_id', incidentId)
    .eq('hotel_id', user.profile.hotel_id)
    .order('priority', { ascending: true })

  // Staff only see tasks for their own role
  if (user.profile.role === 'staff') {
    query = query.or(
      `assigned_to_user_id.eq.${user.id},assigned_to_role.eq.${user.profile.staff_role}`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json<ApiResponse<StaffTask[]>>({ success: true, data: (data ?? []) as StaffTask[] })
}

export async function PATCH(req: NextRequest, incidentId: string, taskId: string) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['staff', 'manager'])) return AuthError.forbidden()

  const { action, notes } = await req.json() as {
    action: 'accept' | 'start' | 'complete' | 'skip'
    notes?: string
  }

  const { data: task } = await adminDb
    .from('staff_tasks').select('*')
    .eq('id', taskId).eq('incident_id', incidentId)
    .eq('hotel_id', user.profile.hotel_id).single()

  if (!task) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  // Staff can only touch tasks assigned to their role
  if (user.profile.role === 'staff') {
    const canTouch =
      task.assigned_to_user_id === user.id ||
      task.assigned_to_role === user.profile.staff_role
    if (!canTouch) return AuthError.forbidden()
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { notes }

  switch (action) {
    case 'accept':
      updates.status = 'accepted'
      updates.accepted_at = now
      updates.assigned_to_user_id = user.id
      break
    case 'start':
      updates.status = 'in_progress'
      if (!task.accepted_at) { updates.accepted_at = now; updates.assigned_to_user_id = user.id }
      break
    case 'complete':
      updates.status = 'completed'
      updates.completed_at = now
      if (!task.accepted_at) updates.accepted_at = now
      break
    case 'skip':
      updates.status = 'skipped'
      break
    default:
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })
  }

  const { data: updated, error } = await adminDb
    .from('staff_tasks').update(updates).eq('id', taskId).select().single()

  if (error || !updated) return NextResponse.json({ success: false, error: error?.message }, { status: 500 })

  // Record presence when staff accepts or starts a task
  // Seeds their presence record so the last-seen tracker knows they're active
  if (action === 'accept' || action === 'start') {
    upsertPresencePing({
      userId:     user.id,
      hotelId:    user.profile.hotel_id,
      incidentId,
      floor:      user.profile.floor_assignment ?? null,
      zone:       user.profile.zone_assignment  ?? null,
    }).catch(console.error)
  }

  // Check if all tasks are done
  checkAllTasksDone(incidentId).catch(console.error)

  return NextResponse.json<ApiResponse<StaffTask>>({ success: true, data: updated as StaffTask })
}

async function checkAllTasksDone(incidentId: string) {
  const { data } = await adminDb.from('staff_tasks').select('status').eq('incident_id', incidentId)
  if (!data) return
  const incomplete = data.filter((t: { status: string }) => !['completed','skipped'].includes(t.status))
  if (incomplete.length === 0) {
    await adminDb.from('incidents')
      .update({ ai_briefing: 'All assigned tasks completed by staff.' }).eq('id', incidentId)
  }
}
