import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { IncidentSeverity, IncidentStatus, IncidentType, TaskStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export function formatMs(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

export function severityLabel(s: IncidentSeverity | null): string {
  if (!s) return 'Assessing'
  return { 1: 'CRITICAL', 2: 'URGENT', 3: 'MONITOR' }[s] ?? 'Unknown'
}

export function severityColor(s: IncidentSeverity | null): string {
  if (!s) return 'text-neutral-400'
  return { 1: 'text-red-400', 2: 'text-amber-400', 3: 'text-emerald-400' }[s] ?? 'text-neutral-400'
}

export function severityBg(s: IncidentSeverity | null): string {
  if (!s) return 'bg-neutral-800 border-neutral-700'
  return {
    1: 'bg-red-950/60 border-red-800/60',
    2: 'bg-amber-950/60 border-amber-800/60',
    3: 'bg-emerald-950/60 border-emerald-800/60',
  }[s] ?? 'bg-neutral-800 border-neutral-700'
}

export function statusLabel(s: IncidentStatus): string {
  return {
    detecting: 'Detecting',
    triaging: 'AI Triaging',
    active: 'Active',
    investigating: 'Investigating',
    resolved: 'Resolved',
    false_alarm: 'False Alarm',
    drill: 'Drill',
  }[s] ?? s
}

export function statusColor(s: IncidentStatus): string {
  return {
    detecting: 'text-blue-400',
    triaging: 'text-violet-400',
    active: 'text-red-400',
    investigating: 'text-amber-400',
    resolved: 'text-emerald-400',
    false_alarm: 'text-neutral-400',
    drill: 'text-cyan-400',
  }[s] ?? 'text-neutral-400'
}

export function incidentTypeIcon(type: IncidentType | string): string {
  return {
    fire: '🔥', smoke: '💨', medical: '🚑', security: '🚨',
    gas_leak: '⚠️', power_outage: '⚡', flood: '🌊', other: '⚠️',
  }[type] ?? '⚠️'
}

export function incidentTypeColor(type: IncidentType | string): string {
  return {
    fire: 'text-orange-400', smoke: 'text-slate-400', medical: 'text-blue-400',
    security: 'text-red-400', gas_leak: 'text-amber-400', power_outage: 'text-yellow-400',
    flood: 'text-cyan-400', other: 'text-neutral-400',
  }[type] ?? 'text-neutral-400'
}

export function taskStatusColor(s: TaskStatus): string {
  return {
    pending: 'text-neutral-400', accepted: 'text-blue-400',
    in_progress: 'text-amber-400', completed: 'text-emerald-400', skipped: 'text-neutral-600',
  }[s] ?? 'text-neutral-400'
}

export function roleLabel(role: string): string {
  return {
    security: 'Security', housekeeping: 'Housekeeping', front_desk: 'Front Desk',
    maintenance: 'Maintenance', management: 'Management', f_and_b: 'F&B', medical: 'Medical',
  }[role] ?? role
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
