'use client'

import { useState, use } from 'react'
import { useIncident, useTasksMock, useHeatmap, useStaffPresence } from '@/hooks'
import { useAuth } from '@/context/AuthContext'
import { TaskList } from '@/components/TaskList'
import { FloorHeatmap } from '@/components/FloorHeatmap'
import { StaffPresencePanel } from '@/components/StaffPresence'
import { Card, SectionHeader, Button, Badge, LiveDot, Stat, ProgressBar, Spinner } from '@/components/ui'
import { cn, severityLabel, statusLabel, statusColor, incidentTypeIcon, timeAgo, formatMs, roleLabel } from '@/lib/utils'
import * as api from '@/lib/api'
import Link from 'next/link'

const DEMO_HOTEL_ID = 'hotel-001'

export default function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { token, user } = useAuth()
  const { incident, isLoading, refetch } = useIncident(id)
  const { tasks, updateTask } = useTasksMock(id)
  const heatmap = useHeatmap(DEMO_HOTEL_ID, incident?.floor ?? 1, id)
  const { presence, welfareAlerts } = useStaffPresence(id)

  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportMsg, setReportMsg] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const isActive = incident && ['detecting','triaging','active','investigating'].includes(incident.status)

  const handleAction = async (action: 'confirm' | 'investigate' | 'dismiss' | 'resolve' | 'escalate_911') => {
    if (!token || !incident) return
    setActionLoading(action)
    try {
      const res = await api.incidents.patch(incident.id, action, token)
      if (res.success) refetch()
    } catch { /* backend offline in demo */ }
    finally { setActionLoading(null) }
  }

  const handleGenerateReport = async () => {
    if (!token || !incident) return
    setReportLoading(true)
    try {
      const res = await api.reports.generate(incident.id, token)
      setReportMsg(res.success ? '✓ Report generated' : `⚠ ${res.error}`)
    } catch { setReportMsg('⚠ Backend not reachable') }
    finally { setReportLoading(false) }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size={24} />
      </div>
    )
  }

  if (!incident) {
    return (
      <div className="text-center py-20">
        <p className="text-white/30 font-mono text-sm">Incident not found</p>
        <Link href="/dashboard/incidents" className="text-blue-400/60 text-xs font-mono mt-2 block hover:text-blue-400">
          ← Back to incidents
        </Link>
      </div>
    )
  }

  const sev = incident.severity
  const elapsed = Math.round((Date.now() - new Date(incident.detected_at).getTime()) / 1000)
  const completedTasks = tasks.filter(t => t.status === 'completed').length

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-mono text-white/25">
        <Link href="/dashboard" className="hover:text-white/50 transition-colors">Dashboard</Link>
        <span>/</span>
        <Link href="/dashboard/incidents" className="hover:text-white/50 transition-colors">Incidents</Link>
        <span>/</span>
        <span className="text-white/40">{incident.id.slice(0, 8)}...</span>
      </div>

      {/* Header */}
      <div className={cn(
        'relative rounded-xl border p-5 overflow-hidden',
        sev === 1 ? 'border-red-900/50 bg-red-950/15' :
        sev === 2 ? 'border-amber-900/40 bg-amber-950/10' :
        'border-white/10 bg-white/[0.02]'
      )}>
        {/* BG pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.8) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-2xl">{incidentTypeIcon(incident.type)}</span>
              <h1 className="text-xl font-bold text-white/90 capitalize">
                {incident.type.replace('_', ' ')}
              </h1>
              {incident.is_drill && <Badge variant="cyan">DRILL</Badge>}
              {incident.ai_recommend_911 && isActive && (
                <Badge variant="red" className="animate-pulse">911 RECOMMENDED</Badge>
              )}
            </div>

            <div className="flex items-center gap-4 mt-2 flex-wrap text-xs font-mono text-white/40">
              <span>Floor {incident.floor} · {incident.zone}</span>
              {incident.room && <span>Room {incident.room}</span>}
              <span>via {incident.source.replace('_', ' ')}</span>
              <span>{timeAgo(incident.detected_at)}</span>
            </div>

            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {sev && (
                <span className={cn(
                  'text-xs font-mono font-bold px-2 py-0.5 rounded border',
                  sev === 1 && 'bg-red-950/60 text-red-400 border-red-800/50',
                  sev === 2 && 'bg-amber-950/60 text-amber-400 border-amber-800/50',
                  sev === 3 && 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50',
                )}>
                  SEV {sev} — {severityLabel(sev)}
                </span>
              )}
              <span className={cn('text-xs font-mono font-semibold', statusColor(incident.status))}>
                {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 animate-ping" />}
                {statusLabel(incident.status)}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          {user?.role === 'manager' && isActive && (
            <div className="flex flex-wrap gap-2">
              {incident.status === 'detecting' && (
                <Button variant="primary" onClick={() => handleAction('confirm')} disabled={!!actionLoading}>
                  {actionLoading === 'confirm' ? '...' : '✓ Confirm'}
                </Button>
              )}
              {['active','detecting'].includes(incident.status) && (
                <Button variant="default" onClick={() => handleAction('investigate')} disabled={!!actionLoading}>
                  {actionLoading === 'investigate' ? '...' : '🔍 Investigate'}
                </Button>
              )}
              {incident.status === 'active' && (
                <Button variant="danger" onClick={() => handleAction('dismiss')} disabled={!!actionLoading}>
                  {actionLoading === 'dismiss' ? '...' : '✗ False Alarm'}
                </Button>
              )}
              <Button
                variant="default"
                className="border-emerald-800/40 text-emerald-400 hover:bg-emerald-950/20"
                onClick={() => handleAction('resolve')}
                disabled={!!actionLoading}
              >
                {actionLoading === 'resolve' ? '...' : '✓ Resolve'}
              </Button>
              {incident.ai_recommend_911 && (
                <Button variant="danger" className="animate-pulse" onClick={() => handleAction('escalate_911')} disabled={!!actionLoading}>
                  🚨 Escalate 911
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sensor data */}
      {incident.sensor_value && (
        <Card className="px-5 py-3">
          <div className="flex items-center gap-6 flex-wrap">
            <Stat label="Sensor Type" value={incident.sensor_type ?? '—'} />
            <Stat label="Reading" value={incident.sensor_value} unit="units" color="text-amber-400" />
            <Stat label="Threshold" value={incident.sensor_threshold ?? '—'} />
            <div>
              <p className="text-[10px] font-mono text-white/35 uppercase tracking-widest mb-0.5">Exceedance</p>
              <div className="flex items-center gap-2">
                <ProgressBar
                  value={incident.sensor_value}
                  max={incident.sensor_threshold ?? 100}
                  color={incident.sensor_value > (incident.sensor_threshold ?? 100) ? 'red' : 'amber'}
                />
                <span className="text-xs font-mono text-amber-400 min-w-[40px]">
                  {Math.round((incident.sensor_value / (incident.sensor_threshold ?? 100)) * 100)}%
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* AI Briefing */}
      {incident.ai_briefing && (
        <Card className="p-4 border-violet-900/20">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded bg-violet-950/50 border border-violet-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-violet-400 text-xs font-mono">AI</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-violet-400">Gemini AI Briefing</span>
                {incident.ai_triage_completed_at && (
                  <span className="text-[10px] font-mono text-white/25">
                    {timeAgo(incident.ai_triage_completed_at)}
                  </span>
                )}
              </div>
              <p className="text-sm text-white/70 leading-relaxed">{incident.ai_briefing}</p>
              {incident.ai_severity_reason && (
                <p className="text-xs text-white/35 mt-2 font-mono">Reason: {incident.ai_severity_reason}</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Responder briefing */}
      {incident.ai_responder_briefing && (
        <Card className="p-4 border-blue-900/20">
          <SectionHeader title="Responder Briefing" subtitle="For emergency services" />
          <p className="text-sm text-white/60 leading-relaxed font-mono whitespace-pre-line">
            {incident.ai_responder_briefing}
          </p>
        </Card>
      )}

      {/* Guest alert */}
      {incident.ai_guest_alert_en && (
        <Card className="p-4">
          <SectionHeader title="Guest Alert Messages" subtitle="Dispatched to all guests on floor" />
          <div className="space-y-2">
            <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
              <span className="text-[9px] font-mono text-white/30 uppercase">EN</span>
              <p className="text-sm text-white/70 mt-1">{incident.ai_guest_alert_en}</p>
            </div>
            {Object.entries(incident.ai_guest_alert_translations).map(([lang, msg]) => (
              <div key={lang} className="bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
                <span className="text-[9px] font-mono text-white/30 uppercase">{lang}</span>
                <p className="text-sm text-white/50 mt-1">{msg}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tasks */}
        <div className="lg:col-span-2">
          <TaskList
            tasks={tasks}
            userRole={user?.role}
            userStaffRole={user?.staff_role}
            onAction={updateTask}
          />
        </div>

        {/* Guest summary + metrics */}
        <div className="space-y-4">
          {incident.guest_summary && (
            <Card className="p-4">
              <SectionHeader title="Guest Summary" />
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/[0.03] rounded p-3 border border-white/[0.05] text-center">
                  <div className="text-2xl font-mono font-bold text-white/80">{incident.guest_summary.total_notified}</div>
                  <div className="text-[9px] font-mono text-white/30 mt-0.5">NOTIFIED</div>
                </div>
                <div className="bg-emerald-950/30 rounded p-3 border border-emerald-900/30 text-center">
                  <div className="text-2xl font-mono font-bold text-emerald-400">{incident.guest_summary.confirmed_safe}</div>
                  <div className="text-[9px] font-mono text-emerald-400/60 mt-0.5">SAFE</div>
                </div>
                <div className="bg-red-950/30 rounded p-3 border border-red-900/30 text-center">
                  <div className="text-2xl font-mono font-bold text-red-400">{incident.guest_summary.needs_help}</div>
                  <div className="text-[9px] font-mono text-red-400/60 mt-0.5">NEED HELP</div>
                </div>
                <div className="bg-white/[0.03] rounded p-3 border border-white/[0.05] text-center">
                  <div className="text-xs font-mono text-white/50 leading-relaxed">
                    {incident.guest_summary.languages.join(', ').toUpperCase() || '—'}
                  </div>
                  <div className="text-[9px] font-mono text-white/25 mt-0.5">LANGUAGES</div>
                </div>
              </div>
            </Card>
          )}

          {/* Elapsed time */}
          <Card className="p-4">
            <SectionHeader title="Response Metrics" />
            <div className="space-y-3">
              <Stat label="Elapsed Time" value={Math.floor(elapsed / 60) + 'm ' + (elapsed % 60) + 's'} />
              <Stat label="Tasks Done" value={`${completedTasks}/${tasks.length}`} color="text-emerald-400" />
              {incident.ai_triage_completed_at && (
                <Stat
                  label="Triage Time"
                  value={formatMs(new Date(incident.ai_triage_completed_at).getTime() - new Date(incident.detected_at).getTime())}
                  color="text-violet-400"
                />
              )}
            </div>
          </Card>

          {/* Report generate */}
          {user?.role === 'manager' && incident.status === 'resolved' && (
            <Card className="p-4">
              <SectionHeader title="Incident Report" subtitle="AI-generated compliance report" />
              <Button
                variant="default"
                className="w-full justify-center"
                onClick={handleGenerateReport}
                disabled={reportLoading}
              >
                {reportLoading ? <><Spinner size={12} /> Generating...</> : '📋 Generate Report'}
              </Button>
              {reportMsg && (
                <p className={cn(
                  'text-[10px] font-mono mt-2 px-2 py-1.5 rounded border',
                  reportMsg.startsWith('✓')
                    ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30'
                    : 'text-amber-400 bg-amber-950/20 border-amber-900/30'
                )}>{reportMsg}</p>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Floor heatmap */}
      {isActive && <FloorHeatmap data={heatmap} />}

      {/* Staff presence */}
      {isActive && presence.length > 0 && (
        <StaffPresencePanel presence={presence} welfareAlerts={welfareAlerts} />
      )}
    </div>
  )
}
