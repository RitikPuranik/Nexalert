'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { UserProfile, UserRole } from '@/types'

interface AuthContextValue {
  token: string | null
  user: UserProfile | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
  error: string | null
}

const AuthContext = createContext<AuthContextValue>({
  token: null, user: null, login: async () => {}, logout: () => {},
  isLoading: false, error: null,
})

// ─── Mock users for demo (replace with real Firebase auth) ───────────────────
const MOCK_USERS: Record<string, { token: string; profile: UserProfile }> = {
  'manager@nexalert.demo': {
    token: 'mock-manager-token',
    profile: {
      id: 'mgr-001', hotel_id: 'hotel-001', name: 'Arjun Sharma',
      role: 'manager', staff_role: 'management',
      floor_assignment: null, zone_assignment: null,
      is_on_duty: true, language: 'en',
    },
  },
  'security@nexalert.demo': {
    token: 'mock-security-token',
    profile: {
      id: 'staff-001', hotel_id: 'hotel-001', name: 'Ravi Kumar',
      role: 'staff', staff_role: 'security',
      floor_assignment: 4, zone_assignment: 'east_wing',
      is_on_duty: true, language: 'en',
    },
  },
  'frontdesk@nexalert.demo': {
    token: 'mock-frontdesk-token',
    profile: {
      id: 'staff-002', hotel_id: 'hotel-001', name: 'Priya Singh',
      role: 'staff', staff_role: 'front_desk',
      floor_assignment: 1, zone_assignment: 'lobby',
      is_on_duty: true, language: 'en',
    },
  },
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = useCallback(async (email: string, _password: string) => {
    setIsLoading(true)
    setError(null)
    await new Promise(r => setTimeout(r, 600))

    const mock = MOCK_USERS[email]
    if (mock) {
      setToken(mock.token)
      setUser(mock.profile)
    } else {
      setError('Invalid credentials. Try manager@nexalert.demo')
    }
    setIsLoading(false)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isLoading, error }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
