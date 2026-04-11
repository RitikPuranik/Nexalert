import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser, hasRole, AuthError } from '@/core/auth'
import { adminDb } from '@/core/db'
import type { ApiResponse, Incident } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) return AuthError.unauthorized()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const floor = searchParams.get('floor')
  const hotelId = user.profile.hotel_id

  let query = adminDb
    .from('incidents')
    .select(`
      id, type, severity, status, source, is_drill,
      floor, zone, room, sensor_type, sensor_value,
      ai_briefing, ai_severity_reason, ai_recommend_911, ai_triage_completed_at,
      detected_at, confirmed_at, resolved_at, updated_at
    `)
    .eq('hotel_id', hotelId)
    .order('detected_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (floor) query = query.eq('floor', parseInt(floor))

  // Guests only see active/resolved incidents on their floor
  if (user.profile.role === 'guest') {
    const { data: loc } = await adminDb
      .from('guest_locations')
      .select('floor')
      .eq('guest_id', user.id)
      .eq('hotel_id', hotelId)
      .single()

    if (loc) {
      query = query.eq('floor', loc.floor).in('status', ['active', 'resolved'])
    }
  }

  const { data, error } = await query.limit(50)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json<ApiResponse<Incident[]>>({ success: true, data: (data ?? []) as Incident[] })
}

export async function PATCH(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager', 'staff'])) return AuthError.forbidden()

  // This handler is unused — PATCH on /api/incidents/[id] is handled by detail.ts
  return NextResponse.json({ success: false, error: 'Use PATCH /api/incidents/[id]' }, { status: 405 })
}
