import { adminAuth } from '@/core/firebase/admin'
import { adminDb } from '@/core/db'
import { NextResponse } from 'next/server'

export type UserRole = 'guest' | 'staff' | 'manager' | 'responder'
export type StaffRole =
  | 'security' | 'housekeeping' | 'front_desk'
  | 'maintenance' | 'management' | 'f_and_b' | 'medical'

export interface UserProfile {
  id: string
  hotel_id: string
  name: string
  role: UserRole
  staff_role: StaffRole | null
  floor_assignment: number | null
  zone_assignment: string | null
  is_on_duty: boolean
  language: string
}

export interface AuthUser {
  id: string
  email?: string
  profile: UserProfile
}

/**
 * Verifies a Firebase Bearer token and returns the authenticated user
 * with their Supabase profile. Returns null if invalid or profile missing.
 */
export async function getRequestUser(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.replace('Bearer ', '')

  try {
    const decoded = await adminAuth.verifyIdToken(token)

    const { data: profile } = await adminDb
      .from('user_profiles')
      .select('*')
      .eq('id', decoded.uid)
      .single()

    if (!profile) return null

    return {
      id: decoded.uid,
      email: decoded.email,
      profile: profile as UserProfile,
    }
  } catch {
    return null
  }
}

/**
 * Returns true if the user's role is in the allowed list.
 */
export function hasRole(user: AuthUser | null, roles: UserRole[]): boolean {
  return !!user && roles.includes(user.profile.role)
}

/**
 * Standard auth error responses — used across all API route handlers.
 */
export const AuthError = {
  unauthorized: () =>
    NextResponse.json(
      { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401 }
    ),
  forbidden: () =>
    NextResponse.json(
      { success: false, error: 'Insufficient permissions', code: 'FORBIDDEN' },
      { status: 403 }
    ),
}
