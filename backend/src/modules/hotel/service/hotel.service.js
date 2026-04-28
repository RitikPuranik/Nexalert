"use strict";
const Hotel = require("../model/hotel.model");
const ExitRoute = require("../model/exitRoute.model");
const FloorPlan = require("../model/floorPlan.model");
const { createDefaultPolicies } = require("../../incident/service/escalation.service");

// ── Hotel CRUD ──────────────────────────────────────────────────────────────

async function createHotel(data) {
  const hotel = await Hotel.create(data);

  // Create default escalation policies for the new hotel
  createDefaultPolicies(hotel._id).catch((err) =>
    console.error("[Hotel] Failed to create default escalation policies:", err.message)
  );

  return hotel;
}

async function getHotelById(id) {
  return Hotel.findById(id).lean();
}

async function updateHotel(id, updates) {
  return Hotel.findByIdAndUpdate(id, updates, { new: true }).lean();
}

// ── Exit Routes ─────────────────────────────────────────────────────────────

async function getExitRoutes(hotelId, floor) {
  const filter = { hotel_id: hotelId, is_active: true };
  if (floor != null) filter.floor = Number(floor);
  return ExitRoute.find(filter).lean();
}

async function getExitRouteById(id) {
  return ExitRoute.findById(id).lean();
}

async function createExitRoute(hotelId, data) {
  return ExitRoute.create({ hotel_id: hotelId, ...data });
}

async function updateExitRoute(id, updates) {
  return ExitRoute.findByIdAndUpdate(id, updates, { new: true }).lean();
}

async function deleteExitRoute(id) {
  return ExitRoute.findByIdAndDelete(id);
}

// ── Floor Plans ─────────────────────────────────────────────────────────────

async function getFloorPlan(hotelId, floor) {
  return FloorPlan.findOne({ hotel_id: hotelId, floor: Number(floor) }).lean();
}

async function upsertFloorPlan(hotelId, floor, data) {
  const { grid_cells, ...rest } = data;
  const setFields = { hotel_id: hotelId, floor: Number(floor), ...rest };
  if (grid_cells !== undefined) setFields.grid_cells = grid_cells;

  // Use findOneAndUpdate with $set so Mongoose detects changes on Mixed fields
  const doc = await FloorPlan.findOneAndUpdate(
    { hotel_id: hotelId, floor: Number(floor) },
    { $set: setFields },
    { upsert: true, new: true }
  );
  if (grid_cells !== undefined) {
    doc.markModified('grid_cells');
    await doc.save();
  }
  return doc.toObject();
}

// ── Geofences ─────────────────────────────────────────────────────────────────────

async function addGeofence(hotelId, geofenceData) {
  return Hotel.findByIdAndUpdate(
    hotelId,
    { $push: { geofences: geofenceData } },
    { new: true }
  ).lean();
}

async function removeGeofence(hotelId, geofenceId) {
  return Hotel.findByIdAndUpdate(
    hotelId,
    { $pull: { geofences: { _id: geofenceId } } },
    { new: true }
  ).lean();
}

module.exports = {
  createHotel,
  getHotelById,
  updateHotel,
  getExitRoutes,
  getExitRouteById,
  createExitRoute,
  updateExitRoute,
  deleteExitRoute,
  getFloorPlan,
  upsertFloorPlan,
  addGeofence,
  removeGeofence,
  generateQrToken,
  getHotelByQrToken,
};

// ── QR Token ─────────────────────────────────────────────────────────────────
const crypto = require("crypto");

async function generateQrToken(hotelId) {
  const token = crypto.randomBytes(16).toString("hex");
  const hotel = await Hotel.findByIdAndUpdate(
    hotelId,
    { qr_token: token },
    { new: true }
  ).lean();
  if (!hotel) throw Object.assign(new Error("Hotel not found"), { status: 404 });
  return { qr_token: token };
}

async function getHotelByQrToken(token) {
  return Hotel.findOne({ qr_token: token }).lean();
}


