"use strict";
const Hotel = require("../model/hotel.model");
const ExitRoute = require("../model/exitRoute.model");
const FloorPlan = require("../model/floorPlan.model");

// ── Hotel CRUD ──────────────────────────────────────────────────────────────

async function createHotel(data) {
  return Hotel.create(data);
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
  return FloorPlan.findOneAndUpdate(
    { hotel_id: hotelId, floor: Number(floor) },
    { hotel_id: hotelId, floor: Number(floor), ...data },
    { upsert: true, new: true }
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
};
