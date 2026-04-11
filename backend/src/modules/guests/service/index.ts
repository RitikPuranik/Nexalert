/**
 * Guests Module — Service Layer
 *
 * Owns: guest location management, exit route selection,
 * notification dispatch, all-clear messages.
 */

import { adminDb } from '@/core/db'
import { buildEvacuationInstruction } from '@/core/ai'
import type { GuestLocation, ExitRoute } from '@/types'

// ─── Guest Location ───────────────────────────────────────────────────────────

export async function getGuestsOnFloor(
  hotelId: string,
  floor: number
): Promise<GuestLocation[]> {
  const { data } = await adminDb
    .from('guest_locations')
    .select('id, hotel_id, guest_id, guest_name, room_number, floor, zone, last_seen_at, location_source, notification_status, guest_response, responded_at, needs_accessibility_assistance, language, phone')
    .eq('hotel_id', hotelId)
    .eq('floor', floor)
    .order('room_number', { ascending: true })
  return (data ?? []) as GuestLocation[]
}

export async function getAllGuestLocations(
  hotelId: string,
  floorFilter?: number
): Promise<GuestLocation[]> {
  let query = adminDb
    .from('guest_locations')
    .select('id, hotel_id, guest_id, guest_name, room_number, floor, zone, last_seen_at, location_source, notification_status, guest_response, responded_at, needs_accessibility_assistance, language, phone')
    .eq('hotel_id', hotelId)
    .order('floor', { ascending: true })
    .order('room_number', { ascending: true })

  if (floorFilter !== undefined) query = query.eq('floor', floorFilter)

  const { data } = await query
  return (data ?? []) as GuestLocation[]
}

export async function upsertGuestLocation(payload: {
  hotelId: string
  guestId?: string
  guestName: string
  room: string
  floor: number
  zone: string
  language: string
  phone?: string
  needsAccessibility?: boolean
}) {
  const { data: existing } = payload.guestId
    ? await adminDb.from('guest_locations').select('id').eq('guest_id', payload.guestId).eq('hotel_id', payload.hotelId).single()
    : { data: null }

  if (existing?.id) {
    return adminDb.from('guest_locations').update({
      room_number: payload.room, floor: payload.floor, zone: payload.zone,
      language: payload.language, last_seen_at: new Date().toISOString(), location_source: 'qr_scan',
    }).eq('id', existing.id)
  }

  return adminDb.from('guest_locations').insert({
    hotel_id: payload.hotelId, guest_id: payload.guestId ?? null,
    guest_name: payload.guestName, room_number: payload.room, floor: payload.floor,
    zone: payload.zone, language: payload.language, phone: payload.phone ?? null,
    needs_accessibility_assistance: payload.needsAccessibility ?? false,
    location_source: 'qr_scan', last_seen_at: new Date().toISOString(),
  })
}

export async function recordGuestResponse(
  hotelId: string,
  guestId: string,
  incidentId: string,
  response: 'safe' | 'needs_help'
) {
  const now = new Date().toISOString()
  await adminDb.from('guest_locations')
    .update({ guest_response: response, responded_at: now })
    .eq('guest_id', guestId).eq('hotel_id', hotelId)

  const { data: loc } = await adminDb.from('guest_locations')
    .select('id').eq('guest_id', guestId).eq('hotel_id', hotelId).single()

  if (loc) {
    await adminDb.from('guest_notifications')
      .update({ guest_response: response, responded_at: now })
      .eq('incident_id', incidentId).eq('guest_location_id', loc.id)
  }
}

// ─── Exit Routes ──────────────────────────────────────────────────────────────

export async function getFloorExits(hotelId: string, floor: number) {
  const { data } = await adminDb
    .from('exit_routes')
    .select('id, label, uses_elevator, is_accessible, muster_point')
    .eq('hotel_id', hotelId).eq('floor', floor)
  return (data ?? []).map((e: { id: string; label: string; uses_elevator: boolean; is_accessible: boolean }) => ({
    id: e.id, label: e.label, type: 'fire_exit', accessible: e.is_accessible,
  }))
}

export async function getExitRouteForRoom(
  hotelId: string,
  floor: number,
  room: string,
  zone: string,
  language: string,
  needsAccessibility: boolean,
  avoidZones: string[] = []
): Promise<{ route: ExitRoute | null; instruction: string; pathCoordinates: unknown[] }> {
  const { data: routes } = await adminDb
    .from('exit_routes')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('floor', floor)

  const allRoutes = (routes ?? []) as ExitRoute[]
  const best = selectBestRoute(room, zone, needsAccessibility, allRoutes, avoidZones)

  if (!best) {
    return {
      route: null,
      instruction: `Leave Room ${room} via the nearest fire exit. Do not use elevators. Proceed to the muster point.`,
      pathCoordinates: [],
    }
  }

  const labelTranslation = best.label_translations?.[language] ?? best.label
  const instruction = buildEvacuationInstruction(
    best.label_translations?.[language] ? `${best.label_translations[language]}. Proceed to {{muster_point}}.` : `Use {{exit_label}}. Proceed to {{muster_point}}.`,
    room, labelTranslation, best.muster_point.location_description,
    language, best.label_translations ?? {}
  )

  return { route: best, instruction, pathCoordinates: best.path_coordinates ?? [] }
}

function selectBestRoute(
  room: string, zone: string, needsAccessibility: boolean,
  routes: ExitRoute[], avoidZones: string[]
): ExitRoute | null {
  if (!routes.length) return null

  let candidates = routes.filter(r =>
    !r.avoid_zones?.some((z: string) => avoidZones.includes(z))
  )
  if (!candidates.length) candidates = routes // fall back to any route if all avoided

  if (needsAccessibility) {
    const accessible = candidates.filter(r => r.is_accessible && !r.uses_elevator)
    if (accessible.length) candidates = accessible
  }

  const roomSpecific = candidates.filter(r => r.room === room)
  if (roomSpecific.length) return fastest(roomSpecific)

  const zoneSpecific = candidates.filter(r => r.zone === zone && !r.room)
  if (zoneSpecific.length) return fastest(zoneSpecific)

  return fastest(candidates)
}

function fastest(routes: ExitRoute[]): ExitRoute | null {
  if (!routes.length) return null
  return routes.reduce((a, b) => a.estimated_time_seconds < b.estimated_time_seconds ? a : b)
}

// ─── Build exit routes for entire floor ───────────────────────────────────────
export async function buildFloorRoutes(
  hotelId: string,
  incident: { floor: number; zone: string; avoidZones: string[]; evacuationTemplate: string; templateTranslations: Record<string, string> },
  guests: GuestLocation[]
): Promise<Record<string, string>> {
  const { data: routes } = await adminDb
    .from('exit_routes').select('*').eq('hotel_id', hotelId).eq('floor', incident.floor)
  const allRoutes = (routes ?? []) as ExitRoute[]

  const map: Record<string, string> = {}
  for (const guest of guests) {
    const best = selectBestRoute(
      guest.room_number, guest.zone, guest.needs_accessibility_assistance,
      allRoutes, incident.avoidZones
    )
    const exitLabel = best?.label ?? 'nearest fire exit'
    const muster = best?.muster_point?.location_description ?? 'car park Level B1'
    map[guest.id] = buildEvacuationInstruction(
      incident.evacuationTemplate, guest.room_number,
      exitLabel, muster, guest.language, incident.templateTranslations
    )
  }
  return map
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function dispatchFloorAlerts(payload: {
  incidentId: string
  hotelId: string
  guestLocations: GuestLocation[]
  alertByLanguage: Record<string, string>
  evacuationByGuestId: Record<string, string>
  isDrill: boolean
}) {
  const chunks = chunkArray(payload.guestLocations, 10)
  for (const chunk of chunks) {
    await Promise.all(chunk.map(async guest => {
      const lang = guest.language ?? 'en'
      const alertText = payload.alertByLanguage[lang] ?? payload.alertByLanguage['en'] ?? 'Emergency — follow evacuation procedures.'
      const evacuation = payload.evacuationByGuestId[guest.id] ?? 'Evacuate via nearest exit immediately.'

      const status = await sendToGuest(guest, alertText, evacuation, payload.isDrill)

      await adminDb.from('guest_notifications').insert({
        incident_id: payload.incidentId, guest_location_id: guest.id,
        hotel_id: payload.hotelId, channel: 'in_app', language: lang,
        message_text: alertText, evacuation_instruction: evacuation,
        status: status ? 'sent' : 'failed',
        sent_at: status ? new Date().toISOString() : null,
      })

      await adminDb.from('guest_locations')
        .update({ notification_status: status ? 'sent' : 'failed' }).eq('id', guest.id)
    }))
  }
}

export async function notifyStaff(hotelId: string, incidentId: string) {
  const { data: staff } = await adminDb
    .from('user_profiles').select('id, name, staff_role, push_token')
    .eq('hotel_id', hotelId).eq('role', 'staff').eq('is_on_duty', true)

  if (!staff?.length) return

  const { data: tasks } = await adminDb
    .from('staff_tasks').select('*')
    .eq('incident_id', incidentId).eq('status', 'pending')

  if (!tasks?.length) return

  await Promise.all(staff.map(async (member: { id: string; staff_role: string; push_token: string | null }) => {
    const myTasks = tasks.filter((t: { assigned_to_role: string }) => t.assigned_to_role === member.staff_role)
    if (!myTasks.length) return
    // In production: send FCM push via member.push_token
    // Supabase realtime handles in-app delivery automatically
    console.log(`[NOTIFY STAFF] ${member.id}: ${myTasks.length} tasks`)
  }))
}

// All-clear message translations
const ALL_CLEAR: Record<string, string> = {
  en: 'All clear. The emergency has been resolved. You may return to your room.',
  hi: 'सब ठीक है। आपातकाल समाप्त हो गई है। आप अपने कमरे में वापस जा सकते हैं।',
  ar: 'الوضع طبيعي. تم حل حالة الطوارئ. يمكنك العودة إلى غرفتك.',
  zh: '解除警报。紧急情况已解决。您可以返回房间。',
  es: 'Todo despejado. La emergencia ha sido resuelta. Puede volver a su habitación.',
  fr: "Tout est clair. L'urgence a été résolue. Vous pouvez retourner dans votre chambre.",
  de: 'Entwarnung. Der Notfall wurde behoben. Sie können in Ihr Zimmer zurückkehren.',
  ja: '安全確認。緊急事態は解決されました。お部屋にお戻りいただけます。',
  ru: 'Отбой тревоги. Чрезвычайная ситуация устранена. Вы можете вернуться в свой номер.',
}

export async function sendAllClear(incidentId: string, hotelId: string, floor: number) {
  const { data: locs } = await adminDb
    .from('guest_locations').select('id, language')
    .eq('hotel_id', hotelId).eq('floor', floor)

  if (!locs?.length) return

  await adminDb.from('guest_notifications').insert(
    locs.map((g: { id: string; language: string }) => ({
      incident_id: incidentId, guest_location_id: g.id, hotel_id: hotelId,
      channel: 'in_app', language: g.language ?? 'en',
      message_text: ALL_CLEAR[g.language] ?? ALL_CLEAR['en'],
      evacuation_instruction: 'No further action required.',
      status: 'sent', sent_at: new Date().toISOString(),
    }))
  )

  await adminDb.from('guest_locations')
    .update({ notification_status: null, guest_response: null })
    .eq('hotel_id', hotelId).eq('floor', floor)
}

// ─── Channel delivery ─────────────────────────────────────────────────────────
async function sendToGuest(
  guest: GuestLocation, alertText: string, evacuation: string, isDrill: boolean
): Promise<boolean> {
  // SMS via Twilio if phone on file
  if (guest.phone && process.env.TWILIO_ACCOUNT_SID) {
    const ok = await sendSMS(guest.phone, `${alertText}\n\n${evacuation}`)
    if (ok) return true
  }
  // Supabase realtime handles in-app delivery to subscribed PWA clients
  console.log(`[ALERT ${isDrill ? 'DRILL' : 'LIVE'}] → Room ${guest.room_number} (${guest.language}): ${alertText.slice(0, 50)}...`)
  return true
}

async function sendSMS(phone: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: process.env.TWILIO_PHONE_NUMBER!, To: phone, Body: message }),
      }
    )
    return res.ok
  } catch { return false }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}
