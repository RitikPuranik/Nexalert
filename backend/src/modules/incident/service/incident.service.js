"use strict";
const Incident          = require("../model/incident.model");
const StaffTask         = require("../model/staffTask.model");
const Hotel             = require("../../hotel/model/hotel.model");
const GuestLocation     = require("../../guest/model/guestLocation.model");
const GuestNotification = require("../../guest/model/guestNotification.model");
const DeadmanSession    = require("../../guest/model/deadmanSession.model");
const StaffPresence     = require("../../staff/model/staffPresence.model");
const ExitRoute         = require("../../hotel/model/exitRoute.model");
const { emitCrisisEvent }    = require("../../../lib/eventBus");
const { runTriagePipeline }  = require("./triage.service");
const { generateToken }      = require("../../../lib/tokens");
const { sendSMS }            = require("../../realtime/service/twilio.service");

// ── Create incident (manual / staff) ────────────────────────────────────────

async function createIncident(hotelId, { type, floor, zone, room, is_drill = false }) {
  const incident = await Incident.create({
    hotel_id: hotelId, type, floor, zone, room,
    source: "staff", is_drill, status: "detecting",
  });
  emitCrisisEvent(hotelId, "incident:created", { incident_id: incident._id, type, floor, source: "staff", is_drill });
  runTriagePipeline(incident._id).catch(console.error);
  return incident;
}

// ── Guest SOS entry point ────────────────────────────────────────────────────

async function handleGuestSOS(hotelId, { room, floor, type = "sos", language = "en" }) {
  // Verify the hotel exists before creating any records
  const hotel = await Hotel.findById(hotelId).lean();
  if (!hotel) throw Object.assign(new Error("Hotel not found"), { status: 404 });
  // Upsert guest location
  const guestDoc = await GuestLocation.findOneAndUpdate(
    { hotel_id: hotelId, room: String(room) },
    { hotel_id: hotelId, room: String(room), floor: parseInt(floor), language, is_checked_in: true },
    { upsert: true, new: true }
  ).lean();

  // Fetch immediate exit (shown before AI runs)
  const exits = await ExitRoute.find({ hotel_id: hotelId, floor: parseInt(floor), is_active: true }).lean();
  const exitInstruction = exits.length > 0
    ? `Please evacuate via ${exits[0].label} to ${exits[0].muster_point || "the muster point"}.`
    : null;

  // Deduplicate against existing active incident on this floor
  const existing = await Incident.findOne({
    hotel_id: hotelId,
    floor:    parseInt(floor),
    status:   { $in: ["detecting","triaging","active","investigating"] },
  }).lean();

  let incident;
  if (existing) {
    incident = existing;
  } else {
    incident = await Incident.create({
      hotel_id: hotelId, type, floor: parseInt(floor),
      room: String(room), source: "guest_sos", status: "detecting",
    });
    emitCrisisEvent(hotelId, "incident:created", { incident_id: incident._id, type, floor, source: "guest_sos", room });
    runTriagePipeline(incident._id).catch(console.error);
  }

  // Auto-create deadman session for this SOS guest
  const dm = await DeadmanSession.create({
    incident_id:       incident._id,
    hotel_id:          hotelId,
    guest_location_id: guestDoc._id,
    room:              String(room),
    floor:             parseInt(floor),
    token:             generateToken(),
    status:            "active",
    interval_seconds:  120,
    escalate_after:    2,
    missed_pings:      0,
    last_ping_at:      new Date(),
  });

  return {
    incident_id:      incident._id,
    status:           incident.status,
    deadman_token:    dm.token,
    exit_instruction: exitInstruction,
  };
}

// ── List / get ───────────────────────────────────────────────────────────────

async function listIncidents(hotelId, { status, floor, limit = 50 }) {
  const filter = { hotel_id: hotelId };
  if (status) filter.status = status;
  if (floor)  filter.floor  = parseInt(floor);
  return Incident.find(filter).sort({ createdAt: -1 }).limit(Math.min(limit, 200)).lean();
}

async function getIncident(incidentId) {
  return Incident.findById(incidentId).lean();
}

async function getSOSStatus(hotelId, floor) {
  return Incident.find({
    hotel_id: hotelId,
    floor:    parseInt(floor),
    status:   { $in: ["detecting","triaging","active","investigating","resolved"] },
  }).sort({ createdAt: -1 }).limit(5).lean();
}

// ── Manager actions ──────────────────────────────────────────────────────────

async function applyManagerAction(incidentId, action) {
  const statusMap = {
    confirm:        "active",
    investigate:    "investigating",
    false_alarm:    "false_alarm",
    resolve:        "resolved",
    escalate_911:   "active",
  };
  if (!statusMap[action]) throw Object.assign(new Error("Invalid action"), { status: 400 });

  const incident = await Incident.findById(incidentId);
  if (!incident) throw Object.assign(new Error("Incident not found"), { status: 404 });

  incident.status = statusMap[action];

  if (action === "confirm")    incident.confirmed_at = new Date();

  if (action === "resolve") {
    incident.resolved_at = new Date();
    await _sendAllClear(incident);
    await DeadmanSession.updateMany(
      { incident_id: incidentId, status: { $in: ["active","escalated"] } },
      { status: "expired" }
    );
    emitCrisisEvent(incident.hotel_id, "incident:resolved", { incident_id: incidentId });
  }

  if (action === "escalate_911") {
    incident.escalated_to_911_at   = new Date();
    incident.responder_briefing_packet = await _build911Packet(incident);
    emitCrisisEvent(incident.hotel_id, "incident:updated", { incident_id: incidentId, action: "escalate_911" });
  }

  await incident.save();
  emitCrisisEvent(incident.hotel_id, "incident:updated", { incident_id: incidentId, status: incident.status, action });
  return incident;
}

// ── Task actions (staff) ─────────────────────────────────────────────────────

async function applyTaskAction(incidentId, taskId, staffId, hotelId, action, notes) {
  const actionMap = { accept: "accepted", start: "in_progress", complete: "completed", skip: "skipped" };
  if (!actionMap[action]) throw Object.assign(new Error("Invalid action"), { status: 400 });

  const task = await StaffTask.findById(taskId);
  if (!task) throw Object.assign(new Error("Task not found"), { status: 404 });

  task.status = actionMap[action];
  if (notes)              task.notes        = notes;
  if (action === "accept") { task.accepted_at  = new Date(); task.assigned_to = staffId; }
  if (action === "start")    task.started_at   = new Date();
  if (action === "complete") task.completed_at = new Date();
  await task.save();

  // Register staff presence when they engage with a task
  if (action === "accept" || action === "start") {
    await StaffPresence.findOneAndUpdate(
      { incident_id: incidentId, staff_id: staffId },
      { incident_id: incidentId, hotel_id: hotelId, staff_id: staffId, task_id: taskId, last_ping_at: new Date(), is_silent: false, status: "active" },
      { upsert: true }
    );
  }

  // Update denormalised counter on incident
  if (action === "complete" || action === "skip") {
    const completedCount = await StaffTask.countDocuments({
      incident_id: incidentId,
      status: { $in: ["completed","skipped"] },
    });
    await Incident.findByIdAndUpdate(incidentId, { tasks_completed: completedCount });
  }

  emitCrisisEvent(hotelId, "task:updated", { incident_id: incidentId, task_id: taskId, status: task.status, staff_id: staffId });
  return task;
}

async function listTasks(incidentId) {
  return StaffTask.find({ incident_id: incidentId })
    .populate("assigned_to", "name email role")
    .lean();
}

// ── Private helpers ──────────────────────────────────────────────────────────

async function _sendAllClear(incident) {
  const notifications = await GuestNotification.find({ incident_id: incident._id, all_clear_sent: false }).lean();
  const hotel         = await Hotel.findById(incident.hotel_id).lean();
  const fromNumber    = hotel?.twilio_from_number || process.env.TWILIO_FROM_NUMBER;
  const message       = "✅ All clear — the emergency at your hotel has been resolved. You may return to your room.";

  for (const notif of notifications) {
    if (notif.channel === "sms") {
      const guest = await GuestLocation.findById(notif.guest_location_id).lean();
      if (guest?.phone) sendSMS({ to: guest.phone, body: message, from: fromNumber }).catch(() => {});
    }
    await GuestNotification.findByIdAndUpdate(notif._id, { all_clear_sent: true });
  }
}

async function _build911Packet(incident) {
  const [hotel, guests, notifications, tasks] = await Promise.all([
    Hotel.findById(incident.hotel_id).lean(),
    GuestLocation.find({ hotel_id: incident.hotel_id, floor: incident.floor, is_checked_in: true }).lean(),
    GuestNotification.find({ incident_id: incident._id }).lean(),
    StaffTask.find({ incident_id: incident._id }).lean(),
  ]);
  return {
    incident_type:  incident.type,
    hotel_name:     hotel?.name,
    hotel_address:  hotel?.address,
    floor:          incident.floor,
    zone:           incident.zone,
    room:           incident.room,
    sensor_reading: incident.sensor_reading,
    total_guests_on_floor:        guests.length,
    guests_needing_accessibility: guests.filter((g) => g.needs_accessibility).length,
    guests_confirmed_safe:   notifications.filter((n) => n.guest_response === "safe").length,
    guests_needing_help:     notifications.filter((n) => n.guest_response === "needs_help").length,
    guests_no_response:      notifications.filter((n) => n.guest_response === "no_response").length,
    staff_tasks_total:     tasks.length,
    staff_tasks_completed: tasks.filter((t) => t.status === "completed").length,
    access_codes:         Object.fromEntries(hotel?.access_codes || new Map()),
    emergency_contacts:   hotel?.emergency_contacts || [],
    responder_briefing:   incident.responder_briefing,
    generated_at:         new Date().toISOString(),
  };
}

module.exports = {
  createIncident,
  handleGuestSOS,
  listIncidents,
  getIncident,
  getSOSStatus,
  applyManagerAction,
  applyTaskAction,
  listTasks,
};
