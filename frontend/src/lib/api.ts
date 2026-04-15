import type {
  ApiResponse, Incident, StaffTask, FloorHeatmapResult,
  DeadmanSession, EnrichedPresence, IncidentReport, SOSResponse,
  TriageStatusResponse, IncidentType
} from '@/types'

const BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '')

// Safe fetch — never throws, always returns ApiResponse
async function req<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<ApiResponse<T>> {
  const { token, ...init } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const res = await fetch(`${BASE}${path}`, { ...init, headers })
    const text = await res.text()
    if (!text) return { success: false, error: `Empty response (${res.status})` }
    try {
      return JSON.parse(text)
    } catch {
      return { success: false, error: `Non-JSON response (${res.status}): ${text.slice(0, 80)}` }
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

// ─── Incidents ────────────────────────────────────────────────────────────────
export const incidents = {
  list: (token: string, params?: { status?: string; floor?: number }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.floor !== undefined) qs.set('floor', String(params.floor))
    return req<Incident[]>(`/api/incidents${qs.size ? '?' + qs : ''}`, { token })
  },

  get: (id: string, token: string) =>
    req<Incident>(`/api/incidents/${id}`, { token }),

  patch: (id: string, action: 'confirm' | 'investigate' | 'dismiss' | 'resolve' | 'escalate_911', token: string) =>
    req<Incident>(`/api/incidents/${id}`, {
      method: 'PATCH', token,
      body: JSON.stringify({ action }),
    }),

  getTasks: (id: string, token: string) =>
    req<StaffTask[]>(`/api/incidents/${id}/tasks`, { token }),

  patchTask: (
    incidentId: string, taskId: string,
    action: 'accept' | 'start' | 'complete' | 'skip',
    notes: string | undefined,
    token: string
  ) =>
    req<StaffTask>(`/api/incidents/${incidentId}/tasks/${taskId}`, {
      method: 'PATCH', token,
      body: JSON.stringify({ action, notes }),
    }),
}

// ─── SOS (no auth needed) ─────────────────────────────────────────────────────
export const sos = {
  submit: (body: {
    hotel_id: string; type: string; room: string; floor: number
    zone?: string; language?: string; guest_name?: string
    phone?: string; needs_accessibility?: boolean
  }) =>
    req<SOSResponse>('/api/incidents/sos', { method: 'POST', body: JSON.stringify(body) }),

  poll: (incidentId: string, room: string, lang = 'en') =>
    req<TriageStatusResponse>(`/api/incidents/sos?incident_id=${incidentId}&room=${encodeURIComponent(room)}&lang=${lang}`),
}

// ─── Heatmap (no auth) ────────────────────────────────────────────────────────
export const heatmap = {
  get: (hotelId: string, floor: number, incidentId: string) =>
    req<FloorHeatmapResult>(`/api/heatmap?hotel_id=${hotelId}&floor=${floor}&incident_id=${incidentId}`),
}

// ─── Staff ────────────────────────────────────────────────────────────────────
export const staff = {
  setDuty: (isOnDuty: boolean, token: string) =>
    req<{ is_on_duty: boolean }>('/api/staff/duty', {
      method: 'PATCH', token, body: JSON.stringify({ is_on_duty: isOnDuty }),
    }),

  getOnDuty: (token: string) =>
    req<unknown[]>('/api/staff/duty', { token }),

  ping: (incidentId: string, floor: number | undefined, zone: string | undefined, token: string) =>
    req<{ pinged: boolean; at: string }>('/api/staff/presence/ping', {
      method: 'POST', token,
      body: JSON.stringify({ incident_id: incidentId, floor, zone }),
    }),

  getPresence: (incidentId: string, token: string) =>
    req<{ staff: EnrichedPresence[]; welfare_check_needed: { count: number; staff: unknown[] } }>(
      `/api/staff/presence?incident_id=${incidentId}`, { token }
    ),

  checkPresence: (incidentId: string, token: string) =>
    req<{ checked: number; alerts: unknown[] }>('/api/staff/presence/check', {
      method: 'POST', token, body: JSON.stringify({ incident_id: incidentId }),
    }),
}

// ─── Dead Man's Switch ────────────────────────────────────────────────────────
export const deadman = {
  // No auth — called after SOS
  start: (body: { incident_id: string; hotel_id: string; room: string; floor: number; interval_seconds?: number }) =>
    req<{ session_token: string; interval_seconds: number; next_ping_due: string; message: string }>(
      '/api/deadman/start', { method: 'POST', body: JSON.stringify(body) }
    ),

  // No auth — guest taps button
  ping: (sessionToken: string) =>
    req<{ ok: boolean; status: string; seconds_remaining: number; next_ping_due: string }>(
      '/api/deadman/ping', { method: 'POST', body: JSON.stringify({ session_token: sessionToken }) }
    ),

  // No auth — guest polls status
  status: (token: string) =>
    req<{ status: string; seconds_remaining: number; missed_pings: number; escalated: boolean }>(
      `/api/deadman/status?token=${encodeURIComponent(token)}`
    ),

  // Requires manager/staff auth — GET active sessions
  getActive: (authToken: string) =>
    req<DeadmanSession[]>('/api/deadman/active', { token: authToken }),

  // Requires manager/staff auth — POST check
  check: (authToken: string) =>
    req<{ checked: number; escalated: number; escalated_rooms: string[] }>(
      '/api/deadman/check', { method: 'POST', token: authToken, body: JSON.stringify({}) }
    ),

  // Requires manager/staff auth
  resolve: (sessionToken: string, authToken: string) =>
    req<{ resolved: boolean }>('/api/deadman/resolve', {
      method: 'POST', token: authToken,
      body: JSON.stringify({ session_token: sessionToken }),
    }),
}

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reports = {
  generate: (incidentId: string, token: string) =>
    req<IncidentReport>('/api/reports', {
      method: 'POST', token, body: JSON.stringify({ incident_id: incidentId }),
    }),

  list: (token: string, incidentId?: string) => {
    const qs = incidentId ? `?incident_id=${incidentId}` : ''
    return req<IncidentReport[]>(`/api/reports${qs}`, { token })
  },

  triggerDrill: (body: { type?: IncidentType; floor: number; zone?: string; room?: string | null }, token: string) =>
    req<{ drill_id: string; message: string }>('/api/reports/drills', {
      method: 'POST', token, body: JSON.stringify(body),
    }),

  listDrills: (token: string) =>
    req<unknown[]>('/api/reports/drills', { token }),
}

// ─── Sensors (uses x-sensor-secret header) ───────────────────────────────────
export const sensors = {
  event: (body: {
    sensor_id: string; hotel_id: string; type: string
    value: number; threshold: number; floor: number; zone: string; room?: string
  }) =>
    req<{ incident_id: string; is_duplicate: boolean }>('/api/sensors/event', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'x-sensor-secret': process.env.NEXT_PUBLIC_SENSOR_SECRET || '' },
    }),
}

// ─── Responder Portal (no auth) ───────────────────────────────────────────────
export const responder = {
  get: (incidentId: string) =>
    req<unknown>(`/api/responder/portal?incident_id=${incidentId}`),
}

// ─── Guests ───────────────────────────────────────────────────────────────────
export const guests = {
  respond: (body: { hotel_id: string; guest_id: string; incident_id: string; response: 'safe' | 'needs_help' }) =>
    req<{ recorded: boolean }>('/api/guests/locations/respond', {
      method: 'POST', body: JSON.stringify(body),
    }),

  getLocations: (token: string, floor?: number) => {
    const qs = floor !== undefined ? `?floor=${floor}` : ''
    return req<unknown[]>(`/api/guests/locations${qs}`, { token })
  },
}
