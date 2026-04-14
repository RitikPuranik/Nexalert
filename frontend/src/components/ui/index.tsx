'use client'

import { cn } from '@/lib/utils'
import type { ReactNode, ButtonHTMLAttributes } from 'react'

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ children, variant = 'default', className }: {
  children: ReactNode
  variant?: 'default' | 'red' | 'amber' | 'green' | 'blue' | 'violet' | 'cyan' | 'outline'
  className?: string
}) {
  const variants = {
    default: 'bg-white/5 text-white/60 border-white/10',
    red: 'bg-red-950/60 text-red-400 border-red-800/50',
    amber: 'bg-amber-950/60 text-amber-400 border-amber-800/50',
    green: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50',
    blue: 'bg-blue-950/60 text-blue-400 border-blue-800/50',
    violet: 'bg-violet-950/60 text-violet-400 border-violet-800/50',
    cyan: 'bg-cyan-950/60 text-cyan-400 border-cyan-800/50',
    outline: 'bg-transparent text-white/50 border-white/15',
  }
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider border uppercase',
      variants[variant], className
    )}>
      {children}
    </span>
  )
}

// ─── Button ───────────────────────────────────────────────────────────────────
export function Button({
  children, variant = 'default', size = 'md', className, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}) {
  const variants = {
    default: 'bg-white/8 hover:bg-white/12 border-white/12 text-white/80',
    primary: 'bg-blue-600 hover:bg-blue-500 border-blue-500 text-white',
    danger: 'bg-red-600/20 hover:bg-red-600/30 border-red-500/40 text-red-400',
    ghost: 'bg-transparent hover:bg-white/6 border-transparent text-white/60 hover:text-white/80',
    outline: 'bg-transparent hover:bg-white/6 border-white/15 text-white/70',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
  }
  return (
    <button
      className={cn(
        'inline-flex items-center gap-2 rounded font-medium border transition-all duration-150',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'active:scale-[0.97]',
        variants[variant], sizes[size], className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className, glow }: {
  children: ReactNode
  className?: string
  glow?: 'red' | 'amber' | 'green' | 'blue'
}) {
  const glows = {
    red: 'shadow-[0_0_30px_rgba(255,59,78,0.08)] border-red-900/40',
    amber: 'shadow-[0_0_30px_rgba(255,176,32,0.06)] border-amber-900/40',
    green: 'shadow-[0_0_30px_rgba(0,232,122,0.06)] border-emerald-900/40',
    blue: 'shadow-[0_0_30px_rgba(61,139,255,0.06)] border-blue-900/40',
  }
  return (
    <div className={cn(
      'bg-[#111820] border border-white/[0.07] rounded-lg',
      glow && glows[glow],
      className
    )}>
      {children}
    </div>
  )
}

// ─── Stat ─────────────────────────────────────────────────────────────────────
export function Stat({ label, value, unit, color }: {
  label: string
  value: string | number
  unit?: string
  color?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-mono text-white/35 uppercase tracking-widest">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className={cn('text-2xl font-bold mono', color ?? 'text-white')}>{value}</span>
        {unit && <span className="text-xs text-white/35">{unit}</span>}
      </div>
    </div>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      className="animate-spin-slow"
      style={{ '--tw-spin-duration': '0.8s' } as React.CSSProperties}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────
export function SectionHeader({ title, subtitle, right }: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="text-sm font-semibold text-white/80 tracking-wide">{title}</h2>
        {subtitle && <p className="text-xs text-white/35 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

// ─── Live indicator dot ───────────────────────────────────────────────────────
export function LiveDot({ color = 'red' }: { color?: 'red' | 'green' | 'amber' | 'blue' }) {
  const colors = {
    red: 'bg-red-500',
    green: 'bg-emerald-400',
    amber: 'bg-amber-400',
    blue: 'bg-blue-400',
  }
  return (
    <span className="relative flex h-2 w-2">
      <span className={cn(
        'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
        colors[color]
      )} />
      <span className={cn('relative inline-flex rounded-full h-2 w-2', colors[color])} />
    </span>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ value, max, color = 'blue' }: {
  value: number
  max: number
  color?: 'blue' | 'red' | 'amber' | 'green'
}) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const colors = {
    blue: 'bg-blue-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
    green: 'bg-emerald-500',
  }
  return (
    <div className="w-full bg-white/8 rounded-full h-1.5 overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-700', colors[color])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }: {
  icon?: ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      {icon && <div className="text-white/20 text-4xl mb-1">{icon}</div>}
      <p className="text-white/50 font-medium text-sm">{title}</p>
      {subtitle && <p className="text-white/25 text-xs max-w-xs">{subtitle}</p>}
    </div>
  )
}
