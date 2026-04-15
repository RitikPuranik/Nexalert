'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Card, SectionHeader, EmptyState } from '@/components/ui'
import { cn, roleLabel } from '@/lib/utils'
import * as api from '@/lib/api'

const MOCK_STAFF = [
  { id: 'staff-001', name: 'Ravi Kumar', staff_role: 'security', floor_assignment: 4, zone_assignment: 'east_wing', is_on_duty: true },
  { id: 'staff-002', name: 'Priya Singh', staff_role: 'housekeeping', floor_assignment: 4, zone_assignment: 'west_wing', is_on_duty: true },
  { id: 'staff-003', name: 'Amit Sharma', staff_role: 'front_desk', floor_assignment: 1, zone_assignment: 'lobby', is_on_duty: true },
  { id: 'staff-004', name: 'Neha Patel', staff_role: 'maintenance', floor_assignment: null, zone_assignment: null, is_on_duty: false },
]

const ROLE_GROUPS = ['security', 'housekeeping', 'front_desk', 'maintenance', 'management', 'f_and_b', 'medical']

export default function StaffPage() {
  const { token, user, isDemoMode } = useAuth()
  const [onDutyStaff, setOnDutyStaff] = useState<any[]>([])
  const [dutyLoading, setDutyLoading] = useState(false)
  const [isDuty, setIsDuty] = useState(user?.is_on_duty ?? false)

  useEffect(() => {
    if (isDemoMode) { setOnDutyStaff(MOCK_STAFF.filter(s => s.is_on_duty)); return }
    if (!token) return
    const fetch = async () => {
      const res = await api.staff.getOnDuty(token)
      if (res.success) setOnDutyStaff(res.data as any[])
    }
    fetch()
    const t = setInterval(fetch, 10000)
    return () => clearInterval(t)
  }, [token, isDemoMode])

  const toggleDuty = async () => {
    if (isDemoMode) { setIsDuty(v => !v); return }
    if (!token) return
    setDutyLoading(true)
    try {
      const res = await api.staff.setDuty(!isDuty, token)
      if (res.success) setIsDuty(res.data.is_on_duty)
    } finally { setDutyLoading(false) }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-base font-semibold text-white/80">Staff Management</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {user?.role === 'staff' && (
          <Card className="p-4">
            <SectionHeader title="My Duty Status" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80">{user.name}</p>
                <p className="text-xs text-white/35 font-mono mt-0.5">
                  {user.staff_role ? roleLabel(user.staff_role) : 'Staff'}
                  {user.floor_assignment ? ` · Floor ${user.floor_assignment}` : ''}
                  {user.zone_assignment ? ` · ${user.zone_assignment}` : ''}
                </p>
              </div>
              <button onClick={toggleDuty} disabled={dutyLoading}
                className={cn('relative w-12 h-6 rounded-full border transition-all duration-300',
                  isDuty ? 'bg-emerald-500/30 border-emerald-600/50' : 'bg-white/8 border-white/15')}>
                <span className={cn('absolute top-1 w-4 h-4 rounded-full transition-all duration-300',
                  isDuty ? 'left-7 bg-emerald-400' : 'left-1 bg-white/40')} />
              </button>
            </div>
            <p className="text-[10px] font-mono text-white/25 mt-3">
              {isDuty ? '● On duty — receiving task assignments' : '○ Off duty'}
            </p>
          </Card>
        )}

        <Card className="p-4">
          <SectionHeader title="On-Duty Staff" subtitle={`${onDutyStaff.length} active`} />
          {onDutyStaff.length === 0 ? (
            <EmptyState icon="◈" title="No staff on duty" subtitle="Staff toggle duty status via their app" />
          ) : (
            <div className="space-y-2">
              {onDutyStaff.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-xs text-white/50">
                      {s.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-xs text-white/70">{s.name}</p>
                      <p className="text-[10px] font-mono text-white/30">
                        {roleLabel(s.staff_role)}{s.floor_assignment ? ` · F${s.floor_assignment}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[9px] font-mono text-emerald-400">ON DUTY</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <SectionHeader title="Role Distribution" subtitle="Staff by function" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {ROLE_GROUPS.map(role => {
            const count = onDutyStaff.filter((s: any) => s.staff_role === role).length
            return (
              <div key={role} className={cn('rounded-lg border p-3 text-center',
                count > 0 ? 'border-white/10 bg-white/[0.03]' : 'border-white/[0.04]')}>
                <div className={cn('text-xl font-mono font-bold', count > 0 ? 'text-white/80' : 'text-white/15')}>{count}</div>
                <div className="text-[9px] font-mono text-white/25 mt-0.5">{roleLabel(role)}</div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}