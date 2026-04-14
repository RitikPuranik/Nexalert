'use client'

import { cn, roleLabel, formatElapsed } from '@/lib/utils'
import { Card, SectionHeader, Badge, EmptyState } from '@/components/ui'
import type { EnrichedPresence } from '@/types'

const STATUS_CONFIG = {
  active: { color: 'text-emerald-400', bg: 'bg-emerald-500', label: 'Active' },
  silent: { color: 'text-amber-400', bg: 'bg-amber-400', label: 'Silent' },
  offline: { color: 'text-white/25', bg: 'bg-white/20', label: 'Offline' },
}

export function StaffPresencePanel({
  presence,
  welfareAlerts,
}: {
  presence: EnrichedPresence[]
  welfareAlerts: number
}) {
  const sortedPresence = [...presence].sort((a, b) => {
    const order = { active: 0, silent: 1, offline: 2 }
    return order[a.status] - order[b.status]
  })

  return (
    <Card className="p-4">
      <SectionHeader
        title="Staff Presence"
        subtitle="Live field positions"
        right={
          welfareAlerts > 0 ? (
            <span className="text-[10px] font-mono text-amber-400 bg-amber-950/30 border border-amber-900/40 px-2 py-1 rounded animate-pulse">
              ⚠ {welfareAlerts} welfare check{welfareAlerts > 1 ? 's' : ''} needed
            </span>
          ) : undefined
        }
      />

      {!sortedPresence.length ? (
        <EmptyState icon="◈" title="No staff tracked" subtitle="Staff appear here when they accept tasks" />
      ) : (
        <div className="space-y-2">
          {sortedPresence.map(s => {
            const cfg = STATUS_CONFIG[s.status]
            const openTask = s.assigned_tasks.find(t => ['accepted', 'in_progress'].includes(t.status))

            return (
              <div
                key={s.user_id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border',
                  s.needs_welfare_check
                    ? 'border-amber-900/40 bg-amber-950/10'
                    : 'border-white/[0.06] bg-white/[0.02]'
                )}
              >
                {/* Avatar */}
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  'bg-white/8 border border-white/10 text-white/60'
                )}>
                  {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-white/80 truncate">{s.name}</span>
                      <span className={cn(
                        'text-[9px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0',
                        'bg-white/5 text-white/40 border-white/10'
                      )}>
                        {roleLabel(s.staff_role)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={cn('relative flex h-1.5 w-1.5')}>
                        {s.status === 'active' && (
                          <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        )}
                        <span className={cn('relative rounded-full h-1.5 w-1.5', cfg.bg)} />
                      </span>
                      <span className={cn('text-[10px] font-mono', cfg.color)}>{cfg.label}</span>
                    </div>
                  </div>

                  {/* Location */}
                  <div className="flex items-center gap-3 mt-1">
                    {s.floor !== null && (
                      <span className="text-[10px] font-mono text-white/30">
                        Floor {s.floor}{s.zone ? ` · ${s.zone}` : ''}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-white/20">
                      {formatElapsed(s.seconds_since_ping)} ago
                    </span>
                  </div>

                  {/* Active task */}
                  {openTask && (
                    <div className={cn(
                      'mt-1.5 text-[10px] rounded px-2 py-1 border',
                      openTask.status === 'in_progress'
                        ? 'text-amber-400/80 bg-amber-950/20 border-amber-900/30'
                        : 'text-blue-400/70 bg-blue-950/20 border-blue-900/30'
                    )}>
                      {openTask.status === 'in_progress' ? '● ' : '◑ '}{openTask.task_text}
                    </div>
                  )}

                  {/* Welfare alert */}
                  {s.needs_welfare_check && (
                    <div className="mt-1.5 text-[10px] font-mono text-amber-400 flex items-center gap-1 animate-blink">
                      <span>⚠</span>
                      <span>Silent for {s.silent_for_seconds ? formatElapsed(s.silent_for_seconds) : '?'} · welfare check needed</span>
                    </div>
                  )}

                  {s.phone && (
                    <a
                      href={`tel:${s.phone}`}
                      className="mt-1 text-[10px] font-mono text-blue-400/60 hover:text-blue-400 transition-colors"
                    >
                      📞 {s.phone}
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
