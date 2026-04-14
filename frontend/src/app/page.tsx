'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const DEMO_USERS = [
  { email: 'manager@nexalert.demo', label: 'Duty Manager', desc: 'Full command dashboard access', role: 'manager' },
  { email: 'security@nexalert.demo', label: 'Security Officer', desc: 'Field tasks + presence tracking', role: 'staff' },
  { email: 'frontdesk@nexalert.demo', label: 'Front Desk', desc: 'Guest coordination view', role: 'staff' },
]

export default function LoginPage() {
  const { login, isLoading, error } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await login(email, password)
    router.push('/dashboard')
  }

  const quickLogin = async (demoEmail: string) => {
    await login(demoEmail, 'demo')
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-[#080c10]">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-red-950/20 blur-[120px] rounded-full" />
      </div>
      <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
      <div className="relative z-10 w-full max-w-sm px-4 animate-slide-up">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <span className="text-red-400 text-xl font-mono font-bold">N</span>
          </div>
          <div className="text-center">
            <h1 className="text-lg font-mono font-bold tracking-[.15em] text-white/90 uppercase">NexAlert</h1>
            <p className="text-xs font-mono text-white/30 mt-0.5 tracking-wider">CRISIS RESPONSE PLATFORM</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-[10px] font-mono text-white/30 mb-1.5 uppercase tracking-widest">Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@hotel.com"
              className="w-full bg-[#111820] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25 transition-colors font-mono" />
          </div>
          <div>
            <label className="block text-[10px] font-mono text-white/30 mb-1.5 uppercase tracking-widest">Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
              className="w-full bg-[#111820] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25 transition-colors font-mono" />
          </div>
          {error && <p className="text-xs font-mono text-red-400 bg-red-950/30 border border-red-900/40 rounded px-3 py-2">{error}</p>}
          <button type="submit" disabled={isLoading||!email}
            className="mt-1 py-2.5 rounded-lg font-mono text-sm font-bold tracking-wider uppercase transition-all duration-200 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-400 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[.98]">
            {isLoading ? 'Authenticating...' : 'Access System'}
          </button>
        </form>
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-white/[.06]" />
          <span className="text-[10px] font-mono text-white/20">DEMO ACCESS</span>
          <div className="flex-1 h-px bg-white/[.06]" />
        </div>
        <div className="flex flex-col gap-2">
          {DEMO_USERS.map(u => (
            <button key={u.email} onClick={()=>quickLogin(u.email)} disabled={isLoading}
              className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border transition-all duration-150 bg-white/[.025] border-white/[.07] hover:bg-white/[.05] hover:border-white/[.12] active:scale-[.98] group">
              <div className="text-left">
                <p className="text-xs font-medium text-white/70 group-hover:text-white/90 transition-colors">{u.label}</p>
                <p className="text-[10px] font-mono text-white/25 mt-0.5">{u.desc}</p>
              </div>
              <span className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded border', u.role==='manager' ? 'bg-red-950/40 text-red-400/70 border-red-900/40' : 'bg-white/5 text-white/30 border-white/10')}>
                {u.role.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
        <p className="text-center text-[10px] font-mono text-white/15 mt-6">NEXALERT v1.0 · HOTEL CRISIS RESPONSE</p>
      </div>
    </div>
  )
}
