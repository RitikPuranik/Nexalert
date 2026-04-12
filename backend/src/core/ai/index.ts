import { GoogleGenAI } from '@google/genai'

let _client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (!_client) _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  return _client
}

export type IncidentType =
  | 'fire' | 'smoke' | 'medical' | 'security'
  | 'gas_leak' | 'power_outage' | 'flood' | 'other'

export type IncidentSeverity = 1 | 2 | 3

export interface TriageInput {
  incidentId: string
  type: IncidentType
  floor: number
  zone: string
  room: string | null
  source: string
  isDrill: boolean
  sensorValue?: number
  sensorThreshold?: number
  sensorType?: string
  reporterDescription?: string
  guestsOnFloor: { room: string; name: string; language: string; needsAccessibility: boolean }[]
  guestLanguages: string[]
  hotelName: string
  totalFloors: number
  accessCodes: Record<string, string>
  floorExits: { id: string; label: string; type: string; accessible: boolean }[]
  musterPoints: { id: string; label: string; location_description: string }[]
}

export interface TriageOutput {
  severity: IncidentSeverity
  severity_reason: string
  briefing: string
  responder_briefing: string
  recommend_911: boolean
  recommend_911_reason: string | null
  tasks: {
    role: string
    text: string
    priority: number
    protocol_id: string | null
  }[]
  guest_alert_en: string
  guest_alert_translations: Record<string, string>
  evacuation_instruction_template: string
}

const STAFF_ROLES = ['security','housekeeping','front_desk','maintenance','management','f_and_b','medical']

function buildTriagePrompt(input: TriageInput): string {
  const guestList = input.guestsOnFloor.map(g =>
    `  Room ${g.room}: ${g.name} (lang: ${g.language}${g.needsAccessibility ? ', accessibility' : ''})`
  ).join('\n')

  const exitList = input.floorExits.map(e =>
    `  ${e.id}: "${e.label}" (${e.type}, accessible: ${e.accessible})`
  ).join('\n')

  const musterList = input.musterPoints.map(m =>
    `  ${m.id}: ${m.label} — ${m.location_description}`
  ).join('\n')

  const langs = [...new Set(input.guestLanguages)].join(', ') || 'en'

  return `
INCIDENT — ${input.hotelName}
Type: ${input.type} | Floor: ${input.floor}/${input.totalFloors} | Zone: ${input.zone} | Room: ${input.room ?? 'corridor'}
Source: ${input.source} | Drill: ${input.isDrill}
${input.sensorValue !== undefined ? `Sensor: ${input.sensorType} reading ${input.sensorValue} (threshold ${input.sensorThreshold})` : ''}
${input.reporterDescription ? `Note: "${input.reporterDescription}"` : ''}

GUESTS ON FLOOR (${input.guestsOnFloor.length}):
${guestList || '  None registered'}
LANGUAGES: ${langs}

EXITS:
${exitList || '  None mapped'}

MUSTER POINTS:
${musterList || '  Car park Level B1'}

ACCESS CODES: ${JSON.stringify(input.accessCodes)}

Return ONLY valid JSON, no markdown:
{
  "severity": <1|2|3>,
  "severity_reason": "<one sentence>",
  "briefing": "<2-3 sentence manager summary>",
  "responder_briefing": "<structured briefing for fire dept / ambulance>",
  "recommend_911": <true|false>,
  "recommend_911_reason": "<reason or null>",
  "tasks": [{ "role": "<${STAFF_ROLES.join('|')}>", "text": "<specific task>", "priority": <1-10>, "protocol_id": null }],
  "guest_alert_en": "<calm clear English alert>",
  "guest_alert_translations": { "<lang>": "<translation>" },
  "evacuation_instruction_template": "<uses {{room}}, {{exit_label}}, {{muster_point}}>"
}
Severity: 1=evacuate now, 2=investigate urgently, 3=monitor.
Cover ALL languages: ${langs}.
${input.isDrill ? 'Prefix ALL guest alerts with [DRILL].' : ''}
`
}

export async function runTriage(input: TriageInput): Promise<TriageOutput> {
  const prompt = buildTriagePrompt(input)

  try {
    const response = await getClient().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: 'You are NexAlert AI crisis coordinator. Respond with valid JSON only. Be calm, precise, actionable.',
        maxOutputTokens: 2000,
      },
    })

    const text = response.text ?? ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return validateTriageOutput(parsed)
  } catch {
    return fallbackTriage(input)
  }
}

function validateTriageOutput(p: Record<string, unknown>): TriageOutput {
  const severity = ([1,2,3].includes(Number(p.severity)) ? Number(p.severity) : 2) as IncidentSeverity
  return {
    severity,
    severity_reason: String(p.severity_reason ?? 'AI assessed'),
    briefing: String(p.briefing ?? 'Incident under assessment.'),
    responder_briefing: String(p.responder_briefing ?? 'Incident reported.'),
    recommend_911: Boolean(p.recommend_911),
    recommend_911_reason: p.recommend_911_reason ? String(p.recommend_911_reason) : null,
    tasks: Array.isArray(p.tasks) ? p.tasks.map(t => {
      const task = t as Record<string, unknown>
      return {
        role: STAFF_ROLES.includes(task.role as string) ? String(task.role) : 'security',
        text: String(task.text ?? 'Respond to incident'),
        priority: Number(task.priority ?? 5),
        protocol_id: task.protocol_id ? String(task.protocol_id) : null,
      }
    }) : [],
    guest_alert_en: String(p.guest_alert_en ?? 'Emergency reported. Follow staff instructions.'),
    guest_alert_translations: (p.guest_alert_translations as Record<string,string>) ?? {},
    evacuation_instruction_template: String(p.evacuation_instruction_template ?? 'Evacuate via nearest exit to muster point.'),
  }
}

function fallbackTriage(input: TriageInput): TriageOutput {
  const isFire = ['fire','smoke'].includes(input.type)
  const prefix = input.isDrill ? '[DRILL] ' : ''
  return {
    severity: isFire ? 1 : 2,
    severity_reason: 'Fallback — AI unavailable',
    briefing: `${input.type} on Floor ${input.floor}, Zone ${input.zone}. Manual response required.`,
    responder_briefing: `${input.type.toUpperCase()} on Floor ${input.floor}. ${input.guestsOnFloor.length} guests on floor.`,
    recommend_911: isFire,
    recommend_911_reason: isFire ? 'Fire event — standard protocol' : null,
    tasks: [
      { role: 'security', text: `Go to Floor ${input.floor} — assess ${input.type}`, priority: 1, protocol_id: null },
      { role: 'front_desk', text: 'Alert duty manager, prepare to call emergency services', priority: 2, protocol_id: null },
      { role: 'housekeeping', text: `Assist Floor ${input.floor} guests with evacuation`, priority: 3, protocol_id: null },
    ],
    guest_alert_en: `${prefix}Emergency on your floor. Follow evacuation procedures immediately.`,
    guest_alert_translations: {},
    evacuation_instruction_template: `${prefix}Leave Room {{room}} via {{exit_label}}. Go to {{muster_point}}. Do not use elevators.`,
  }
}

export function buildEvacuationInstruction(
  template: string,
  room: string,
  exitLabel: string,
  musterPoint: string,
  language: string,
  translations: Record<string, string>
): string {
  const base = language !== 'en' && translations[language] ? translations[language] : template
  return base
    .replace(/\{\{room\}\}/g, room)
    .replace(/\{\{exit_label\}\}/g, exitLabel)
    .replace(/\{\{muster_point\}\}/g, musterPoint)
}

export async function generateReportNarrative(data: {
  incident: Record<string, unknown>
  tasks: Record<string, unknown>[]
  notifications: Record<string, unknown>[]
  timeline: { timestamp: string; event: string; actor: string }[]
}): Promise<{ executive_summary: string; recommendations: string[] }> {
  try {
    const response = await getClient().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Write executive_summary and recommendations for this incident. Return JSON only.\n\n${JSON.stringify(data, null, 2)}`,
      config: {
        systemInstruction: 'You write concise professional hotel incident reports. Output valid JSON only.',
        maxOutputTokens: 1000,
      },
    })

    const text = response.text ?? '{}'
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch {
    return {
      executive_summary: `Incident of type ${data.incident.type} on Floor ${data.incident.floor}.`,
      recommendations: ['Review response times', 'Ensure staff complete protocol training'],
    }
  }
}
