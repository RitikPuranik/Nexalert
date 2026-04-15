'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import * as api from '@/lib/api'
import type { Incident, StaffTask, FloorHeatmapResult, DeadmanSession, EnrichedPresence } from '@/types'

// ─── Mock data for demo mode (when backend is offline) ────────────────────────
const MOCK_INCIDENTS: Incident[] = [
  {
    id: 'demo-inc-001',
    hotel_id: 'hotel-001',
    type: 'fire',
    severity: 1,
    status: 'active',
    source: 'sensor',
    is_drill: false,
    floor: 4,
    zone: 'east_wing',
    room: '412',
    sensor_id: 'smoke-04-east',
    sensor_type: 'smoke',
    sensor_value: 87,
    sensor_threshold: 50,
    reporter_id: null,
    reporter_role: null,
    reporter_language: null,
    ai_severity_reason: 'Smoke sensor exceeded threshold by 74% on occupied floor during peak hours.',
    ai_briefing: 'Smoke detected in Room 412, Floor 4 East Wing. Sensor reading 87 units (threshold 50). 8 guests registered on this floor. Evacuation recommended. Fire department ETA 6 minutes.',
    ai_responder_briefing: 'FIRE/SMOKE — Floor 4, Room 412, East Wing. 8 guests on floor. 1 guest with mobility needs (Room 419). Use stairwell B for access. Floor plan available.',
    ai_guest_alert_en: 'Emergency on your floor. Please evacuate immediately via the nearest fire exit. Do not use elevators. Proceed to assembly point at Car Park B1.',
    ai_guest_alert_translations: {
      hi: 'आपकी मंजिल पर आपातकाल। कृपया तुरंत निकटतम अग्नि निकास से निकासी करें।',
      de: 'Notfall auf Ihrer Etage. Bitte evakuieren Sie sofort über den nächsten Feuerausgang.',
    },
    ai_tasks: [],
    ai_recommend_911: true,
    ai_triage_completed_at: new Date(Date.now() - 120000).toISOString(),
    detected_at: new Date(Date.now() - 240000).toISOString(),
    confirmed_at: new Date(Date.now() - 200000).toISOString(),
    resolved_at: null,
    created_at: new Date(Date.now() - 240000).toISOString(),
    updated_at: new Date(Date.now() - 60000).toISOString(),
    tasks: [],
    guest_summary: { total_notified: 8, confirmed_safe: 3, needs_help: 1, languages: ['en', 'hi', 'de'] },
  },
  {
    id: 'demo-inc-002',
    hotel_id: 'hotel-001',
    type: 'medical',
    severity: 2,
    status: 'investigating',
    source: 'guest_sos',
    is_drill: false,
    floor: 2,
    zone: 'west_wing',
    room: '219',
    sensor_id: null,
    sensor_type: null,
    sensor_value: null,
    sensor_threshold: null,
    reporter_id: 'guest-xyz',
    reporter_role: 'guest',
    reporter_language: 'en',
    ai_severity_reason: 'Guest-initiated SOS on occupied floor, medical nature requires urgent response.',
    ai_briefing: 'Medical emergency reported from Room 219, Floor 2 West Wing by guest SOS. Nurse dispatched. AED available at Floor 2 station.',
    ai_responder_briefing: null,
    ai_guest_alert_en: 'Medical assistance is on the way to your room. Please stay calm and keep the door unlocked.',
    ai_guest_alert_translations: {},
    ai_tasks: [],
    ai_recommend_911: false,
    ai_triage_completed_at: new Date(Date.now() - 300000).toISOString(),
    detected_at: new Date(Date.now() - 360000).toISOString(),
    confirmed_at: new Date(Date.now() - 340000).toISOString(),
    resolved_at: null,
    created_at: new Date(Date.now() - 360000).toISOString(),
    updated_at: new Date(Date.now() - 30000).toISOString(),
    tasks: [],
    guest_summary: null,
  },
]

const MOCK_TASKS: StaffTask[] = [
  {
    id: 'task-001', incident_id: 'demo-inc-001', hotel_id: 'hotel-001',
    assigned_to_user_id: null, assigned_to_role: 'security',
    task_text: 'Proceed to Floor 4 East Wing immediately. Confirm fire/smoke source in Room 412. Do NOT enter if smoke visible — report back.',
    protocol_id: null, status: 'in_progress', priority: 1,
    accepted_at: new Date(Date.now() - 180000).toISOString(),
    completed_at: null, notes: null,
    created_at: new Date(Date.now() - 200000).toISOString(),
    updated_at: new Date(Date.now() - 180000).toISOString(),
  },
  {
    id: 'task-002', incident_id: 'demo-inc-001', hotel_id: 'hotel-001',
    assigned_to_user_id: null, assigned_to_role: 'housekeeping',
    task_text: 'Assist evacuation of Floor 4. Priority: Room 419 (guest needs mobility assistance). Escort to Car Park B1 assembly point.',
    protocol_id: null, status: 'accepted', priority: 2,
    accepted_at: new Date(Date.now() - 150000).toISOString(),
    completed_at: null, notes: null,
    created_at: new Date(Date.now() - 200000).toISOString(),
    updated_at: new Date(Date.now() - 150000).toISOString(),
  },
  {
    id: 'task-003', incident_id: 'demo-inc-001', hotel_id: 'hotel-001',
    assigned_to_user_id: null, assigned_to_role: 'front_desk',
    task_text: 'Alert duty manager. Call fire department if not already done. Prepare guest list for Floor 4. Stand by at main entrance.',
    protocol_id: null, status: 'pending', priority: 3,
    accepted_at: null, completed_at: null, notes: null,
    created_at: new Date(Date.now() - 200000).toISOString(),
    updated_at: new Date(Date.now() - 200000).toISOString(),
  },
  {
    id: 'task-004', incident_id: 'demo-inc-001', hotel_id: 'hotel-001',
    assigned_to_user_id: null, assigned_to_role: 'maintenance',
    task_text: 'Shut off HVAC for Floor 4 East Wing to prevent smoke spread. Report to Floor 4 utility room.',
    protocol_id: null, status: 'completed', priority: 4,
    accepted_at: new Date(Date.now() - 170000).toISOString(),
    completed_at: new Date(Date.now() - 90000).toISOString(),
    notes: 'HVAC isolated for floors 4-5 east wing.',
    created_at: new Date(Date.now() - 200000).toISOString(),
    updated_at: new Date(Date.now() - 90000).toISOString(),
  },
]

// ─── Incidents list ────────────────────────────────────────────────────────────
export function useIncidents(params?: { status?: string; floor?: number }) {
  const { token } = useAuth()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDemoMode, setIsDemoMode] = useState(false)

  const fetch = useCallback(async () => {
    if (!token) return
    const res = await api.incidents.list(token, params)
    if (res.success) {
      setIncidents(res.data)
      setIsDemoMode(false)
    } else {
      // Backend offline — use mock data
      setIsDemoMode(true)
      const filtered = params?.status
        ? MOCK_INCIDENTS.filter(i => i.status === params.status)
        : MOCK_INCIDENTS
      setIncidents(filtered)
    }
    setIsLoading(false)
  }, [token, params?.status, params?.floor])

  useEffect(() => {
    fetch()
    const t = setInterval(fetch, 8000)
    return () => clearInterval(t)
  }, [fetch])

  return { incidents, isLoading, isDemoMode, refetch: fetch }
}

// ─── Single incident ──────────────────────────────────────────────────────────
export function useIncident(id: string | null) {
  const { token } = useAuth()
  const [incident, setIncident] = useState<Incident | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!token || !id) return
    const res = await api.incidents.get(id, token)
    if (res.success) {
      setIncident(res.data)
    } else {
      // Demo fallback
      const mock = MOCK_INCIDENTS.find(i => i.id === id) ?? null
      setIncident(mock)
    }
    setIsLoading(false)
  }, [token, id])

  useEffect(() => {
    fetch()
    const t = setInterval(fetch, 5000)
    return () => clearInterval(t)
  }, [fetch])

  return { incident, isLoading, refetch: fetch }
}

// ─── Tasks for incident ────────────────────────────────────────────────────────
export function useTasksMock(incidentId: string | null) {
  const { token } = useAuth()
  const [tasks, setTasks] = useState<StaffTask[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!token || !incidentId) return
    const res = await api.incidents.getTasks(incidentId, token)
    if (res.success) {
      setTasks(res.data)
    } else {
      // Demo fallback
      setTasks(MOCK_TASKS.filter(t => t.incident_id === incidentId))
    }
    setIsLoading(false)
  }, [token, incidentId])

  useEffect(() => {
    fetch()
    const t = setInterval(fetch, 5000)
    return () => clearInterval(t)
  }, [fetch])

  const updateTask = useCallback(async (taskId: string, action: 'accept' | 'start' | 'complete' | 'skip') => {
    if (!token || !incidentId) return
    const res = await api.incidents.patchTask(incidentId, taskId, action, undefined, token)
    if (res.success) {
      setTasks(prev => prev.map(t => t.id === taskId ? res.data : t))
    } else {
      // Demo: update locally
      const statusMap = { accept: 'accepted', start: 'in_progress', complete: 'completed', skip: 'skipped' } as const
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: statusMap[action], accepted_at: t.accepted_at ?? new Date().toISOString() }
          : t
      ))
    }
  }, [token, incidentId])

  return { tasks, isLoading, updateTask }
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────
export function useHeatmap(hotelId: string, floor: number, incidentId: string | null) {
  const [heatmap, setHeatmap] = useState<FloorHeatmapResult | null>(null)

  const fetch = useCallback(async () => {
    if (!incidentId) return
    const res = await api.heatmap.get(hotelId, floor, incidentId)
    if (res.success) {
      setHeatmap(res.data)
    } else {
      // Demo heatmap
      setHeatmap({
        floor, hotel_id: hotelId, incident_id: incidentId,
        computed_at: new Date().toISOString(),
        rooms: [
          { room_number: '401', floor, zone: 'east_wing', status: 'safe', colour: 'green', guest_name: 'Mr. Patel', language: 'en', needs_accessibility: false, notification_sent_at: new Date(Date.now()-120000).toISOString(), seconds_waiting: null, responded_at: new Date(Date.now()-90000).toISOString(), guest_response: 'safe' },
          { room_number: '402', floor, zone: 'east_wing', status: 'no_response', colour: 'amber', guest_name: 'Ms. Chen', language: 'zh', needs_accessibility: false, notification_sent_at: new Date(Date.now()-120000).toISOString(), seconds_waiting: 120, responded_at: null, guest_response: null },
          { room_number: '403', floor, zone: 'east_wing', status: 'safe', colour: 'green', guest_name: 'Dr. Schmidt', language: 'de', needs_accessibility: false, notification_sent_at: new Date(Date.now()-120000).toISOString(), seconds_waiting: null, responded_at: new Date(Date.now()-60000).toISOString(), guest_response: 'safe' },
          { room_number: '404', floor, zone: 'east_wing', status: 'no_response', colour: 'amber', guest_name: 'Mr. Johnson', language: 'en', needs_accessibility: false, notification_sent_at: new Date(Date.now()-120000).toISOString(), seconds_waiting: 115, responded_at: null, guest_response: null },
          { room_number: '412', floor, zone: 'east_wing', status: 'needs_help', colour: 'red', guest_name: 'Mrs. Kumar', language: 'hi', needs_accessibility: false, notification_sent_at: new Date(Date.now()-120000).toISOString(), seconds_waiting: null, responded_at: new Date(Date.now()-30000).toISOString(), guest_response: 'needs_help' },
          { room_number: '419', floor, zone: 'east_wing', status: 'no_response', colour: 'amber', guest_name: 'Ms. Petrov', language: 'ru', needs_accessibility: true, notification_sent_at: new Date(Date.now()-120000).toISOString(), seconds_waiting: 110, responded_at: null, guest_response: null },
          { room_number: '420', floor, zone: 'east_wing', status: 'empty', colour: 'gray', guest_name: null, language: null, needs_accessibility: false, notification_sent_at: null, seconds_waiting: null, responded_at: null, guest_response: null },
          { room_number: '421', floor, zone: 'east_wing', status: 'safe', colour: 'green', guest_name: 'Mr. Ali', language: 'ar', needs_accessibility: false, notification_sent_at: new Date(Date.now()-120000).toISOString(), seconds_waiting: null, responded_at: new Date(Date.now()-45000).toISOString(), guest_response: 'safe' },
        ],
        summary: { total: 8, safe: 3, needs_help: 1, no_response: 3, unreachable: 0, empty: 1 },
      })
    }
  }, [hotelId, floor, incidentId])

  useEffect(() => {
    fetch()
    const t = setInterval(fetch, 10000)
    return () => clearInterval(t)
  }, [fetch])

  return heatmap
}

// ─── Dead man's switch – active sessions ─────────────────────────────────────
export function useDeadmanSessions() {
  const { token } = useAuth()
  const [sessions, setSessions] = useState<DeadmanSession[]>([])

  const fetch = useCallback(async () => {
    if (!token) return
    const res = await api.deadman.getActive(token)
    if (res.success) setSessions(res.data)
    // Silently fail if backend offline — empty list is fine
  }, [token])

  useEffect(() => {
    fetch()
    const t = setInterval(fetch, 15000)
    return () => clearInterval(t)
  }, [fetch])

  return sessions
}

// ─── Staff presence ───────────────────────────────────────────────────────────
export function useStaffPresence(incidentId: string | null) {
  const { token } = useAuth()
  const [presence, setPresence] = useState<EnrichedPresence[]>([])
  const [welfareAlerts, setWelfareAlerts] = useState(0)

  const fetch = useCallback(async () => {
    if (!token || !incidentId) return
    const res = await api.staff.getPresence(incidentId, token)
    if (res.success) {
      setPresence(res.data.staff)
      setWelfareAlerts(res.data.welfare_check_needed.count)
    } else {
      // Demo presence data
      setPresence([
        { user_id: 'staff-001', name: 'Ravi Kumar', staff_role: 'security', phone: '+91-98765-43210', floor: 4, zone: 'east_wing', status: 'active', last_ping_at: new Date(Date.now()-30000).toISOString(), seconds_since_ping: 30, silent_for_seconds: null, assigned_tasks: [{ task_text: 'Assess smoke source in Room 412', status: 'in_progress', priority: 1, accepted_at: new Date(Date.now()-180000).toISOString() }], needs_welfare_check: false },
        { user_id: 'staff-002', name: 'Priya Singh', staff_role: 'housekeeping', phone: '+91-87654-32109', floor: 4, zone: 'west_wing', status: 'silent', last_ping_at: new Date(Date.now()-140000).toISOString(), seconds_since_ping: 140, silent_for_seconds: 20, assigned_tasks: [{ task_text: 'Assist Floor 4 guest evacuation', status: 'accepted', priority: 2, accepted_at: new Date(Date.now()-150000).toISOString() }], needs_welfare_check: true },
        { user_id: 'staff-003', name: 'Amit Sharma', staff_role: 'front_desk', phone: null, floor: 1, zone: 'lobby', status: 'active', last_ping_at: new Date(Date.now()-20000).toISOString(), seconds_since_ping: 20, silent_for_seconds: null, assigned_tasks: [], needs_welfare_check: false },
      ])
      setWelfareAlerts(1)
    }
  }, [token, incidentId])

  useEffect(() => {
    fetch()
    const t = setInterval(fetch, 10000)
    return () => clearInterval(t)
  }, [fetch])

  return { presence, welfareAlerts }
}

// ─── Dead man's switch – guest-side countdown ──────────────────────────────────
export function useDeadmanPing(sessionToken: string | null) {
  const [secondsLeft, setSecondsLeft] = useState(120)
  const [status, setStatus] = useState<string>('active')
  const [lastPinged, setLastPinged] = useState<Date>(new Date())

  const ping = useCallback(async () => {
    if (!sessionToken) return
    const res = await api.deadman.ping(sessionToken)
    if (res.success) {
      setSecondsLeft(res.data.seconds_remaining)
      setStatus(res.data.status)
      setLastPinged(new Date())
    } else {
      // Demo: just reset the timer
      setSecondsLeft(120)
      setLastPinged(new Date())
    }
  }, [sessionToken])

  // Countdown
  useEffect(() => {
    const t = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  // Poll actual status every 30s
  useEffect(() => {
    if (!sessionToken) return
    const poll = async () => {
      const res = await api.deadman.status(sessionToken)
      if (res.success) {
        setSecondsLeft(res.data.seconds_remaining)
        setStatus(res.data.status)
      }
    }
    poll()
    const t = setInterval(poll, 30000)
    return () => clearInterval(t)
  }, [sessionToken])

  return { secondsLeft, status, lastPinged, ping }
}
