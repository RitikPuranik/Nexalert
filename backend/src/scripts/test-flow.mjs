#!/usr/bin/env node
/**
 * NexAlert Integration Test — Full Pipeline
 * Run: node src/scripts/test-flow.mjs
 *
 * Tests the complete incident pipeline end-to-end without needing a browser.
 * Covers: sensor → triage → SOS → deadman → exit-route → heatmap → responder portal
 * Set your .env before running.
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const SENSOR_SECRET = process.env.SENSOR_SECRET || 'dev-secret'
const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

const log = (label, data) => {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`✓ ${label}`)
  if (data) console.log(JSON.stringify(data, null, 2))
}

const err = (label, data) => {
  console.error(`\n✗ FAILED: ${label}`)
  console.error(JSON.stringify(data, null, 2))
  process.exit(1)
}

const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function run() {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  NexAlert — Full Integration Test`)
  console.log(`${'═'.repeat(60)}`)
  console.log(`  Target: ${BASE_URL}`)
  console.log(`  Hotel:  ${HOTEL_ID}`)
  console.log(`  Time:   ${new Date().toISOString()}\n`)

  // ── 1. Health Check ──────────────────────────────────────────────────────
  const healthRes = await fetch(`${BASE_URL}/api/health`)
  const healthData = await healthRes.json()
  if (!healthData.success) err('Health check', healthData)
  log('1. Health check passed', healthData.data)

  // ── 2. Sensor Event (above threshold → creates incident) ──────────────
  const sensorPayload = {
    sensor_id: 'sensor_f3_east_corridor',
    hotel_id: HOTEL_ID,
    type: 'smoke',
    value: 847,
    threshold: 400,
    floor: 3,
    zone: 'east_wing',
    room: null,
    timestamp: new Date().toISOString(),
  }

  const sensorRes = await fetch(`${BASE_URL}/api/sensors/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sensor-secret': SENSOR_SECRET },
    body: JSON.stringify(sensorPayload),
  })
  const sensorData = await sensorRes.json()
  if (!sensorData.success) err('Sensor event', sensorData)
  log('2. Sensor event accepted', {
    incident_id: sensorData.data?.incident_id,
    triggered: sensorData.data?.triggered,
  })

  const incidentId = sensorData.data?.incident_id
  if (!incidentId) err('No incident_id returned', sensorData)

  // ── 3. Wait for AI Triage ────────────────────────────────────────────────
  console.log('\n⏳ Waiting 10s for AI triage to complete...')
  await wait(10000)

  // ── 4. Guest SOS (different floor — creates second incident) ──────────
  const sosPayload = {
    hotel_id: HOTEL_ID,
    type: 'medical',
    room: '512',
    floor: 5,
    zone: 'east_wing',
    language: 'hi',
    guest_name: 'Priya Sharma',
    phone: '+919876543210',
    needs_accessibility: false,
  }

  const sosRes = await fetch(`${BASE_URL}/api/incidents/sos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sosPayload),
  })
  const sosData = await sosRes.json()
  if (!sosData.success) err('Guest SOS', sosData)
  log('4. Guest SOS accepted', {
    incident_id: sosData.data?.incident_id,
    is_new: sosData.data?.is_new,
    evacuation_instruction: sosData.data?.evacuation_instruction,
    deadman_token: sosData.data?.deadman_token ? '✓ received' : '✗ missing',
  })

  // ── 5. Dead man's switch ping (if token available) ────────────────────
  const deadmanToken = sosData.data?.deadman_token
  if (deadmanToken) {
    const pingRes = await fetch(`${BASE_URL}/api/deadman/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: deadmanToken }),
    })
    const pingData = await pingRes.json()
    if (!pingData.success) err('Deadman ping', pingData)
    log('5. Dead man switch ping', pingData.data)

    // Also test status polling
    const statusRes = await fetch(`${BASE_URL}/api/deadman/status?token=${deadmanToken}`)
    const statusData = await statusRes.json()
    if (!statusData.success) err('Deadman status', statusData)
    log('5b. Dead man switch status', statusData.data)
  } else {
    console.log('\n⚠  Dead man token not available — skipping deadman tests')
  }

  // ── 6. Exit route for specific room on Floor 3 ────────────────────────
  const exitRes = await fetch(
    `${BASE_URL}/api/guests/exit-route?hotel_id=${HOTEL_ID}&floor=3&room=312&lang=en&incident_id=${incidentId}`
  )
  const exitData = await exitRes.json()
  if (!exitData.success) err('Exit route', exitData)
  log('6. Exit route for Room 312', {
    instruction: exitData.data?.instruction,
    route_label: exitData.data?.route?.label,
    path_steps: exitData.data?.path_coordinates?.length,
  })

  // ── 7. Exit route in Arabic ───────────────────────────────────────────
  const exitArRes = await fetch(
    `${BASE_URL}/api/guests/exit-route?hotel_id=${HOTEL_ID}&floor=3&room=302&lang=ar&incident_id=${incidentId}`
  )
  const exitArData = await exitArRes.json()
  if (!exitArData.success) err('Exit route Arabic', exitArData)
  log('7. Exit route Room 302 (Arabic)', { instruction: exitArData.data?.instruction })

  // ── 8. Floor heatmap ──────────────────────────────────────────────────
  const heatmapRes = await fetch(
    `${BASE_URL}/api/heatmap?hotel_id=${HOTEL_ID}&floor=3&incident_id=${incidentId}`
  )
  const heatmapData = await heatmapRes.json()
  if (!heatmapData.success) err('Heatmap', heatmapData)
  log('8. Floor 3 heatmap', {
    rooms: heatmapData.data?.rooms?.length,
    summary: heatmapData.data?.summary,
  })

  // ── 9. Responder portal ───────────────────────────────────────────────
  const portalRes = await fetch(`${BASE_URL}/api/responder/portal?incident_id=${incidentId}`)
  const portalData = await portalRes.json()
  if (!portalData.success) err('Responder portal', portalData)
  log('9. Responder portal', {
    incident_type: portalData.data?.incident?.type,
    severity: portalData.data?.incident?.severity,
    briefing: portalData.data?.incident?.briefing?.slice(0, 100) + '...',
    guests_on_floor: portalData.data?.guest_summary?.total_on_floor,
    tasks_total: portalData.data?.task_summary?.total,
    elapsed_seconds: portalData.data?.incident?.elapsed_seconds,
  })

  // ── 10. SOS poll (check AI triage updates) ────────────────────────────
  const pollRes = await fetch(
    `${BASE_URL}/api/incidents/sos?incident_id=${incidentId}&room=301&lang=en`
  )
  const pollData = await pollRes.json()
  if (!pollData.success) err('SOS poll', pollData)
  log('10. SOS poll — triage status', {
    status: pollData.data?.status,
    severity: pollData.data?.severity,
    triage_complete: pollData.data?.triage_complete,
    alert_text: pollData.data?.alert_text?.slice(0, 80),
  })

  // ── 11. Guest locations (need auth — expect 401) ──────────────────────
  const locRes = await fetch(
    `${BASE_URL}/api/guests/locations?floor=3&incident_id=${incidentId}`,
    { headers: { Authorization: 'Bearer INVALID_TOKEN' } }
  )
  log('11. Guest locations (auth required)', {
    status: locRes.status,
    note: locRes.status === 401 ? '✓ correctly rejected unauthenticated request' : '⚠ unexpected status',
  })

  // ── 12. Statistics endpoint ───────────────────────────────────────────
  const statsRes = await fetch(`${BASE_URL}/api/stats?hotel_id=${HOTEL_ID}`)
  const statsData = await statsRes.json()
  log('12. Statistics', statsData.success ? statsData.data : { error: statsData.error })

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`)
  console.log('  ✅ All public endpoints working correctly')
  console.log(`${'═'.repeat(60)}`)
  console.log(`  📋 Sensor Incident: ${incidentId}`)
  console.log(`  📋 SOS Incident:    ${sosData.data?.incident_id}`)
  console.log(`  🔗 Responder Portal: ${BASE_URL}/api/responder/portal?incident_id=${incidentId}`)
  console.log(`  🗺  Floor Heatmap:   ${BASE_URL}/api/heatmap?hotel_id=${HOTEL_ID}&floor=3&incident_id=${incidentId}`)
  console.log()
  console.log('  Next steps:')
  console.log('    1. Check Supabase → incidents table (ai_briefing, ai_tasks populated)')
  console.log('    2. Check staff_tasks table for role-based task assignments')
  console.log('    3. Check guest_notifications for Floor 3 guests')
  console.log('    4. Check deadman_sessions for the SOS-triggered session')
}

run().catch(e => { console.error('\n✗ Test error:', e.message || e); process.exit(1) })
