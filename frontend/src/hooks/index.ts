'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import * as api from '@/lib/api'
import type { Incident, StaffTask, FloorHeatmapResult, DeadmanSession, EnrichedPresence } from '@/types'

// ─── Generic polling hook ─────────────────────────────────────────────────────
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs = 5000,
  enabled = true
) {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetch = useCallback(async () => {
    try {
      const result = await fetcher()
      setData(result)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setIsLoading(false)
    }
  }, [fetcher])

  useEffect(() => {
    if (!enabled) return
    fetch()
    timerRef.current = setInterval(fetch, intervalMs)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [enabled, intervalMs, fetch])

  return { data, isLoading, error, refetch: fetch }
}

// ─── Incidents list ────────────────────────────────────────────────────────────
export function useIncidents(params?: { status?: string; floor?: number }) {
  const { token } = useAuth()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!token) return
    try {
      const res = await api.incidents.list(token, params)
      if (res.success) setIncidents(res.data)
      else setError(res.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setIsLoading(false)
    }
  }, [token, params?.status, params?.floor])

  useEffect(() => {
    fetch()
    const t = setInterval(fetch, 8000)
    return () => clearInterval(t)
  }, [fetch])

  return { incidents, isLoading, error, refetch: fetch }
}

// ─── Single incident ──────────────────────────────────────────────────────────
export function useIncident(id: string | null) {
  const { token } = useAuth()
  const [incident, setIncident] = useState<Incident | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!token || !id) return
    try {
      const res = await api.incidents.get(id, token)
      if (res.success) setIncident(res.data)
      else setError(res.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setIsLoading(false)
    }
  }, [token, id])

  useEffect(() => {
    fetch()
    const t = setInterval(fetch, 5000)
    return () => clearInterval(t)
  }, [fetch])

  return { incident, isLoading, error, refetch: fetch }
}

// ─── Tasks for incident ────────────────────────────────────────────────────────
export function useTasksMock(incidentId: string | null): {
  tasks: StaffTask[]
  isLoading: boolean
  updateTask: (taskId: string, action: 'accept' | 'start' | 'complete' | 'skip') => Promise<void>
} {
  const { token } = useAuth()
  const [tasks, setTasks] = useState<StaffTask[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!token || !incidentId) return
    const res = await api.incidents.getTasks(incidentId, token)
    if (res.success) setTasks(res.data)
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
    if (res.success) setHeatmap(res.data)
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
    }
  }, [token, incidentId])

  useEffect(() => {
    fetch()
    const t = setInterval(fetch, 10000)
    return () => clearInterval(t)
  }, [fetch])

  return { presence, welfareAlerts }
}

// ─── Dead man's switch – guest-side ──────────────────────────────────────────
export function useDeadmanPing(sessionToken: string | null) {
  const [secondsLeft, setSecondsLeft] = useState(120)
  const [status, setStatus] = useState<string>('active')
  const [lastPinged, setLastPinged] = useState<Date | null>(null)

  const ping = useCallback(async () => {
    if (!sessionToken) return
    const res = await api.deadman.ping(sessionToken)
    if (res.success) {
      setSecondsLeft(res.data.seconds_remaining)
      setStatus(res.data.status)
      setLastPinged(new Date())
    }
  }, [sessionToken])

  // Countdown
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft(s => Math.max(0, s - 1))
    }, 1000)
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
