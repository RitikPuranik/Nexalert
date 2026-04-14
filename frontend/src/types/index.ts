// ─── Core types mirroring backend /src/types/index.ts ─────────────────────────

export type UserRole = 'guest' | 'staff' | 'manager' | 'responder'
export type StaffRole =
  | 'security' | 'housekeeping' | 'front_desk'
  | 'maintenance' | 'management' | 'f_and_b' | 'medical'

export interface UserProfile {
  id: string
  hotel_id: string
  name: string
  role: UserRole
  staff_role: StaffRole | null
  floor_assignment: number | null
  zone_assignment: string | null
  is_on_duty: boolean
  language: string
}

export type IncidentType =
  | 'fire' | 'smoke' | 'medical' | 'security'
  | 'gas_leak' | 'power_outage' | 'flood' | 'other'

export type IncidentSeverity = 1 | 2 | 3

export type IncidentStatus =
  | 'detecting' | 'triaging' | 'active'
  | 'investigating' | 'resolved' | 'false_alarm' | 'drill'

export interface Incident {
  id: string
  hotel_id: string
  type: IncidentType
  severity: IncidentSeverity | null
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
  // Enriched fields from GET /api/incidents/[id]
  tasks?: StaffTask[]
  guest_summary?: {
    total_notified: number
    confirmed_safe: number
    needs_help: number
    languages: string[]
  } | null
}

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
  seconds_since_last_ping?: number
  seconds_until_overdue?: number
  is_overdue?: boolean
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
  assigned_tasks: { task_text: string; status: string; priority: number; accepted_at: string | null }[]
  needs_welfare_check: boolean
}

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

export interface ApiSuccess<T> { success: true; data: T }
export interface ApiError { success: false; error: string; code?: string }
export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ─── SOS Response types ───────────────────────────────────────────────────────
export interface SOSResponse {
  incident_id: string
  is_new: boolean
  severity: number | null
  alert_text: string
  evacuation_instruction: string
  exit_route: {
    label: string
    estimated_seconds: number
    path_coordinates: unknown[]
    muster_point: unknown
    is_accessible: boolean
  } | null
  deadman_token: string | null
}

export interface TriageStatusResponse {
  incident_id: string
  status: string
  severity: number | null
  triage_complete: boolean
  alert_text: string | null
  evacuation_instruction: string | null
}
