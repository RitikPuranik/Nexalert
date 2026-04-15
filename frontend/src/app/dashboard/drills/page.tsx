'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Card, SectionHeader, Button, Badge, EmptyState, ProgressBar, Spinner } from '@/components/ui'
import { cn, formatMs, timeAgo } from '@/lib/utils'
import * as api from '@/lib/api'
import type { IncidentType } from '@/types'

const DRILL_TYPES: IncidentType[] = ['fire', 'smoke', 'medical', 'security', 'flood', 'gas_leak']

const MOCK_DRILLS = [
  { id: 'drill-001', type: 'fire', floor: 3, zone: 'east_wing', status: 'resolved', is_drill: true, detected_at: new Date(Date.now() - 7*24*3600*1000).toISOString(), resolved_at: new Date(Date.now() - 7*24*3600*1000 + 900000).toISOString(), severity: 1, metrics: { tasks_total: 5, tasks_completed: 5, completion_rate: 100, first_response_ms: 42000, duration_ms: 900000 } },
  { id: 'drill-002', type: 'medical', floor: 2, zone: 'west_wing', status: 'resolved', is_drill: true, detected_at: new Date(Date.now() - 14*24*3600*1000).toISOString(), resolved_at: new Date(Date.now() - 14*24*3600*1000 + 600000).toISOString(), severity: 2, metrics: { tasks_total: 4, tasks_completed: 3, completion_rate: 75, first_response_ms: 68000, duration_ms: 600000 } },
]

export default function DrillsPage() {
  const { token, user, isDemoMode } = useAuth()
  const [drills, setDrills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [drillType, setDrillType] = useState<IncidentType>('fire')
  const [drillFloor, setDrillFloor] = useState(3)
  const [msg, setMsg] = useState<string | null>(null)

  const fetchDrills = async () => {
    if (isDemoMode) { setDrills(MOCK_DRILLS); setLoading(false); return }
    if (!token) return
    const res = await api.reports.listDrills(token)
    if (res.success) setDrills(res.data as any[])
    setLoading(false)
  }

  useEffect(() => { fetchDrills() }, [token, isDemoMode])

  const triggerDrill = async () => {
    if (isDemoMode) {
      setMsg(`✓ [DRILL] ${drillType} started on Floor ${drillFloor}. Staff receive tasks. Response times measured. (Demo mode — not sent to backend)`)
      return
    }
    if (!token) return
    setTriggering(true)
    setMsg(null)
    try {
      const res = await api.reports.triggerDrill({ type: drillType, floor: drillFloor, zone: 'east_wing' }, token)
      setMsg(res.success ? `✓ ${res.data.message}` : `⚠ ${res.error}`)
      if (res.success) fetchDrills()
    } finally { setTriggering(false) }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white/80">Emergency Drills</h1>
          <p className="text-xs text-white/30 font-mono mt-0.5">{drills.length} past drills</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {user?.role === 'manager' && (
          <Card className="p-4 border-cyan-900/20">
            <SectionHeader title="Trigger Drill" subtitle="Simulate an emergency scenario" />
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-white/30 uppercase mb-1.5 block">Scenario Type</label>
                <select value={drillType} onChange={e => setDrillType(e.target.value as IncidentType)}
                  className="w-full bg-[#0d1117] border border-white/10 rounded px-3 py-2 text-xs font-mono text-white/70 focus:outline-none">
                  {DRILL_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-mono text-white/30 uppercase mb-1.5 block">Floor</label>
                <input type="number" min={1} max={20} value={drillFloor} onChange={e => setDrillFloor(Number(e.target.value))}
                  className="w-full bg-[#0d1117] border border-white/10 rounded px-3 py-2 text-xs font-mono text-white/70 focus:outline-none" />
              </div>
              <Button variant="default" className="w-full justify-center border-cyan-800/40 text-cyan-400 hover:bg-cyan-950/20"
                onClick={triggerDrill} disabled={triggering}>
                {triggering ? <><Spinner size={12} /> Starting...</> : '◎ Start Drill'}
              </Button>
              {msg && (
                <p className={cn('text-[10px] font-mono px-2 py-1.5 rounded border', msg.startsWith('✓')
                  ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30'
                  : 'text-amber-400 bg-amber-950/20 border-amber-900/30')}>
                  {msg}
                </p>
              )}
              <p className="text-[10px] font-mono text-white/20 leading-relaxed pt-1 border-t border-white/[0.05]">
                Staff receive [DRILL] tasks. Guests get [DRILL] alerts. Response times measured.
              </p>
            </div>
          </Card>
        )}

        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <div className="text-xs font-mono text-white/25 animate-pulse text-center py-12">Loading...</div>
          ) : drills.length === 0 ? (
            <Card className="p-8"><EmptyState icon="◎" title="No drills recorded" subtitle="Trigger your first drill" /></Card>
          ) : (
            drills.map((drill: any) => (
              <Card key={drill.id} className="p-4 border-cyan-900/15">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="cyan">DRILL</Badge>
                      <span className="text-sm font-medium text-white/80 capitalize">{drill.type.replace('_', ' ')} — Floor {drill.floor}</span>
                    </div>
                    <p className="text-xs font-mono text-white/30 mt-1">{timeAgo(drill.detected_at)}</p>
                  </div>
                  <span className={cn('text-xs font-mono', drill.status === 'resolved' ? 'text-emerald-400' : 'text-amber-400')}>{drill.status}</span>
                </div>
                {drill.metrics && (
                  <div className="mt-3 grid grid-cols-3 gap-3 pt-3 border-t border-white/[0.05]">
                    <div>
                      <p className="text-[9px] font-mono text-white/25 uppercase">First Response</p>
                      <p className="text-sm font-mono font-bold text-white/70 mt-0.5">{formatMs(drill.metrics.first_response_ms)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-mono text-white/25 uppercase">Task Completion</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <ProgressBar value={drill.metrics.completion_rate} max={100} color="blue" />
                        <span className="text-xs font-mono text-blue-400">{drill.metrics.completion_rate}%</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] font-mono text-white/25 uppercase">Duration</p>
                      <p className="text-sm font-mono font-bold text-white/70 mt-0.5">{formatMs(drill.metrics.duration_ms)}</p>
                    </div>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}