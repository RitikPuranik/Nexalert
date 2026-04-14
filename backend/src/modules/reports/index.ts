/**
 * Reports Module
 *
 * Owns: incident report generation (AI narrative + metrics),
 * drill management and performance tracking.
 *
 * Routes:
 *   POST /api/reports           Generate incident report
 *   GET  /api/reports           List reports for hotel
 *   POST /api/reports/drills    Trigger drill
 *   GET  /api/reports/drills    List past drills with metrics
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser, hasRole, AuthError } from '@/core/auth'
import { adminDb } from '@/core/db'
import { generateReportNarrative } from '@/core/ai'
import { createDrillIncident, runTriagePipeline } from '@/modules/incidents/service'
import type { ApiResponse, IncidentReport, IncidentType } from '@/types'

export const dynamic = 'force-dynamic'

// ─── Report Service ───────────────────────────────────────────────────────────

export async function generateReport(incidentId: string, userId: string, hotelId: string) {
  // Return cached report if exists
  const { data: cached } = await adminDb
    .from('incident_reports').select('*').eq('incident_id', incidentId).single()
  if (cached) return cached

  const [incidentRes, tasksRes, notifsRes] = await Promise.all([
    adminDb.from('incidents').select('*').eq('id', incidentId).single(),
    adminDb.from('staff_tasks').select('*').eq('incident_id', incidentId).order('priority'),
    adminDb.from('guest_notifications').select('*').eq('incident_id', incidentId),
  ])

  const incident = incidentRes.data
  if (!incident || incident.hotel_id !== hotelId) throw new Error('Incident not found')

  const tasks = tasksRes.data ?? []
  const notifs = notifsRes.data ?? []
  const timeline = buildTimeline(incident, tasks, notifs)
  const metrics = computeMetrics(incident, tasks)
  const notifSummary = computeNotifSummary(notifs)
  const taskSummary = computeTaskSummary(tasks)

  const narrative = await generateReportNarrative({ incident, tasks, notifications: notifs, timeline })

  const { data: report, error } = await adminDb
    .from('incident_reports')
    .insert({
      incident_id: incidentId, hotel_id: hotelId, generated_by: userId,
      executive_summary: narrative.executive_summary,
      timeline, response_metrics: metrics,
      notifications_summary: notifSummary,
      tasks_summary: taskSummary,
      recommendations: narrative.recommendations,
    })
    .select().single()

  if (error || !report) throw new Error(error?.message ?? 'Failed to save report')
  return report
}

// ─── Drill Service ────────────────────────────────────────────────────────────

export async function triggerDrill(payload: {
  hotelId: string; managerId: string
  type: IncidentType; floor: number; zone: string; room: string | null
}) {
  const incident = await createDrillIncident({
    hotelId: payload.hotelId, type: payload.type,
    floor: payload.floor, zone: payload.zone, room: payload.room,
    managerId: payload.managerId,
  })
  runTriagePipeline(incident).catch(console.error)
  return incident
}

export async function listDrills(hotelId: string) {
  const { data: drills, error } = await adminDb
    .from('incidents')
    .select('id, type, floor, zone, status, detected_at, resolved_at, severity, is_drill')
    .eq('hotel_id', hotelId).eq('is_drill', true)
    .order('detected_at', { ascending: false }).limit(20)

  if (error) throw new Error(error.message)

  return Promise.all((drills ?? []).map(async drill => {
    const { data: tasks } = await adminDb
      .from('staff_tasks').select('status, accepted_at').eq('incident_id', drill.id)
    const tl = tasks ?? []
    const base = new Date(drill.detected_at).getTime()
    const first = tl
      .filter((t: { accepted_at: string | null }) => t.accepted_at)
      .sort((a: { accepted_at: string }, b: { accepted_at: string }) =>
        new Date(a.accepted_at).getTime() - new Date(b.accepted_at).getTime())[0]

    return {
      ...drill,
      metrics: {
        tasks_total: tl.length,
        tasks_completed: tl.filter((t: { status: string }) => t.status === 'completed').length,
        completion_rate: tl.length
          ? Math.round((tl.filter((t: { status: string }) => t.status === 'completed').length / tl.length) * 100) : 0,
        first_response_ms: first?.accepted_at
          ? new Date(first.accepted_at).getTime() - base : null,
        duration_ms: drill.resolved_at
          ? new Date(drill.resolved_at).getTime() - base : null,
      },
    }
  }))
}

// ─── API Route: Reports ───────────────────────────────────────────────────────

export async function POST_REPORT(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager'])) return AuthError.forbidden()

  const { incident_id } = await req.json()
  if (!incident_id) return NextResponse.json({ success: false, error: 'incident_id required' }, { status: 400 })

  const report = await generateReport(incident_id, user.id, user.profile.hotel_id)
  return NextResponse.json<ApiResponse<IncidentReport>>({ success: true, data: report as IncidentReport }, { status: 201 })
}

export async function GET_REPORTS(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager'])) return AuthError.forbidden()

  const { searchParams } = new URL(req.url)
  const incidentId = searchParams.get('incident_id')

  let query = adminDb
    .from('incident_reports')
    .select('id, incident_id, generated_at, executive_summary, response_metrics, pdf_url')
    .eq('hotel_id', user.profile.hotel_id)
    .order('generated_at', { ascending: false })

  if (incidentId) query = query.eq('incident_id', incidentId)

  const { data, error } = await query.limit(20)
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json<ApiResponse<unknown[]>>({ success: true, data: data ?? [] })
}

// ─── API Route: Drills ────────────────────────────────────────────────────────

export async function POST_DRILL(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager'])) return AuthError.forbidden()

  const { type = 'fire', floor, zone = 'east_wing', room = null } = await req.json() as {
    type?: IncidentType; floor: number; zone?: string; room?: string | null
  }

  if (!floor) return NextResponse.json({ success: false, error: 'floor required' }, { status: 400 })

  const incident = await triggerDrill({
    hotelId: user.profile.hotel_id, managerId: user.id,
    type: type as IncidentType, floor, zone, room,
  })

  return NextResponse.json<ApiResponse<{ drill_id: string; message: string }>>({
    success: true,
    data: {
      drill_id: incident.id,
      message: `[DRILL] started on Floor ${floor}. Staff receive tasks. Guests receive [DRILL] alerts. Response times measured.`,
    },
  }, { status: 201 })
}

export async function GET_DRILLS(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager'])) return AuthError.forbidden()

  const drills = await listDrills(user.profile.hotel_id)
  return NextResponse.json<ApiResponse<unknown[]>>({ success: true, data: drills })
}

/** GET /api/reports/drills/score?drill_id= — drill scorecard with NFPA benchmarks */
export async function GET_DRILL_SCORE(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager'])) return AuthError.forbidden()

  const drillId = new URL(req.url).searchParams.get('drill_id')
  if (!drillId) return NextResponse.json({ success: false, error: 'drill_id required' }, { status: 400 })

  const score = await scoreDrill(drillId, user.profile.hotel_id)
  if (!score) return NextResponse.json({ success: false, error: 'Drill not found' }, { status: 404 })

  return NextResponse.json<ApiResponse<typeof score>>({ success: true, data: score })
}

// ─── NFPA Benchmark Scorecard ─────────────────────────────────────────────────

/** NFPA 72/101 emergency response benchmarks */
const BENCHMARKS = {
  first_response_seconds: 60,       // Staff should respond within 60s
  full_evacuation_seconds: 300,      // Full evacuation within 5 minutes
  task_completion_rate: 90,          // 90% of tasks should be completed
  notification_delivery_rate: 95,    // 95% of notifications should reach guests
}

function letterGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

async function scoreDrill(drillId: string, hotelId: string) {
  const { data: drill } = await adminDb
    .from('incidents')
    .select('id, type, floor, zone, detected_at, resolved_at, hotel_id, is_drill')
    .eq('id', drillId)
    .eq('hotel_id', hotelId)
    .eq('is_drill', true)
    .single()

  if (!drill) return null

  const [tasksRes, notifsRes] = await Promise.all([
    adminDb.from('staff_tasks').select('status, accepted_at, completed_at').eq('incident_id', drillId),
    adminDb.from('guest_notifications').select('status, guest_response').eq('incident_id', drillId),
  ])

  const tasks = tasksRes.data ?? []
  const notifs = notifsRes.data ?? []
  const base = new Date(drill.detected_at).getTime()

  // First response time
  const acceptedTasks = tasks
    .filter((t: { accepted_at: string | null }) => t.accepted_at)
    .sort((a: { accepted_at: string }, b: { accepted_at: string }) =>
      new Date(a.accepted_at).getTime() - new Date(b.accepted_at).getTime())

  const firstResponseMs = acceptedTasks.length
    ? new Date((acceptedTasks[0] as { accepted_at: string }).accepted_at).getTime() - base
    : null
  const firstResponseSeconds = firstResponseMs ? Math.round(firstResponseMs / 1000) : null

  // Duration (detection → resolution)
  const durationMs = drill.resolved_at
    ? new Date(drill.resolved_at).getTime() - base : null
  const durationSeconds = durationMs ? Math.round(durationMs / 1000) : null

  // Task completion
  const tasksTotal = tasks.length
  const tasksCompleted = tasks.filter((t: { status: string }) => t.status === 'completed').length
  const taskCompletionRate = tasksTotal ? Math.round((tasksCompleted / tasksTotal) * 100) : 0

  // Notification delivery
  const notifsTotal = notifs.length
  const notifsDelivered = notifs.filter((n: { status: string }) => ['sent', 'delivered'].includes(n.status)).length
  const notifDeliveryRate = notifsTotal ? Math.round((notifsDelivered / notifsTotal) * 100) : 0

  // Guest response rate
  const guestsSafe = notifs.filter((n: { guest_response: string | null }) => n.guest_response === 'safe').length

  // Score each dimension (0-100)
  const scores = {
    first_response: firstResponseSeconds !== null
      ? Math.max(0, 100 - Math.round(((firstResponseSeconds - BENCHMARKS.first_response_seconds) / BENCHMARKS.first_response_seconds) * 100))
      : 0,
    evacuation_time: durationSeconds !== null
      ? Math.max(0, 100 - Math.round(((durationSeconds - BENCHMARKS.full_evacuation_seconds) / BENCHMARKS.full_evacuation_seconds) * 100))
      : 0,
    task_completion: taskCompletionRate,
    notification_delivery: notifDeliveryRate,
  }

  // Weighted overall score
  const overallScore = Math.round(
    scores.first_response * 0.30 +
    scores.evacuation_time * 0.25 +
    scores.task_completion * 0.25 +
    scores.notification_delivery * 0.20
  )

  return {
    drill_id: drillId,
    type: drill.type,
    floor: drill.floor,
    zone: drill.zone,
    conducted_at: drill.detected_at,

    overall_score: overallScore,
    overall_grade: letterGrade(overallScore),

    dimensions: {
      first_response: {
        score: scores.first_response,
        grade: letterGrade(scores.first_response),
        actual_seconds: firstResponseSeconds,
        benchmark_seconds: BENCHMARKS.first_response_seconds,
        met_benchmark: firstResponseSeconds !== null && firstResponseSeconds <= BENCHMARKS.first_response_seconds,
      },
      evacuation_time: {
        score: scores.evacuation_time,
        grade: letterGrade(scores.evacuation_time),
        actual_seconds: durationSeconds,
        benchmark_seconds: BENCHMARKS.full_evacuation_seconds,
        met_benchmark: durationSeconds !== null && durationSeconds <= BENCHMARKS.full_evacuation_seconds,
      },
      task_completion: {
        score: scores.task_completion,
        grade: letterGrade(scores.task_completion),
        completed: tasksCompleted,
        total: tasksTotal,
        benchmark_rate: BENCHMARKS.task_completion_rate,
        met_benchmark: taskCompletionRate >= BENCHMARKS.task_completion_rate,
      },
      notification_delivery: {
        score: scores.notification_delivery,
        grade: letterGrade(scores.notification_delivery),
        delivered: notifsDelivered,
        total: notifsTotal,
        guests_confirmed_safe: guestsSafe,
        benchmark_rate: BENCHMARKS.notification_delivery_rate,
        met_benchmark: notifDeliveryRate >= BENCHMARKS.notification_delivery_rate,
      },
    },

    benchmarks_used: 'NFPA 72 / NFPA 101',
    recommendations: generateDrillRecommendations(scores, firstResponseSeconds, durationSeconds, taskCompletionRate),
  }
}

function generateDrillRecommendations(
  scores: Record<string, number>,
  firstResponse: number | null,
  duration: number | null,
  taskRate: number
): string[] {
  const recs: string[] = []

  if (scores.first_response < 70) {
    recs.push(`First response was ${firstResponse ?? '?'}s — NFPA standard is 60s. Consider adding more staff to the duty roster or relocating staff break areas closer to high-risk zones.`)
  }
  if (scores.evacuation_time < 70) {
    recs.push(`Total drill time was ${duration ?? '?'}s — NFPA target is 300s. Review evacuation routes for bottlenecks and conduct stairwell-specific drills.`)
  }
  if (taskRate < 80) {
    recs.push(`Only ${taskRate}% of tasks were completed. Ensure all on-duty staff have push notifications enabled and have practiced the task acceptance flow.`)
  }
  if (scores.notification_delivery < 80) {
    recs.push('Guest notification delivery was below 80%. Verify SMS provider configuration and consider adding PA system integration as a backup channel.')
  }
  if (recs.length === 0) {
    recs.push('Excellent drill performance! All metrics met NFPA benchmarks. Consider increasing drill complexity by adding multi-floor scenarios or mobility-impaired guest actors.')
  }

  return recs
}

// ─── Metric helpers ───────────────────────────────────────────────────────────
function buildTimeline(
  incident: Record<string, unknown>,
  tasks: Record<string, unknown>[],
  notifs: Record<string, unknown>[]
) {
  const entries: { timestamp: string; event: string; actor: string }[] = []

  entries.push({ timestamp: incident.detected_at as string, event: `${incident.type} detected via ${incident.source}`, actor: 'System' })
  if (incident.ai_triage_completed_at) entries.push({ timestamp: incident.ai_triage_completed_at as string, event: `AI triage complete — severity ${incident.severity}`, actor: 'NexAlert AI' })
  if (incident.confirmed_at) entries.push({ timestamp: incident.confirmed_at as string, event: 'Incident confirmed and activated', actor: 'Duty Manager' })

  tasks.forEach(t => {
    if (t.accepted_at) entries.push({ timestamp: t.accepted_at as string, event: `Task accepted: ${t.task_text}`, actor: String(t.assigned_to_role) })
    if (t.completed_at) entries.push({ timestamp: t.completed_at as string, event: `Task completed: ${t.task_text}`, actor: String(t.assigned_to_role) })
  })

  const first = notifs.filter(n => n.sent_at).sort((a, b) => new Date(a.sent_at as string).getTime() - new Date(b.sent_at as string).getTime())[0]
  if (first) entries.push({ timestamp: first.sent_at as string, event: `Notifications dispatched to ${notifs.length} guests`, actor: 'System' })
  if (incident.resolved_at) entries.push({ timestamp: incident.resolved_at as string, event: 'All-clear issued', actor: 'Duty Manager' })

  return entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

function computeMetrics(incident: Record<string, unknown>, tasks: Record<string, unknown>[]) {
  const base = new Date(incident.detected_at as string).getTime()
  const triaged = incident.ai_triage_completed_at ? new Date(incident.ai_triage_completed_at as string).getTime() : null
  const resolved = incident.resolved_at ? new Date(incident.resolved_at as string).getTime() : null
  const accepted = tasks.filter(t => t.accepted_at).sort((a, b) => new Date(a.accepted_at as string).getTime() - new Date(b.accepted_at as string).getTime())
  const completed = tasks.filter(t => t.status === 'completed')

  return {
    time_to_triage_ms: triaged ? triaged - base : null,
    time_to_first_staff_response_ms: accepted[0]?.accepted_at ? new Date(accepted[0].accepted_at as string).getTime() - base : null,
    time_to_resolution_ms: resolved ? resolved - base : null,
    tasks_total: tasks.length,
    tasks_completed: completed.length,
    tasks_completion_rate: tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0,
    avg_task_acceptance_ms: accepted.length
      ? Math.round(accepted.reduce((s, t) => s + new Date(t.accepted_at as string).getTime() - base, 0) / accepted.length) : null,
  }
}

function computeNotifSummary(notifs: Record<string, unknown>[]) {
  return {
    total_guests_notified: notifs.length,
    sent: notifs.filter(n => n.status === 'sent').length,
    delivered: notifs.filter(n => n.status === 'delivered').length,
    confirmed_safe: notifs.filter(n => n.guest_response === 'safe').length,
    requested_help: notifs.filter(n => n.guest_response === 'needs_help').length,
    languages: [...new Set(notifs.map(n => n.language as string))],
  }
}

function computeTaskSummary(tasks: Record<string, unknown>[]) {
  return {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    unaccepted: tasks.filter(t => t.status === 'pending').map(t => t.task_text as string),
  }
}

