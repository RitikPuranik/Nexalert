'use client'

import { cn, severityLabel, statusLabel, statusColor, incidentTypeIcon, timeAgo } from '@/lib/utils'
import { Badge, LiveDot } from '@/components/ui'
import type { Incident } from '@/types'
import Link from 'next/link'

const SEV_STYLES: Record<number, { border: string; bg: string; dot: string }> = {
  1: { border: 'border-red-900/50', bg: 'hover:bg-red-950/20', dot: 'bg-red-500 sev-1-pulse' },
  2: { border: 'border-amber-900/40', bg: 'hover:bg-amber-950/15', dot: 'bg-amber-400 sev-2-pulse' },
  3: { border: 'border-emerald-900/30', bg: 'hover:bg-emerald-950/10', dot: 'bg-emerald-500' },
}

const TYPE_COLOR: Record<string, string> = {
  fire: 'text-orange-400', smoke: 'text-slate-300', medical: 'text-blue-400',
  security: 'text-red-400', gas_leak: 'text-amber-400', power_outage: 'text-yellow-400',
  flood: 'text-cyan-400', other: 'text-white/40',
}

export function IncidentCard({ incident }: { incident: Incident }) {
  const sev = incident.severity
  const style = sev ? SEV_STYLES[sev] : null
  const isActive = ['detecting', 'triaging', 'active', 'investigating'].includes(incident.status)

  return (
    <Link href={`/dashboard/incidents/${incident.id}`}>
      <div className={cn(
        'group relative bg-[#111820] border rounded-lg p-4 transition-all duration-200 cursor-pointer animate-slide-up',
        style ? `${style.border} ${style.bg}` : 'border-white/[0.07] hover:bg-white/[0.03]'
      )}>
        {/* Left accent line */}
        {sev === 1 && (
          <div className="absolute left-0 top-3 bottom-3 w-[2px] bg-red-500 rounded-full" />
        )}
        {sev === 2 && (
          <div className="absolute left-0 top-3 bottom-3 w-[2px] bg-amber-400 rounded-full" />
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {/* Status dot */}
            <div className="mt-1 flex-shrink-0">
              {isActive ? (
                <span className="relative flex h-2 w-2">
                  <span className={cn(
                    'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                    sev === 1 ? 'bg-red-500' : sev === 2 ? 'bg-amber-400' : 'bg-emerald-400'
                  )} />
                  <span className={cn(
                    'relative inline-flex rounded-full h-2 w-2',
                    sev === 1 ? 'bg-red-500' : sev === 2 ? 'bg-amber-400' : 'bg-emerald-400'
                  )} />
                </span>
              ) : (
                <div className="w-2 h-2 rounded-full bg-white/20" />
              )}
            </div>

            <div className="min-w-0">
              {/* Type + location */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('text-sm font-semibold capitalize', TYPE_COLOR[incident.type] ?? 'text-white/70')}>
                  {incidentTypeIcon(incident.type)} {incident.type.replace('_', ' ')}
                </span>
                {incident.is_drill && (
                  <Badge variant="cyan">DRILL</Badge>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-xs font-mono text-white/35">
                  Floor {incident.floor} · {incident.zone}
                  {incident.room && ` · Room ${incident.room}`}
                </span>
                <span className="text-[10px] font-mono text-white/20">
                  via {incident.source.replace('_', ' ')}
                </span>
              </div>

              {/* AI briefing preview */}
              {incident.ai_briefing && (
                <p className="text-xs text-white/40 mt-1.5 line-clamp-2 leading-relaxed">
                  {incident.ai_briefing}
                </p>
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {/* Severity */}
            {sev ? (
              <span className={cn(
                'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border',
                sev === 1 && 'bg-red-950/60 text-red-400 border-red-800/50',
                sev === 2 && 'bg-amber-950/60 text-amber-400 border-amber-800/50',
                sev === 3 && 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50',
              )}>
                SEV {sev}
              </span>
            ) : (
              <span className="text-[10px] font-mono text-white/25 border border-white/10 rounded px-1.5 py-0.5">
                TRIAGING
              </span>
            )}

            {/* Status */}
            <span className={cn('text-[10px] font-mono', statusColor(incident.status))}>
              {statusLabel(incident.status)}
            </span>

            {/* Time */}
            <span className="text-[10px] font-mono text-white/20">
              {timeAgo(incident.detected_at)}
            </span>
          </div>
        </div>

        {/* 911 recommend banner */}
        {incident.ai_recommend_911 && isActive && (
          <div className="mt-3 flex items-center gap-2 bg-red-950/30 border border-red-900/40 rounded px-3 py-1.5">
            <span className="text-red-400 text-xs">🚨</span>
            <span className="text-[10px] font-mono text-red-400 font-bold">
              AI RECOMMENDS 911 ESCALATION
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}

// ─── Compact row variant ───────────────────────────────────────────────────────
export function IncidentRow({ incident }: { incident: Incident }) {
  const sev = incident.severity
  const isActive = ['detecting', 'triaging', 'active', 'investigating'].includes(incident.status)

  return (
    <Link href={`/dashboard/incidents/${incident.id}`}>
      <div className="flex items-center gap-3 py-2.5 px-3 hover:bg-white/[0.03] rounded transition-colors cursor-pointer group">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0">
          {isActive ? (
            <span className="relative flex h-2 w-2">
              <span className={cn(
                'animate-ping absolute h-full w-full rounded-full opacity-75',
                sev === 1 ? 'bg-red-500' : sev === 2 ? 'bg-amber-400' : 'bg-emerald-400'
              )} />
              <span className={cn(
                'relative inline-flex rounded-full h-2 w-2',
                sev === 1 ? 'bg-red-500' : sev === 2 ? 'bg-amber-400' : 'bg-emerald-400'
              )} />
            </span>
          ) : <div className="w-2 h-2 rounded-full bg-white/15" />}
        </div>

        <span className="text-xs font-mono text-white/50 w-16 flex-shrink-0">
          F{incident.floor} · {incident.zone.slice(0, 4)}
        </span>

        <span className={cn('text-xs font-medium capitalize flex-1 truncate', TYPE_COLOR[incident.type] ?? 'text-white/70')}>
          {incident.type.replace('_', ' ')}
        </span>

        {sev && (
          <span className={cn(
            'text-[9px] font-mono font-bold px-1 py-0.5 rounded border flex-shrink-0',
            sev === 1 && 'bg-red-950/60 text-red-400 border-red-900/50',
            sev === 2 && 'bg-amber-950/60 text-amber-400 border-amber-900/50',
            sev === 3 && 'bg-emerald-950/60 text-emerald-400 border-emerald-900/50',
          )}>
            S{sev}
          </span>
        )}

        <span className="text-[10px] font-mono text-white/20 flex-shrink-0">
          {timeAgo(incident.detected_at)}
        </span>
      </div>
    </Link>
  )
}
