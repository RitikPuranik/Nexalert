/**
 * Guest Self-Registration — POST /api/guests/register
 *
 * Public endpoint (no auth). Guest scans QR code in their room,
 * enters their name + language, and gets tracked in guest_locations.
 * This ensures the system knows who's on which floor BEFORE any emergency.
 *
 * Rate limited to prevent abuse.
 */

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/core/db'
import { rateLimit } from '@/core/rate-limit'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

const VALID_LANGUAGES = ['en', 'hi', 'ar', 'zh', 'es', 'ja', 'fr', 'de', 'ru', 'ko', 'pt', 'it']

export async function POST(req: NextRequest) {
    // Rate limit: max 20 registrations per minute per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
    const limit = rateLimit(`guest-register:${ip}`, 20)
    if (!limit.allowed) {
        return NextResponse.json<ApiResponse<never>>(
            { success: false, error: 'Too many registrations. Please wait.', code: 'RATE_LIMITED' },
            { status: 429 }
        )
    }

    let body: Record<string, unknown>
    try {
        body = await req.json()
    } catch {
        return NextResponse.json<ApiResponse<never>>(
            { success: false, error: 'Invalid JSON body', code: 'INVALID_BODY' },
            { status: 400 }
        )
    }

    const hotel_id = body.hotel_id as string
    const room = body.room as string
    const floor = body.floor as number
    const zone = body.zone as string
    const guest_name = body.guest_name as string
    const language = (body.language as string) ?? 'en'
    const phone = (body.phone as string) ?? null
    const needs_accessibility = (body.needs_accessibility as boolean) ?? false

    // Validate required fields
    if (!hotel_id || !room || !floor || !zone || !guest_name) {
        return NextResponse.json<ApiResponse<never>>(
            { success: false, error: 'Required fields: hotel_id, room, floor, zone, guest_name', code: 'MISSING_FIELDS' },
            { status: 400 }
        )
    }

    // Validate types
    if (typeof floor !== 'number' || floor < 0 || floor > 200) {
        return NextResponse.json<ApiResponse<never>>(
            { success: false, error: 'floor must be a number between 0 and 200', code: 'INVALID_FLOOR' },
            { status: 400 }
        )
    }

    // Sanitize strings
    const safeName = String(guest_name).slice(0, 100).replace(/[<>"']/g, '')
    const safeRoom = String(room).slice(0, 20).replace(/[<>"']/g, '')
    const safeZone = String(zone).slice(0, 50).replace(/[<>"']/g, '')
    const safeLang = VALID_LANGUAGES.includes(language) ? language : 'en'

    // Validate hotel exists
    const { data: hotel } = await adminDb
        .from('hotels')
        .select('id')
        .eq('id', hotel_id)
        .single()

    if (!hotel) {
        return NextResponse.json<ApiResponse<never>>(
            { success: false, error: 'Hotel not found', code: 'NOT_FOUND' },
            { status: 404 }
        )
    }

    // Upsert guest location — if room already has a guest, update
    const { data: existing } = await adminDb
        .from('guest_locations')
        .select('id')
        .eq('hotel_id', hotel_id)
        .eq('room_number', safeRoom)
        .eq('floor', floor)
        .single()

    const now = new Date().toISOString()

    if (existing) {
        const { data, error } = await adminDb
            .from('guest_locations')
            .update({
                guest_name: safeName,
                zone: safeZone,
                language: safeLang,
                phone,
                needs_accessibility_assistance: needs_accessibility,
                last_seen_at: now,
                location_source: 'qr_scan',
            })
            .eq('id', existing.id)
            .select('id, room_number, floor, zone, guest_name, language')
            .single()

        if (error) {
            return NextResponse.json<ApiResponse<never>>(
                { success: false, error: 'Failed to update registration', code: 'DB_ERROR' },
                { status: 500 }
            )
        }

        return NextResponse.json<ApiResponse<{
            guest_location_id: string
            registered: boolean
            updated: boolean
            message: string
        }>>({
            success: true,
            data: {
                guest_location_id: data!.id,
                registered: true,
                updated: true,
                message: `Welcome back, ${safeName}! Your info for Room ${safeRoom} has been updated.`,
            },
        })
    }

    // New registration
    const { data, error } = await adminDb
        .from('guest_locations')
        .insert({
            hotel_id,
            guest_name: safeName,
            room_number: safeRoom,
            floor,
            zone: safeZone,
            language: safeLang,
            phone,
            needs_accessibility_assistance: needs_accessibility,
            last_seen_at: now,
            location_source: 'qr_scan',
        })
        .select('id, room_number, floor, zone, guest_name, language')
        .single()

    if (error || !data) {
        return NextResponse.json<ApiResponse<never>>(
            { success: false, error: 'Failed to register', code: 'DB_ERROR' },
            { status: 500 }
        )
    }

    return NextResponse.json<ApiResponse<{
        guest_location_id: string
        registered: boolean
        updated: boolean
        message: string
    }>>({
        success: true,
        data: {
            guest_location_id: data.id,
            registered: true,
            updated: false,
            message: `Welcome, ${safeName}! You're registered in Room ${safeRoom}, Floor ${floor}. In an emergency, you'll receive alerts in ${safeLang}.`,
        },
    }, { status: 201 })
}
