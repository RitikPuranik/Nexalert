'use client'

/**
 * Frontend Hooks — Supabase Realtime subscriptions
 *
 * Each hook maps to one module and owns its own channel.
 * Import only what your component needs.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { getDb } from '@/core/db'
import type { Incident, StaffTask, GuestLocation, GuestNotification } from '@/types'

// ─── Incidents Module Hooks ────────────────────────────────────────────────────

/** Live list of active incidents for the manager dashboard */
export function useActiveIncidents(hotelId: string) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hotelId) return
    const db = getDb()

    db.from('incidents')
      .select('*')
      .eq('hotel_id', hotelId)
      .in('status', ['detecting', 'triaging', 'active', 'investigating'])
      .order('detected_at', { ascending: false })
      .then(({ data }) => { setIncidents((data as Incident[]) ?? []); setLoading(false) })

    const ch = db.channel(`incidents:${hotelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents', filter: `hotel_id=eq.${hotelId}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'INSERT') setIncidents(p => [n as Incident, ...p])
          else if (eventType === 'UPDATE') setIncidents(p => p.map(i => i.id === (n as Incident).id ? n as Incident : i))
          else if (eventType === 'DELETE') setIncidents(p => p.filter(i => i.id !== (o as Incident).id))
        })
      .subscribe()

    return () => { db.removeChannel(ch) }
  }, [hotelId])

  return { incidents, loading }
}

/** Single incident — live updates for the command view */
export function useIncident(incidentId: string | null) {
  const [incident, setIncident] = useState<Incident | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!incidentId) { setLoading(false); return }
    const db = getDb()

    db.from('incidents').select('*').eq('id', incidentId).single()
      .then(({ data }) => { setIncident(data as Incident); setLoading(false) })

    const ch = db.channel(`incident:${incidentId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'incidents', filter: `id=eq.${incidentId}` },
        ({ new: n }) => setIncident(n as Incident))
      .subscribe()

    return () => { db.removeChannel(ch) }
  }, [incidentId])

  return { incident, loading }
}

/** Live elapsed time counter */
export function useIncidentTimer(detectedAt: string | null) {
  const [elapsed, setElapsed] = useState(0)
  const ref = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!detectedAt) return
    const base = new Date(detectedAt).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - base) / 1000))
    tick()
    ref.current = setInterval(tick, 1000)
    return () => { if (ref.current) clearInterval(ref.current) }
  }, [detectedAt])

  const mm = Math.floor(elapsed / 60).toString().padStart(2, '0')
  const ss = (elapsed % 60).toString().padStart(2, '0')
  return { elapsed, formatted: `${mm}:${ss}` }
}

// ─── Staff Module Hooks ────────────────────────────────────────────────────────

/** Staff task list for an incident — filtered to role for staff, all for manager */
export function useStaffTasks(incidentId: string | null, myRole?: string) {
  const [tasks, setTasks] = useState<StaffTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!incidentId) { setLoading(false); return }
    const db = getDb()

    let q = db.from('staff_tasks').select('*').eq('incident_id', incidentId).order('priority', { ascending: true })
    if (myRole) q = q.eq('assigned_to_role', myRole)

    q.then(({ data }) => { setTasks((data as StaffTask[]) ?? []); setLoading(false) })

    const ch = db.channel(`tasks:${incidentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_tasks', filter: `incident_id=eq.${incidentId}` },
        ({ eventType, new: n }) => {
          if (eventType === 'INSERT') setTasks(p => [...p, n as StaffTask].sort((a, b) => a.priority - b.priority))
          else if (eventType === 'UPDATE') setTasks(p => p.map(t => t.id === (n as StaffTask).id ? n as StaffTask : t))
        })
      .subscribe()

    return () => { db.removeChannel(ch) }
  }, [incidentId, myRole])

  const pending = tasks.filter(t => t.status === 'pending')
  const inProgress = tasks.filter(t => t.status === 'in_progress' || t.status === 'accepted')
  const completed = tasks.filter(t => t.status === 'completed')
  const completionRate = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0

  return { tasks, pending, inProgress, completed, completionRate, loading }
}

/** Accept / complete a task — with optimistic status update */
export function useTaskAction(authToken: string) {
  const [updating, setUpdating] = useState<string | null>(null)

  const updateTask = useCallback(async (
    incidentId: string,
    taskId: string,
    action: 'accept' | 'start' | 'complete' | 'skip',
    notes?: string
  ) => {
    setUpdating(taskId)
    try {
      const res = await fetch(`/api/incidents/${incidentId}/tasks?task_id=${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ action, notes }),
      })
      return res.json()
    } finally { setUpdating(null) }
  }, [authToken])

  return { updateTask, updating }
}

// ─── Guests Module Hooks ───────────────────────────────────────────────────────

/**
 * All guest locations in the hotel — live updates.
 * Manager/Staff/Responder: full list.
 * Used for the floor map on manager dashboard.
 */
export function useGuestLocations(hotelId: string, floorFilter?: number) {
  const [locations, setLocations] = useState<GuestLocation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hotelId) return
    const db = getDb()

    let q = db.from('guest_locations').select('*').eq('hotel_id', hotelId)
      .order('floor', { ascending: true }).order('room_number', { ascending: true })
    if (floorFilter !== undefined) q = q.eq('floor', floorFilter)

    q.then(({ data }) => { setLocations((data as GuestLocation[]) ?? []); setLoading(false) })

    const ch = db.channel(`guests:${hotelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guest_locations', filter: `hotel_id=eq.${hotelId}` },
        ({ eventType, new: n, old: o }) => {
          if (eventType === 'INSERT') setLocations(p => [...p, n as GuestLocation])
          else if (eventType === 'UPDATE') setLocations(p => p.map(g => g.id === (n as GuestLocation).id ? n as GuestLocation : g))
          else if (eventType === 'DELETE') setLocations(p => p.filter(g => g.id !== (o as GuestLocation).id))
        })
      .subscribe()

    return () => { db.removeChannel(ch) }
  }, [hotelId, floorFilter])

  const byFloor = locations.reduce((acc, g) => {
    if (!acc[g.floor]) acc[g.floor] = []
    acc[g.floor].push(g)
    return acc
  }, {} as Record<number, GuestLocation[]>)

  const needingHelp = locations.filter(g => g.guest_response === 'needs_help')
  const confirmedSafe = locations.filter(g => g.guest_response === 'safe')
  const notResponded = locations.filter(g => !g.guest_response && g.notification_status === 'sent')

  return { locations, byFloor, needingHelp, confirmedSafe, notResponded, loading }
}

/** Guest PWA — incoming alert notifications for this guest */
export function useGuestNotifications(guestLocationId: string | null) {
  const [notifications, setNotifications] = useState<GuestNotification[]>([])
  const [latest, setLatest] = useState<GuestNotification | null>(null)

  useEffect(() => {
    if (!guestLocationId) return
    const db = getDb()

    db.from('guest_notifications').select('*')
      .eq('guest_location_id', guestLocationId)
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => {
        const n = (data as GuestNotification[]) ?? []
        setNotifications(n)
        if (n.length) setLatest(n[0])
      })

    const ch = db.channel(`notifs:${guestLocationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'guest_notifications', filter: `guest_location_id=eq.${guestLocationId}` },
        ({ new: n }) => {
          setNotifications(p => [n as GuestNotification, ...p])
          setLatest(n as GuestNotification)
        })
      .subscribe()

    return () => { db.removeChannel(ch) }
  }, [guestLocationId])

  return { notifications, latest }
}

/** Guest PWA — submit SOS and poll for triage result */
export function useGuestSOS() {
  const [submitting, setSubmitting] = useState(false)
  const [incidentId, setIncidentId] = useState<string | null>(null)
  const [result, setResult] = useState<{
    alert_text: string; evacuation_instruction: string
    exit_route: unknown; severity: number | null
  } | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  const submitSOS = useCallback(async (payload: {
    hotel_id: string; type: string; room: string; floor: number
    zone: string; language: string; guest_name?: string; phone?: string; needs_accessibility?: boolean
  }) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/incidents/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (data.success) {
        setIncidentId(data.data.incident_id)
        setResult({ alert_text: data.data.alert_text, evacuation_instruction: data.data.evacuation_instruction, exit_route: data.data.exit_route, severity: data.data.severity })
        if (!data.data.severity) startPolling(data.data.incident_id, payload.room, payload.language)
      }
      return data
    } finally { setSubmitting(false) }
  }, [])

  const startPolling = (id: string, room: string, lang: string) => {
    let n = 0
    pollRef.current = setInterval(async () => {
      if (++n > 12) { clearInterval(pollRef.current!); return }
      const r = await fetch(`/api/incidents/sos?incident_id=${id}&room=${room}&lang=${lang}`)
      const d = await r.json()
      if (d.success && d.data.triage_complete) {
        setResult(p => ({ ...p!, alert_text: d.data.alert_text ?? p!.alert_text, evacuation_instruction: d.data.evacuation_instruction ?? p!.evacuation_instruction, severity: d.data.severity }))
        clearInterval(pollRef.current!)
      }
    }, 5000)
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])
  return { submitSOS, submitting, incidentId, result }
}

// ─── Sensors Module Hook ───────────────────────────────────────────────────────

/** Live sensor readings strip for manager dashboard */
export function useSensorEvents(hotelId: string) {
  const [events, setEvents] = useState<{ sensor_id: string; value: number; triggered: boolean; recorded_at: string }[]>([])

  useEffect(() => {
    if (!hotelId) return
    const db = getDb()

    db.from('sensor_events').select('sensor_id, value, triggered, recorded_at')
      .eq('hotel_id', hotelId).order('recorded_at', { ascending: false }).limit(20)
      .then(({ data }) => setEvents(data ?? []))

    const ch = db.channel(`sensors:${hotelId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_events', filter: `hotel_id=eq.${hotelId}` },
        ({ new: n }) => setEvents(p => {
          const filtered = p.filter(e => e.sensor_id !== (n as typeof events[0]).sensor_id)
          return [n as typeof events[0], ...filtered].slice(0, 20)
        }))
      .subscribe()

    return () => { db.removeChannel(ch) }
  }, [hotelId])

  return { events, triggered: events.filter(e => e.triggered) }
}

// ─── Dead man's switch — Guest hook ──────────────────────────────────────────

/**
 * useDeadmanSwitch  — mount this in the SOS confirmation screen.
 *
 * Shows a live countdown. Guest must tap ping() before it hits zero.
 * When the server escalates (missed 2 windows) `escalated` becomes true
 * and the UI can show a "Help is being sent to your room" message.
 *
 * @param sessionToken  Returned from POST /api/incidents/sos
 * @param intervalSecs  Should match what the server set (default 120)
 */
export function useDeadmanSwitch(sessionToken: string | null, intervalSecs = 120) {
  const [secondsLeft, setSecondsLeft]   = useState(intervalSecs)
  const [status, setStatus]             = useState<'active' | 'escalated' | 'resolved' | 'expired'>('active')
  const [missedPings, setMissedPings]   = useState(0)
  const [lastPinged, setLastPinged]     = useState<Date | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const pollRef  = useRef<NodeJS.Timeout | null>(null)

  // Live countdown
  useEffect(() => {
    if (!sessionToken) return
    timerRef.current = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [sessionToken])

  // Server poll every 30 s
  useEffect(() => {
    if (!sessionToken) return
    const poll = async () => {
      const r = await fetch(`/api/deadman/status?token=${sessionToken}`)
      const d = await r.json()
      if (d.success) {
        setStatus(d.data.status)
        setMissedPings(d.data.missed_pings)
        setSecondsLeft(d.data.seconds_remaining)
      }
    }
    poll()
    pollRef.current = setInterval(poll, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [sessionToken])

  const ping = useCallback(async () => {
    if (!sessionToken) return false
    const r = await fetch('/api/deadman/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: sessionToken }),
    })
    const d = await r.json()
    if (d.success) {
      setSecondsLeft(intervalSecs)
      setLastPinged(new Date())
      setStatus('active')
      setMissedPings(0)
    }
    return d.success as boolean
  }, [sessionToken, intervalSecs])

  const mm = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const ss = (secondsLeft % 60).toString().padStart(2, '0')

  return {
    ping,
    secondsLeft,
    formatted:   `${mm}:${ss}`,
    status,
    missedPings,
    lastPinged,
    escalated:   status === 'escalated',
    isUrgent:    secondsLeft > 0 && secondsLeft < 30,
    isOverdue:   secondsLeft === 0,
  }
}

/**
 * useDeadmanSessions  — manager dashboard.
 * Live list of all active/escalated sessions via Supabase realtime.
 */
export function useDeadmanSessions(hotelId: string) {
  const [sessions, setSessions] = useState<{
    id: string; room_number: string; floor: number; status: string
    seconds_since_last_ping: number; is_overdue: boolean; missed_pings: number
    incident_id: string; escalated_at: string | null
  }[]>([])

  useEffect(() => {
    if (!hotelId) return
    const db = getDb()
    const ch = db.channel(`deadman:${hotelId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'deadman_sessions', filter: `hotel_id=eq.${hotelId}` },
        ({ eventType, new: n }) => {
          const row = n as typeof sessions[0]
          if (eventType === 'INSERT') {
            setSessions(p => [...p, row])
          } else if (eventType === 'UPDATE') {
            setSessions(p =>
              p.map(s => s.id === row.id ? { ...s, ...row } : s)
               .filter(s => ['active', 'escalated'].includes(s.status))
            )
          }
        })
      .subscribe()
    return () => { db.removeChannel(ch) }
  }, [hotelId])

  const escalated = sessions.filter(s => s.status === 'escalated')
  return { sessions, escalated, escalatedCount: escalated.length }
}

// ─── Floor heatmap hook ───────────────────────────────────────────────────────

/**
 * useFloorHeatmap  — manager dashboard floor plan overlay.
 *
 * Polls /api/heatmap every 10 s and re-fetches on any guest_locations
 * or guest_notifications realtime event.
 *
 * Returns `rooms` array — one entry per room with colour, status, and timer.
 */
export function useFloorHeatmap(hotelId: string, floor: number | null, incidentId: string | null) {
  const [rooms, setRooms]     = useState<import('@/types').RoomHeatmapEntry[]>([])
  const [summary, setSummary] = useState<import('@/types').FloorHeatmapResult['summary'] | null>(null)
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  const fetch_ = useCallback(async () => {
    if (!hotelId || !floor || !incidentId) return
    const r = await fetch(`/api/heatmap?hotel_id=${hotelId}&floor=${floor}&incident_id=${incidentId}`)
    const d = await r.json()
    if (d.success) {
      setRooms(d.data.rooms)
      setSummary(d.data.summary)
      setLoading(false)
    }
  }, [hotelId, floor, incidentId])

  // Poll every 10 s
  useEffect(() => {
    fetch_()
    pollRef.current = setInterval(fetch_, 10_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetch_])

  // Also re-fetch on any guest_locations or guest_notifications change
  useEffect(() => {
    if (!hotelId) return
    const db = getDb()
    const ch = db.channel(`heatmap:${hotelId}:${floor}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'guest_locations', filter: `hotel_id=eq.${hotelId}` },
        () => fetch_())
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'guest_notifications', filter: `hotel_id=eq.${hotelId}` },
        () => fetch_())
      .subscribe()
    return () => { db.removeChannel(ch) }
  }, [hotelId, floor, fetch_])

  // Derived helpers
  const needingHelp    = rooms.filter(r => r.status === 'needs_help')
  const notResponded   = rooms.filter(r => r.status === 'no_response')
  const unreachable    = rooms.filter(r => r.status === 'unreachable')
  const accessibility  = rooms.filter(r => r.needs_accessibility && r.status !== 'safe')

  return { rooms, summary, loading, needingHelp, notResponded, unreachable, accessibility }
}

// ─── Staff presence hooks ─────────────────────────────────────────────────────

/**
 * usePresenceHeartbeat  — mount in any staff-facing component.
 *
 * Sends a ping immediately on mount, then every 30 s.
 * Also pings when the tab becomes visible again.
 * Pass incidentId=null when there's no active incident (pings are no-ops server-side).
 */
export function usePresenceHeartbeat(authToken: string, incidentId: string | null) {
  const send = useCallback(async () => {
    if (!authToken || !incidentId) return
    await fetch('/api/staff/presence/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ incident_id: incidentId }),
    }).catch(console.error)
  }, [authToken, incidentId])

  useEffect(() => {
    send()
    const id = setInterval(send, 30_000)
    return () => clearInterval(id)
  }, [send])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') send() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [send])
}

/**
 * useStaffPresence  — manager dashboard last-seen panel.
 *
 * Fetches enriched presence list and re-fetches on any staff_presence change.
 * Returns `welfare_check_needed` for staff who are silent with open tasks.
 */
export function useStaffPresence(authToken: string, hotelId: string, incidentId: string | null) {
  const [staff, setStaff]     = useState<import('@/types').EnrichedPresence[]>([])
  const [welfareNeeded, setWelfareNeeded] = useState<{ count: number; staff: unknown[] }>({ count: 0, staff: [] })

  const fetch_ = useCallback(async () => {
    if (!authToken || !incidentId) return
    const r = await fetch(`/api/staff/presence?incident_id=${incidentId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    const d = await r.json()
    if (d.success) {
      setStaff(d.data.staff)
      setWelfareNeeded(d.data.welfare_check_needed)
    }
  }, [authToken, incidentId])

  useEffect(() => { fetch_() }, [fetch_])

  useEffect(() => {
    if (!hotelId) return
    const db = getDb()
    const ch = db.channel(`presence:${hotelId}:${incidentId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'staff_presence', filter: `hotel_id=eq.${hotelId}` },
        () => fetch_())
      .subscribe()
    return () => { db.removeChannel(ch) }
  }, [hotelId, incidentId, fetch_])

  const silent = staff.filter(s => s.status === 'silent')
  const active = staff.filter(s => s.status === 'active')

  return { staff, silent, active, welfareNeeded, silentCount: silent.length }
}
