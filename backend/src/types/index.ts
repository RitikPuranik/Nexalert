// ─── Re-export core types ─────────────────────────────────────────────────────
export type { UserRole, StaffRole, UserProfile, AuthUser } from '@/core/auth'
export type { IncidentType, IncidentSeverity, TriageInput, TriageOutput } from '@/core/ai'

// ─── Incident ─────────────────────────────────────────────────────────────────
export type IncidentStatus =
  | 'detecting' | 'triaging' | 'active'
  | 'investigating' | 'resolved' | 'false_alarm' | 'drill'

export interface Incident {
  id: string
  hotel_id: string
  type: string
  severity: 1 | 2 | 3 | null
  status: IncidentStatus
  source: 'sensor' | 'guest_sos' | 'staff_alert' | 'manual' | 'drill'
  is_drill: boolean
  floor: number
  zone: string
  room: string | null
  sensor_id: string | null
  sensor_type: string | null
  sensor_value: number | null
  sensor_threshold: number | null
  reporter_id: string | null
  reporter_role: string | null
  reporter_language: string | null
  ai_severity_reason: string | null
  ai_briefing: string | null
  ai_responder_briefing: string | null
  ai_guest_alert_en: string | null
  ai_guest_alert_translations: Record<string, string>
  ai_tasks: unknown[]
  ai_recommend_911: boolean
  ai_triage_completed_at: string | null
  detected_at: string
  confirmed_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

// ─── Staff Task ────────────────────────────────────────────────────────────────
export type TaskStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'skipped'

export interface StaffTask {
  id: string
  incident_id: string
  hotel_id: string
  assigned_to_user_id: string | null
  assigned_to_role: string
  task_text: string
  protocol_id: string | null
  status: TaskStatus
  priority: number
  accepted_at: string | null
  completed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Guest Location ────────────────────────────────────────────────────────────
export interface GuestLocation {
  id: string
  hotel_id: string
  guest_id: string | null
  guest_name: string
  room_number: string
  floor: number
  zone: string
  last_seen_at: string
  location_source: 'check_in' | 'qr_scan' | 'sos_report' | 'manual'
  notification_status: 'pending' | 'sent' | 'delivered' | 'failed' | null
  guest_response: 'safe' | 'needs_help' | null
  responded_at: string | null
  needs_accessibility_assistance: boolean
  language: string
  phone: string | null
}

// ─── Guest Notification ────────────────────────────────────────────────────────
export interface GuestNotification {
  id: string
  incident_id: string
  guest_location_id: string
  hotel_id: string
  channel: 'push' | 'sms' | 'in_app' | 'tv_override'
  language: string
  message_text: string
  evacuation_instruction: string
  status: 'pending' | 'sent' | 'delivered' | 'failed'
  sent_at: string | null
  delivered_at: string | null
  guest_response: 'safe' | 'needs_help' | null
  responded_at: string | null
  created_at: string
}

// ─── Exit Route ────────────────────────────────────────────────────────────────
export interface ExitRoute {
  id: string
  hotel_id: string
  floor: number
  room: string | null
  zone: string
  path_coordinates: { x: number; y: number; instruction: string | null }[]
  muster_point: { id: string; label: string; location_description: string; x: number; y: number }
  estimated_time_seconds: number
  is_accessible: boolean
  uses_elevator: boolean
  avoid_zones: string[]
  label: string
  label_translations: Record<string, string>
}

// ─── Sensor ────────────────────────────────────────────────────────────────────
export interface SensorEvent {
  sensor_id: string
  hotel_id: string
  type: 'smoke' | 'heat' | 'gas' | 'motion'
  value: number
  threshold: number
  floor: number
  zone: string
  room: string | null
  timestamp: string
}

// ─── Hotel ────────────────────────────────────────────────────────────────────
export interface Hotel {
  id: string
  name: string
  address: string
  total_floors: number
  access_codes: Record<string, string>
  emergency_contacts: { label: string; number: string }[]
}

// ─── Incident Report ──────────────────────────────────────────────────────────
export interface IncidentReport {
  id: string
  incident_id: string
  hotel_id: string
  generated_at: string
  generated_by: string
  executive_summary: string
  timeline: { timestamp: string; event: string; actor: string }[]
  response_metrics: {
    time_to_triage_ms: number | null
    time_to_first_staff_response_ms: number | null
    time_to_resolution_ms: number | null
    tasks_total: number
    tasks_completed: number
    tasks_completion_rate: number
    avg_task_acceptance_ms: number | null
  }
  notifications_summary: Record<string, unknown>
  tasks_summary: Record<string, unknown>
  recommendations: string[]
  pdf_url: string | null
}

// ─── API Response wrapper ─────────────────────────────────────────────────────
export interface ApiSuccess<T> { success: true; data: T }
export interface ApiError { success: false; error: string; code?: string }
export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ─── Standard API error responses ─────────────────────────────────────────────
export const ApiErrors = {
  badRequest: (msg: string) =>
    Response.json({ success: false, error: msg, code: 'BAD_REQUEST' }, { status: 400 }),
  notFound: (msg = 'Not found') =>
    Response.json({ success: false, error: msg, code: 'NOT_FOUND' }, { status: 404 }),
  internal: (msg = 'Internal server error') =>
    Response.json({ success: false, error: msg, code: 'INTERNAL' }, { status: 500 }),
  conflict: (msg: string) =>
    Response.json({ success: false, error: msg, code: 'CONFLICT' }, { status: 409 }),
}

// ─── Dead man's switch ────────────────────────────────────────────────────────
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
  // Computed by API
  seconds_since_last_ping?: number
  seconds_until_overdue?: number
  is_overdue?: boolean
}

// ─── Floor heatmap ────────────────────────────────────────────────────────────
export type RoomStatus = 'safe' | 'needs_help' | 'no_response' | 'unreachable' | 'empty'

export interface RoomHeatmapEntry {
  room_number: string
  floor: number
  zone: string
  status: RoomStatus
  colour: 'green' | 'red' | 'amber' | 'gray'
  guest_name: string | null
  language: string | null
  needs_accessibility: boolean
  notification_sent_at: string | null
  seconds_waiting: number | null
  responded_at: string | null
  guest_response: string | null
  deadman_status: string | null
  deadman_missed_pings: number | null
}

export interface FloorHeatmapResult {
  floor: number
  hotel_id: string
  incident_id: string
  computed_at: string
  rooms: RoomHeatmapEntry[]
  summary: {
    total: number
    safe: number
    needs_help: number
    no_response: number
    unreachable: number
    empty: number
  }
}

// ─── Staff presence ────────────────────────────────────────────────────────────
// ─── Incident Timeline ──────────────────────────────────────────────────────
export interface TimelineEvent {
  timestamp: string
  event: string
  actor: string
  category: 'system' | 'ai' | 'staff' | 'guest' | 'sensor' | 'notification'
  severity?: 'info' | 'warning' | 'critical'
  elapsed_seconds: number
  elapsed_formatted: string
  metadata?: Record<string, unknown>
}

// ─── Floor Plan ──────────────────────────────────────────────────────────────
export interface FloorPlan {
  id: string
  hotel_id: string
  floor: number
  svg_url: string | null
  width_px: number
  height_px: number
  rooms: { room_number: string; x: number; y: number; w: number; h: number; zone: string }[]
  exits: { id: string; label: string; x: number; y: number; type: string; accessible: boolean }[]
  hazard_zones: unknown[]
  aed_locations: unknown[]
  muster_points: { id: string; label: string; location_description: string; x: number; y: number }[]
}

// ─── Staff presence ────────────────────────────────────────────────────────────
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
  assigned_tasks: { task_text: string; status: string; priority: number; accepted_at: string | null }[]
  needs_welfare_check: boolean
}
