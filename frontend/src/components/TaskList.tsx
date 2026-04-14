'use client'

import { useState } from 'react'
import { cn, roleLabel, taskStatusColor, timeAgo, formatMs } from '@/lib/utils'
import { Badge, Button, Card, SectionHeader, ProgressBar, EmptyState } from '@/components/ui'
import type { StaffTask, TaskStatus, UserRole } from '@/types'

const STATUS_ICON: Record<TaskStatus, string> = {
  pending: '○', accepted: '◑', in_progress: '●', completed: '✓', skipped: '—',
}

const ROLE_BADGE: Record<string, string> = {
  security: 'bg-red-950/50 text-red-400 border-red-900/40',
  housekeeping: 'bg-purple-950/50 text-purple-400 border-purple-900/40',
  front_desk: 'bg-blue-950/50 text-blue-400 border-blue-900/40',
  maintenance: 'bg-amber-950/50 text-amber-400 border-amber-900/40',
  management: 'bg-white/10 text-white/60 border-white/15',
  f_and_b: 'bg-teal-950/50 text-teal-400 border-teal-900/40',
  medical: 'bg-emerald-950/50 text-emerald-400 border-emerald-900/40',
}

interface TaskListProps {
  tasks: StaffTask[]
  userRole?: UserRole
  userStaffRole?: string | null
  onAction?: (taskId: string, action: 'accept' | 'start' | 'complete' | 'skip') => Promise<void>
}

export function TaskList({ tasks, userRole, userStaffRole, onAction }: TaskListProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const completed = tasks.filter(t => t.status === 'completed').length
  const total = tasks.length

  const handleAction = async (taskId: string, action: 'accept' | 'start' | 'complete' | 'skip') => {
    if (!onAction) return
    setActionLoading(taskId)
    try { await onAction(taskId, action) }
    finally { setActionLoading(null) }
  }

  if (!tasks.length) {
    return (
      <Card className="p-4">
        <EmptyState icon="◎" title="No tasks" subtitle="AI triage will generate tasks when incident activates" />
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <SectionHeader
        title="Response Tasks"
        subtitle={`${completed}/${total} completed`}
        right={<ProgressBar value={completed} max={total} color="green" />}
      />

      <div className="space-y-2">
        {tasks.map(task => {
          const canAct = userRole === 'manager' ||
            (userRole === 'staff' && (task.assigned_to_role === userStaffRole || task.assigned_to_user_id !== null))
          const isLoading = actionLoading === task.id

          return (
            <div
              key={task.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border transition-all duration-200',
                task.status === 'completed' && 'opacity-50',
                task.status === 'skipped' && 'opacity-30',
                task.status === 'in_progress' && 'border-amber-900/40 bg-amber-950/10',
                !['completed','skipped','in_progress'].includes(task.status) && 'border-white/[0.06] bg-white/[0.02]'
              )}
            >
              {/* Priority + status icon */}
              <div className="flex flex-col items-center gap-1 pt-0.5 flex-shrink-0">
                <span className={cn('text-xs font-mono', taskStatusColor(task.status))}>
                  {STATUS_ICON[task.status]}
                </span>
                <span className="text-[9px] font-mono text-white/20">{task.priority}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className={cn(
                    'text-xs font-mono px-1.5 py-0.5 rounded border flex-shrink-0',
                    ROLE_BADGE[task.assigned_to_role] ?? 'bg-white/5 text-white/40 border-white/10'
                  )}>
                    {roleLabel(task.assigned_to_role)}
                  </span>
                  {task.status === 'in_progress' && (
                    <span className="text-[9px] font-mono text-amber-400 bg-amber-950/40 border border-amber-900/40 px-1.5 py-0.5 rounded animate-pulse">
                      IN PROGRESS
                    </span>
                  )}
                </div>

                <p className={cn(
                  'text-xs mt-1.5 leading-relaxed',
                  task.status === 'completed' ? 'text-white/30 line-through' : 'text-white/70'
                )}>
                  {task.task_text}
                </p>

                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {task.accepted_at && (
                    <span className="text-[10px] font-mono text-white/25">
                      Accepted {timeAgo(task.accepted_at)}
                    </span>
                  )}
                  {task.completed_at && (
                    <span className="text-[10px] font-mono text-emerald-400/60">
                      ✓ {timeAgo(task.completed_at)}
                    </span>
                  )}
                  {task.notes && (
                    <span className="text-[10px] text-white/30 italic">{task.notes}</span>
                  )}
                </div>

                {/* Actions */}
                {canAct && onAction && (
                  <div className="flex items-center gap-2 mt-2">
                    {task.status === 'pending' && (
                      <>
                        <Button size="sm" variant="primary" onClick={() => handleAction(task.id, 'accept')} disabled={isLoading}>
                          {isLoading ? '...' : 'Accept'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleAction(task.id, 'skip')} disabled={isLoading}>
                          Skip
                        </Button>
                      </>
                    )}
                    {task.status === 'accepted' && (
                      <Button size="sm" variant="default" onClick={() => handleAction(task.id, 'start')} disabled={isLoading}>
                        {isLoading ? '...' : 'Start'}
                      </Button>
                    )}
                    {task.status === 'in_progress' && (
                      <Button size="sm" variant="default" className="border-emerald-800/50 text-emerald-400 hover:bg-emerald-950/30" onClick={() => handleAction(task.id, 'complete')} disabled={isLoading}>
                        {isLoading ? '...' : '✓ Complete'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
