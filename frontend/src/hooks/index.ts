'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import * as api from '@/lib/api'
import type { Incident, StaffTask, FloorHeatmapResult, DeadmanSession, EnrichedPresence } from '@/types'

// ─── Rich mock data (used whenever isDemoMode = true) ─────────────────────────
const NOW = () => new Date().toISOString()
const AGO = (s: number) => new Date(Date.now() - s * 1000).toISOString()

const MOCK_INCIDENTS: Incident[] = [
  {
    id: 'demo-inc-001', hotel_id: 'hotel-001', type: 'fire', severity: 1,
    status: 'active', source: 'sensor', is_drill: false, floor: 4,
    zone: 'east_wing', room: '412', sensor_id: 'smoke-04-east',
    sensor_type: 'smoke', sensor_value: 87, sensor_threshold: 50,
    reporter_id: null, reporter_role: null, reporter_language: null,
    ai_severity_reason: 'Smoke sensor exceeded threshold by 74% on occupied floor during peak hours.',
    ai_briefing: 'Smoke detected in Room 412, Floor 4 East Wing. Sensor reading 87 units (threshold 50). 8 guests on floor. Evacuation recommended. Fire dept ETA 6 min.',
    ai_responder_briefing: 'FIRE/SMOKE — Floor 4, Room 412, East Wing. 8 guests on floor. 1 mobility-needs guest (Room 419). Use stairwell B. Floor plan available via portal.',
    ai_guest_alert_en: 'Emergency on your floor. Evacuate immediately via nearest fire exit. Do not use lifts. Proceed to Car Park B1.',
    ai_guest_alert_translations: {
      hi: 'आपकी मंजिल पर आपातकाल। कृपया तुरंत निकटतम अग्नि निकास से बाहर जाएं।',
      de: 'Notfall auf Ihrer Etage. Bitte sofort über den nächsten Feuerausgang evakuieren.',
      zh: '您所在楼层发生紧急情况。请立即通过最近的消防出口疏散。',
    },
    ai_tasks: [], ai_recommend_911: true,
    ai_triage_completed_at: AGO(120),
    detected_at: AGO(240), confirmed_at: AGO(200), resolved_at: null,
    created_at: AGO(240), updated_at: AGO(30),
    guest_summary: { total_notified: 8, confirmed_safe: 3, needs_help: 1, languages: ['en', 'hi', 'de', 'zh'] },
  },
  {
    id: 'demo-inc-002', hotel_id: 'hotel-001', type: 'medical', severity: 2,
    status: 'investigating', source: 'guest_sos', is_drill: false, floor: 2,
    zone: 'west_wing', room: '219', sensor_id: null,
    sensor_type: null, sensor_value: null, sensor_threshold: null,
    reporter_id: 'guest-xyz', reporter_role: 'guest', reporter_language: 'en',
    ai_severity_reason: 'Guest-initiated SOS — medical nature requires urgent staff response.',
    ai_briefing: 'Medical emergency from Room 219, Floor 2 West Wing via guest SOS. Nurse dispatched. AED at Floor 2 station.',
    ai_responder_briefing: null,
    ai_guest_alert_en: 'Medical assistance is on the way. Please stay calm and keep the door unlocked.',
    ai_guest_alert_translations: {},
    ai_tasks: [], ai_recommend_911: false,
    ai_triage_completed_at: AGO(300),
    detected_at: AGO(360), confirmed_at: AGO(340), resolved_at: null,
    created_at: AGO(360), updated_at: AGO(30),
    guest_summary: null,
  },
  {
    id: 'demo-inc-003', hotel_id: 'hotel-001', type: 'security', severity: 3,
    status: 'resolved', source: 'staff_alert', is_drill: false, floor: 1,
    zone: 'lobby', room: null, sensor_id: null,
    sensor_type: null, sensor_value: null, sensor_threshold: null,
    reporter_id: 'staff-003', reporter_role: 'security', reporter_language: 'en',
    ai_severity_reason: 'Suspicious individual reported — resolved after verification.',
    ai_briefing: 'Security alert in lobby resolved. Individual identified as a guest. No further action required.',
    ai_responder_briefing: null,
    ai_guest_alert_en: 'Security situation has been resolved. Thank you for your patience.',
    ai_guest_alert_translations: {},
    ai_tasks: [], ai_recommend_911: false,
    ai_triage_completed_at: AGO(3600),
    detected_at: AGO(4200), confirmed_at: AGO(4100),
    resolved_at: AGO(3200), created_at: AGO(4200), updated_at: AGO(3200),
    guest_summary: null,
  },
]

const MOCK_TASKS: StaffTask[] = [
  {
    id: 'task-001', incident_id: 'demo-inc-001', hotel_id: 'hotel-001',
    assigned_to_user_id: 'staff-001', assigned_to_role: 'security',
    task_text: 'Proceed to Floor 4 East Wing. Confirm smoke source in Room 412. Do NOT enter if smoke visible — report back.',
    protocol_id: null, status: 'in_progress', priority: 1,
    accepted_at: AGO(180), completed_at: null, notes: null,
    created_at: AGO(200), updated_at: AGO(180),
  },
  {
    id: 'task-002', incident_id: 'demo-inc-001', hotel_id: 'hotel-001',
    assigned_to_user_id: null, assigned_to_role: 'housekeeping',
    task_text: 'Assist Floor 4 evacuation. PRIORITY: Room 419 has a guest needing mobility assistance. Escort to Car Park B1.',
    protocol_id: null, status: 'accepted', priority: 2,
    accepted_at: AGO(150), completed_at: null, notes: null,
    created_at: AGO(200), updated_at: AGO(150),
  },
  {
    id: 'task-003', incident_id: 'demo-inc-001', hotel_id: 'hotel-001',
    assigned_to_user_id: null, assigned_to_role: 'front_desk',
    task_text: 'Alert duty manager. Prepare Floor 4 guest list. Verify fire dept called. Stand by at main entrance to direct responders.',
    protocol_id: null, status: 'pending', priority: 3,
    accepted_at: null, completed_at: null, notes: null,
    created_at: AGO(200), updated_at: AGO(200),
  },
  {
    id: 'task-004', incident_id: 'demo-inc-001', hotel_id: 'hotel-001',
    assigned_to_user_id: 'staff-004', assigned_to_role: 'maintenance',
    task_text: 'Isolate HVAC for Floor 4 East Wing to prevent smoke spread. Report to Floor 4 utility room.',
    protocol_id: null, status: 'completed', priority: 4,
    accepted_at: AGO(170), completed_at: AGO(90),
    notes: 'HVAC isolated floors 4–5 east wing.',
    created_at: AGO(200), updated_at: AGO(90),
  },
]

const MOCK_HEATMAP: FloorHeatmapResult = {
  floor: 4, hotel_id: 'hotel-001', incident_id: 'demo-inc-001',
  computed_at: NOW(),
  rooms: [
    { room_number: '401', floor: 4, zone: 'east_wing', status: 'safe', colour: 'green', guest_name: 'Mr. Patel', language: 'en', needs_accessibility: false, notification_sent_at: AGO(120), seconds_waiting: null, responded_at: AGO(90), guest_response: 'safe' },
    { room_number: '402', floor: 4, zone: 'east_wing', status: 'no_response', colour: 'amber', guest_name: 'Ms. Chen', language: 'zh', needs_accessibility: false, notification_sent_at: AGO(120), seconds_waiting: 120, responded_at: null, guest_response: null },
    { room_number: '403', floor: 4, zone: 'east_wing', status: 'safe', colour: 'green', guest_name: 'Dr. Schmidt', language: 'de', needs_accessibility: false, notification_sent_at: AGO(120), seconds_waiting: null, responded_at: AGO(60), guest_response: 'safe' },
    { room_number: '404', floor: 4, zone: 'east_wing', status: 'no_response', colour: 'amber', guest_name: 'Mr. Johnson', language: 'en', needs_accessibility: false, notification_sent_at: AGO(120), seconds_waiting: 115, responded_at: null, guest_response: null },
    { room_number: '412', floor: 4, zone: 'east_wing', status: 'needs_help', colour: 'red', guest_name: 'Mrs. Kumar', language: 'hi', needs_accessibility: false, notification_sent_at: AGO(120), seconds_waiting: null, responded_at: AGO(30), guest_response: 'needs_help' },
    { room_number: '419', floor: 4, zone: 'east_wing', status: 'no_response', colour: 'amber', guest_name: 'Ms. Petrov', language: 'ru', needs_accessibility: true, notification_sent_at: AGO(120), seconds_waiting: 110, responded_at: null, guest_response: null },
    { room_number: '420', floor: 4, zone: 'east_wing', status: 'empty', colour: 'gray', guest_name: null, language: null, needs_accessibility: false, notification_sent_at: null, seconds_waiting: null, responded_at: null, guest_response: null },
    { room_number: '421', floor: 4, zone: 'east_wing', status: 'safe', colour: 'green', guest_name: 'Mr. Ali', language: 'ar', needs_accessibility: false, notification_sent_at: AGO(120), seconds_waiting: null, responded_at: AGO(45), guest_response: 'safe' },
  ],
  summary: { total: 8, safe: 3, needs_help: 1, no_response: 3, unreachable: 0, empty: 1 },
}

const MOCK_PRESENCE: EnrichedPresence[] = [
  { user_id: 'staff-001', name: 'Ravi Kumar', staff_role: 'security', phone: '+91-98765-43210', floor: 4, zone: 'east_wing', status: 'active', last_ping_at: AGO(30), seconds_since_ping: 30, silent_for_seconds: null, assigned_tasks: [{ task_text: 'Assess smoke in Room 412', status: 'in_progress', priority: 1, accepted_at: AGO(180) }], needs_welfare_check: false },
  { user_id: 'staff-002', name: 'Priya Singh', staff_role: 'housekeeping', phone: '+91-87654-32109', floor: 4, zone: 'west_wing', status: 'silent', last_ping_at: AGO(145), seconds_since_ping: 145, silent_for_seconds: 25, assigned_tasks: [{ task_text: 'Assist Floor 4 guest evacuation', status: 'accepted', priority: 2, accepted_at: AGO(150) }], needs_welfare_check: true },
  { user_id: 'staff-003', name: 'Amit Sharma', staff_role: 'front_desk', phone: null, floor: 1, zone: 'lobby', status: 'active', last_ping_at: AGO(15), seconds_since_ping: 15, silent_for_seconds: null, assigned_tasks: [], needs_welfare_check: false },
]

// ─── Incidents ────────────────────────────────────────────────────────────────
export function useIncidents(params?: { status?: string; floor?: number }) {
  const { token, isDemoMode } = useAuth()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    // Demo mode: never hit the backend
    if (isDemoMode) {
      const filtered = params?.status
        ? MOCK_INCIDENTS.filter(i => i.status === params.status)
        : MOCK_INCIDENTS
      setIncidents(filtered)
      setIsLoading(false)
      return
    }
    if (!token) return
    const res = await api.incidents.list(token, params)
    if (res.success) setIncidents(res.data)
    setIsLoading(false)
  }, [token, isDemoMode, params?.status, params?.floor])

  useEffect(() => {
    fetchData()
    const t = setInterval(fetchData, 8000)
    return () => clearInterval(t)
  }, [fetchData])

  return { incidents, isLoading, isDemoMode, refetch: fetchData }
}

// ─── Single incident ──────────────────────────────────────────────────────────
export function useIncident(id: string | null) {
  const { token, isDemoMode } = useAuth()
  const [incident, setIncident] = useState<Incident | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (isDemoMode) {
      setIncident(MOCK_INCIDENTS.find(i => i.id === id) ?? null)
      setIsLoading(false)
      return
    }
    if (!token || !id) return
    const res = await api.incidents.get(id, token)
    if (res.success) setIncident(res.data)
    setIsLoading(false)
  }, [token, isDemoMode, id])

  useEffect(() => {
    fetchData()
    const t = setInterval(fetchData, 5000)
    return () => clearInterval(t)
  }, [fetchData])

  return { incident, isLoading, refetch: fetchData }
}

// ─── Tasks ────────────────────────────────────────────────────────────────────
export function useTasksMock(incidentId: string | null) {
  const { token, isDemoMode } = useAuth()
  const [tasks, setTasks] = useState<StaffTask[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (isDemoMode) {
      setTasks(MOCK_TASKS.filter(t => t.incident_id === incidentId))
      setIsLoading(false)
      return
    }
    if (!token || !incidentId) return
    const res = await api.incidents.getTasks(incidentId, token)
    if (res.success) setTasks(res.data)
    setIsLoading(false)
  }, [token, isDemoMode, incidentId])

  useEffect(() => {
    fetchData()
    const t = setInterval(fetchData, 5000)
    return () => clearInterval(t)
  }, [fetchData])

  const updateTask = useCallback(async (taskId: string, action: 'accept' | 'start' | 'complete' | 'skip') => {
    const statusMap = { accept: 'accepted', start: 'in_progress', complete: 'completed', skip: 'skipped' } as const
    // Optimistic local update (works in both demo and live mode)
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: statusMap[action], accepted_at: t.accepted_at ?? NOW() }
        : t
    ))
    if (isDemoMode || !token || !incidentId) return
    const res = await api.incidents.patchTask(incidentId, taskId, action, undefined, token)
    if (res.success) setTasks(prev => prev.map(t => t.id === taskId ? res.data : t))
  }, [token, isDemoMode, incidentId])

  return { tasks, isLoading, updateTask }
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────
export function useHeatmap(hotelId: string, floor: number, incidentId: string | null) {
  const { isDemoMode } = useAuth()
  const [heatmap, setHeatmap] = useState<FloorHeatmapResult | null>(null)

  const fetchData = useCallback(async () => {
    if (isDemoMode) {
      setHeatmap({ ...MOCK_HEATMAP, floor, computed_at: NOW() })
      return
    }
    if (!incidentId) return
    const res = await api.heatmap.get(hotelId, floor, incidentId)
    if (res.success) setHeatmap(res.data)
  }, [hotelId, floor, incidentId, isDemoMode])

  useEffect(() => {
    fetchData()
    const t = setInterval(fetchData, 10000)
    return () => clearInterval(t)
  }, [fetchData])

  return heatmap
}

// ─── Dead man's switch sessions ───────────────────────────────────────────────
export function useDeadmanSessions() {
  const { token, isDemoMode } = useAuth()
  const [sessions, setSessions] = useState<DeadmanSession[]>([])

  const fetchData = useCallback(async () => {
    // Demo: show no active sessions (clean state)
    if (isDemoMode) { setSessions([]); return }
    if (!token) return
    const res = await api.deadman.getActive(token)
    if (res.success) setSessions(res.data)
  }, [token, isDemoMode])

  useEffect(() => {
    fetchData()
    const t = setInterval(fetchData, 15000)
    return () => clearInterval(t)
  }, [fetchData])

  return sessions
}

// ─── Staff presence ───────────────────────────────────────────────────────────
export function useStaffPresence(incidentId: string | null) {
  const { token, isDemoMode } = useAuth()
  const [presence, setPresence] = useState<EnrichedPresence[]>([])
  const [welfareAlerts, setWelfareAlerts] = useState(0)

  const fetchData = useCallback(async () => {
    if (isDemoMode) {
      setPresence(MOCK_PRESENCE)
      setWelfareAlerts(MOCK_PRESENCE.filter(p => p.needs_welfare_check).length)
      return
    }
    if (!token || !incidentId) return
    const res = await api.staff.getPresence(incidentId, token)
    if (res.success) {
      setPresence(res.data.staff)
      setWelfareAlerts(res.data.welfare_check_needed.count)
    }
  }, [token, isDemoMode, incidentId])

  useEffect(() => {
    fetchData()
    const t = setInterval(fetchData, 10000)
    return () => clearInterval(t)
  }, [fetchData])

  return { presence, welfareAlerts }
}

// ─── Dead man's switch guest countdown ────────────────────────────────────────
export function useDeadmanPing(sessionToken: string | null) {
  const { isDemoMode } = useAuth()
  const [secondsLeft, setSecondsLeft] = useState(120)
  const [status, setStatus] = useState<string>('active')
  const [lastPinged, setLastPinged] = useState<Date>(new Date())

  const ping = useCallback(async () => {
    if (isDemoMode || !sessionToken) {
      setSecondsLeft(120)
      setLastPinged(new Date())
      return
    }
    const res = await api.deadman.ping(sessionToken)
    if (res.success) {
      setSecondsLeft(res.data.seconds_remaining)
      setStatus(res.data.status)
      setLastPinged(new Date())
    }
  }, [sessionToken, isDemoMode])

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (isDemoMode || !sessionToken) return
    const poll = async () => {
      const res = await api.deadman.status(sessionToken)
      if (res.success) { setSecondsLeft(res.data.seconds_remaining); setStatus(res.data.status) }
    }
    poll()
    const t = setInterval(poll, 30000)
    return () => clearInterval(t)
  }, [sessionToken, isDemoMode])

  return { secondsLeft, status, lastPinged, ping }
}