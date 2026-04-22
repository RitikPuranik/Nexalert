"use strict";
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function getModel() {
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.2 },
  });
}

function stripFences(text) {
  return text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
}

/**
 * Run AI triage for an incident.
 * Returns structured JSON with severity, tasks, translations, etc.
 */
async function runAITriage({ incident, hotel, guests, exits }) {
  const languages = [...new Set(guests.map((g) => g.language || "en"))];
  const accessCodes = Object.fromEntries(hotel.access_codes || new Map());

  const prompt = `
You are an AI emergency triage system for a hotel. A crisis is underway.
Respond ONLY with a single valid JSON object. No markdown, no prose, no code fences.

## INCIDENT
- Type: ${incident.type}
- Floor: ${incident.floor}
- Zone: ${incident.zone || "unknown"}
- Room: ${incident.room || "unknown"}
- Source: ${incident.source}
- Sensor reading: ${incident.sensor_reading ?? "N/A"} (threshold: ${incident.sensor_threshold ?? "N/A"})
- Hotel: ${hotel.name}
- Is Drill: ${incident.is_drill}

## GUESTS ON AFFECTED FLOOR (${guests.length} total)
${JSON.stringify(guests.map((g) => ({ room: g.room, language: g.language, needs_accessibility: g.needs_accessibility, accessibility_notes: g.accessibility_notes || null })))}

## AVAILABLE EXIT ROUTES
${JSON.stringify(exits.map((e) => ({ label: e.label, description: e.description, is_accessible: e.is_accessible, muster_point: e.muster_point, avoids_zones: e.avoids_zones })))}

## BUILDING ACCESS CODES
${JSON.stringify(accessCodes)}

## MUSTER POINTS
${JSON.stringify(hotel.muster_points || [])}

---
Return this exact JSON structure (no extra keys):
{
  "severity": <1|2|3>,
  "severity_reason": "<one sentence>",
  "manager_briefing": "<2-3 sentences for manager dashboard>",
  "responder_briefing": "<structured briefing for fire dept or ambulance>",
  "recommend_911": <true|false>,
  "recommend_911_reason": "<one sentence or null>",
  "staff_tasks": [
    { "title": "<task>", "description": "<details>", "assigned_role": "<security|housekeeping|medical|maintenance|front_desk>", "priority": <1-10> }
  ],
  "guest_alert_en": "<English alert, 2-3 sentences. Prefix [DRILL] if is_drill>",
  "guest_alert_translations": { ${languages.filter((l) => l !== "en").map((l) => `"${l}": "<alert in ${l}>"`).join(", ")} },
  "evacuation_template": "<Instruction using {{room}}, {{exit_label}}, {{muster_point}} placeholders>"
}

Severity: 1=CRITICAL(evacuate now), 2=URGENT(investigate), 3=MONITOR.
Severity 1 fire/explosion MUST recommend_911=true.
Provide at least 3 staff_tasks. Priority 10 = most urgent.
`;

  const result = await getModel().generateContent(prompt);
  return JSON.parse(stripFences(result.response.text().trim()));
}

/**
 * Generate an executive summary and recommendations for a post-incident report.
 */
async function generateReportNarrative({ incident, tasks, notifications, hotel, timeline, metrics }) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.3 },
  });

  const prompt = `
You are a hotel safety compliance officer writing a post-incident report.
Respond ONLY with valid JSON, no markdown.

## INCIDENT
${JSON.stringify({ type: incident.type, floor: incident.floor, source: incident.source, severity: incident.severity, is_drill: incident.is_drill, status: incident.status, created_at: incident.createdAt, resolved_at: incident.resolved_at })}

## METRICS
${JSON.stringify(metrics)}

## TIMELINE (${timeline.length} events)
${JSON.stringify(timeline.slice(0, 20))}

## TASK SUMMARY
Total: ${tasks.length}, Completed: ${tasks.filter((t) => t.status === "completed").length}, Skipped: ${tasks.filter((t) => t.status === "skipped").length}

## NOTIFICATION SUMMARY
Total: ${notifications.length}, Delivered: ${notifications.filter((n) => ["delivered","sent"].includes(n.delivery_status)).length}

---
Return:
{
  "executive_summary": "<3-5 paragraph narrative>",
  "recommendations": ["<recommendation 1>", "...up to 8"]
}
`;

  const result = await model.generateContent(prompt);
  return JSON.parse(stripFences(result.response.text().trim()));
}

module.exports = { runAITriage, generateReportNarrative };
