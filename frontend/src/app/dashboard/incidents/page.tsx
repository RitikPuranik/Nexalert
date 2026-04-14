'use client'

import { useState } from 'react'
import { useIncidents } from '@/hooks'
import { IncidentCard } from '@/components/IncidentCard'
import { Card, SectionHeader, Button, EmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { IncidentStatus } from '@/types'

const STATUS_FILTERS: { label: string; value: IncidentStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Detecting', value: 'detecting' },
  { label: 'Triaging', value: 'triaging' },
  { label: 'Active', value: 'active' },
  { label: 'Investigating', value: 'investigating' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'False Alarm', value: 'false_alarm' },
]

export default function IncidentsPage() {
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'all'>('all')
  const { incidents, isLoading, refetch } = useIncidents(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  )

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white/80">Incidents</h1>
          <p className="text-xs text-white/30 mt-0.5 font-mono">{incidents.length} records</p>
        </div>
        <Button size="sm" variant="ghost" onClick={refetch}>↻ Refresh</Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              'px-3 py-1 rounded-full text-[10px] font-mono border transition-all duration-150',
              statusFilter === f.value
                ? 'bg-white/10 border-white/20 text-white/80'
                : 'bg-transparent border-white/[0.07] text-white/30 hover:border-white/15 hover:text-white/50'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-xs font-mono text-white/25 animate-pulse text-center py-12">Loading incidents...</div>
      ) : incidents.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon="◎" title="No incidents found" subtitle="Adjust filter or wait for new events" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {incidents.map(inc => <IncidentCard key={inc.id} incident={inc} />)}
        </div>
      )}
    </div>
  )
}
