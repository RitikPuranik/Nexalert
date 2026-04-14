'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useIncidents, useDeadmanSessions } from '@/hooks'
import { IncidentCard, IncidentRow } from '@/components/IncidentCard'
import { Card, Stat, SectionHeader, LiveDot, Badge, Button, EmptyState } from '@/components/ui'
import { cn, statusLabel, statusColor, incidentTypeIcon, timeAgo } from '@/lib/utils'
import * as api from '@/lib/api'

const INCIDENT_TYPES = ['fire', 'smoke', 'medical', 'security', 'gas_leak', 'flood', 'other']

export default function CommandDashboard() {
  const { user, token } = useAuth()
  const { incidents, isLoading, refetch } = useIncidents()
  const deadmanSessions = useDeadmanSessions()
  const [simulating, setSimulating] = useState(false)
  const [simType, setSimType] = useState('fire')
  const [simFloor, setSimFloor] = useState(4)
  const [simMsg, setSimMsg] = useState<string | null>(null)

  const active = incidents.filter(i => ['detecting','triaging','active','investigating'].includes(i.status))
  const resolved = incidents.filter(i => ['resolved','false_alarm'].includes(i.status))
  const sev1 = incidents.filter(i => i.severity === 1).length
  const escalated = deadmanSessions.filter(s => s.status === 'escalated').length

  const handleSimulate = async () => {
    if (!token) return
    setSimulating(true)
    setSimMsg(null)
    try {
      const res = await api.sensors.event({
        sensor_id: `sim-${Date.now()}`,
        hotel_id: user?.hotel_id ?? 'hotel-001',
        type: simType,
        value: 85,
        threshold: 50,
        floor: simFloor,
        zone: 'east_wing',
      })
      if (res.success) {
        setSimMsg(`✓ Incident triggered — ID: ${res.data.incident_id.slice(0, 8)}...`)
        refetch()
      } else {
        setSimMsg(`⚠ ${res.error} (backend may not be running — demo mode)`)
      }
    } catch {
      setSimMsg('⚠ Backend not reachable — showing mock data')
    } finally {
      setSimulating(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Ticker for active incidents */}
      {active.length > 0 && (
        <div className="overflow-hidden bg-red-950/20 border border-red-900/30 rounded-lg h-9 flex items-center">
          <div className="flex-shrink-0 flex items-center gap-2 px-4 border-r border-red-900/30 h-full">
            <LiveDot color="red" />
            <span className="text-[10px] font-mono font-bold text-red-400">LIVE</span>
          </div>
          <div className="flex-1 overflow-hidden px-4">
            <div className="ticker-inner">
              {[...active, ...active].map((inc, i) => (
                <span key={i} className="text-[10px] font-mono text-red-300/80">
                  {incidentTypeIcon(inc.type)} {inc.type.toUpperCase()} · Floor {inc.floor} · {statusLabel(inc.status)}
                  <span className="ml-8 text-red-900/60">///</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Metric strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Active Incidents', value: active.length, color: active.length > 0 ? 'text-red-400' : 'text-white/60', pulse: active.length > 0 },
          { label: 'Severity 1 (Critical)', value: sev1, color: sev1 > 0 ? 'text-red-400' : 'text-white/40', pulse: sev1 > 0 },
          { label: 'Deadman Escalated', value: escalated, color: escalated > 0 ? 'text-amber-400' : 'text-white/40', pulse: false },
          { label: 'Resolved Today', value: resolved.length, color: 'text-emerald-400', pulse: false },
        ].map(m => (
          <Card key={m.label} className={cn('p-4', m.pulse && 'border-red-900/30')}>
            <div className="flex items-start justify-between">
              <Stat label={m.label} value={m.value} color={m.color} />
              {m.pulse && m.value > 0 && <LiveDot color="red" />}
            </div>
          </Card>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Active incidents — 2 col */}
        <div className="lg:col-span-2 space-y-3">
          <SectionHeader
            title="Active Incidents"
            subtitle={`${active.length} ongoing`}
            right={
              <Button size="sm" variant="ghost" onClick={refetch}>↻ Refresh</Button>
            }
          />
          {isLoading ? (
            <div className="text-xs font-mono text-white/25 animate-pulse py-8 text-center">Loading...</div>
          ) : active.length === 0 ? (
            <Card className="p-6">
              <EmptyState icon="◎" title="No active incidents" subtitle="All clear — monitoring sensors" />
            </Card>
          ) : (
            active.map(inc => <IncidentCard key={inc.id} incident={inc} />)
          )}

          {/* Deadman sessions */}
          {deadmanSessions.length > 0 && (
            <div className="mt-4">
              <SectionHeader title="Dead Man's Switch — Active Sessions" subtitle="Guests who triggered SOS" />
              <div className="space-y-2">
                {deadmanSessions.map(s => (
                  <Card key={s.id} className={cn('p-3', s.status === 'escalated' && 'border-amber-900/40 bg-amber-950/10')}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-mono text-white/70">Room {s.room_number} · Floor {s.floor}</span>
                        {s.is_overdue && <span className="ml-2 text-[9px] font-mono text-red-400 animate-blink">OVERDUE</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {s.status === 'escalated' && <Badge variant="amber">ESCALATED</Badge>}
                        <span className="text-[10px] font-mono text-white/25">
                          {s.seconds_until_overdue !== undefined && s.seconds_until_overdue > 0
                            ? `${s.seconds_until_overdue}s left`
                            : 'Overdue'}
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">

          {/* Sensor simulator */}
          {user?.role === 'manager' && (
            <Card className="p-4">
              <SectionHeader title="Sensor Simulator" subtitle="Trigger test incident" />
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-mono text-white/30 uppercase mb-1.5 block">Incident Type</label>
                  <select
                    value={simType}
                    onChange={e => setSimType(e.target.value)}
                    className="w-full bg-[#0d1117] border border-white/10 rounded px-3 py-2 text-xs font-mono text-white/70 focus:outline-none"
                  >
                    {INCIDENT_TYPES.map(t => (
                      <option key={t} value={t}>{t.replace('_',' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono text-white/30 uppercase mb-1.5 block">Floor</label>
                  <input
                    type="number" min={1} max={20} value={simFloor}
                    onChange={e => setSimFloor(Number(e.target.value))}
                    className="w-full bg-[#0d1117] border border-white/10 rounded px-3 py-2 text-xs font-mono text-white/70 focus:outline-none"
                  />
                </div>
                <Button
                  variant="danger"
                  className="w-full justify-center"
                  onClick={handleSimulate}
                  disabled={simulating}
                >
                  {simulating ? '⟳ Triggering...' : '⚡ Trigger Incident'}
                </Button>
                {simMsg && (
                  <p className={cn(
                    'text-[10px] font-mono px-2 py-1.5 rounded border',
                    simMsg.startsWith('✓')
                      ? 'text-emerald-400 bg-emerald-950/20 border-emerald-900/30'
                      : 'text-amber-400 bg-amber-950/20 border-amber-900/30'
                  )}>{simMsg}</p>
                )}
              </div>
            </Card>
          )}

          {/* Recent history */}
          <Card className="p-4">
            <SectionHeader title="Recent History" subtitle={`${resolved.length} resolved`} />
            {resolved.length === 0 ? (
              <p className="text-[10px] font-mono text-white/25 text-center py-4">No history</p>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {resolved.slice(0, 8).map(inc => (
                  <IncidentRow key={inc.id} incident={inc} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
