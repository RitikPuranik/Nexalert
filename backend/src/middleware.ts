import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/core/firebase/admin'

// Routes fully public — no token needed
const PUBLIC_ROUTES = [
  '/api/incidents/sos',
  '/api/guests/exit-route',
  '/api/responder/portal',
  '/api/sensors/event',       // uses sensor secret, not JWT
  '/api/heatmap',             // used by responder portal too
  '/api/deadman/start',       // called from guest SOS flow (no auth)
  '/api/deadman/ping',        // guest taps "I'm okay" (no auth, uses token)
  '/api/deadman/status',      // guest polls session status (no auth, uses token)
]

// Routes restricted to manager role
const MANAGER_ONLY_ROUTES = [
  '/api/reports',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-sensor-secret',
      },
    })
  }

  if (!pathname.startsWith('/api/')) return NextResponse.next()
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) return NextResponse.next()

  // All other API routes need a valid JWT
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  const token = auth.replace('Bearer ', '')
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: { user }, error } = await client.auth.getUser(token)
  if (error || !user) {
    return NextResponse.json(
      { success: false, error: 'Invalid or expired token', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  // Check manager-only routes
  if (MANAGER_ONLY_ROUTES.some(r => pathname.startsWith(r))) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: profile } = await admin
      .from('user_profiles').select('role').eq('id', user.id).single()

    if (profile?.role !== 'manager') {
      return NextResponse.json(
        { success: false, error: 'Manager role required', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }
  }

  // Pass user ID downstream
  const headers = new Headers(req.headers)
  headers.set('x-user-id', user.id)
  return NextResponse.next({ request: { headers } })
}

export const config = { matcher: ['/api/:path*'] }
