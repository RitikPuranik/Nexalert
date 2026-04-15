'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Card, SectionHeader, EmptyState, ProgressBar } from '@/components/ui'
import { cn, formatMs, timeAgo } from '@/lib/utils'
import * as api from '@/lib/api'
import type { IncidentReport } from '@/types'

const MOCK_REPORTS: IncidentReport[] = [
  {
    id: 'rep-001', incident_id: 'demo-inc-003', hotel_id: 'hotel-001',
    generated_at: new Date(Date.now() - 3200*1000).toISOString(),
    generated_by: 'mgr-001',
    executive_summary: 'A security alert was reported in the hotel lobby at 14:22 by the on-duty security officer. The individual was identified within 4 minutes as a registered guest who had misplaced their key card. The incident was resolved without any guest disruption. Response times were within acceptable parameters. No emergency services were required.',
    timeline: [
      { timestamp: new Date(Date.now() - 4200*1000).toISOString(), event: 'Security alert reported in lobby', actor: 'Security Officer' },
      { timestamp: new Date(Date.now() - 4100*1000).toISOString(), event: 'AI triage complete — severity 3 (monitor)', actor: 'NexAlert AI' },
      { timestamp: new Date(Date.now() - 4000*1000).toISOString(), event: 'Task accepted: Verify individual identity', actor: 'security' },
      { timestamp: new Date(Date.now() - 3800*1000).toISOString(), event: 'Individual identified as registered guest', actor: 'security' },
      { timestamp: new Date(Date.now() - 3200*1000).toISOString(), event: 'All-clear issued — incident resolved', actor: 'Duty Manager' },
    ],
    response_metrics: {
      time_to_triage_ms: 45000,
      time_to_first_staff_response_ms: 62000,
      time_to_resolution_ms: 1000000,
      tasks_total: 3, tasks_completed: 3,
      tasks_completion_rate: 100,
      avg_task_acceptance_ms: 55000,
    },
    notifications_summary: { total_guests_notified: 0, sent: 0, delivered: 0, confirmed_safe: 0, requested_help: 0, languages: [] },
    tasks_summary: { total: 3, completed: 3, unaccepted: [] },
    recommendations: [
      'Install digital key card dispensers near lobby to reduce guest confusion and prevent similar incidents.',
      'Brief front desk staff on rapid guest identity verification protocols to reduce response time below 3 minutes.',
      'Consider installing visible QR-code based self-service support kiosks in high-traffic areas.',
    ],
    pdf_url: null,
  },
]

export default function ReportsPage() {
  const { token, isDemoMode } = useAuth()
  const [reports, setReports] = useState<IncidentReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<IncidentReport | null>(null)

  useEffect(() => {
    if (isDemoMode) { setReports(MOCK_REPORTS); setLoading(false); return }
    if (!token) return
    const fetch = async () => {
      const res = await api.reports.list(token)
      if (res.success) setReports(res.data)
      setLoading(false)
    }
    fetch()
  }, [token, isDemoMode])

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-base font-semibold text-white/80">Incident Reports</h1>
        <p className="text-xs text-white/30 font-mono mt-0.5">{reports.length} reports generated</p>
      </div>

      {loading ? (
        <div className="text-xs font-mono text-white/25 animate-pulse text-center py-12">Loading...</div>
      ) : reports.length === 0 ? (
        <Card className="p-8"><EmptyState icon="◷" title="No reports yet" subtitle="Generate a report from a resolved incident's detail page" /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {reports.map(r => (
              <button key={r.id} onClick={() => setSelected(r)}
                className={cn('w-full text-left p-3 rounded-lg border transition-all duration-150',
                  selected?.id === r.id ? 'bg-white/8 border-white/15' : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05]')}>
                <p className="text-xs font-mono text-white/60 truncate">Inc. {r.incident_id.slice(0, 16)}...</p>
                <p className="text-[10px] font-mono text-white/30 mt-0.5">{timeAgo(r.generated_at)}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <ProgressBar value={r.response_metrics.tasks_completion_rate} max={100} color="green" />
                  <span className="text-[9px] font-mono text-white/30">{r.response_metrics.tasks_completion_rate}%</span>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-2">
            {selected ? (
              <Card className="p-5 space-y-5">
                <SectionHeader title="Incident Report" subtitle={`Generated ${timeAgo(selected.generated_at)}`} />
                <div>
                  <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-2">Executive Summary</p>
                  <p className="text-sm text-white/70 leading-relaxed">{selected.executive_summary}</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-3">Response Metrics</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Time to Triage', val: formatMs(selected.response_metrics.time_to_triage_ms) },
                      { label: 'First Response', val: formatMs(selected.response_metrics.time_to_first_staff_response_ms) },
                      { label: 'Resolution Time', val: formatMs(selected.response_metrics.time_to_resolution_ms) },
                      { label: 'Tasks Completion', val: `${selected.response_metrics.tasks_completion_rate}%` },
                    ].map(m => (
                      <div key={m.label} className="bg-white/[0.03] rounded p-3 border border-white/[0.05]">
                        <p className="text-[9px] font-mono text-white/25 uppercase">{m.label}</p>
                        <p className="text-sm font-mono font-bold text-white/70 mt-0.5">{m.val}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {selected.timeline.length > 0 && (
                  <div>
                    <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-3">Timeline</p>
                    <div className="space-y-2 relative">
                      <div className="absolute left-2 top-0 bottom-0 w-px bg-white/[0.06]" />
                      {selected.timeline.map((e, i) => (
                        <div key={i} className="flex gap-4 pl-6 relative">
                          <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-[#111820] border border-white/15 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
                          </div>
                          <div>
                            <p className="text-xs text-white/60">{e.event}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[9px] font-mono text-white/25">{e.actor}</span>
                              <span className="text-[9px] font-mono text-white/20">{new Date(e.timestamp).toLocaleTimeString()}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selected.recommendations.length > 0 && (
                  <div>
                    <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-3">AI Recommendations</p>
                    <ul className="space-y-2">
                      {selected.recommendations.map((r, i) => (
                        <li key={i} className="flex gap-2 text-sm text-white/55">
                          <span className="text-violet-400/60 flex-shrink-0 font-mono text-xs mt-0.5">{i + 1}.</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="p-8"><EmptyState icon="◷" title="Select a report" subtitle="Click a report on the left to view details" /></Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}