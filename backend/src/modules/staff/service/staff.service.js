"use strict";
const UserProfile   = require("../model/userProfile.model");
const StaffPresence = require("../model/staffPresence.model");
const StaffTask     = require("../../incident/model/staffTask.model");
const Incident      = require("../../incident/model/incident.model");
const GuestLocation = require("../../guest/model/guestLocation.model");
const { emitCrisisEvent } = require("../../../lib/eventBus");

const STALE_THRESHOLD_SECONDS = 120;

// ── Duty ────────────────────────────────────────────────────────────────────

async function setDutyStatus(staffId, isOnDuty) {
  return UserProfile.findByIdAndUpdate(
    staffId,
    { is_on_duty: isOnDuty, ...(isOnDuty ? { last_duty_at: new Date() } : {}) },
    { new: true }
  ).lean();
}

// ── Presence Pings ──────────────────────────────────────────────────────────

async function recordPresencePing(hotelId, staffId, incidentId, coordinates) {
  const update = {
    last_ping_at: new Date(),
    is_silent:    false,
    hotel_id:     hotelId,   // ensure hotel_id is always set (needed on upsert)
  };
  if (coordinates) update.coordinates = coordinates;

  return StaffPresence.findOneAndUpdate(
    { incident_id: incidentId, staff_id: staffId },
    update,
    { new: true, upsert: true }
  ).lean();
}

async function getPresence(incidentId) {
  return StaffPresence.find({ incident_id: incidentId, status: "active" })
    .populate("staff_id", "name role floor_assignment")
    .lean();
}

// ── Tasks ────────────────────────────────────────────────────────────────────

async function getMyTasks(hotelId, staffId, role) {
  const activeIncidents = await Incident.find({
    hotel_id: hotelId,
    status: { $in: ["active","triaging","investigating"] },
  }).select("_id").lean();

  const incidentIds = activeIncidents.map((i) => i._id);

  const filter = {
    incident_id: { $in: incidentIds },
    status: { $in: ["pending","accepted","in_progress"] },
  };

  // Staff see: tasks explicitly assigned to them OR any pending unassigned task
  // (Triage assigns by job role like "security"/"housekeeping", not user role "staff")
  if (role === "staff") {
    filter.$or = [
      { assigned_to: staffId },                    // already claimed
      { assigned_to: { $exists: false }, status: "pending" }, // unclaimed
    ];
  }
  // Managers see all tasks for the hotel's active incidents

  return StaffTask.find(filter)
    .populate("incident_id", "type floor zone status")
    .sort({ priority: -1 })
    .lean();
}

// ── Profile ──────────────────────────────────────────────────────────────────

async function updateProfile(staffId, updates) {
  const allowed = ["name","phone","fcm_token"];
  const safe = Object.fromEntries(allowed.filter((k) => updates[k] !== undefined).map((k) => [k, updates[k]]));
  return UserProfile.findByIdAndUpdate(staffId, safe, { new: true }).lean();
}

async function registerStaff(hotelId, data) {
  return UserProfile.create({ hotel_id: hotelId, ...data });
}

async function getTeam(hotelId) {
  return UserProfile.find({ hotel_id: hotelId }).lean();
}

// ── Guest locations (visible to staff on their floor, all floors for manager) ──

async function getGuestLocations(hotelId, role, floorAssignment, floorQuery) {
  const filter = { hotel_id: hotelId, is_checked_in: true };
  if (role === "staff" && floorAssignment) filter.floor = floorAssignment;
  if (floorQuery) filter.floor = parseInt(floorQuery);

  return GuestLocation.find(filter)
    .select("room floor name language needs_accessibility coordinates coordinates_updated_at guest_response")
    .lean();
}

// ── Cron: check staff presence staleness ─────────────────────────────────────

async function checkStaffPresence(hotelId, incidentId) {
  const records = await StaffPresence.find({
    hotel_id:    hotelId,
    incident_id: incidentId,
    status:      "active",
    is_silent:   false,
  }).lean();

  const silenced = [];

  for (const p of records) {
    const elapsed = (Date.now() - new Date(p.last_ping_at).getTime()) / 1000;
    if (elapsed > STALE_THRESHOLD_SECONDS) {
      await StaffPresence.findByIdAndUpdate(p._id, {
        is_silent:          true,
        silence_flagged_at: new Date(),
      });
      emitCrisisEvent(hotelId, "staff:silent", {
        incident_id:          incidentId,
        staff_id:             p.staff_id,
        task_id:              p.task_id,
        last_seen_seconds_ago: Math.round(elapsed),
      });
      silenced.push(p._id);
    }
  }

  return { checked: records.length, silenced: silenced.length };
}

module.exports = {
  setDutyStatus,
  recordPresencePing,
  getPresence,
  getMyTasks,
  updateProfile,
  registerStaff,
  getTeam,
  getGuestLocations,
  checkStaffPresence,
};
