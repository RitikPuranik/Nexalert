"use strict";
const GuestLocation     = require("../model/guestLocation.model");
const GuestNotification = require("../model/guestNotification.model");
const { emitCrisisEvent } = require("../../../lib/eventBus");
const { logAction } = require("../../audit/service/audit.service");
const { checkGeofences } = require("./geofence.service");

// ── Check-in / location ─────────────────────────────────────────────────────

async function upsertLocation(data) {
  const { hotel_id, room, floor, name, phone, language, needs_accessibility, accessibility_notes, check_in, check_out } = data;
  return GuestLocation.findOneAndUpdate(
    { hotel_id, room: String(room) },
    {
      hotel_id,
      room: String(room),
      floor: parseInt(floor),
      name,
      phone,
      language:            language || "en",
      needs_accessibility: needs_accessibility || false,
      accessibility_notes,
      is_checked_in: true,
      guest_response: "no_response",
      check_in: check_in || new Date(),
      check_out,
    },
    { upsert: true, new: true }
  ).lean();
}

async function updateCoordinates(hotelId, room, coordinates) {
  const doc = await GuestLocation.findOneAndUpdate(
    { hotel_id: hotelId, room: String(room), is_checked_in: true },
    { coordinates, coordinates_updated_at: new Date() },
    { new: true }
  ).lean();
  if (!doc) throw Object.assign(new Error("Guest not found"), { status: 404 });
  emitCrisisEvent(hotelId, "heatmap:change", { room, floor: doc.floor, coordinates });

  // Check geofences during active incidents (non-blocking)
  checkGeofences(hotelId, room, doc.floor, coordinates).catch((err) =>
    console.error("[Geofence] Check failed:", err.message)
  );

  return doc;
}

async function recordResponse(hotelId, room, floor, response, incidentId) {
  const now = new Date();
  await GuestLocation.findOneAndUpdate(
    { hotel_id: hotelId, room: String(room) },
    { guest_response: response, responded_at: now }
  );
  if (incidentId) {
    await GuestNotification.findOneAndUpdate(
      { incident_id: incidentId, room: String(room) },
      { guest_response: response, responded_at: now }
    );
  }
  emitCrisisEvent(hotelId, "guest:response", { room, floor, response, incident_id: incidentId });

  logAction({
    actor: `guest:${room}`, actorType: "guest",
    action: "guest:response",
    resourceType: "guest_location", resourceId: `${hotelId}:${room}`,
    hotelId, incidentId,
    after: { response },
    details: `Guest in room ${room}: ${response}`,
  });
}

async function checkoutGuest(hotelId, room) {
  return GuestLocation.findOneAndUpdate(
    { hotel_id: hotelId, room: String(room) },
    { is_checked_in: false, check_out: new Date() }
  );
}

async function listGuests(hotelId, floor) {
  const filter = { hotel_id: hotelId, is_checked_in: true };
  if (floor) filter.floor = parseInt(floor);
  return GuestLocation.find(filter).lean();
}

// ── Notifications ────────────────────────────────────────────────────────────

async function listNotifications(incidentId) {
  return GuestNotification.find({ incident_id: incidentId })
    .populate("guest_location_id", "name phone coordinates")
    .lean();
}

module.exports = {
  upsertLocation,
  updateCoordinates,
  recordResponse,
  checkoutGuest,
  listGuests,
  listNotifications,
};
