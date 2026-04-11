import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _browser: SupabaseClient | null = null
let _admin: SupabaseClient | null = null

/** Browser client — respects RLS, safe in components and hooks */
export function getDb(): SupabaseClient {
  if (!_browser) {
    _browser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _browser
}

/** Admin client — bypasses RLS. Use only inside API route handlers. */
export function getAdminDb(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _admin
}

// Proxy exports — safe to import at module level, lazy under the hood
export const db = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

export const adminDb = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return (getAdminDb() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
