"use strict";
const Hotel           = require("../../hotel/model/hotel.model");
const GuestLocation   = require("../model/guestLocation.model");
const GuestNotification = require("../model/guestNotification.model");
const Incident        = require("../../incident/model/incident.model");
const { emitCrisisEvent } = require("../../../lib/eventBus");
const { sendSMS }     = require("../../realtime/service/twilio.service");
const { logAction }   = require("../../audit/service/audit.service");

/**
 * Haversine distance between two lat/lng points in meters.
 */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Ray-casting algorithm: checks if a point is inside a polygon.
 * Polygon is an array of [lat, lng] coordinate pairs.
 */
function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect =
      yi > lng !== yj > lng &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if a point is inside a circle geofence.
 */
function pointInCircle(lat, lng, center, radiusMeters) {
  const dist = haversineMeters(lat, lng, center.lat, center.lng);
  return dist <= radiusMeters;
}

/**
 * Check a guest's coordinates against all hotel geofences during an active incident.
 *
 * @param {string} hotelId
 * @param {string} room       — guest room number
 * @param {number} floor      — guest floor
 * @param {{ lat, lng }} coordinates — current GPS position
 * @returns {{ actions: Array<{ type, label, details }> }}
 */
async function checkGeofences(hotelId, room, floor, coordinates) {
  if (!coordinates?.lat || !coordinates?.lng) return { actions: [] };

  const hotel = await Hotel.findById(hotelId).lean();
  if (!hotel?.geofences || hotel.geofences.length === 0) return { actions: [] };

  // Only run geofence checks during active incidents
  const activeIncident = await Incident.findOne({
    hotel_id: hotelId,
    status:   { $in: ["active", "investigating"] },
  }).lean();

  if (!activeIncident) return { actions: [] };

  const { lat, lng } = coordinates;
  const triggeredActions = [];

  for (const fence of hotel.geofences) {
    let isInside = false;

    if (fence.type === "polygon" && fence.coordinates?.length >= 3) {
      isInside = pointInPolygon(lat, lng, fence.coordinates);
    } else if (fence.type === "circle" && fence.center && fence.radius_meters) {
      isInside = pointInCircle(lat, lng, fence.center, fence.radius_meters);
    }

    if (!isInside) continue;

    // Execute the auto-action
    if (fence.auto_action === "mark_safe") {
      await _autoMarkSafe(hotelId, room, floor, activeIncident._id, fence.label);
      triggeredActions.push({ type: "mark_safe", label: fence.label, details: `Guest in ${room} auto-marked safe (entered ${fence.label})` });
    } else if (fence.auto_action === "reroute_alert") {
      await _sendRerouteAlert(hotelId, room, floor, activeIncident, fence.label);
      triggeredActions.push({ type: "reroute_alert", label: fence.label, details: `Reroute alert sent to guest in ${room} (approaching ${fence.label})` });
    } else if (fence.auto_action === "muster_arrival") {
      await _recordMusterArrival(hotelId, room, floor, activeIncident._id, fence.label);
      triggeredActions.push({ type: "muster_arrival", label: fence.label, details: `Guest in ${room} arrived at muster point (${fence.label})` });
    }
  }

  return { actions: triggeredActions };
}

/**
 * Auto-mark a guest as "safe" when they enter a safe-zone geofence.
 */
async function _autoMarkSafe(hotelId, room, floor, incidentId, fenceLabel) {
  const before = "no_response";

  await GuestLocation.findOneAndUpdate(
    { hotel_id: hotelId, room: String(room) },
    { guest_response: "safe", responded_at: new Date() }
  );

  await GuestNotification.findOneAndUpdate(
    { incident_id: incidentId, room: String(room) },
    { guest_response: "safe", responded_at: new Date() }
  );

  emitCrisisEvent(hotelId, "guest:response", {
    room,
    floor,
    response:    "safe",
    incident_id: incidentId,
    auto:        true,
    trigger:     `geofence:${fenceLabel}`,
  });

  logAction({
    actor:        "system",
    actorType:    "system",
    action:       "guest:auto_marked_safe",
    resourceType: "guest_location",
    resourceId:   `${hotelId}:${room}`,
    hotelId,
    incidentId,
    before:       { guest_response: before },
    after:        { guest_response: "safe" },
    details:      `Auto-marked safe via geofence "${fenceLabel}"`,
  });
}

/**
 * Send an immediate reroute alert when a guest approaches a danger zone.
 */
async function _sendRerouteAlert(hotelId, room, floor, incident, fenceLabel) {
  const guest = await GuestLocation.findOne({ hotel_id: hotelId, room: String(room) }).lean();
  if (!guest) return;

  const message = `⚠️ WARNING: You are approaching a danger zone (${fenceLabel}). Turn back immediately and proceed to the nearest exit or muster point.`;

  // Send SMS if phone available
  if (guest.phone) {
    sendSMS({ to: guest.phone, body: message }).catch(() => {});
  }

  emitCrisisEvent(hotelId, "guest:reroute_alert", {
    room,
    floor,
    incident_id: incident._id,
    fence_label: fenceLabel,
    message,
  });

  logAction({
    actor:        "system",
    actorType:    "system",
    action:       "guest:reroute_alert_sent",
    resourceType: "guest_location",
    resourceId:   `${hotelId}:${room}`,
    hotelId,
    incidentId:   incident._id,
    details:      `Reroute alert: guest approaching "${fenceLabel}"`,
  });
}

/**
 * Record when a guest arrives at a muster point.
 */
async function _recordMusterArrival(hotelId, room, floor, incidentId, fenceLabel) {
  await GuestLocation.findOneAndUpdate(
    { hotel_id: hotelId, room: String(room) },
    {
      guest_response:    "safe",
      responded_at:      new Date(),
      muster_arrival_at: new Date(),
      muster_point:      fenceLabel,
    }
  );

  await GuestNotification.findOneAndUpdate(
    { incident_id: incidentId, room: String(room) },
    { guest_response: "safe", responded_at: new Date() }
  );

  emitCrisisEvent(hotelId, "guest:muster_arrival", {
    room,
    floor,
    incident_id:  incidentId,
    muster_point: fenceLabel,
    arrived_at:   new Date(),
  });

  logAction({
    actor:        "system",
    actorType:    "system",
    action:       "guest:muster_arrival",
    resourceType: "guest_location",
    resourceId:   `${hotelId}:${room}`,
    hotelId,
    incidentId,
    details:      `Guest arrived at muster point "${fenceLabel}"`,
  });
}

module.exports = { checkGeofences, pointInPolygon, pointInCircle, haversineMeters };
