/**
 * Real-time Statistics — GET /api/stats?hotel_id=
 *
 * Live operational KPIs for the manager dashboard and demo presentations.
 * Public endpoint — no auth required (for hackathon demo purposes).
 */

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/core/db'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const hotelId = new URL(req.url).searchParams.get('hotel_id')
    if (!hotelId) {
        return NextResponse.json({ success: false, error: 'hotel_id required' }, { status: 400 })
    }

    const now = Date.now()

    const [incidentsRes, tasksRes, guestsRes, presenceRes, deadmanRes, notifsRes] = await Promise.all([
        adminDb.from('incidents')
            .select('id, status, severity, type, detected_at, confirmed_at, resolved_at, ai_triage_completed_at, is_drill')
            .eq('hotel_id', hotelId)
            .order('detected_at', { ascending: false })
            .limit(100),
        adminDb.from('staff_tasks')
            .select('id, status, accepted_at, completed_at, incident_id')
            .eq('hotel_id', hotelId),
        adminDb.from('guest_locations')
            .select('id, guest_response, notification_status, needs_accessibility_assistance')
            .eq('hotel_id', hotelId),
        adminDb.from('staff_presence')
            .select('status, last_ping_at')
            .eq('hotel_id', hotelId),
        adminDb.from('deadman_sessions')
            .select('status, missed_pings')
            .eq('hotel_id', hotelId),
        adminDb.from('guest_notifications')
            .select('status, guest_response')
            .eq('hotel_id', hotelId),
    ])

    const incidents = incidentsRes.data ?? []
    const tasks = tasksRes.data ?? []
    const guests = guestsRes.data ?? []
    const presence = presenceRes.data ?? []
    const deadman = deadmanRes.data ?? []
    const notifs = notifsRes.data ?? []

    // Active incidents
    const activeStatuses = ['detecting', 'triaging', 'active', 'investigating']
    const activeIncidents = incidents.filter((i: { status: string }) => activeStatuses.includes(i.status))
    const resolvedIncidents = incidents.filter((i: { status: string }) => i.status === 'resolved')

    // Average response times (for resolved incidents)
    const responseTimes = resolvedIncidents
        .filter((i: { detected_at: string; ai_triage_completed_at: string | null }) => i.ai_triage_completed_at)
        .map((i: { detected_at: string; ai_triage_completed_at: string }) =>
            new Date(i.ai_triage_completed_at).getTime() - new Date(i.detected_at).getTime()
        )

    const avgTriageMs = responseTimes.length
        ? Math.round(responseTimes.reduce((a: number, b: number) => a + b, 0) / responseTimes.length)
        : null

    const resolutionTimes = resolvedIncidents
        .filter((i: { detected_at: string; resolved_at: string | null }) => i.resolved_at)
        .map((i: { detected_at: string; resolved_at: string }) =>
            new Date(i.resolved_at).getTime() - new Date(i.detected_at).getTime()
        )

    const avgResolutionMs = resolutionTimes.length
        ? Math.round(resolutionTimes.reduce((a: number, b: number) => a + b, 0) / resolutionTimes.length)
        : null

    // Task stats
    const completedTasks = tasks.filter((t: { status: string }) => t.status === 'completed')
    const pendingTasks = tasks.filter((t: { status: string }) => t.status === 'pending')

    // Guest accountability
    const guestsSafe = guests.filter((g: { guest_response: string }) => g.guest_response === 'safe').length
    const guestsNeedHelp = guests.filter((g: { guest_response: string }) => g.guest_response === 'needs_help').length
    const guestsNotResponded = guests.filter((g: { guest_response: string | null; notification_status: string | null }) =>
        !g.guest_response && g.notification_status === 'sent'
    ).length

    // Staff presence
    const staffActive = presence.filter((p: { status: string }) => p.status === 'active').length
    const staffSilent = presence.filter((p: { status: string }) => p.status === 'silent').length

    // Deadman
    const deadmanEscalated = deadman.filter((d: { status: string }) => d.status === 'escalated').length

    // Notification delivery rate
    const notifsSent = notifs.filter((n: { status: string }) => ['sent', 'delivered'].includes(n.status)).length
    const notifsFailed = notifs.filter((n: { status: string }) => n.status === 'failed').length

    // Incident type breakdown
    const typeBreakdown = incidents.reduce((acc: Record<string, number>, i: { type: string }) => {
        acc[i.type] = (acc[i.type] || 0) + 1
        return acc
    }, {} as Record<string, number>)

    // Severity breakdown
    const severityBreakdown = incidents.reduce((acc: Record<string, number>, i: { severity: number | null }) => {
        const key = i.severity ? `severity_${i.severity}` : 'unassessed'
        acc[key] = (acc[key] || 0) + 1
        return acc
    }, {} as Record<string, number>)

    return NextResponse.json<ApiResponse<unknown>>({
        success: true,
        data: {
            hotel_id: hotelId,
            computed_at: new Date().toISOString(),

            incidents: {
                active: activeIncidents.length,
                total: incidents.length,
                resolved: resolvedIncidents.length,
                false_alarms: incidents.filter((i: { status: string }) => i.status === 'false_alarm').length,
                drills: incidents.filter((i: { is_drill: boolean }) => i.is_drill).length,
                by_type: typeBreakdown,
                by_severity: severityBreakdown,
            },

            response_performance: {
                avg_triage_ms: avgTriageMs,
                avg_triage_formatted: avgTriageMs ? `${(avgTriageMs / 1000).toFixed(1)}s` : null,
                avg_resolution_ms: avgResolutionMs,
                avg_resolution_formatted: avgResolutionMs ? `${Math.round(avgResolutionMs / 60000)}min` : null,
            },

            tasks: {
                total: tasks.length,
                completed: completedTasks.length,
                pending: pendingTasks.length,
                in_progress: tasks.filter((t: { status: string }) => ['accepted', 'in_progress'].includes(t.status)).length,
                completion_rate: tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0,
            },

            guest_accountability: {
                total_guests: guests.length,
                confirmed_safe: guestsSafe,
                needs_help: guestsNeedHelp,
                awaiting_response: guestsNotResponded,
                needs_accessibility: guests.filter((g: { needs_accessibility_assistance: boolean }) => g.needs_accessibility_assistance).length,
                accountability_rate: guests.length
                    ? Math.round(((guestsSafe + guestsNeedHelp) / guests.length) * 100)
                    : 0,
            },

            notifications: {
                total: notifs.length,
                delivered: notifsSent,
                failed: notifsFailed,
                delivery_rate: notifs.length ? Math.round((notifsSent / notifs.length) * 100) : 0,
            },

            staff: {
                active: staffActive,
                silent: staffSilent,
                total_tracked: presence.length,
            },

            deadman_switch: {
                active_sessions: deadman.filter((d: { status: string }) => d.status === 'active').length,
                escalated: deadmanEscalated,
                resolved: deadman.filter((d: { status: string }) => d.status === 'resolved').length,
            },
        },
    })
}
