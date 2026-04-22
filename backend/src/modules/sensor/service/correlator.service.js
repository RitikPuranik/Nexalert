"use strict";
const Incident   = require("../../incident/model/incident.model");
const Sensor     = require("../model/sensor.model");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { emitCrisisEvent }   = require("../../../lib/eventBus");
const { logAction }          = require("../../audit/service/audit.service");

const CORRELATION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const CASCADE_WINDOW_MS     = 2 * 60 * 1000; // 2 minutes
const CASCADE_FLOOR_THRESHOLD = 3;            // 3+ distinct floors

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function stripFences(text) {
  return text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
}

/**
 * Correlate a new sensor event with existing active incidents.
 *
 * Strategy:
 * 1. Find active incidents within ±1 floor or same zone, created in last 5 min
 * 2. If no candidates → action: "new"
 * 3. If candidates found → ask Gemini whether events are related
 * 4. Return { action: "merge"|"new", target_incident_id?, upgrade_severity? }
 *
 * @param {{ sensor_id, value, threshold, type, floor, zone, hotel_id }} sensorContext
 * @returns {{ action: "merge"|"new", target_incident_id?, upgrade_severity?, correlation_reason? }}
 */
async function correlateEvent(sensorContext) {
  const { hotel_id, floor, zone } = sensorContext;
  const cutoff = new Date(Date.now() - CORRELATION_WINDOW_MS);

  // Find active incidents within spatial/temporal window
  const candidates = await Incident.find({
    hotel_id,
    status:    { $in: ["detecting", "triaging", "active", "investigating"] },
    createdAt: { $gte: cutoff },
    $or: [
      { floor: { $gte: floor - 1, $lte: floor + 1 } },  // ±1 floor
      ...(zone ? [{ zone }] : []),                         // same zone
    ],
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  if (candidates.length === 0) {
    return { action: "new" };
  }

  // Ask Gemini to determine correlation
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.1 },
    });

    const prompt = `
You are an AI threat correlation engine for a hotel safety system.
A new sensor event has occurred. Determine if it is related to any existing active incidents.
Respond ONLY with valid JSON. No markdown, no code fences.

## NEW SENSOR EVENT
- Type: ${sensorContext.type}
- Floor: ${floor}
- Zone: ${zone || "unknown"}
- Value: ${sensorContext.value} (threshold: ${sensorContext.threshold})
- Sensor ID: ${sensorContext.sensor_id}

## EXISTING ACTIVE INCIDENTS (last 5 minutes)
${JSON.stringify(candidates.map((i) => ({
  id: i._id,
  type: i.type,
  floor: i.floor,
  zone: i.zone,
  room: i.room,
  severity: i.severity,
  source: i.source,
  sensor_reading: i.sensor_reading,
  created_at: i.createdAt,
  status: i.status,
})))}

---
Return this exact JSON:
{
  "related": <true|false>,
  "target_incident_id": "<id of the related incident or null>",
  "reason": "<one sentence explanation>",
  "upgrade_severity": <true|false>,
  "suggested_severity": <1|2|3|null>
}

Rules:
- If the new event is on the same or adjacent floor AND is a related type (e.g., smoke+heat = fire), mark related=true.
- If the new event is clearly unrelated (e.g., flood on floor 1 vs smoke on floor 10), mark related=false.
- If related=true and the combined threat is more severe, set upgrade_severity=true and suggested_severity to the appropriate level.
- Severity 1=CRITICAL, 2=URGENT, 3=MONITOR.
`;

    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(stripFences(result.response.text().trim()));

    if (parsed.related && parsed.target_incident_id) {
      // Verify the target is actually in our candidate list
      const validTarget = candidates.find((c) => String(c._id) === String(parsed.target_incident_id));
      if (validTarget) {
        return {
          action:             "merge",
          target_incident_id: validTarget._id,
          upgrade_severity:   parsed.upgrade_severity || false,
          suggested_severity: parsed.suggested_severity || validTarget.severity,
          correlation_reason: parsed.reason,
        };
      }
    }

    return { action: "new", correlation_reason: parsed.reason };
  } catch (err) {
    console.error("[Correlator] AI correlation failed, defaulting to simple logic:", err.message);
    return fallbackCorrelation(sensorContext, candidates);
  }
}

/**
 * Simple rule-based fallback when Gemini is unavailable.
 */
function fallbackCorrelation(sensorContext, candidates) {
  const TYPE_GROUPS = {
    fire:     ["fire", "smoke", "heat"],
    chemical: ["gas_leak", "co2"],
    water:    ["flood"],
  };

  // Find the group the new event belongs to
  let newGroup = null;
  for (const [group, types] of Object.entries(TYPE_GROUPS)) {
    if (types.includes(sensorContext.type)) {
      newGroup = group;
      break;
    }
  }

  if (!newGroup) return { action: "new" };

  // Check if any candidate belongs to the same threat group
  for (const candidate of candidates) {
    for (const [group, types] of Object.entries(TYPE_GROUPS)) {
      if (group === newGroup && types.includes(candidate.type)) {
        return {
          action:             "merge",
          target_incident_id: candidate._id,
          upgrade_severity:   candidate.severity > 1, // upgrade toward CRITICAL
          suggested_severity: Math.max(1, (candidate.severity || 2) - 1),
          correlation_reason: `Fallback: ${sensorContext.type} on floor ${sensorContext.floor} correlates with ${candidate.type} on floor ${candidate.floor} (same threat group: ${newGroup})`,
        };
      }
    }
  }

  return { action: "new" };
}

/**
 * Check the cascade auto-escalation rule:
 * If 3+ sensors on different floors triggered incidents within the last 2 minutes,
 * auto-set the primary incident to severity=1 and recommend_911=true.
 *
 * @param {string} hotelId
 * @returns {{ cascaded: boolean, primary_incident_id?, floors_affected? }}
 */
async function checkCascadeRule(hotelId) {
  const cutoff = new Date(Date.now() - CASCADE_WINDOW_MS);

  const recentIncidents = await Incident.find({
    hotel_id:  hotelId,
    source:    "sensor",
    createdAt: { $gte: cutoff },
    status:    { $in: ["detecting", "triaging", "active", "investigating"] },
  })
    .sort({ createdAt: 1 })
    .lean();

  // Count distinct floors
  const distinctFloors = new Set(recentIncidents.map((i) => i.floor));

  if (distinctFloors.size < CASCADE_FLOOR_THRESHOLD) {
    return { cascaded: false };
  }

  // Find the primary (oldest) incident
  const primary = recentIncidents[0];

  // Only cascade if primary isn't already severity 1
  if (primary.severity === 1) {
    return { cascaded: false, reason: "Already at maximum severity" };
  }

  // Auto-escalate
  const before = { severity: primary.severity, recommend_911: primary.recommend_911 };

  await Incident.findByIdAndUpdate(primary._id, {
    severity:             1,
    severity_reason:      `AUTO-CASCADE: ${distinctFloors.size} floors with active sensor incidents within 2 minutes.`,
    recommend_911:        true,
    recommend_911_reason: `Cascade rule triggered: ${distinctFloors.size} floors affected simultaneously.`,
    is_cascade:           true,
    correlated_incidents: recentIncidents.slice(1).map((i) => i._id),
  });

  // Link all other incidents back to the primary
  for (const inc of recentIncidents.slice(1)) {
    await Incident.findByIdAndUpdate(inc._id, {
      $addToSet: { correlated_incidents: primary._id },
      correlation_reason: `Linked to primary incident via cascade rule`,
    });
  }

  const after = { severity: 1, recommend_911: true, is_cascade: true };

  emitCrisisEvent(hotelId, "sensor:cascade", {
    primary_incident_id: primary._id,
    floors_affected:     [...distinctFloors],
    total_incidents:     recentIncidents.length,
    message:             `🚨 CASCADE ALERT: ${distinctFloors.size} floors with simultaneous sensor incidents — auto-escalated to CRITICAL`,
  });

  logAction({
    actor:        "system",
    actorType:    "system",
    action:       "incident:cascade_escalated",
    resourceType: "incident",
    resourceId:   primary._id,
    hotelId,
    incidentId:   primary._id,
    before,
    after,
    details:      `Cascade rule: ${distinctFloors.size} floors affected`,
  });

  return {
    cascaded:            true,
    primary_incident_id: primary._id,
    floors_affected:     [...distinctFloors],
    total_incidents:     recentIncidents.length,
  };
}

module.exports = { correlateEvent, checkCascadeRule, fallbackCorrelation };
