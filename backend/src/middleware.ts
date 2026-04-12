import { NextRequest, NextResponse } from 'next/server'

// Routes fully public — no token needed at all
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

// NOTE: Full Firebase JWT verification happens inside each route handler via
// getRequestUser() from @/core/auth. Middleware only does a lightweight
// presence check because middleware runs in Edge Runtime which cannot use
// firebase-admin (a Node.js-only package).

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // CORS preflight — handle before anything else
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

  // Public routes — pass straight through
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) return NextResponse.next()

  // Protected routes — check a token is present (verification is in the route handler)
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json(
      { success: false, error: 'Authentication required', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  return NextResponse.next()
}

export const config = { matcher: ['/api/:path*'] }
