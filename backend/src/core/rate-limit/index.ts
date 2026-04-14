/**
 * Simple in-memory rate limiter for public API routes.
 *
 * Not a substitute for a proper WAF, but prevents trivial abuse
 * of public endpoints like SOS and sensor ingestion during a hackathon demo.
 */

const windowMs = 60_000 // 1 minute window
const store = new Map<string, { count: number; resetAt: number }>()

// Clean up expired entries every 5 minutes
setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
        if (now > entry.resetAt) store.delete(key)
    }
}, 5 * 60_000)

export function rateLimit(
    identifier: string,
    maxRequests: number = 30
): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    const entry = store.get(identifier)

    if (!entry || now > entry.resetAt) {
        store.set(identifier, { count: 1, resetAt: now + windowMs })
        return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs }
    }

    entry.count++
    const remaining = Math.max(0, maxRequests - entry.count)
    return { allowed: entry.count <= maxRequests, remaining, resetAt: entry.resetAt }
}

/**
 * Extract a rate-limit key from the request.
 * Uses X-Forwarded-For header (set by most reverse proxies) or falls back to a generic key.
 */
export function getClientIp(req: Request): string {
    return (
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        req.headers.get('x-real-ip') ??
        'anonymous'
    )
}
