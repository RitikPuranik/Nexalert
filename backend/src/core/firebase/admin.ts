import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getAuth, Auth } from 'firebase-admin/auth'

let _app: App | null = null

function getApp(): App | null {
  if (_app) return _app

  const projectId   = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey || privateKey === 'placeholder_key') {
    return null
  }

  if (getApps().length > 0) {
    _app = getApps()[0]
  } else {
    _app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  }

  return _app
}

// Lazy auth — only initialised on first actual use (at request time, not build time)
export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    const app = getApp()
    if (!app) throw new Error('Firebase Admin not initialised — check FIREBASE_* env vars')
    return (getAuth(app) as unknown as Record<string | symbol, unknown>)[prop]
  },
})
