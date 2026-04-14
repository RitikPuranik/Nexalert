'use client'

import { useState, useEffect } from 'react'
import { cn, incidentTypeIcon, timeAgo, formatElapsed } from '@/lib/utils'
import { Card, SectionHeader, Badge, ProgressBar } from '@/components/ui'
import * as api from '@/lib/api'

export default function ResponderPortalPage({ searchParams }: { searchParams: Promise<{ incident_id?: string }> }) {
  const [incidentId, setIncidentId] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [inputId, setInputId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    searchParams.then(p => {
      if (p.incident_id) {
        setIncidentId(p.incident_id)
        loadPortal(p.incident_id)
      }
    })
  }, [])

  const loadPortal = async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.responder.get(id)
      if ((res as any).success) {
        setData((res as any).data)
      } else {
        setError((res as any).error)
      }
    } catch {
      setError('Backend not reachable — demo mode')
    } finally {
      setLoading(false)
    }
  }

  const handleLoad = () => {
    if (!inputId) return
    setIncidentId(inputId)
    loadPortal(inputId)
  }

  return (
    <div className="min-h-screen bg-[#080c10] p-4">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3 py-3 border-b border-white/[0.07]">
          <div className="w-8 h-8 rounded bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
            <span className="text-blue-400 font-mono text-xs font-bold">R</span>
          </div>
          <div>
            <h1 className="text-sm font-mono font-bold text-white/80">Responder Portal</h1>
            <p className="text-[10px] font-mono text-white/30">NexAlert · First Responder Briefing</p>
          </div>
        </div>

        {/* ID input if not provided */}
        {!data && (
          <div className="space-y-3">
            <p className="text-xs text-white/40 font-mono">Enter incident ID to load live briefing:</p>
            <div className="flex gap-2">
              <input value={inputId} onChange={e => setInputId(e.target.value)}
                placeholder="Incident ID"
                className="flex-1 bg-[#111820] border border-white/10 rounded px-3 py-2 text-xs font-mono text-white/70 focus:outline-none" />
              <button onClick={handleLoad} disabled={loading || !inputId}
                className="px-4 py-2 bg-blue-600/20 border border-blue-600/40 text-blue-400 rounded text-xs font-mono hover:bg-blue-600/30 disabled:opacity-40">
                {loading ? '...' : 'Load'}
              </button>
            </div>
            {error && <p className="text-xs font-mono text-amber-400 bg-amber-950/20 border border-amber-900/30 rounded px-3 py-2">{error}</p>}
          </div>
        )}

        {/* Portal content */}
        {data && (
          <div className="space-y-4 animate-slide-up">

            {/* Incident summary */}
            <div className={cn('rounded-xl border p-4',
              data.incident.severity === 1 ? 'border-red-900/50 bg-red-950/20' :
              data.incident.severity === 2 ? 'border-amber-900/40 bg-amber-950/10' :
              'border-blue-900/30 bg-blue-950/10')}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{incidentTypeIcon(data.incident.type)}</span>
                    <span className="text-lg font-bold text-white/90 capitalize">{data.incident.type.replace('_',' ')}</span>
                    {data.incident.is_drill && <Badge variant="cyan">DRILL</Badge>}
                  </div>
                  <p className="text-xs font-mono text-white/40 mt-1">
                    Floor {data.incident.floor} · Zone {data.incident.zone}
                    {data.incident.room && ` · Room ${data.incident.room}`}
                  </p>
                </div>
                <div className="text-right">
                  <div className={cn('text-2xl font-mono font-bold',
                    data.incident.severity === 1 ? 'text-red-400' :
                    data.incident.severity === 2 ? 'text-amber-400' : 'text-emerald-400')}>
                    SEV {data.incident.severity ?? '?'}
                  </div>
                  <p className="text-[10px] font-mono text-white/30">
                    {formatElapsed(data.incident.elapsed_seconds)} elapsed
                  </p>
                </div>
              </div>

              {data.incident.sensor && (
                <div className="mt-3 text-xs font-mono text-white/40 bg-white/[0.03] rounded p-2">
                  Sensor: {data.incident.sensor.type} = {data.incident.sensor.value} (threshold: {data.incident.sensor.threshold})
                </div>
              )}
            </div>

            {/* Hotel info */}
            {data.hotel && (
              <Card className="p-4">
                <SectionHeader title="Property Information" />
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="font-mono text-white/30">Hotel</span>
                    <span className="text-white/70">{data.hotel.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-mono text-white/30">Address</span>
                    <span className="text-white/70">{data.hotel.address}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-mono text-white/30">Total Floors</span>
                    <span className="text-white/70">{data.hotel.total_floors}</span>
                  </div>
                </div>
                {data.hotel.access_codes && Object.keys(data.hotel.access_codes).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/[0.05]">
                    <p className="text-[9px] font-mono text-white/25 uppercase mb-2">Access Codes</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(data.hotel.access_codes).map(([k, v]) => (
                        <div key={k} className="bg-white/[0.04] rounded px-2 py-1.5 border border-white/[0.07]">
                          <p className="text-[9px] font-mono text-white/30">{k}</p>
                          <p className="text-sm font-mono font-bold text-white/80">{v as string}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* AI Briefing */}
            {data.incident.briefing && (
              <Card className="p-4 border-violet-900/20">
                <SectionHeader title="AI Responder Briefing" />
                <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line">{data.incident.briefing}</p>
              </Card>
            )}

            {/* Guest summary */}
            <Card className="p-4">
              <SectionHeader title={`Guests on Floor ${data.incident.floor}`} />
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Total', val: data.guest_summary.total_on_floor, color: 'text-white/70' },
                  { label: 'Confirmed Safe', val: data.guest_summary.confirmed_safe, color: 'text-emerald-400' },
                  { label: 'Needs Help', val: data.guest_summary.needs_help, color: 'text-red-400' },
                  { label: 'No Response', val: data.guest_summary.not_responded, color: 'text-amber-400' },
                  { label: 'Accessibility', val: data.guest_summary.needs_accessibility, color: 'text-blue-400' },
                ].map(s => (
                  <div key={s.label} className="bg-white/[0.03] rounded p-2 border border-white/[0.05]">
                    <p className={cn('text-xl font-mono font-bold', s.color)}>{s.val}</p>
                    <p className="text-[9px] font-mono text-white/25 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {data.guest_summary.rooms_needing_help.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/[0.05]">
                  <p className="text-[9px] font-mono text-red-400/60 uppercase mb-1.5">Rooms Needing Assistance</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.guest_summary.rooms_needing_help.map((r: string) => (
                      <span key={r} className="text-[10px] font-mono bg-red-950/40 text-red-400 border border-red-900/40 rounded px-1.5 py-0.5">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Task summary */}
            <Card className="p-4">
              <SectionHeader
                title="Staff Task Status"
                right={
                  <span className="text-xs font-mono text-white/30">
                    {data.task_summary.completed}/{data.task_summary.total} done
                  </span>
                }
              />
              <ProgressBar
                value={data.task_summary.completed}
                max={data.task_summary.total || 1}
                color="green"
              />
              <div className="flex gap-4 mt-3 text-xs font-mono">
                <span className="text-emerald-400">{data.task_summary.completed} completed</span>
                <span className="text-amber-400">{data.task_summary.in_progress} in progress</span>
                <span className="text-white/30">{data.task_summary.pending} pending</span>
              </div>
            </Card>

            <p className="text-center text-[9px] font-mono text-white/15">
              Auto-refreshes every 30s · NexAlert Responder Portal
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
