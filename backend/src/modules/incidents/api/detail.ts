import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser, hasRole, AuthError } from '@/core/auth'
import { adminDb } from '@/core/db'
import { updateIncidentStatus, build911Packet } from '@/modules/incidents/service'
import type { ApiResponse, Incident } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, incidentId: string) {
  const user = await getRequestUser(req)
  if (!user) return AuthError.unauthorized()

  const { data: incident, error } = await adminDb
    .from('incidents')
    .select('*')
    .eq('id', incidentId)
    .eq('hotel_id', user.profile.hotel_id)
    .single()

  if (error || !incident) {
    return NextResponse.json({ success: false, error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  // Guests can only see active/resolved incidents on their floor
  if (user.profile.role === 'guest') {
    const { data: loc } = await adminDb
      .from('guest_locations').select('floor')
      .eq('guest_id', user.id).eq('hotel_id', user.profile.hotel_id).single()

    if (!loc || loc.floor !== incident.floor || !['active','resolved'].includes(incident.status)) {
      return NextResponse.json({ success: false, error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
    }
  }

  // Enrich with tasks and guest summary for manager/staff
  const [tasksResult, guestSummaryResult] = await Promise.all([
    adminDb.from('staff_tasks').select('id, assigned_to_role, task_text, status, priority, accepted_at, completed_at')
      .eq('incident_id', incidentId).order('priority', { ascending: true }),
    hasRole(user, ['manager', 'staff', 'responder'])
      ? adminDb.from('guest_notifications').select('status, guest_response, language').eq('incident_id', incidentId)
      : Promise.resolve({ data: null }),
  ])

  let guestSummary = null
  if (guestSummaryResult.data) {
    const n = guestSummaryResult.data
    guestSummary = {
      total_notified: n.length,
      confirmed_safe: n.filter((x: { guest_response: string }) => x.guest_response === 'safe').length,
      needs_help: n.filter((x: { guest_response: string }) => x.guest_response === 'needs_help').length,
      languages: [...new Set(n.map((x: { language: string }) => x.language))],
    }
  }

  return NextResponse.json<ApiResponse<unknown>>({
    success: true,
    data: { ...incident, tasks: tasksResult.data ?? [], guest_summary: guestSummary },
  })
}

export async function PATCH(req: NextRequest, incidentId: string) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager', 'staff'])) return AuthError.forbidden()

  const { action } = await req.json() as {
    action: 'confirm' | 'investigate' | 'dismiss' | 'resolve' | 'escalate_911'
  }

  const validActions = ['confirm', 'investigate', 'dismiss', 'resolve', 'escalate_911']
  if (!validActions.includes(action)) {
    return NextResponse.json({ success: false, error: `Invalid action: ${action}` }, { status: 400 })
  }

  // Verify incident belongs to this hotel
  const { data: existing } = await adminDb
    .from('incidents').select('id, hotel_id').eq('id', incidentId)
    .eq('hotel_id', user.profile.hotel_id).single()

  if (!existing) {
    return NextResponse.json({ success: false, error: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const updated = await updateIncidentStatus(incidentId, action)

  // For 911 escalation, include the full data packet
  if (action === 'escalate_911') {
    const packet = await build911Packet(incidentId, user.profile.hotel_id)
    return NextResponse.json<ApiResponse<unknown>>({ success: true, data: { ...updated, packet_911: packet } })
  }

  return NextResponse.json<ApiResponse<Incident>>({ success: true, data: updated })
}
