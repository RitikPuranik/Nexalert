'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, SectionHeader, Badge } from '@/components/ui'
import type { FloorHeatmapResult, RoomHeatmapEntry } from '@/types'

const ROOM_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  green:  { bg: 'bg-emerald-950/70', border: 'border-emerald-700/60', text: 'text-emerald-400' },
  red:    { bg: 'bg-red-950/80',     border: 'border-red-700/60',     text: 'text-red-400'     },
  amber:  { bg: 'bg-amber-950/70',   border: 'border-amber-700/50',   text: 'text-amber-400'   },
  gray:   { bg: 'bg-white/[0.03]',   border: 'border-white/[0.06]',   text: 'text-white/25'    },
}

function RoomCell({ room, onSelect }: { room: RoomHeatmapEntry; onSelect: (r: RoomHeatmapEntry) => void }) {
  const c = ROOM_COLORS[room.colour]
  return (
    <button
      onClick={() => onSelect(room)}
      className={cn(
        'relative flex flex-col items-center justify-center rounded p-1.5 border transition-all duration-200',
        'hover:scale-105 hover:z-10 cursor-pointer min-w-[52px] h-[48px]',
        c.bg, c.border,
        room.status === 'needs_help' && 'animate-pulse',
        room.needs_accessibility && 'ring-1 ring-blue-500/40'
      )}
    >
      <span className={cn('text-[9px] font-mono font-bold', c.text)}>
        {room.room_number}
      </span>
      {room.guest_name && (
        <span className="text-[7px] text-white/25 truncate w-full text-center leading-tight mt-0.5">
          {room.guest_name.split(' ')[0]}
        </span>
      )}
      {room.needs_accessibility && (
        <span className="absolute top-0.5 right-0.5 text-[7px] text-blue-400">♿</span>
      )}
      {room.status === 'needs_help' && (
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
      )}
    </button>
  )
}

function RoomDetail({ room, onClose }: { room: RoomHeatmapEntry; onClose: () => void }) {
  const statusLabels: Record<string, string> = {
    safe: 'Confirmed Safe', needs_help: 'Needs Help!',
    no_response: 'No Response', unreachable: 'Unreachable', empty: 'Empty',
  }
  return (
    <div className="bg-[#0d1117] border border-white/10 rounded-lg p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white/80 font-mono">Room {room.room_number}</span>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xs">✕</button>
      </div>
      <div className="space-y-2 text-xs">
        <Row label="Status" value={statusLabels[room.status] ?? room.status} />
        {room.guest_name && <Row label="Guest" value={room.guest_name} />}
        {room.language && <Row label="Language" value={room.language.toUpperCase()} />}
        <Row label="Floor" value={String(room.floor)} />
        <Row label="Zone" value={room.zone} />
        {room.needs_accessibility && <Row label="Access" value="Mobility assistance needed" color="text-blue-400" />}
        {room.seconds_waiting !== null && (
          <Row label="Waiting" value={`${Math.round(room.seconds_waiting / 60)}m`} color="text-amber-400" />
        )}
        {room.notification_sent_at && (
          <Row label="Notified" value={new Date(room.notification_sent_at).toLocaleTimeString()} />
        )}
      </div>
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-white/30 font-mono">{label}</span>
      <span className={cn('font-medium text-right', color ?? 'text-white/70')}>{value}</span>
    </div>
  )
}

export function FloorHeatmap({ data }: { data: FloorHeatmapResult | null }) {
  const [selected, setSelected] = useState<RoomHeatmapEntry | null>(null)

  if (!data) {
    return (
      <Card className="p-6">
        <div className="text-center text-white/25 text-xs font-mono py-8">
          SELECT INCIDENT TO VIEW FLOOR MAP
        </div>
      </Card>
    )
  }

  const { rooms, summary } = data

  return (
    <Card className="p-4">
      <SectionHeader
        title={`Floor ${data.floor} — Room Status`}
        subtitle={`Computed ${new Date(data.computed_at).toLocaleTimeString()}`}
        right={
          <span className="text-[10px] font-mono text-white/25">
            {rooms.length} rooms
          </span>
        }
      />

      {/* Summary row */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        {[
          { label: 'Safe', val: summary.safe, color: 'text-emerald-400 border-emerald-900/40 bg-emerald-950/30' },
          { label: 'Help', val: summary.needs_help, color: 'text-red-400 border-red-900/40 bg-red-950/30' },
          { label: 'No Resp.', val: summary.no_response, color: 'text-amber-400 border-amber-900/40 bg-amber-950/30' },
          { label: 'Unreach.', val: summary.unreachable, color: 'text-red-400/60 border-red-900/30 bg-red-950/20' },
          { label: 'Empty', val: summary.empty, color: 'text-white/25 border-white/10 bg-white/[0.03]' },
        ].map(s => (
          <div key={s.label} className={cn('rounded border px-2 py-1.5 text-center', s.color)}>
            <div className="text-lg font-mono font-bold">{s.val}</div>
            <div className="text-[9px] font-mono opacity-70">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Room grid */}
      <div className="flex flex-wrap gap-1.5">
        {rooms.map(room => (
          <RoomCell key={room.room_number} room={room} onSelect={setSelected} />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/[0.05]">
        {[
          { color: 'bg-emerald-500', label: 'Safe' },
          { color: 'bg-red-500', label: 'Needs help' },
          { color: 'bg-amber-400', label: 'No response' },
          { color: 'bg-white/20', label: 'Empty' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={cn('w-2 h-2 rounded-sm', l.color)} />
            <span className="text-[10px] text-white/30 font-mono">{l.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-sm border border-blue-500/60 bg-transparent" />
          <span className="text-[10px] text-white/30 font-mono">Accessibility</span>
        </div>
      </div>

      {/* Room detail panel */}
      {selected && (
        <div className="mt-3">
          <RoomDetail room={selected} onClose={() => setSelected(null)} />
        </div>
      )}
    </Card>
  )
}
