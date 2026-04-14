/**
 * API Client — typed fetch wrappers grouped by module.
 *
 * Usage in Next.js components / pages:
 *   import { incidentsApi, guestsApi, reportsApi } from '@/client'
 *   const { data } = await incidentsApi.list(token)
 */

import type { Incident, StaffTask, GuestLocation, IncidentType } from '@/types'

const h = (token?: string): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

async function call<T>(path: string, init: RequestInit = {}): Promise<{ success: boolean; data?: T; error?: string }> {
  const res = await fetch(path, init)
  return res.json()
}

// ─── Health & Stats ───────────────────────────────────────────────────────────
export const systemApi = {
  /** System health check — no auth */
  health: () => call<{
    service: string; version: string; status: string; uptime_seconds: number
    services: Record<string, string>; capabilities: string[]
  }>('/api/health'),

  /** Real-time statistics — no auth, pass hotel_id */
  stats: (hotelId: string) => call<unknown>(`/api/stats?hotel_id=${hotelId}`),

  /** SSE event stream — returns EventSource URL (client should use new EventSource(url)) */
  sseUrl: (hotelId: string, incidentId?: string) => {
    const q = new URLSearchParams({ hotel_id: hotelId })
    if (incidentId) q.set('incident_id', incidentId)
    return `/api/sse?${q}`
  },
}

// ─── Incidents ────────────────────────────────────────────────────────────────
export const incidentsApi = {
  /** List active/all incidents. Manager/staff/responder see all; guests see their floor. */
  list: (token: string, params?: { status?: string; floor?: number }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.floor !== undefined) q.set('floor', String(params.floor))
    return call<Incident[]>(`/api/incidents?${q}`, { headers: h(token) })
  },

  /** Full incident detail + tasks + guest summary */
  get: (token: string, id: string) =>
    call<Incident & { tasks: StaffTask[]; guest_summary: unknown }>(`/api/incidents/${id}`, { headers: h(token) }),

  /** Confirm, investigate, dismiss, resolve, or escalate to 911 */
  action: (token: string, id: string, action: 'confirm' | 'investigate' | 'dismiss' | 'resolve' | 'escalate_911') =>
    call<Incident>(`/api/incidents/${id}`, { method: 'PATCH', headers: h(token), body: JSON.stringify({ action }) }),

  /** Get full incident timeline / audit trail */
  timeline: (token: string, id: string) =>
    call<{
      incident_id: string; incident_type: string; severity: number | null
      total_events: number; events: {
        timestamp: string; event: string; actor: string
        category: string; severity?: string; elapsed_seconds: number; elapsed_formatted: string
      }[]
    }>(`/api/incidents/${id}/timeline`, { headers: h(token) }),
}

// ─── SOS (Guest) ──────────────────────────────────────────────────────────────
export const sosApi = {
  /** Submit guest SOS — no auth required */
  submit: (payload: {
    hotel_id: string; type: IncidentType; room: string; floor: number
    zone: string; language: string; guest_name?: string; phone?: string; needs_accessibility?: boolean
  }) => call<{
    incident_id: string; is_new: boolean; severity: number | null
    alert_text: string; evacuation_instruction: string; exit_route: unknown
    deadman_token: string | null
  }>('/api/incidents/sos', { method: 'POST', headers: h(), body: JSON.stringify(payload) }),

  /** Poll for triage completion after SOS */
  poll: (incidentId: string, room: string, lang = 'en') =>
    call<{
      status: string; severity: number | null; triage_complete: boolean
      alert_text: string | null; evacuation_instruction: string | null
    }>(`/api/incidents/sos?incident_id=${incidentId}&room=${room}&lang=${lang}`),
}

// ─── Staff Tasks ──────────────────────────────────────────────────────────────
export const tasksApi = {
  /** Get tasks for an incident (role-filtered for staff) */
  list: (token: string, incidentId: string) =>
    call<StaffTask[]>(`/api/incidents/${incidentId}/tasks`, { headers: h(token) }),

  /** Accept, start, complete, or skip a task */
  update: (token: string, incidentId: string, taskId: string, action: 'accept' | 'start' | 'complete' | 'skip', notes?: string) =>
    call<StaffTask>(`/api/incidents/${incidentId}/tasks?task_id=${taskId}`, {
      method: 'PATCH', headers: h(token), body: JSON.stringify({ action, notes }),
    }),
}

// ─── Sensors ──────────────────────────────────────────────────────────────────
export const sensorsApi = {
  /** Trigger a sensor event (from simulator panel or real hardware) */
  trigger: (params: {
    sensor_id: string; hotel_id: string; type: 'smoke' | 'heat' | 'gas' | 'motion'
    value: number; threshold: number; floor: number; zone: string; room?: string
  }) => fetch('/api/sensors/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sensor-secret': process.env.NEXT_PUBLIC_SENSOR_SECRET ?? '' },
    body: JSON.stringify({ ...params, timestamp: new Date().toISOString() }),
  }).then(r => r.json()),
}

// ─── Guests ───────────────────────────────────────────────────────────────────
export const guestsApi = {
  /** All guest locations. Manager/staff/responder see all; guests see their own. */
  locations: (token: string, params?: { floor?: number; incident_id?: string }) => {
    const q = new URLSearchParams()
    if (params?.floor !== undefined) q.set('floor', String(params.floor))
    if (params?.incident_id) q.set('incident_id', params.incident_id)
    return call<GuestLocation[]>(`/api/guests/locations?${q}`, { headers: h(token) })
  },

  /** Guest confirms they are safe or need assistance */
  respond: (token: string, incidentId: string, response: 'safe' | 'needs_help') =>
    call<{ response: string }>('/api/guests/locations/respond', {
      method: 'PATCH', headers: h(token),
      body: JSON.stringify({ incident_id: incidentId, response }),
    }),

  /** Get personalized exit route for a specific room — no auth required */
  exitRoute: (params: {
    hotel_id: string; floor: number; room: string; zone?: string
    lang?: string; incident_id?: string; accessible?: boolean
  }) => {
    const q = new URLSearchParams({ hotel_id: params.hotel_id, floor: String(params.floor), room: params.room })
    if (params.zone) q.set('zone', params.zone)
    if (params.lang) q.set('lang', params.lang)
    if (params.incident_id) q.set('incident_id', params.incident_id)
    if (params.accessible) q.set('accessible', 'true')
    return call<{ room: string; floor: number; instruction: string; path_coordinates: unknown[]; route: unknown }>(`/api/guests/exit-route?${q}`)
  },
}

// ─── Responder Portal ─────────────────────────────────────────────────────────
export const responderApi = {
  /** Public portal — no auth. Call with incident_id from shared URL. */
  portal: (incidentId: string) =>
    call<{
      incident: unknown; hotel: unknown; guest_summary: unknown
      task_summary: unknown; floor_plan: unknown; generated_at: string
    }>(`/api/responder/portal?incident_id=${incidentId}`),
}

// ─── Staff ────────────────────────────────────────────────────────────────────
export const staffApi = {
  /** Toggle on-duty status */
  setDuty: (token: string, isOnDuty: boolean) =>
    call<{ is_on_duty: boolean }>('/api/staff/duty', {
      method: 'PATCH', headers: h(token), body: JSON.stringify({ is_on_duty: isOnDuty }),
    }),

  /** List on-duty staff (manager only) */
  onDuty: (token: string) =>
    call<unknown[]>('/api/staff/duty', { headers: h(token) }),
}

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsApi = {
  /** Generate AI incident report (cached after first call) */
  generate: (token: string, incidentId: string) =>
    call<unknown>('/api/reports', { method: 'POST', headers: h(token), body: JSON.stringify({ incident_id: incidentId }) }),

  /** List all reports for the hotel */
  list: (token: string, incidentId?: string) => {
    const q = incidentId ? `?incident_id=${incidentId}` : ''
    return call<unknown[]>(`/api/reports${q}`, { headers: h(token) })
  },

  /** Trigger a drill */
  triggerDrill: (token: string, payload: { type?: IncidentType; floor: number; zone?: string; room?: string | null }) =>
    call<{ drill_id: string; message: string }>('/api/reports/drills', {
      method: 'POST', headers: h(token), body: JSON.stringify(payload),
    }),

  /** List past drills with metrics */
  listDrills: (token: string) =>
    call<unknown[]>('/api/reports/drills', { headers: h(token) }),
}

// ─── Dead man's switch ────────────────────────────────────────────────────────
export const deadmanApi = {
  /** Create session immediately after SOS — no auth */
  start: (payload: { incident_id: string; hotel_id: string; room: string; floor: number; guest_location_id?: string }) =>
    call<{ session_token: string; interval_seconds: number; next_ping_due: string; message: string }>(
      '/api/deadman/start', { method: 'POST', headers: h(), body: JSON.stringify(payload) }
    ),

  /** Guest taps "I'm okay" — no auth, uses token */
  ping: (sessionToken: string) =>
    call<{ ok: boolean; status: string; seconds_remaining: number; next_ping_due: string }>(
      '/api/deadman/ping', { method: 'POST', headers: h(), body: JSON.stringify({ session_token: sessionToken }) }
    ),

  /** Poll session status — no auth, uses token */
  status: (token: string) =>
    call<{ status: string; seconds_remaining: number; missed_pings: number; escalated: boolean }>(
      `/api/deadman/status?token=${token}`
    ),

  /** Periodic staleness check — manager/staff auth */
  check: (token: string) =>
    call<{ checked: number; escalated: number; escalated_rooms: string[] }>(
      '/api/deadman/check', { method: 'POST', headers: h(token) }
    ),

  /** Staff resolves a session (guest found) — manager/staff auth */
  resolve: (token: string, sessionToken: string) =>
    call<{ resolved: boolean }>(
      '/api/deadman/resolve', { method: 'POST', headers: h(token), body: JSON.stringify({ session_token: sessionToken }) }
    ),

  /** Manager: all active/escalated sessions — manager/staff auth */
  active: (token: string) =>
    call<unknown[]>('/api/deadman/active', { headers: h(token) }),
}

// ─── Floor heatmap ────────────────────────────────────────────────────────────
export const heatmapApi = {
  /** Room-by-room status for floor plan overlay — no auth */
  get: (hotelId: string, floor: number, incidentId: string) =>
    call<import('@/types').FloorHeatmapResult>(
      `/api/heatmap?hotel_id=${hotelId}&floor=${floor}&incident_id=${incidentId}`
    ),
}

// ─── Staff presence ────────────────────────────────────────────────────────────
export const presenceApi = {
  /** Staff heartbeat — call every 30 s */
  ping: (token: string, incidentId: string, opts?: { floor?: number; zone?: string }) =>
    call<{ pinged: boolean; at: string }>(
      '/api/staff/presence/ping',
      { method: 'POST', headers: h(token), body: JSON.stringify({ incident_id: incidentId, ...opts }) }
    ),

  /** Manager: enriched presence list with welfare alerts */
  get: (token: string, incidentId: string) =>
    call<{ staff: unknown[]; welfare_check_needed: { count: number; staff: unknown[] } }>(
      `/api/staff/presence?incident_id=${incidentId}`, { headers: h(token) }
    ),

  /** Periodic staleness check — call every 30 s from manager dashboard */
  check: (token: string, incidentId: string) =>
    call<{ checked: number; alerts: unknown[] }>(
      '/api/staff/presence/check',
      { method: 'POST', headers: h(token), body: JSON.stringify({ incident_id: incidentId }) }
    ),
}

// ─── Guest Registration ───────────────────────────────────────────────────────────────
export const guestRegistrationApi = {
  /** Guest self-registration via QR code — no auth */
  register: (payload: {
    hotel_id: string; room: string; floor: number; zone: string
    guest_name: string; language?: string; phone?: string; needs_accessibility?: boolean
  }) => call<{ guest_location_id: string; registered: boolean; updated: boolean; message: string }>(
    '/api/guests/register', { method: 'POST', headers: h(), body: JSON.stringify(payload) }
  ),
}

// ─── War Room ─────────────────────────────────────────────────────────────────────
export const warRoomApi = {
  /** Single endpoint with entire crisis state — manager/responder auth */
  get: (token: string, incidentId: string) =>
    call<unknown>(`/api/warroom?incident_id=${incidentId}`, { headers: h(token) }),
}

// ─── Cron ────────────────────────────────────────────────────────────────────────
export const cronApi = {
  /** Background check — runs deadman + staff presence checks for all active incidents */
  check: (cronSecret: string) =>
    fetch('/api/cron/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
    }).then(r => r.json()),
}

// ─── Drill Scorecard ───────────────────────────────────────────────────────────────
export const drillScoreApi = {
  /** Get NFPA-benchmarked drill scorecard — manager auth */
  score: (token: string, drillId: string) =>
    call<unknown>(`/api/reports/drills/score?drill_id=${drillId}`, { headers: h(token) }),
}
