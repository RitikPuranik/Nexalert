/**
 * Incident Chat/Log Module
 *
 * Inter-incident communication log. Staff/managers post quick text updates
 * during an active incident, visible to all responders.
 *
 * Routes:
 *   POST /api/incidents/[id]/chat   Post a message
 *   GET  /api/incidents/[id]/chat   Get all messages for the incident
 */

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/core/db'
import { getRequestUser, hasRole, AuthError } from '@/core/auth'
import { emitCrisisEvent } from '@/core/events'
import type { ApiResponse } from '@/types'

export const dynamic = 'force-dynamic'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IncidentChatMessage {
  id: string
  incident_id: string
  hotel_id: string
  user_id: string
  user_name: string
  user_role: string
  message: string
  message_type: 'update' | 'alert' | 'question' | 'resolution'
  floor: number | null
  zone: string | null
  created_at: string
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function postChatMessage(payload: {
  incidentId: string
  hotelId: string
  userId: string
  userName: string
  userRole: string
  message: string
  messageType?: 'update' | 'alert' | 'question' | 'resolution'
  floor?: number | null
  zone?: string | null
}): Promise<IncidentChatMessage> {
  const { data, error } = await adminDb
    .from('incident_chat')
    .insert({
      incident_id: payload.incidentId,
      hotel_id: payload.hotelId,
      user_id: payload.userId,
      user_name: payload.userName,
      user_role: payload.userRole,
      message: payload.message,
      message_type: payload.messageType ?? 'update',
      floor: payload.floor ?? null,
      zone: payload.zone ?? null,
    })
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to post chat message: ${error?.message}`)

  // Emit event for SSE subscribers
  emitCrisisEvent('incident:chat', payload.hotelId, {
    chat_message: {
      id: data.id,
      user_name: payload.userName,
      user_role: payload.userRole,
      message: payload.message,
      message_type: payload.messageType ?? 'update',
      created_at: data.created_at,
    },
  }, payload.incidentId)

  return data as IncidentChatMessage
}

export async function getChatMessages(
  incidentId: string,
  hotelId: string,
  limit = 100,
  before?: string
): Promise<IncidentChatMessage[]> {
  let query = adminDb
    .from('incident_chat')
    .select('id, incident_id, hotel_id, user_id, user_name, user_role, message, message_type, floor, zone, created_at')
    .eq('incident_id', incidentId)
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data, error } = await query

  if (error) throw new Error(`Failed to fetch chat messages: ${error.message}`)
  return (data ?? []) as IncidentChatMessage[]
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

/** POST /api/incidents/[id]/chat — post a message */
export async function POST_CHAT(req: NextRequest, incidentId: string) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager', 'staff', 'responder'])) return AuthError.forbidden()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'Invalid JSON body', code: 'INVALID_BODY' },
      { status: 400 }
    )
  }

  const message = body.message as string
  const messageType = (body.message_type as string) ?? 'update'
  const floor = body.floor as number | undefined
  const zone = body.zone as string | undefined

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'message is required and must not be empty', code: 'MISSING_FIELDS' },
      { status: 400 }
    )
  }

  if (message.length > 1000) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'message must be 1000 characters or less', code: 'INVALID_LENGTH' },
      { status: 400 }
    )
  }

  const validTypes = ['update', 'alert', 'question', 'resolution']
  if (!validTypes.includes(messageType)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: `message_type must be one of: ${validTypes.join(', ')}`, code: 'INVALID_TYPE' },
      { status: 400 }
    )
  }

  // Verify incident exists and belongs to user's hotel
  const { data: incident } = await adminDb
    .from('incidents')
    .select('id, hotel_id')
    .eq('id', incidentId)
    .eq('hotel_id', user.profile.hotel_id)
    .single()

  if (!incident) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: 'Incident not found', code: 'NOT_FOUND' },
      { status: 404 }
    )
  }

  // Sanitize message
  const safeMessage = message.trim().slice(0, 1000).replace(/<[^>]*>/g, '')

  const chatMessage = await postChatMessage({
    incidentId,
    hotelId: user.profile.hotel_id,
    userId: user.id,
    userName: user.profile.name ?? 'Staff',
    userRole: user.profile.staff_role ?? user.profile.role ?? 'staff',
    message: safeMessage,
    messageType: messageType as 'update' | 'alert' | 'question' | 'resolution',
    floor,
    zone,
  })

  return NextResponse.json<ApiResponse<IncidentChatMessage>>(
    { success: true, data: chatMessage },
    { status: 201 }
  )
}

/** GET /api/incidents/[id]/chat — get all messages */
export async function GET_CHAT(req: NextRequest, incidentId: string) {
  const user = await getRequestUser(req)
  if (!user || !hasRole(user, ['manager', 'staff', 'responder'])) return AuthError.forbidden()

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 200)
  const before = searchParams.get('before') ?? undefined

  const messages = await getChatMessages(incidentId, user.profile.hotel_id, limit, before)

  return NextResponse.json<ApiResponse<{
    messages: IncidentChatMessage[]
    count: number
    incident_id: string
  }>>({
    success: true,
    data: {
      messages,
      count: messages.length,
      incident_id: incidentId,
    },
  })
}
