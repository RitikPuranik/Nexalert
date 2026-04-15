'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useIncidents } from '@/hooks'
import { LiveDot, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', label: 'Command', icon: '⬡' },
  { href: '/dashboard/incidents', label: 'Incidents', icon: '⚡' },
  { href: '/dashboard/staff', label: 'Staff', icon: '◈' },
  { href: '/dashboard/drills', label: 'Drills', icon: '◎' },
  { href: '/dashboard/reports', label: 'Reports', icon: '◷' },
]

export function Navbar() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const { incidents } = useIncidents()
  const [timeStr, setTimeStr] = useState('')

  useEffect(() => {
    const update = () => setTimeStr(new Date().toLocaleTimeString('en-IN', { hour12: false }))
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [])

  const activeIncidents = incidents.filter(i =>
    ['detecting', 'triaging', 'active', 'investigating'].includes(i.status)
  ).length

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#080c10]/95 backdrop-blur-sm">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 h-12 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-red-500/20 border border-red-500/40 flex items-center justify-center">
            <span className="text-red-400 text-[10px] font-bold font-mono">N</span>
          </div>
          <span className="text-xs font-mono font-bold text-white/60 tracking-[0.2em] uppercase">
            NexAlert
          </span>
          {activeIncidents > 0 && (
            <div className="flex items-center gap-1.5 ml-2">
              <LiveDot color="red" />
              <span className="text-[10px] font-mono text-red-400 font-bold">
                {activeIncidents} ACTIVE
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {timeStr && (
            <span className="text-[10px] font-mono text-white/25">IST {timeStr}</span>
          )}
          {user && (
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-white/40 font-mono">{user.name}</span>
              <span className={cn(
                'text-[9px] font-mono px-1.5 py-0.5 rounded border',
                user.role === 'manager'
                  ? 'bg-red-950/40 text-red-400/70 border-red-900/40'
                  : 'bg-white/5 text-white/30 border-white/10'
              )}>
                {user.role.toUpperCase()}
              </span>
              <button
                onClick={logout}
                className="text-[10px] font-mono text-white/25 hover:text-white/50 transition-colors ml-2"
              >
                EXIT
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Nav tabs */}
      <nav className="flex items-center gap-1 px-6 h-10">
        {NAV.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-1.5 px-3 h-full text-xs font-mono transition-all duration-150 border-b-2',
              pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                ? 'text-white border-red-500'
                : 'text-white/35 hover:text-white/60 border-transparent'
            )}
          >
            <span className="text-[10px] opacity-60">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
