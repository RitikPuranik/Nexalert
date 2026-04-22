"use strict";
const Sensor      = require("../model/sensor.model");
const SensorEvent = require("../model/sensorEvent.model");
const Incident    = require("../../incident/model/incident.model");
const { emitCrisisEvent } = require("../../../lib/eventBus");
const { runTriagePipeline } = require("../../incident/service/triage.service");
const { correlateEvent, checkCascadeRule } = require("./correlator.service");
const { logAction } = require("../../audit/service/audit.service");

/** Sensor type → incident type mapping */
const TYPE_MAP = {
  smoke:  "smoke",
  heat:   "fire",
  gas:    "gas_leak",
  motion: "security",
  flood:  "flood",
  co2:    "gas_leak",
};

/**
 * Process one sensor reading from an ESP32 device.
 * Returns { status, incident_id? }
 */
async function processSensorEvent(sensorId, value, threshold) {
  const sensor = await Sensor.findOne({ sensor_id: sensorId, is_active: true }).lean();
  if (!sensor) throw Object.assign(new Error("Sensor not found"), { status: 404 });

  const effectiveThreshold = threshold ?? sensor.threshold;

  // Log the raw event
  const event = await SensorEvent.create({
    sensor_id:  sensorId,
    hotel_id:   sensor.hotel_id,
    value,
    threshold:  effectiveThreshold,
    triggered_incident: false,
  });

  await Sensor.findByIdAndUpdate(sensor._id, { last_event_at: new Date() });

  // Below threshold — just log
  if (value <= effectiveThreshold) {
    return { status: "logged", triggered: false };
  }

  // Above threshold — run AI correlation before creating new incident
  const sensorContext = {
    sensor_id: sensorId,
    value,
    threshold: effectiveThreshold,
    type:      sensor.type,
    floor:     sensor.floor,
    zone:      sensor.zone,
    hotel_id:  sensor.hotel_id,
  };

  let correlation;
  try {
    correlation = await correlateEvent(sensorContext);
  } catch (corrErr) {
    console.error("[Sensor] Correlation failed, treating as new:", corrErr.message);
    correlation = { action: "new" };
  }

  // If correlated with existing incident, merge instead of creating new
  if (correlation.action === "merge" && correlation.target_incident_id) {
    await SensorEvent.findByIdAndUpdate(event._id, {
      incident_id:        correlation.target_incident_id,
      triggered_incident: false,
    });

    // Upgrade severity if recommended
    if (correlation.upgrade_severity && correlation.suggested_severity) {
      const targetInc = await Incident.findById(correlation.target_incident_id);
      if (targetInc && (targetInc.severity || 3) > correlation.suggested_severity) {
        const before = { severity: targetInc.severity };
        targetInc.severity        = correlation.suggested_severity;
        targetInc.severity_reason = `Upgraded via AI correlation: ${correlation.correlation_reason}`;
        if (correlation.suggested_severity === 1) {
          targetInc.recommend_911 = true;
          targetInc.recommend_911_reason = "Severity auto-upgraded to CRITICAL by AI correlation engine.";
        }
        await targetInc.save();

        emitCrisisEvent(sensor.hotel_id, "incident:updated", {
          incident_id: correlation.target_incident_id,
          severity:    correlation.suggested_severity,
          action:      "correlation_upgrade",
          reason:      correlation.correlation_reason,
        });

        logAction({
          actor: `sensor:${sensorId}`, actorType: "sensor",
          action: "incident:correlation_upgrade",
          resourceType: "incident", resourceId: correlation.target_incident_id,
          hotelId: sensor.hotel_id, incidentId: correlation.target_incident_id,
          before, after: { severity: correlation.suggested_severity },
          details: correlation.correlation_reason,
        });
      }
    }

    emitCrisisEvent(sensor.hotel_id, "sensor:correlated", {
      sensor_id:   sensorId,
      incident_id: correlation.target_incident_id,
      value,
      threshold:   effectiveThreshold,
      correlation_reason: correlation.correlation_reason,
    });

    logAction({
      actor: `sensor:${sensorId}`, actorType: "sensor",
      action: "sensor:event_correlated",
      resourceType: "sensor_event", resourceId: event._id,
      hotelId: sensor.hotel_id, incidentId: correlation.target_incident_id,
      details: `Correlated with existing incident: ${correlation.correlation_reason}`,
    });

    return { status: "correlated", incident_id: correlation.target_incident_id, correlation_reason: correlation.correlation_reason };
  }

  // Deduplicate against existing active incident on same floor/zone (original logic)
  const existing = await Incident.findOne({
    hotel_id: sensor.hotel_id,
    floor:    sensor.floor,
    ...(sensor.zone ? { zone: sensor.zone } : {}),
    status: { $in: ["detecting","triaging","active","investigating"] },
  }).lean();

  if (existing) {
    await SensorEvent.findByIdAndUpdate(event._id, { incident_id: existing._id });
    emitCrisisEvent(sensor.hotel_id, "sensor:escalation", {
      sensor_id:   sensorId,
      incident_id: existing._id,
      value,
      threshold:   effectiveThreshold,
    });
    return { status: "deduplicated", incident_id: existing._id };
  }

  // Create a new incident
  const incident = await Incident.create({
    hotel_id:          sensor.hotel_id,
    type:              TYPE_MAP[sensor.type] || "unknown",
    floor:             sensor.floor,
    zone:              sensor.zone,
    room:              sensor.room,
    source:            "sensor",
    sensor_id:         sensor._id,
    sensor_reading:    value,
    sensor_threshold:  effectiveThreshold,
    status:            "detecting",
  });

  await SensorEvent.findByIdAndUpdate(event._id, {
    triggered_incident: true,
    incident_id:        incident._id,
  });

  emitCrisisEvent(sensor.hotel_id, "incident:created", {
    incident_id: incident._id,
    type:        incident.type,
    floor:       incident.floor,
    source:      "sensor",
  });

  logAction({
    actor: `sensor:${sensorId}`, actorType: "sensor",
    action: "incident:created",
    resourceType: "incident", resourceId: incident._id,
    hotelId: sensor.hotel_id, incidentId: incident._id,
    after: { type: incident.type, floor: incident.floor, source: "sensor" },
    details: `Sensor ${sensorId} triggered new incident: ${incident.type} on floor ${incident.floor}`,
  });

  // Fire triage asynchronously (non-blocking)
  runTriagePipeline(incident._id).catch(console.error);

  // Check cascade rule after new incident creation
  checkCascadeRule(sensor.hotel_id).catch(console.error);

  return { status: "incident_created", incident_id: incident._id };
}

async function listSensors(hotelId) {
  return Sensor.find({ hotel_id: hotelId }).lean();
}


async function registerSensor(hotelId, data) {
  return Sensor.create({ hotel_id: hotelId, ...data });
}

async function updateSensor(id, updates) {
  return Sensor.findByIdAndUpdate(id, updates, { new: true }).lean();
}

async function recentEvents(hotelId, limit = 100) {
  return SensorEvent.find({ hotel_id: hotelId })
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 500))
    .lean();
}

module.exports = {
  processSensorEvent,
  listSensors,
  registerSensor,
  updateSensor,
  recentEvents,
};
