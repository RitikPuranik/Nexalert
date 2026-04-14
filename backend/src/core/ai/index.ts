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

const STAFF_ROLES = ['security', 'housekeeping', 'front_desk', 'maintenance', 'management', 'f_and_b', 'medical']

function buildTriagePrompt(input: TriageInput): string {
  const guestList = input.guestsOnFloor.map(g =>
    `  Room ${g.room}: ${g.name} (lang: ${g.language}${g.needsAccessibility ? ', ACCESSIBILITY REQUIRED' : ''})`
  ).join('\n')

  const exitList = input.floorExits.map(e =>
    `  ${e.id}: "${e.label}" (${e.type}, accessible: ${e.accessible})`
  ).join('\n')

  const musterList = input.musterPoints.map(m =>
    `  ${m.id}: ${m.label} — ${m.location_description}`
  ).join('\n')

  const langs = [...new Set(input.guestLanguages)].join(', ') || 'en'

  // Build urgency context
  const sensorContext = input.sensorValue !== undefined
    ? `\nSENSOR DATA: ${input.sensorType} reading ${input.sensorValue} (threshold ${input.sensorThreshold}). Reading is ${Math.round((input.sensorValue / (input.sensorThreshold ?? 1)) * 100)}% of threshold.`
    : ''

  const accessibilityCount = input.guestsOnFloor.filter(g => g.needsAccessibility).length

  return `
CRISIS TRIAGE REQUEST — ${input.hotelName}

INCIDENT DETAILS:
  Type: ${input.type.toUpperCase()}
  Floor: ${input.floor}/${input.totalFloors}
  Zone: ${input.zone}
  Room: ${input.room ?? 'corridor/common area'}
  Source: ${input.source}
  Drill: ${input.isDrill ? 'YES — this is a drill' : 'NO — this is a real emergency'}
${sensorContext}
${input.reporterDescription ? `\nREPORTER NOTE: "${input.reporterDescription}"` : ''}

AFFECTED GUESTS (${input.guestsOnFloor.length} on floor${accessibilityCount > 0 ? `, ${accessibilityCount} need ACCESSIBILITY assistance` : ''}):
${guestList || '  None registered on this floor'}

GUEST LANGUAGES: ${langs}

AVAILABLE EXITS:
${exitList || '  None mapped — use generic instructions'}

MUSTER POINTS:
${musterList || '  Default: Car park Level B1'}

ACCESS CODES: ${JSON.stringify(input.accessCodes)}

AVAILABLE STAFF ROLES: ${STAFF_ROLES.join(', ')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUCTIONS:
1. Assess severity: 1=CRITICAL (evacuate now), 2=URGENT (investigate + prepare), 3=MONITOR
2. Generate staff tasks assigned to specific roles with clear, actionable instructions
3. Write calm but clear guest alerts — priority is SAFETY, avoid panic
4. Translate guest alerts into ALL guest languages: ${langs}
5. Create evacuation instructions using {{room}}, {{exit_label}}, {{muster_point}} placeholders
6. Write a structured responder briefing for fire dept / ambulance

Return ONLY valid JSON matching this exact schema:
{
  "severity": <1|2|3>,
  "severity_reason": "<one sentence explaining the severity assessment>",
  "briefing": "<2-3 sentence manager summary with key facts and recommended actions>",
  "responder_briefing": "<structured briefing for emergency services: type, location, affected persons, access info>",
  "recommend_911": <true|false>,
  "recommend_911_reason": "<reason or null>",
  "tasks": [{"role": "<${STAFF_ROLES.join('|')}>", "text": "<specific actionable task>", "priority": <1-10>, "protocol_id": null}],
  "guest_alert_en": "<calm, clear English alert for guests>",
  "guest_alert_translations": {"<lang_code>": "<translated alert>"},
  "evacuation_instruction_template": "<uses {{room}}, {{exit_label}}, {{muster_point}} placeholders>"
}

${input.isDrill ? '⚠ DRILL MODE: Prefix ALL guest alerts with [DRILL]. Tasks should still be realistic for training.' : ''}
`
}

export async function runTriage(input: TriageInput): Promise<TriageOutput> {
  const prompt = buildTriagePrompt(input)

  try {
    const response = await getClient().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: `You are NexAlert, an AI crisis coordinator for hotels. Your role is to:
1. Rapidly assess emergency severity with precision
2. Generate specific, actionable staff task assignments
3. Craft calm but clear multilingual guest communications
4. Provide structured briefings for first responders
5. Recommend 911 escalation when lives are at risk

Respond with valid JSON only. No markdown fences. Be precise, professional, and calm. Every second counts in a crisis.`,
        maxOutputTokens: 3000,
        temperature: 0.2,    // Low temperature for consistent, reliable outputs
      },
    })

    const text = response.text ?? ''
    // Clean any potential markdown wrapping
    const cleaned = text
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()

    const parsed = JSON.parse(cleaned)
    return validateTriageOutput(parsed)
  } catch (err) {
    console.error('[AI TRIAGE] Failed:', err instanceof Error ? err.message : err)
    return fallbackTriage(input)
  }
}

function validateTriageOutput(p: Record<string, unknown>): TriageOutput {
  const severity = ([1, 2, 3].includes(Number(p.severity)) ? Number(p.severity) : 2) as IncidentSeverity
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
        priority: Math.min(10, Math.max(1, Number(task.priority ?? 5))),
        protocol_id: task.protocol_id ? String(task.protocol_id) : null,
      }
    }) : [],
    guest_alert_en: String(p.guest_alert_en ?? 'Emergency reported. Follow staff instructions.'),
    guest_alert_translations: (p.guest_alert_translations as Record<string, string>) ?? {},
    evacuation_instruction_template: String(p.evacuation_instruction_template ?? 'Evacuate via nearest exit to muster point.'),
  }
}

function fallbackTriage(input: TriageInput): TriageOutput {
  const isFire = ['fire', 'smoke'].includes(input.type)
  const isGasLeak = input.type === 'gas_leak'
  const isMedical = input.type === 'medical'
  const prefix = input.isDrill ? '[DRILL] ' : ''

  // Generate more comprehensive fallback tasks
  const tasks: TriageOutput['tasks'] = [
    { role: 'security', text: `Go to Floor ${input.floor}, Zone ${input.zone} — assess ${input.type} and secure the area`, priority: 1, protocol_id: null },
    { role: 'front_desk', text: `Alert duty manager. ${isFire || isGasLeak ? 'Prepare to call emergency services (101/108).' : 'Stand by for updates.'}`, priority: 2, protocol_id: null },
  ]

  if (isFire || isGasLeak) {
    tasks.push(
      { role: 'housekeeping', text: `Sweep Floor ${input.floor} — knock on every door, assist guests to Stairwell A`, priority: 3, protocol_id: null },
      { role: 'maintenance', text: `${isFire ? 'Check fire suppression systems on Floor ' + input.floor : 'Shut off gas supply to Floor ' + input.floor}`, priority: 2, protocol_id: null },
    )
  }

  if (isMedical) {
    tasks.push(
      { role: 'medical', text: `Proceed to Floor ${input.floor}, ${input.room ? `Room ${input.room}` : `Zone ${input.zone}`}. Bring first aid kit and AED.`, priority: 1, protocol_id: null },
      { role: 'front_desk', text: 'Ensure elevator is held at ground floor for ambulance crew', priority: 3, protocol_id: null },
    )
  }

  tasks.push(
    { role: 'management', text: `Monitor incident dashboard. Coordinate response. ${isFire || isGasLeak ? 'Prepare for potential full evacuation.' : ''}`, priority: 4, protocol_id: null },
  )

  // Generate basic translations for common languages
  const alertEn = `${prefix}Emergency on your floor. ${isFire ? 'Evacuate immediately via the nearest stairs. Do NOT use elevators.' : 'Follow evacuation procedures and staff instructions.'}`

  const translations: Record<string, string> = {}
  if (input.guestLanguages.includes('hi')) {
    translations.hi = `${prefix}आपकी मंजिल पर आपातकाल। ${isFire ? 'तुरंत निकटतम सीढ़ियों से निकलें। लिफ्ट का उपयोग न करें।' : 'निकासी प्रक्रियाओं और स्टाफ के निर्देशों का पालन करें।'}`
  }
  if (input.guestLanguages.includes('ar')) {
    translations.ar = `${prefix}حالة طوارئ في طابقك. ${isFire ? 'قم بالإخلاء فوراً عبر أقرب سلم. لا تستخدم المصعد.' : 'اتبع إجراءات الإخلاء وتعليمات الموظفين.'}`
  }
  if (input.guestLanguages.includes('zh')) {
    translations.zh = `${prefix}您所在楼层发生紧急情况。${isFire ? '请立即通过最近的楼梯撤离。请勿使用电梯。' : '请遵循疏散程序和工作人员指示。'}`
  }
  if (input.guestLanguages.includes('es')) {
    translations.es = `${prefix}Emergencia en su planta. ${isFire ? 'Evacúe inmediatamente por las escaleras más cercanas. NO use los ascensores.' : 'Siga los procedimientos de evacuación e instrucciones del personal.'}`
  }
  if (input.guestLanguages.includes('ja')) {
    translations.ja = `${prefix}お客様の階で緊急事態が発生しました。${isFire ? '最寄りの階段から直ちに避難してください。エレベーターは使用しないでください。' : '避難手順とスタッフの指示に従ってください。'}`
  }
  if (input.guestLanguages.includes('fr')) {
    translations.fr = `${prefix}Urgence à votre étage. ${isFire ? "Évacuez immédiatement par l'escalier le plus proche. N'utilisez PAS les ascenseurs." : "Suivez les procédures d'évacuation et les instructions du personnel."}`
  }
  if (input.guestLanguages.includes('de')) {
    translations.de = `${prefix}Notfall auf Ihrer Etage. ${isFire ? 'Evakuieren Sie sofort über die nächste Treppe. Benutzen Sie NICHT den Aufzug.' : 'Befolgen Sie die Evakuierungsverfahren und die Anweisungen des Personals.'}`
  }
  if (input.guestLanguages.includes('ru')) {
    translations.ru = `${prefix}Чрезвычайная ситуация на вашем этаже. ${isFire ? 'Немедленно эвакуируйтесь по ближайшей лестнице. НЕ пользуйтесь лифтом.' : 'Следуйте процедурам эвакуации и указаниям персонала.'}`
  }

  return {
    severity: isFire || isGasLeak ? 1 : isMedical ? 2 : 2,
    severity_reason: 'Automatic assessment — AI service unavailable',
    briefing: `${input.type.toUpperCase()} detected on Floor ${input.floor}, Zone ${input.zone}${input.room ? `, Room ${input.room}` : ''}. ${input.guestsOnFloor.length} guests on floor. Manual assessment required.`,
    responder_briefing: `${input.type.toUpperCase()} incident at Floor ${input.floor}, Zone ${input.zone}. ${input.guestsOnFloor.length} guests on floor, ${input.guestsOnFloor.filter(g => g.needsAccessibility).length} require accessibility assistance. Building has ${input.totalFloors} floors.`,
    recommend_911: isFire || isGasLeak,
    recommend_911_reason: isFire ? 'Fire event — standard protocol requires fire department notification' : isGasLeak ? 'Gas leak — potential explosion risk' : null,
    tasks,
    guest_alert_en: alertEn,
    guest_alert_translations: translations,
    evacuation_instruction_template: `${prefix}Leave Room {{room}} via {{exit_label}}. Proceed to {{muster_point}}. Do not use elevators. Stay calm and follow staff instructions.`,
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
      contents: `Analyze this hotel incident data and generate a professional post-incident report.

INCIDENT DATA:
${JSON.stringify(data, null, 2)}

Return ONLY valid JSON with this structure:
{
  "executive_summary": "<3-5 sentence professional summary of the incident, response, and outcome>",
  "recommendations": ["<specific actionable recommendation>", "..."]
}

Focus on:
- What happened and how quickly it was detected
- How effectively staff responded
- Guest communication effectiveness
- Areas for improvement
- Training recommendations`,
      config: {
        systemInstruction: 'You write concise professional hotel incident reports for management review. Output valid JSON only. Be specific and actionable in recommendations.',
        maxOutputTokens: 1500,
        temperature: 0.3,
      },
    })

    const text = response.text ?? '{}'
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return {
      executive_summary: `Incident of type ${data.incident.type} was detected on Floor ${data.incident.floor} via ${data.incident.source}. ${data.tasks.length} staff tasks were assigned, with ${data.tasks.filter(t => t.status === 'completed').length} completed. ${data.notifications.length} guest notifications were dispatched.`,
      recommendations: [
        'Review staff response times and identify bottlenecks',
        'Ensure all staff complete emergency protocol training',
        'Verify all sensor equipment is calibrated correctly',
        'Conduct follow-up drill within 30 days to reinforce procedures',
      ],
    }
  }
}
