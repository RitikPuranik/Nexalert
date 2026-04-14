import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/core/auth'
import { adminDb } from '@/core/db'
import { createGuestIncident, runTriagePipeline } from '@/modules/incidents/service'
import { getExitRouteForRoom, upsertGuestLocation } from '@/modules/guests/service'
import type { ApiResponse } from '@/types'
import { createDeadmanSession } from '@/modules/deadman'
import { rateLimit, getClientIp } from '@/core/rate-limit'

export const dynamic = 'force-dynamic'

// Valid incident types that can come from guest SOS
const VALID_TYPES = ['fire', 'smoke', 'medical', 'security', 'gas_leak', 'power_outage', 'flood', 'other']

// POST /api/incidents/sos
// No auth required — works from QR scan (anonymous guest)
export async function POST(req: NextRequest) {
  // Rate limit: max 10 SOS per minute per IP
  const ip = getClientIp(req)
  const limit = rateLimit(`sos:${ip}`, 10)
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please wait before submitting again.', code: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    hotel_id, type, room, floor, zone = 'main',
    language = 'en', guest_name, phone, needs_accessibility = false,
  } = body as {
    hotel_id: string; type: string; room: string; floor: number
    zone?: string; language?: string; guest_name?: string
    phone?: string; needs_accessibility?: boolean
  }

  // Input validation
  if (!hotel_id || !type || !room || floor === undefined || floor === null) {
    return NextResponse.json(
      { success: false, error: 'hotel_id, type, room, and floor are required' },
      { status: 400 }
    )
  }

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { success: false, error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  if (typeof floor !== 'number' || floor < 0 || floor > 200) {
    return NextResponse.json(
      { success: false, error: 'floor must be a valid number (0-200)' },
      { status: 400 }
    )
  }

  // Sanitize string inputs
  const sanitizedRoom = String(room).slice(0, 20).trim()
  const sanitizedZone = String(zone).slice(0, 50).trim()
  const sanitizedName = guest_name ? String(guest_name).slice(0, 100).trim() : undefined
  const sanitizedLang = String(language).slice(0, 5).trim()

  const user = await getRequestUser(req).catch(() => null)

  // Register/update guest location
  await upsertGuestLocation({
    hotelId: hotel_id,
    guestId: user?.id,
    guestName: sanitizedName ?? user?.profile?.name ?? 'Guest',
    room: sanitizedRoom, floor, zone: sanitizedZone,
    language: sanitizedLang, phone, needsAccessibility: needs_accessibility,
  })

  // Return immediate exit route — before AI triage completes
  const { instruction, route, pathCoordinates } = await getExitRouteForRoom(
    hotel_id, floor, sanitizedRoom, sanitizedZone, sanitizedLang, needs_accessibility, []
  )

  // Check for existing active incident on this floor
  const { data: existing } = await adminDb
    .from('incidents').select('id, status, severity, ai_guest_alert_en, ai_guest_alert_translations')
    .eq('hotel_id', hotel_id).eq('floor', floor)
    .in('status', ['detecting', 'triaging', 'active', 'investigating'])
    .limit(1).single()

  if (existing) {
    const translations = (existing.ai_guest_alert_translations ?? {}) as Record<string, string>
    return NextResponse.json<ApiResponse<SOSResponse>>({
      success: true,
      data: {
        incident_id: existing.id,
        is_new: false,
        severity: existing.severity,
        alert_text: translations[sanitizedLang] ?? existing.ai_guest_alert_en ?? 'Follow evacuation procedures.',
        evacuation_instruction: instruction,
        exit_route: routeSummary(route, pathCoordinates),
        deadman_token: null,
      },
    })
  }

  // Create new incident and run triage pipeline async
  const incident = await createGuestIncident({
    hotelId: hotel_id, type, floor, zone: sanitizedZone, room: sanitizedRoom,
    reporterId: user?.id ?? null,
    reporterLanguage: sanitizedLang,
  })

  // Auto-create dead man's switch session immediately after SOS
  let deadmanToken: string | null = null
  try {
    // Find the guest location we just upserted
    const { data: guestLoc } = await adminDb
      .from('guest_locations')
      .select('id')
      .eq('hotel_id', hotel_id)
      .eq('room_number', sanitizedRoom)
      .eq('floor', floor)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .single()

    const dm = await createDeadmanSession({
      incidentId: incident.id,
      hotelId: hotel_id,
      guestLocationId: guestLoc?.id ?? null,
      room: sanitizedRoom,
      floor,
      intervalSeconds: 120,
    })
    deadmanToken = dm.session_token
  } catch (err) {
    console.error('[SOS] deadman session failed (non-fatal):', err)
  }

  runTriagePipeline(incident).catch(console.error)

  return NextResponse.json<ApiResponse<SOSResponse>>({
    success: true,
    data: {
      incident_id: incident.id,
      is_new: true,
      severity: null,
      alert_text: 'Your report has been received. Help is on the way. Stay calm and follow the evacuation instructions below.',
      evacuation_instruction: instruction,
      exit_route: routeSummary(route, pathCoordinates),
      deadman_token: deadmanToken,
    },
  }, { status: 201 })
}

// GET /api/incidents/sos?incident_id=&room=&lang=
// Guest polls this after submitting — returns updated alert once AI finishes
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const incidentId = searchParams.get('incident_id')
  const room = searchParams.get('room')
  const language = searchParams.get('lang') ?? 'en'

  if (!incidentId) {
    return NextResponse.json({ success: false, error: 'incident_id required' }, { status: 400 })
  }

  const { data: incident } = await adminDb
    .from('incidents')
    .select('id, status, severity, ai_guest_alert_en, ai_guest_alert_translations, ai_triage_completed_at, floor, hotel_id, zone')
    .eq('id', incidentId)
    .single()

  if (!incident) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

  const translations = (incident.ai_guest_alert_translations ?? {}) as Record<string, string>
  const alertText = translations[language] ?? incident.ai_guest_alert_en ?? null

  let evacuationInstruction = null
  if (incident.status === 'active' && room) {
    const { instruction } = await getExitRouteForRoom(
      incident.hotel_id, incident.floor, room, incident.zone, language, false, [incident.zone]
    )
    evacuationInstruction = instruction
  }

  return NextResponse.json<ApiResponse<TriageStatusResponse>>({
    success: true,
    data: {
      incident_id: incident.id,
      status: incident.status,
      severity: incident.severity,
      triage_complete: !!incident.ai_triage_completed_at,
      alert_text: alertText,
      evacuation_instruction: evacuationInstruction,
    },
  })
}

function routeSummary(route: unknown, path: unknown[]) {
  if (!route) return null
  const r = route as { label: string; estimated_time_seconds: number; is_accessible: boolean; uses_elevator: boolean; muster_point: unknown }
  return {
    label: r.label,
    estimated_seconds: r.estimated_time_seconds,
    path_coordinates: path,
    muster_point: r.muster_point,
    is_accessible: r.is_accessible,
  }
}

interface SOSResponse {
  incident_id: string
  is_new: boolean
  severity: number | null
  alert_text: string
  evacuation_instruction: string
  exit_route: unknown
  /** Token for the dead man's switch — null if session creation failed */
  deadman_token: string | null
}

interface TriageStatusResponse {
  incident_id: string
  status: string
  severity: number | null
  triage_complete: boolean
  alert_text: string | null
  evacuation_instruction: string | null
}
