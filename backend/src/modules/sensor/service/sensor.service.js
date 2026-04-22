"use strict";
const Sensor      = require("../model/sensor.model");
const SensorEvent = require("../model/sensorEvent.model");
const Incident    = require("../../incident/model/incident.model");
const { emitCrisisEvent } = require("../../../lib/eventBus");
const { runTriagePipeline } = require("../../incident/service/triage.service");

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

  // Above threshold — deduplicate against existing active incident on same floor/zone
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

  // Fire triage asynchronously (non-blocking)
  runTriagePipeline(incident._id).catch(console.error);

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
