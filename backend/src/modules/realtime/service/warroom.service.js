"use strict";
const Incident          = require("../../incident/model/incident.model");
const StaffTask         = require("../../incident/model/staffTask.model");
const GuestLocation     = require("../../guest/model/guestLocation.model");
const GuestNotification = require("../../guest/model/guestNotification.model");
const DeadmanSession    = require("../../guest/model/deadmanSession.model");
const StaffPresence     = require("../../staff/model/staffPresence.model");
const FloorPlan         = require("../../hotel/model/floorPlan.model");
const UserProfile       = require("../../staff/model/userProfile.model");
const Hotel             = require("../../hotel/model/hotel.model");

/**
 * Build the full war-room snapshot for a single incident.
 * Replaces 6+ separate API calls with one parallel batch.
 */
async function buildWarRoom(incidentId, hotelId) {
  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw Object.assign(new Error("Incident not found"), { status: 404 });
  if (String(incident.hotel_id) !== String(hotelId))
    throw Object.assign(new Error("Access denied"), { status: 403 });

  const affectedFloor  = incident.floor;
  const adjacentFloors = [affectedFloor - 1, affectedFloor + 1].filter((f) => f >= 1);

  const [tasks, notifications, deadmanSessions, staffPresence, allGuests, floorPlan, staffOnDuty] =
    await Promise.all([
      StaffTask.find({ incident_id: incidentId }).populate("assigned_to", "name role").lean(),
      GuestNotification.find({ incident_id: incidentId }).populate("guest_location_id", "name coordinates coordinates_updated_at").lean(),
      DeadmanSession.find({ incident_id: incidentId, status: { $in: ["active","escalated"] } }).lean(),
      StaffPresence.find({ incident_id: incidentId, status: "active" }).populate("staff_id", "name role floor_assignment").lean(),
      GuestLocation.find({ hotel_id: hotelId, floor: { $in: [affectedFloor, ...adjacentFloors] }, is_checked_in: true }).lean(),
      FloorPlan.findOne({ hotel_id: hotelId, floor: affectedFloor }).lean(),
      UserProfile.find({ hotel_id: hotelId, is_on_duty: true, role: "staff" }).lean(),
    ]);

  const heatmap          = _buildHeatmap(affectedFloor, allGuests, notifications, deadmanSessions);
  const adjacentHeatmaps = {};
  for (const f of adjacentFloors) {
    adjacentHeatmaps[f] = _buildHeatmap(f, allGuests, notifications, deadmanSessions);
  }

  const floorNotifs = notifications.filter((n) => n.floor === affectedFloor);
  const guestAccountability = {
    total:        allGuests.filter((g) => g.floor === affectedFloor).length,
    safe:         floorNotifs.filter((n) => n.guest_response === "safe").length,
    needs_help:   floorNotifs.filter((n) => n.guest_response === "needs_help").length,
    no_response:  floorNotifs.filter((n) => n.guest_response === "no_response").length,
    not_notified: Math.max(0, allGuests.filter((g) => g.floor === affectedFloor).length - floorNotifs.length),
  };

  const taskProgress = {
    total:           tasks.length,
    pending:         tasks.filter((t) => t.status === "pending").length,
    in_progress:     tasks.filter((t) => ["accepted","in_progress"].includes(t.status)).length,
    completed:       tasks.filter((t) => t.status === "completed").length,
    skipped:         tasks.filter((t) => t.status === "skipped").length,
    completion_rate: tasks.length ? Math.round((tasks.filter((t) => t.status === "completed").length / tasks.length) * 100) : 0,
  };

  const notificationStats = {
    total:         notifications.length,
    delivered:     notifications.filter((n) => ["delivered","sent"].includes(n.delivery_status)).length,
    failed:        notifications.filter((n) => n.delivery_status === "failed").length,
    pending:       notifications.filter((n) => n.delivery_status === "pending").length,
    delivery_rate: notifications.length
      ? Math.round((notifications.filter((n) => ["delivered","sent"].includes(n.delivery_status)).length / notifications.length) * 100)
      : 0,
  };

  return {
    incident,
    floor_heatmap:           heatmap,
    adjacent_floor_heatmaps: adjacentHeatmaps,
    guest_accountability:    guestAccountability,
    task_progress:           taskProgress,
    notification_stats:      notificationStats,
    deadman_sessions:        deadmanSessions,
    staff_presence: {
      active:   staffPresence.filter((p) => !p.is_silent),
      silent:   staffPresence.filter((p) => p.is_silent),
      on_duty:  staffOnDuty,
    },
    tasks,
    notifications,
    floor_plan:    floorPlan,
    generated_at:  new Date().toISOString(),
  };
}

/**
 * Build a per-room heatmap object for one floor.
 * Colours: green=safe  amber=no_response  red=needs_help|failed  gray=not_notified
 */
function _buildHeatmap(floor, allGuests, notifications, deadmanSessions) {
  const map = {};

  for (const guest of allGuests.filter((g) => g.floor === floor)) {
    const notif   = notifications.find((n) => n.room === guest.room && n.floor === floor);
    const deadman = deadmanSessions.find((d) => d.room === guest.room && d.floor === floor);

    let color  = "amber";
    let status = "no_response";

    if (!notif) {
      color  = "gray";
      status = "not_notified";
    } else if (notif.guest_response === "safe") {
      color  = "green";
      status = "safe";
    } else if (notif.guest_response === "needs_help" || notif.delivery_status === "failed") {
      color  = "red";
      status = notif.guest_response === "needs_help" ? "needs_help" : "notification_failed";
    }

    map[guest.room] = {
      room:               guest.room,
      floor,
      color,
      status,
      guest_name:         guest.name,
      language:           guest.language,
      needs_accessibility: guest.needs_accessibility,
      coordinates:        guest.coordinates,
      deadman: deadman
        ? { session_id: deadman._id, status: deadman.status, missed_pings: deadman.missed_pings, last_ping_at: deadman.last_ping_at }
        : null,
    };
  }

  return map;
}

/** Build the public responder packet for 911 / fire dept. */
async function buildResponderPacket(incidentId) {

  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw Object.assign(new Error("Incident not found"), { status: 404 });

  const [hotel, guests, notifications, tasks] = await Promise.all([
    Hotel.findById(incident.hotel_id).lean(),
    GuestLocation.find({ hotel_id: incident.hotel_id, floor: incident.floor, is_checked_in: true }).lean(),
    GuestNotification.find({ incident_id: incidentId }).lean(),
    StaffTask.find({ incident_id: incidentId }).lean(),
  ]);

  return {
    incident: {
      id: incident._id, type: incident.type, floor: incident.floor,
      zone: incident.zone, room: incident.room, status: incident.status,
      severity: incident.severity, severity_reason: incident.severity_reason,
      source: incident.source, sensor_reading: incident.sensor_reading,
      created_at: incident.createdAt, triage_at: incident.triage_at,
      is_drill: incident.is_drill,
    },
    location: {
      hotel_name: hotel?.name, hotel_address: hotel?.address, floor: incident.floor,
      zone: incident.zone,
      access_codes:        Object.fromEntries(hotel?.access_codes || new Map()),
      muster_points:       hotel?.muster_points || [],
      emergency_contacts:  hotel?.emergency_contacts || [],
    },
    responder_briefing: incident.responder_briefing,
    guest_summary: {
      total_on_floor:             guests.length,
      needs_accessibility:         guests.filter((g) => g.needs_accessibility).length,
      confirmed_safe:              notifications.filter((n) => n.guest_response === "safe").length,
      needs_help:                  notifications.filter((n) => n.guest_response === "needs_help").length,
      no_response:                 notifications.filter((n) => n.guest_response === "no_response").length,
      guests_needing_help: guests
        .filter((g) => notifications.find((n) => n.room === g.room)?.guest_response === "needs_help")
        .map((g) => ({ room: g.room, name: g.name, needs_accessibility: g.needs_accessibility, accessibility_notes: g.accessibility_notes, coordinates: g.coordinates })),
    },
    staff_response: {
      tasks_total:       tasks.length,
      tasks_completed:   tasks.filter((t) => t.status === "completed").length,
      tasks_in_progress: tasks.filter((t) => ["accepted","in_progress"].includes(t.status)).length,
    },
    generated_at: new Date().toISOString(),
  };
}

module.exports = { buildWarRoom, buildResponderPacket };
