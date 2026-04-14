/**
 * Incident Timeline — GET /api/incidents/[id]/timeline
 *
 * Returns a chronological audit trail of all events for an incident:
 * detection → triage → task assignments → staff actions → guest responses → resolution
 *
 * Used by the incident command view and post-incident reports.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser, hasRole, AuthError } from '@/core/auth'
import { adminDb } from '@/core/db'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

interface TimelineEvent {
    timestamp: string
    event: string
    actor: string
    category: 'system' | 'ai' | 'staff' | 'guest' | 'sensor' | 'notification'
    severity?: 'info' | 'warning' | 'critical'
    metadata?: Record<string, unknown>
}

export async function GET(req: NextRequest, { params }: Params) {
    const { id: incidentId } = await params
    const user = await getRequestUser(req)
    if (!user) return AuthError.unauthorized()
    if (!hasRole(user, ['manager', 'staff', 'responder'])) return AuthError.forbidden()

    const hotelId = user.profile.hotel_id

    // Verify incident belongs to hotel
    const { data: incident } = await adminDb
        .from('incidents')
        .select('*')
        .eq('id', incidentId)
        .eq('hotel_id', hotelId)
        .single()

    if (!incident) {
        return NextResponse.json({ success: false, error: 'Incident not found' }, { status: 404 })
    }

    // Fetch all related data concurrently
    const [tasksRes, notifsRes, deadmanRes, presenceRes] = await Promise.all([
        adminDb.from('staff_tasks')
            .select('id, assigned_to_role, assigned_to_user_id, task_text, status, priority, accepted_at, completed_at, notes, created_at')
            .eq('incident_id', incidentId)
            .order('created_at', { ascending: true }),
        adminDb.from('guest_notifications')
            .select('id, guest_location_id, channel, language, status, sent_at, delivered_at, guest_response, responded_at, created_at')
            .eq('incident_id', incidentId)
            .order('created_at', { ascending: true }),
        adminDb.from('deadman_sessions')
            .select('id, room_number, floor, status, missed_pings, escalated_at, resolved_at, created_at')
            .eq('incident_id', incidentId)
            .order('created_at', { ascending: true }),
        adminDb.from('staff_presence')
            .select('user_id, status, last_ping_at, silent_since')
            .eq('incident_id', incidentId),
    ])

    const tasks = tasksRes.data ?? []
    const notifs = notifsRes.data ?? []
    const deadmanSessions = deadmanRes.data ?? []

    // Build timeline
    const timeline: TimelineEvent[] = []

    // Incident lifecycle
    timeline.push({
        timestamp: incident.detected_at,
        event: `${incident.type.toUpperCase()} ${incident.is_drill ? '[DRILL] ' : ''}detected via ${incident.source}`,
        actor: 'System',
        category: 'system',
        severity: 'critical',
        metadata: {
            floor: incident.floor,
            zone: incident.zone,
            room: incident.room,
            source: incident.source,
        },
    })

    if (incident.sensor_value != null) {
        timeline.push({
            timestamp: incident.detected_at,
            event: `Sensor reading: ${incident.sensor_type} = ${incident.sensor_value} (threshold: ${incident.sensor_threshold})`,
            actor: incident.sensor_id ?? 'Sensor',
            category: 'sensor',
            severity: 'warning',
        })
    }

    if (incident.ai_triage_completed_at) {
        timeline.push({
            timestamp: incident.ai_triage_completed_at,
            event: `AI triage complete — Severity ${incident.severity} (${incident.ai_severity_reason})`,
            actor: 'NexAlert AI',
            category: 'ai',
            severity: incident.severity === 1 ? 'critical' : 'info',
        })

        if (incident.ai_recommend_911) {
            timeline.push({
                timestamp: incident.ai_triage_completed_at,
                event: '⚠ AI recommends 911 escalation',
                actor: 'NexAlert AI',
                category: 'ai',
                severity: 'critical',
            })
        }
    }

    if (incident.confirmed_at) {
        timeline.push({
            timestamp: incident.confirmed_at,
            event: 'Incident confirmed and activated',
            actor: 'Duty Manager',
            category: 'staff',
            severity: 'info',
        })
    }

    if (incident.resolved_at) {
        timeline.push({
            timestamp: incident.resolved_at,
            event: 'All-clear issued — incident resolved',
            actor: 'Duty Manager',
            category: 'staff',
            severity: 'info',
        })
    }

    // Task events
    for (const task of tasks) {
        timeline.push({
            timestamp: task.created_at,
            event: `Task created: "${task.task_text}" [P${task.priority}]`,
            actor: 'NexAlert AI',
            category: 'ai',
            severity: 'info',
            metadata: { role: task.assigned_to_role, priority: task.priority },
        })

        if (task.accepted_at) {
            timeline.push({
                timestamp: task.accepted_at,
                event: `Task accepted by ${task.assigned_to_role}: "${task.task_text}"`,
                actor: task.assigned_to_user_id ?? task.assigned_to_role,
                category: 'staff',
                severity: 'info',
            })
        }

        if (task.completed_at) {
            timeline.push({
                timestamp: task.completed_at,
                event: `Task completed: "${task.task_text}"${task.notes ? ` — Note: ${task.notes}` : ''}`,
                actor: task.assigned_to_user_id ?? task.assigned_to_role,
                category: 'staff',
                severity: 'info',
            })
        }
    }

    // Notification events
    if (notifs.length > 0) {
        // Group notification dispatch
        const firstNotif = notifs.sort((a: { sent_at: string | null }, b: { sent_at: string | null }) => {
            if (!a.sent_at) return 1
            if (!b.sent_at) return -1
            return new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
        })[0]

        if (firstNotif?.sent_at) {
            timeline.push({
                timestamp: firstNotif.sent_at,
                event: `Alerts dispatched to ${notifs.length} guests (${[...new Set(notifs.map((n: { language: string }) => n.language))].join(', ')})`,
                actor: 'System',
                category: 'notification',
                severity: 'info',
            })
        }

        // Guest responses
        for (const notif of notifs) {
            if (notif.guest_response && notif.responded_at) {
                timeline.push({
                    timestamp: notif.responded_at,
                    event: `Guest responded: ${notif.guest_response === 'safe' ? '✅ Safe' : '🚨 Needs help'}`,
                    actor: `Guest (${notif.language})`,
                    category: 'guest',
                    severity: notif.guest_response === 'needs_help' ? 'warning' : 'info',
                })
            }
        }

        // Failed notifications
        const failed = notifs.filter((n: { status: string }) => n.status === 'failed')
        if (failed.length > 0) {
            timeline.push({
                timestamp: failed[0].created_at,
                event: `⚠ ${failed.length} notification(s) failed to deliver`,
                actor: 'System',
                category: 'notification',
                severity: 'warning',
            })
        }
    }

    // Dead man's switch events
    for (const session of deadmanSessions) {
        timeline.push({
            timestamp: session.created_at,
            event: `Dead man's switch activated for Room ${session.room_number} (Floor ${session.floor})`,
            actor: 'System',
            category: 'system',
            severity: 'info',
        })

        if (session.escalated_at) {
            timeline.push({
                timestamp: session.escalated_at,
                event: `🚨 Dead man's switch ESCALATED — Room ${session.room_number} missed ${session.missed_pings} pings`,
                actor: 'System',
                category: 'system',
                severity: 'critical',
            })
        }

        if (session.resolved_at) {
            timeline.push({
                timestamp: session.resolved_at,
                event: `Dead man's switch resolved — Room ${session.room_number} guest located`,
                actor: 'Staff',
                category: 'staff',
                severity: 'info',
            })
        }
    }

    // Sort by timestamp
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    // Compute elapsed times
    const base = new Date(incident.detected_at).getTime()
    const enriched = timeline.map(e => ({
        ...e,
        elapsed_seconds: Math.round((new Date(e.timestamp).getTime() - base) / 1000),
        elapsed_formatted: formatElapsed(Math.round((new Date(e.timestamp).getTime() - base) / 1000)),
    }))

    return NextResponse.json<ApiResponse<unknown>>({
        success: true,
        data: {
            incident_id: incidentId,
            incident_type: incident.type,
            severity: incident.severity,
            started_at: incident.detected_at,
            resolved_at: incident.resolved_at,
            total_events: enriched.length,
            events: enriched,
        },
    })
}

function formatElapsed(seconds: number): string {
    if (seconds < 60) return `+${seconds}s`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    if (m < 60) return `+${m}m${s > 0 ? ` ${s}s` : ''}`
    const h = Math.floor(m / 60)
    return `+${h}h ${m % 60}m`
}
