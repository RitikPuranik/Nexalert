'use client'

import { useEffect, useState, useCallback } from 'react'
import { cn, formatElapsed } from '@/lib/utils'
import { Card } from '@/components/ui'
import * as api from '@/lib/api'

interface DeadmanWidgetProps {
  sessionToken: string
  intervalSeconds?: number
}

export function DeadmanWidget({ sessionToken, intervalSeconds = 120 }: DeadmanWidgetProps) {
  const [secondsLeft, setSecondsLeft] = useState(intervalSeconds)
  const [status, setStatus] = useState<string>('active')
  const [missedPings, setMissedPings] = useState(0)
  const [lastPinged, setLastPinged] = useState<Date>(new Date())
  const [isPinging, setIsPinging] = useState(false)
  const [pingSuccess, setPingSuccess] = useState(false)

  // Countdown
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft(s => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // Poll status every 30s
  useEffect(() => {
    const poll = async () => {
      const res = await api.deadman.status(sessionToken)
      if (res.success) {
        setSecondsLeft(res.data.seconds_remaining)
        setStatus(res.data.status as typeof status)
        setMissedPings(res.data.missed_pings)
      }
    }
    poll()
    const t = setInterval(poll, 30000)
    return () => clearInterval(t)
  }, [sessionToken])

  const handlePing = useCallback(async () => {
    if (isPinging) return
    setIsPinging(true)
    try {
      const res = await api.deadman.ping(sessionToken)
      if (res.success) {
        setSecondsLeft(res.data.seconds_remaining)
        setStatus(res.data.status as typeof status)
        setLastPinged(new Date())
        setMissedPings(0)
        setPingSuccess(true)
        setTimeout(() => setPingSuccess(false), 2000)
      }
    } finally {
      setIsPinging(false)
    }
  }, [sessionToken, isPinging])

  const pct = Math.round((secondsLeft / intervalSeconds) * 100)
  const isUrgent = secondsLeft < 30
  const isEscalated = status === 'escalated'

  const circumference = 2 * Math.PI * 54
  const dashOffset = circumference * (1 - pct / 100)

  if (status === 'resolved') {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="text-5xl">✓</div>
        <p className="text-emerald-400 font-semibold text-lg">You've been found</p>
        <p className="text-white/40 text-sm">Help is with you. Stay calm.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Escalation warning */}
      {isEscalated && (
        <div className="w-full bg-red-950/50 border border-red-700/50 rounded-lg p-3 text-center animate-pulse">
          <p className="text-red-400 font-mono text-sm font-bold">⚠ HELP IS BEING DISPATCHED</p>
          <p className="text-red-400/70 text-xs mt-1">You missed {missedPings} check-ins. Staff are coming to you.</p>
        </div>
      )}

      {/* Countdown ring */}
      <div className="relative">
        <svg width="128" height="128" className="-rotate-90">
          {/* Background ring */}
          <circle
            cx="64" cy="64" r="54"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
          />
          {/* Progress ring */}
          <circle
            cx="64" cy="64" r="54"
            fill="none"
            stroke={isUrgent ? '#ff3b4e' : isEscalated ? '#ff3b4e' : '#00e87a'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-1000"
            style={{
              filter: isUrgent ? 'drop-shadow(0 0 6px rgba(255,59,78,0.6))' : 'drop-shadow(0 0 4px rgba(0,232,122,0.4))'
            }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn(
            'text-2xl font-mono font-bold transition-colors',
            isUrgent ? 'text-red-400' : 'text-white/90'
          )}>
            {secondsLeft}s
          </span>
          <span className="text-[10px] font-mono text-white/30 mt-0.5">remaining</span>
        </div>
      </div>

      {/* Last pinged */}
      <p className="text-xs font-mono text-white/30 text-center">
        Last confirmed: {lastPinged.toLocaleTimeString()}
      </p>

      {/* PING BUTTON */}
      <button
        onClick={handlePing}
        disabled={isPinging || status === 'resolved'}
        className={cn(
          'relative w-full max-w-xs py-5 rounded-xl font-bold text-lg transition-all duration-200 active:scale-95',
          'border-2 select-none touch-none',
          pingSuccess
            ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400'
            : isUrgent || isEscalated
              ? 'bg-red-500/15 border-red-500/50 text-red-400 animate-pulse'
              : 'bg-white/[0.06] border-white/20 text-white/80 hover:bg-white/[0.10]',
          isPinging && 'opacity-60'
        )}
      >
        {pingSuccess ? '✓ Check-in recorded' : isPinging ? 'Sending...' : "I'M OKAY"}
      </button>

      <p className="text-[11px] text-white/25 text-center max-w-xs leading-relaxed">
        Tap every {Math.round(intervalSeconds / 60)} minutes to confirm you're safe.
        If you miss {2} check-ins, help will be sent to your location.
      </p>

      {missedPings > 0 && (
        <div className="flex items-center gap-2 text-amber-400 text-xs font-mono">
          <span className="animate-blink">⚠</span>
          {missedPings} missed check-in{missedPings > 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
