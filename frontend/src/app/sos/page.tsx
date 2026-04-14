'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { DeadmanWidget } from '@/components/DeadmanWidget'
import * as api from '@/lib/api'
import type { SOSResponse, TriageStatusResponse } from '@/types'

const INCIDENT_TYPES = [
  { value: 'fire', label: '🔥 Fire', color: 'border-orange-700/60 bg-orange-950/30 text-orange-300' },
  { value: 'smoke', label: '💨 Smoke', color: 'border-slate-600/50 bg-slate-900/40 text-slate-300' },
  { value: 'medical', label: '🚑 Medical Emergency', color: 'border-blue-700/60 bg-blue-950/30 text-blue-300' },
  { value: 'security', label: '🚨 Security Threat', color: 'border-red-700/60 bg-red-950/30 text-red-300' },
  { value: 'flood', label: '🌊 Flood / Water', color: 'border-cyan-700/60 bg-cyan-950/30 text-cyan-300' },
  { value: 'gas_leak', label: '⚠️ Gas Leak', color: 'border-amber-700/60 bg-amber-950/30 text-amber-300' },
  { value: 'other', label: '⚠️ Other Emergency', color: 'border-white/20 bg-white/5 text-white/60' },
]

type Phase = 'form' | 'submitting' | 'submitted' | 'polling' | 'active'

export default function SOSPage() {
  const [phase, setPhase] = useState<Phase>('form')
  const [type, setType] = useState('')
  const [room, setRoom] = useState('')
  const [floor, setFloor] = useState('')
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('en')
  const [accessibility, setAccessibility] = useState(false)
  const [sosData, setSosData] = useState<SOSResponse | null>(null)
  const [triageData, setTriageData] = useState<TriageStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Demo hotel ID
  const HOTEL_ID = 'hotel-001'

  const handleSubmit = useCallback(async () => {
    if (!type || !room || !floor) return
    setPhase('submitting')
    setError(null)
    try {
      const res = await api.sos.submit({
        hotel_id: HOTEL_ID,
        type, room, floor: parseInt(floor),
        guest_name: name || 'Guest',
        language, needs_accessibility: accessibility,
      })
      if (res.success) {
        setSosData(res.data)
        setPhase(res.data.severity ? 'active' : 'polling')
      } else {
        setError(res.error)
        setPhase('form')
      }
    } catch {
      // Demo: simulate a successful SOS
      setSosData({
        incident_id: 'demo-' + Date.now(),
        is_new: true,
        severity: null,
        alert_text: 'Your report has been received. Help is on the way.',
        evacuation_instruction: 'Leave your room immediately via the nearest fire exit. Do not use elevators. Proceed to the car park assembly point.',
        exit_route: {
          label: 'East Stairwell Exit',
          estimated_seconds: 90,
          path_coordinates: [],
          muster_point: { id: 'mp1', label: 'Car Park B1', location_description: 'Car park Level B1', x: 0, y: 0 },
          is_accessible: true,
        },
        deadman_token: 'demo-token-' + Date.now(),
      })
      setPhase('polling')
    }
  }, [type, room, floor, name, language, accessibility])

  // Poll for triage completion
  useEffect(() => {
    if (phase !== 'polling' || !sosData) return
    const poll = async () => {
      try {
        const res = await api.sos.poll(sosData.incident_id, room, language)
        if (res.success && res.data.triage_complete) {
          setTriageData(res.data)
          setPhase('active')
        }
      } catch { /* demo mode */ }
    }
    poll()
    const t = setInterval(poll, 5000)
    return () => clearInterval(t)
  }, [phase, sosData, room, language])

  const alertText = triageData?.alert_text ?? sosData?.alert_text
  const evacuationText = triageData?.evacuation_instruction ?? sosData?.evacuation_instruction
  const severity = triageData?.severity ?? sosData?.severity

  return (
    <div className="min-h-screen bg-[#080c10] flex flex-col items-center justify-start py-6 px-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <span className="text-red-400 font-mono font-bold text-sm">N</span>
          </div>
          <div>
            <h1 className="text-sm font-mono font-bold text-white/80 tracking-wider">NexAlert</h1>
            <p className="text-[10px] font-mono text-white/30">Emergency SOS</p>
          </div>
        </div>

        {/* FORM PHASE */}
        {phase === 'form' && (
          <div className="space-y-4 animate-slide-up">
            <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4">
              <p className="text-red-300 text-sm font-semibold">⚠ Emergency Report</p>
              <p className="text-red-300/60 text-xs mt-1">Select emergency type and your location. Help will be dispatched immediately.</p>
            </div>

            {/* Type selection */}
            <div>
              <p className="text-[10px] font-mono text-white/30 uppercase mb-2">Emergency Type</p>
              <div className="grid grid-cols-2 gap-2">
                {INCIDENT_TYPES.map(t => (
                  <button key={t.value} onClick={() => setType(t.value)}
                    className={cn(
                      'py-3 px-3 rounded-lg border text-xs font-medium transition-all text-left',
                      type === t.value ? t.color : 'border-white/[0.07] bg-white/[0.02] text-white/40 hover:text-white/60'
                    )}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Room + floor */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono text-white/30 uppercase mb-1.5 block">Room No.</label>
                <input value={room} onChange={e => setRoom(e.target.value)} placeholder="e.g. 412"
                  className="w-full bg-[#111820] border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25" />
              </div>
              <div>
                <label className="text-[10px] font-mono text-white/30 uppercase mb-1.5 block">Floor</label>
                <input value={floor} onChange={e => setFloor(e.target.value)} placeholder="e.g. 4" type="number"
                  className="w-full bg-[#111820] border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25" />
              </div>
            </div>

            {/* Name + options */}
            <div>
              <label className="text-[10px] font-mono text-white/30 uppercase mb-1.5 block">Your Name (optional)</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Guest name"
                className="w-full bg-[#111820] border border-white/10 rounded-lg px-3 py-2.5 text-sm font-mono text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/25" />
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => setAccessibility(!accessibility)}
                className={cn('w-5 h-5 rounded border transition-all flex-shrink-0',
                  accessibility ? 'bg-blue-500/30 border-blue-500/60' : 'bg-white/5 border-white/15')}>
                {accessibility && <span className="text-blue-400 text-xs flex items-center justify-center w-full h-full">✓</span>}
              </button>
              <span className="text-xs text-white/50">I need mobility / accessibility assistance</span>
            </div>

            {error && <p className="text-xs font-mono text-red-400 bg-red-950/20 border border-red-900/30 rounded px-3 py-2">{error}</p>}

            <button onClick={handleSubmit} disabled={!type || !room || !floor}
              className="w-full py-4 rounded-xl font-bold text-base bg-red-600/25 hover:bg-red-600/35 border border-red-600/50 text-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[.98]">
              🚨 SEND SOS — GET HELP NOW
            </button>

            <p className="text-center text-[10px] font-mono text-white/20">
              This will immediately alert hotel staff and dispatch help to your location.
            </p>
          </div>
        )}

        {/* SUBMITTING */}
        {phase === 'submitting' && (
          <div className="flex flex-col items-center py-16 gap-4 animate-fade-in">
            <div className="w-16 h-16 rounded-full border-2 border-red-500/30 border-t-red-500 animate-spin" />
            <p className="text-sm font-mono text-white/60">Sending emergency alert...</p>
          </div>
        )}

        {/* POLLING / ACTIVE */}
        {(phase === 'polling' || phase === 'active') && sosData && (
          <div className="space-y-4 animate-slide-up">

            {/* Main alert */}
            <div className={cn(
              'rounded-xl border p-4',
              severity === 1 ? 'bg-red-950/30 border-red-800/50' :
              severity === 2 ? 'bg-amber-950/30 border-amber-800/40' :
              'bg-emerald-950/20 border-emerald-900/30'
            )}>
              {phase === 'polling' && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full border-2 border-violet-400/50 border-t-violet-400 animate-spin" />
                  <span className="text-[10px] font-mono text-violet-400">AI triage in progress...</span>
                </div>
              )}
              <p className={cn('text-sm font-semibold',
                severity === 1 ? 'text-red-300' :
                severity === 2 ? 'text-amber-300' : 'text-emerald-300'
              )}>
                {alertText}
              </p>
            </div>

            {/* Evacuation instruction */}
            {evacuationText && (
              <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
                <p className="text-[10px] font-mono text-white/30 uppercase mb-2">Evacuation Instructions</p>
                <p className="text-sm text-white/80 leading-relaxed">{evacuationText}</p>
              </div>
            )}

            {/* Exit route */}
            {sosData.exit_route && (
              <div className="bg-[#111820] border border-white/[0.07] rounded-xl p-4">
                <p className="text-[10px] font-mono text-white/30 uppercase mb-2">Nearest Exit Route</p>
                <p className="text-sm font-semibold text-white/80">{sosData.exit_route.label}</p>
                <div className="flex items-center gap-4 mt-2 text-xs font-mono text-white/40">
                  <span>~{Math.round(sosData.exit_route.estimated_seconds / 60)}min walk</span>
                  {sosData.exit_route.is_accessible && <span className="text-blue-400/60">♿ Accessible</span>}
                </div>
              </div>
            )}

            {/* Dead man's switch */}
            {sosData.deadman_token && (
              <div className="bg-[#111820] border border-white/10 rounded-xl p-4">
                <p className="text-[10px] font-mono text-white/30 uppercase mb-3">Safety Check-In</p>
                <DeadmanWidget sessionToken={sosData.deadman_token} intervalSeconds={120} />
              </div>
            )}

            <p className="text-center text-[10px] font-mono text-white/25">
              Keep this page open. Staff have been alerted to your location.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
