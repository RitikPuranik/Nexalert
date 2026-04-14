/**
 * Background Cron Checker — POST /api/cron/check
 *
 * Runs both deadman session checks AND staff presence staleness checks
 * for ALL active incidents across ALL hotels.
 *
 * Designed to be called by:
 *   - Vercel Cron (every 30 seconds)
 *   - External pinger (e.g., UptimeRobot)
 *   - Frontend manager dashboard as a fallback
 *
 * Auth: x-cron-secret header (shared secret) for automated callers.
 * Also accepts JWT from manager/staff as fallback.
 */

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/core/db'
import { checkSessions } from '@/modules/deadman'
import { checkStalePresence } from '@/modules/staff-presence'
import { emitCrisisEvent } from '@/core/events'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

function validateCronSecret(req: Request): boolean {
    const secret = req.headers.get('x-cron-secret')
    if (!secret || !process.env.CRON_SECRET) return false
    if (secret.length !== process.env.CRON_SECRET.length) return false
    let mismatch = 0
    for (let i = 0; i < secret.length; i++) {
        mismatch |= secret.charCodeAt(i) ^ process.env.CRON_SECRET.charCodeAt(i)
    }
    return mismatch === 0
}

export async function POST(req: NextRequest) {
    // Allow cron secret OR JWT auth
    const isCron = validateCronSecret(req)
    if (!isCron) {
        // Fallback: try JWT
        try {
            const { getRequestUser, hasRole } = await import('@/core/auth')
            const user = await getRequestUser(req)
            if (!user || !hasRole(user, ['manager', 'staff'])) {
                return NextResponse.json(
                    { success: false, error: 'Unauthorized — provide x-cron-secret or JWT' },
                    { status: 401 }
                )
            }
        } catch {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }
    }

    // Find all active incidents across all hotels
    const { data: activeIncidents } = await adminDb
        .from('incidents')
        .select('id, hotel_id, floor')
        .in('status', ['detecting', 'triaging', 'active', 'investigating'])

    if (!activeIncidents?.length) {
        return NextResponse.json<ApiResponse<{
            incidents_checked: number
            deadman: { total_checked: number; total_escalated: number }
            staff: { total_checked: number; total_alerts: number }
        }>>({
            success: true,
            data: {
                incidents_checked: 0,
                deadman: { total_checked: 0, total_escalated: 0 },
                staff: { total_checked: 0, total_alerts: 0 },
            },
        })
    }

    // Group incidents by hotel for efficiency
    const hotelIncidents = new Map<string, { id: string; floor: number }[]>()
    for (const inc of activeIncidents) {
        if (!hotelIncidents.has(inc.hotel_id)) hotelIncidents.set(inc.hotel_id, [])
        hotelIncidents.get(inc.hotel_id)!.push({ id: inc.id, floor: inc.floor })
    }

    let totalDeadmanChecked = 0
    let totalDeadmanEscalated = 0
    let totalStaffChecked = 0
    let totalStaffAlerts = 0
    const allEscalatedRooms: string[] = []
    const allSilentStaff: { name: string; incident_id: string }[] = []

    // Run checks for each hotel
    for (const [hotelId, incidents] of hotelIncidents) {
        // Deadman check (per hotel, covers all incidents on that hotel)
        const deadmanResult = await checkSessions(hotelId)
        totalDeadmanChecked += deadmanResult.checked
        totalDeadmanEscalated += deadmanResult.escalated
        allEscalatedRooms.push(...deadmanResult.escalated_rooms)

        // Staff presence check (per incident)
        let hotelStaffAlerts = 0
        for (const inc of incidents) {
            const staffResult = await checkStalePresence(hotelId, inc.id)
            totalStaffChecked += staffResult.checked
            totalStaffAlerts += staffResult.alerts.length
            hotelStaffAlerts += staffResult.alerts.length
            allSilentStaff.push(
                ...staffResult.alerts.map(a => ({ name: a.name, incident_id: inc.id }))
            )
        }

        // Emit per-hotel event so each hotel's SSE channel gets only its own data
        emitCrisisEvent('cron:check', hotelId, {
            deadman_escalated: deadmanResult.escalated,
            staff_alerts: hotelStaffAlerts,
            escalated_rooms: deadmanResult.escalated_rooms,
        })
    }

    return NextResponse.json<ApiResponse<{
        incidents_checked: number
        deadman: { total_checked: number; total_escalated: number; escalated_rooms: string[] }
        staff: { total_checked: number; total_alerts: number; silent_staff: typeof allSilentStaff }
        run_at: string
    }>>({
        success: true,
        data: {
            incidents_checked: activeIncidents.length,
            deadman: {
                total_checked: totalDeadmanChecked,
                total_escalated: totalDeadmanEscalated,
                escalated_rooms: allEscalatedRooms,
            },
            staff: {
                total_checked: totalStaffChecked,
                total_alerts: totalStaffAlerts,
                silent_staff: allSilentStaff,
            },
            run_at: new Date().toISOString(),
        },
    })
}
