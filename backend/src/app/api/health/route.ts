/**
 * Health Check — GET /api/health
 *
 * Every demo/hackathon judge hits this first.
 * Returns system status, uptime, and connected services.
 */

import { NextResponse } from 'next/server'
import { adminDb } from '@/core/db'

export const dynamic = 'force-dynamic'

const startTime = Date.now()

export async function GET() {
    const uptime = Math.floor((Date.now() - startTime) / 1000)

    // Quick Supabase connectivity check
    let dbStatus = 'disconnected'
    try {
        const { error } = await adminDb.from('hotels').select('id').limit(1).single()
        dbStatus = error ? 'error' : 'connected'
    } catch {
        dbStatus = 'unreachable'
    }

    // Check required env vars
    const envCheck = {
        supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        firebase: !!process.env.FIREBASE_PROJECT_ID && !!process.env.FIREBASE_CLIENT_EMAIL,
        gemini: !!process.env.GEMINI_API_KEY,
        twilio: !!process.env.TWILIO_ACCOUNT_SID,
    }

    return NextResponse.json({
        success: true,
        data: {
            service: 'NexAlert Crisis Response API',
            version: '1.0.0',
            status: dbStatus === 'connected' ? 'operational' : 'degraded',
            uptime_seconds: uptime,
            timestamp: new Date().toISOString(),
            services: {
                database: dbStatus,
                auth: envCheck.firebase ? 'configured' : 'missing',
                ai_triage: envCheck.gemini ? 'configured' : 'missing',
                sms_alerts: envCheck.twilio ? 'configured' : 'disabled',
            },
            capabilities: [
                'sensor-event-ingestion',
                'ai-powered-triage',
                'multilingual-guest-alerts',
                'realtime-floor-heatmap',
                'dead-man-switch',
                'staff-presence-tracking',
                'responder-portal',
                'drill-simulation',
                'post-incident-reports',
                '911-data-packet',
            ],
        },
    })
}
