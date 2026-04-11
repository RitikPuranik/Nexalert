#!/usr/bin/env node
/**
 * NexAlert Integration Test
 * Run: node src/scripts/test-flow.mjs
 *
 * Tests the complete incident pipeline end-to-end without needing a browser.
 * Set your .env.local before running.
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const SENSOR_SECRET = process.env.SENSOR_SECRET || 'dev-secret'
const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

const log = (label, data) => {
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`✓ ${label}`)
  if (data) console.log(JSON.stringify(data, null, 2))
}

const err = (label, data) => {
  console.error(`\n✗ FAILED: ${label}`)
  console.error(JSON.stringify(data, null, 2))
  process.exit(1)
}

async function run() {
  console.log(`\nNexAlert Integration Test`)
  console.log(`Target: ${BASE_URL}`)
  console.log(`Hotel:  ${HOTEL_ID}`)

  // ── Test 1: Sensor Event ──────────────────────────────────────────────────
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

  const sensorRes = await fetch(`${BASE_URL}/api/sensor-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sensor-secret': SENSOR_SECRET },
    body: JSON.stringify(sensorPayload),
  })

  const sensorData = await sensorRes.json()
  if (!sensorData.success) err('Sensor event', sensorData)
  log('Sensor event accepted', { incident_id: sensorData.data?.incident_id })

  const incidentId = sensorData.data?.incident_id
  if (!incidentId) err('No incident_id returned', sensorData)

  // ── Test 2: Wait for AI triage ────────────────────────────────────────────
  console.log('\n⏳ Waiting 8s for AI triage...')
  await new Promise(r => setTimeout(r, 8000))

  // ── Test 3: Guest SOS (different floor, same hotel) ───────────────────────
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
  log('Guest SOS accepted', {
    incident_id: sosData.data?.incident_id,
    evacuation_instruction: sosData.data?.evacuation_instruction,
  })

  // ── Test 4: Exit route for specific room ──────────────────────────────────
  const exitRes = await fetch(
    `${BASE_URL}/api/exit-routes?hotel_id=${HOTEL_ID}&floor=3&room=312&lang=en&incident_id=${incidentId}`
  )
  const exitData = await exitRes.json()
  if (!exitData.success) err('Exit route', exitData)
  log('Exit route for Room 312', {
    instruction: exitData.data?.instruction,
    route_label: exitData.data?.route?.label,
    path_steps: exitData.data?.path_coordinates?.length,
  })

  // ── Test 5: Exit route in Arabic ─────────────────────────────────────────
  const exitArRes = await fetch(
    `${BASE_URL}/api/exit-routes?hotel_id=${HOTEL_ID}&floor=3&room=302&lang=ar&incident_id=${incidentId}`
  )
  const exitArData = await exitArRes.json()
  if (!exitArData.success) err('Exit route Arabic', exitArData)
  log('Exit route Room 302 (Arabic)', { instruction: exitArData.data?.instruction })

  // ── Test 6: Responder portal (public, no auth) ────────────────────────────
  const portalRes = await fetch(`${BASE_URL}/api/responder-portal?incident_id=${incidentId}`)
  const portalData = await portalRes.json()
  if (!portalData.success) err('Responder portal', portalData)
  log('Responder portal', {
    incident_type: portalData.data?.incident?.type,
    severity: portalData.data?.incident?.severity,
    briefing: portalData.data?.incident?.briefing?.slice(0, 100) + '...',
    guests_on_floor: portalData.data?.guest_summary?.total_on_floor,
    tasks_total: portalData.data?.task_summary?.total,
  })

  // ── Test 7: Guest locations (would need auth in production) ───────────────
  const locRes = await fetch(
    `${BASE_URL}/api/locations?floor=3&incident_id=${incidentId}`,
    { headers: { Authorization: 'Bearer MANAGER_TOKEN_HERE' } }
  )
  // This will fail without a real token — that's expected
  log('Guest locations endpoint reachable (auth required)', {
    status: locRes.status,
    note: '401 expected without valid manager token',
  })

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(50))
  console.log('✅ All public endpoints working correctly')
  console.log('📋 Incident ID:', incidentId)
  console.log(`🔗 Responder portal: ${BASE_URL}/api/responder-portal?incident_id=${incidentId}`)
  console.log('\nNext steps:')
  console.log('  1. Check Supabase dashboard → Table Editor → incidents')
  console.log('  2. Verify ai_briefing and ai_tasks are populated')
  console.log('  3. Check staff_tasks table for role-based tasks')
  console.log('  4. Check guest_notifications for 12 Floor 3 guests')
}

run().catch(e => { console.error('Test error:', e); process.exit(1) })
