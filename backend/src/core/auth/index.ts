import { adminAuth } from '@/core/firebase/admin'
import { adminDb } from '@/core/db'

export async function getRequestUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.replace('Bearer ', '')

  try {
    // Firebase Admin verifies the Google ID token
    const decoded = await adminAuth.verifyIdToken(token)

    // Load their profile from Supabase (role, hotel_id etc.)
    const { data: profile } = await adminDb
      .from('user_profiles')
      .select('*')
      .eq('id', decoded.uid)   // Firebase UID stored as the profile ID
      .single()

    if (!profile) return null
    return { id: decoded.uid, email: decoded.email, profile }
  } catch {
    return null   // invalid or expired token
  }
}