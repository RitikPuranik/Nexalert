"use strict";
const Sensor        = require("../../sensor/model/sensor.model");
const SensorEvent   = require("../../sensor/model/sensorEvent.model");
const GuestLocation = require("../../guest/model/guestLocation.model");
const Incident      = require("../../incident/model/incident.model");
const StaffPresence = require("../../staff/model/staffPresence.model");
const DeadmanSession = require("../../guest/model/deadmanSession.model");
const { processSensorEvent } = require("../../sensor/service/sensor.service");
const { emitCrisisEvent }    = require("../../../lib/eventBus");
const { logAction }          = require("../../audit/service/audit.service");

/**
 * Simulate a cascading failure scenario for hackathon demo.
 * Triggers: 5 sensor events across 3 floors, 2 unresponsive guests,
 * 1 silent staff member.
 *
 * This function runs the simulation in real-time with delays to show
 * the system reacting progressively.
 *
 * @param {string} hotelId — the hotel to simulate on
 * @returns {Object} timeline of all simulated events
 */
async function runCascadingFailure(hotelId) {
  const timeline = [];
  const ts = () => new Date().toISOString();

  const log = (event, detail) => {
    timeline.push({ time: ts(), event, detail });
    console.log(`[Simulate] ${event}: ${JSON.stringify(detail)}`);
  };

  logAction({
    actor: "system", actorType: "system",
    action: "simulation:started", resourceType: "hotel",
    resourceId: hotelId, hotelId,
    details: "Cascading failure simulation initiated",
  });

  // ── Step 1: Load hotel sensors ──────────────────────────────────────────
  const sensors = await Sensor.find({ hotel_id: hotelId, is_active: true }).lean();
  if (sensors.length === 0) {
    // Create temporary simulation sensors
    const simSensors = [];
    for (let floor = 1; floor <= 3; floor++) {
      for (const type of ["smoke", "heat"]) {
        const sensor = await Sensor.create({
          hotel_id: hotelId,
          sensor_id: `SIM_${type.toUpperCase()}_F${floor}`,
          type,
          floor,
          zone: `zone_${floor}`,
          threshold: 50,
          is_active: true,
          location_description: `Simulation sensor — floor ${floor}`,
        });
        simSensors.push(sensor);
      }
    }
    sensors.push(...simSensors);
    log("sensors_created", { count: simSensors.length, message: "Created temporary simulation sensors" });
  }

  // ── Step 2: Fire 5 sensor events across 3 floors ──────────────────────
  const sensorsByFloor = {};
  for (const s of sensors) {
    if (!sensorsByFloor[s.floor]) sensorsByFloor[s.floor] = [];
    sensorsByFloor[s.floor].push(s);
  }

  const floors = Object.keys(sensorsByFloor).slice(0, 3).map(Number);
  const fireSequence = [];

  // Pick sensors from up to 3 floors, at least 1 per floor, 5 total
  for (let i = 0; i < Math.min(5, sensors.length); i++) {
    const floor = floors[i % floors.length];
    const floorSensors = sensorsByFloor[floor];
    if (floorSensors && floorSensors.length > 0) {
      fireSequence.push(floorSensors[i % floorSensors.length]);
    }
  }

  for (let i = 0; i < fireSequence.length; i++) {
    const sensor = fireSequence[i];
    const breachValue = sensor.threshold * (1.5 + Math.random()); // 50-150% above threshold

    try {
      const result = await processSensorEvent(
        sensor.sensor_id,
        Math.round(breachValue),
        sensor.threshold
      );
      log("sensor_fired", {
        sensor_id: sensor.sensor_id,
        floor:     sensor.floor,
        type:      sensor.type,
        value:     Math.round(breachValue),
        threshold: sensor.threshold,
        result:    result.status,
        incident_id: result.incident_id,
      });
    } catch (err) {
      log("sensor_fire_error", { sensor_id: sensor.sensor_id, error: err.message });
    }

    // Stagger events by 10-15 seconds (simulated — we use actual delays)
    if (i < fireSequence.length - 1) {
      await _delay(2000); // 2s delay for demo speed (adjust if needed)
    }
  }

  // ── Step 3: Create 2 unresponsive guest locations ──────────────────────
  for (let g = 1; g <= 2; g++) {
    const floor = floors[g % floors.length] || 1;
    try {
      await GuestLocation.findOneAndUpdate(
        { hotel_id: hotelId, room: `SIM_${g}01` },
        {
          hotel_id: hotelId,
          room: `SIM_${g}01`,
          floor,
          name: `Simulated Guest ${g}`,
          language: g === 1 ? "en" : "es",
          is_checked_in: true,
          guest_response: "no_response",
        },
        { upsert: true, new: true }
      );
      log("guest_unresponsive", { room: `SIM_${g}01`, floor, language: g === 1 ? "en" : "es" });
    } catch (err) {
      log("guest_create_error", { error: err.message });
    }
  }

  // ── Step 4: Flag 1 staff member as silent ──────────────────────────────
  const activeIncident = await Incident.findOne({
    hotel_id: hotelId,
    status: { $in: ["detecting", "triaging", "active"] },
  }).lean();

  if (activeIncident) {
    const presenceRecords = await StaffPresence.find({
      hotel_id: hotelId,
      incident_id: activeIncident._id,
      status: "active",
      is_silent: false,
    }).limit(1).lean();

    if (presenceRecords.length > 0) {
      await StaffPresence.findByIdAndUpdate(presenceRecords[0]._id, {
        is_silent:          true,
        silence_flagged_at: new Date(),
      });
      emitCrisisEvent(hotelId, "staff:silent", {
        incident_id:          activeIncident._id,
        staff_id:             presenceRecords[0].staff_id,
        last_seen_seconds_ago: 999,
        simulated:            true,
      });
      log("staff_silenced", { staff_id: presenceRecords[0].staff_id, incident_id: activeIncident._id });
    } else {
      log("staff_silence_skipped", { reason: "No active staff presence to flag" });
    }
  }

  // ── Step 5: Summary ────────────────────────────────────────────────────
  const summary = {
    sensors_fired:       fireSequence.length,
    floors_affected:     [...new Set(fireSequence.map((s) => s.floor))],
    guests_unresponsive: 2,
    staff_silenced:      1,
    timeline,
  };

  log("simulation_complete", summary);

  emitCrisisEvent(hotelId, "simulation:complete", {
    ...summary,
    message: "🧪 Cascading failure simulation complete",
  });

  logAction({
    actor: "system", actorType: "system",
    action: "simulation:completed", resourceType: "hotel",
    resourceId: hotelId, hotelId,
    after: summary,
    details: `Simulation: ${fireSequence.length} sensors, ${floors.length} floors, 2 guests, 1 staff`,
  });

  return summary;
}

/**
 * Simple single-incident drill for quick testing.
 */
async function runSingleDrill(hotelId, floor, type) {
  const sensor = await Sensor.findOne({
    hotel_id: hotelId, floor, is_active: true,
  }).lean();

  if (!sensor) {
    throw Object.assign(new Error(`No active sensor on floor ${floor}`), { status: 400 });
  }

  const breachValue = Math.round(sensor.threshold * 2);
  const result = await processSensorEvent(sensor.sensor_id, breachValue, sensor.threshold);

  logAction({
    actor: "system", actorType: "system",
    action: "drill:single_started", resourceType: "incident",
    resourceId: result.incident_id || "none", hotelId,
    details: `Single drill: sensor ${sensor.sensor_id}, floor ${floor}, type ${type}`,
  });

  return result;
}

function _delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { runCascadingFailure, runSingleDrill };
