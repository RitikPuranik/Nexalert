'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { useIncidents } from '@/hooks'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth()
  const router = useRouter()
  const { incidents } = useIncidents({ status: 'active' })
  const activeCount = incidents.filter(i =>
    ['detecting','triaging','active','investigating'].includes(i.status)
  ).length

  useEffect(() => {
    if (!token) router.replace('/')
  }, [token, router])

  if (!token || !user) return (
    <div className="min-h-screen flex items-center justify-center bg-[#080c10]">
      <div className="text-xs font-mono text-white/30 animate-pulse">Authenticating...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#080c10]">
      <Navbar activeIncidents={activeCount} />
      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  )
}
