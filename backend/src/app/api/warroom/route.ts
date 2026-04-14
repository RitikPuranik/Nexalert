/**
 * War Room Dashboard — GET /api/warroom
 *
 * Single endpoint returning the ENTIRE crisis state for a commander.
 * Replaces 6+ individual API calls with one payload.
 *
 * Includes: incident state, all floor heatmaps, staff presence,
 * deadman sessions, task progress, notification stats, and timeline.
 *
 * Auth: JWT required (manager/responder)
 */

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/core/db'
import { getRequestUser, hasRole, AuthError } from '@/core/auth'
import { computeFloorHeatmap } from '@/modules/heatmap'
import { getIncidentPresence } from '@/modules/staff-presence'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const user = await getRequestUser(req)
    if (!user || !hasRole(user, ['manager', 'responder'])) return AuthError.forbidden()

    const incidentId = new URL(req.url).searchParams.get('incident_id')
    if (!incidentId) {
        return NextResponse.json({ success: false, error: 'incident_id required' }, { status: 400 })
    }

    const hotelId = user.profile.hotel_id

    // Fetch incident details
    const { data: incident, error } = await adminDb
        .from('incidents')
        .select('*')
        .eq('id', incidentId)
        .single()

    if (error || !incident) {
        return NextResponse.json({ success: false, error: 'Incident not found' }, { status: 404 })
    }

    // Fetch hotel info
    const { data: hotel } = await adminDb
        .from('hotels')
        .select('name, address, total_floors, emergency_contacts, access_codes')
        .eq('id', hotelId)
        .single()

    const totalFloors = hotel?.total_floors ?? 1

    // Parallel fetch everything
    const [
        tasksResult,
        notifsResult,
        deadmanResult,
        staffPresence,
    ] = await Promise.all([
        adminDb.from('staff_tasks')
            .select('id, assigned_to_role, task_text, status, priority, accepted_at, completed_at')
            .eq('incident_id', incidentId)
            .order('priority', { ascending: true }),
        adminDb.from('guest_notifications')
            .select('status, guest_response, language, sent_at')
            .eq('incident_id', incidentId),
        adminDb.from('deadman_sessions')
            .select('room_number, floor, status, missed_pings, last_ping_at, escalated_at, interval_seconds')
            .eq('hotel_id', hotelId)
            .in('status', ['active', 'escalated']),
        getIncidentPresence(hotelId, incidentId),
    ])

    const tasks = tasksResult.data ?? []
    const notifs = notifsResult.data ?? []
    const deadmanSessions = (deadmanResult.data ?? []) as {
        room_number: string; floor: number; status: string
        missed_pings: number; last_ping_at: string; escalated_at: string | null; interval_seconds: number
    }[]

    // Compute heatmaps for all affected floors (incident floor + adjacent)
    const affectedFloors = new Set<number>([incident.floor])
    for (let f = Math.max(1, incident.floor - 1); f <= Math.min(totalFloors, incident.floor + 1); f++) {
        affectedFloors.add(f)
    }

    const heatmaps = await Promise.all(
        [...affectedFloors].sort().map(floor => computeFloorHeatmap(hotelId, floor, incidentId))
    )

    // Compute high-level metrics
    const now = Date.now()
    const elapsed = Math.round((now - new Date(incident.detected_at).getTime()) / 1000)

    const warRoom = {
        incident: {
            id: incident.id,
            type: incident.type,
            severity: incident.severity,
            status: incident.status,
            is_drill: incident.is_drill,
            floor: incident.floor,
            zone: incident.zone,
            room: incident.room,
            detected_at: incident.detected_at,
            elapsed_seconds: elapsed,
            elapsed_formatted: formatDuration(elapsed),
            briefing: incident.ai_briefing ?? 'Incident in progress.',
            responder_briefing: incident.ai_responder_briefing ?? null,
            recommend_911: incident.ai_recommend_911 ?? false,
        },
        hotel: hotel ?? null,
        heatmaps,
        guest_accountability: {
            total_guests: heatmaps.reduce((s, h) => s + h.summary.total - h.summary.empty, 0),
            confirmed_safe: heatmaps.reduce((s, h) => s + h.summary.safe, 0),
            needs_help: heatmaps.reduce((s, h) => s + h.summary.needs_help, 0),
            no_response: heatmaps.reduce((s, h) => s + h.summary.no_response, 0),
            unreachable: heatmaps.reduce((s, h) => s + h.summary.unreachable, 0),
        },
        tasks: {
            total: tasks.length,
            pending: tasks.filter(t => t.status === 'pending').length,
            accepted: tasks.filter(t => t.status === 'accepted').length,
            in_progress: tasks.filter(t => t.status === 'in_progress').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            completion_rate: tasks.length
                ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100) : 0,
            list: tasks,
        },
        notifications: {
            total: notifs.length,
            sent: notifs.filter(n => n.status === 'sent').length,
            delivered: notifs.filter(n => n.status === 'delivered').length,
            failed: notifs.filter(n => n.status === 'failed').length,
            guest_responses: {
                safe: notifs.filter(n => n.guest_response === 'safe').length,
                needs_help: notifs.filter(n => n.guest_response === 'needs_help').length,
                no_response: notifs.filter(n => !n.guest_response).length,
            },
            languages: [...new Set(notifs.map(n => n.language as string))],
        },
        deadman_sessions: {
            total: deadmanSessions.length,
            active: deadmanSessions.filter(d => d.status === 'active').length,
            escalated: deadmanSessions.filter(d => d.status === 'escalated').length,
            escalated_rooms: deadmanSessions
                .filter(d => d.status === 'escalated')
                .map(d => ({ room: d.room_number, floor: d.floor, missed_pings: d.missed_pings })),
            list: deadmanSessions.map(d => ({
                ...d,
                seconds_since_ping: Math.floor((now - new Date(d.last_ping_at).getTime()) / 1000),
                is_overdue: Math.floor((now - new Date(d.last_ping_at).getTime()) / 1000) > d.interval_seconds,
            })),
        },
        staff_presence: {
            total: staffPresence.length,
            active: staffPresence.filter(s => s.status === 'active').length,
            silent: staffPresence.filter(s => s.status === 'silent').length,
            welfare_checks_needed: staffPresence.filter(s => s.needs_welfare_check).length,
            silent_staff: staffPresence
                .filter(s => s.status === 'silent')
                .map(s => ({
                    name: s.name,
                    role: s.staff_role,
                    floor: s.floor,
                    zone: s.zone,
                    silent_for: s.silent_for_seconds,
                    open_task: s.assigned_tasks.find(t => ['accepted', 'in_progress'].includes(t.status))?.task_text ?? null,
                })),
            list: staffPresence,
        },
        generated_at: new Date().toISOString(),
    }

    return NextResponse.json<ApiResponse<typeof warRoom>>({ success: true, data: warRoom })
}

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    if (m < 60) return `${m}m ${s}s`
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
}
