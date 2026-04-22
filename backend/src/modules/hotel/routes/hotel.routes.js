"use strict";
const express = require("express");
const { requireAuth, requireRole } = require("../../../middleware/auth");
const { asyncHandler } = require("../../../lib/asyncHandler");
const svc = require("../service/hotel.service");

const router = express.Router();

// ── Hotel ────────────────────────────────────────────────────────────────────

/** POST /api/hotels  — create hotel */
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, total_floors, address, access_codes, emergency_contacts, muster_points, timezone } = req.body;
    if (!name || !total_floors) return res.status(400).json({ error: "name and total_floors required" });
    const hotel = await svc.createHotel({ name, total_floors, address, access_codes, emergency_contacts, muster_points, timezone });
    res.status(201).json(hotel);
  })
);

/** GET /api/hotels/me  — own hotel */
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const hotel = await svc.getHotelById(req.user.profile.hotel_id);
    if (!hotel) return res.status(404).json({ error: "Hotel not found" });
    res.json(hotel);
  })
);

/** PATCH /api/hotels/me  — update hotel (manager) */
router.patch(
  "/me",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const allowed = ["name","address","total_floors","access_codes","emergency_contacts","muster_points","timezone","twilio_from_number"];
    const updates = Object.fromEntries(allowed.filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]]));
    const hotel = await svc.updateHotel(req.user.profile.hotel_id, updates);
    res.json(hotel);
  })
);

// ── Exit Routes ──────────────────────────────────────────────────────────────

/** GET /api/hotels/exit-routes  — list exit routes */
router.get(
  "/exit-routes",
  requireAuth,
  asyncHandler(async (req, res) => {
    const routes = await svc.getExitRoutes(req.user.profile.hotel_id, req.query.floor);
    res.json(routes);
  })
);

/** POST /api/hotels/exit-routes  — add exit route (manager) */
router.post(
  "/exit-routes",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { floor, label } = req.body;
    if (!floor || !label) return res.status(400).json({ error: "floor and label required" });
    const route = await svc.createExitRoute(req.user.profile.hotel_id, req.body);
    res.status(201).json(route);
  })
);

/** PATCH /api/hotels/exit-routes/:id  — update exit route (manager) */
router.patch(
  "/exit-routes/:id",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    // Verify hotel scope before updating
    const existing = await svc.getExitRouteById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Exit route not found" });
    if (String(existing.hotel_id) !== String(req.user.profile.hotel_id))
      return res.status(403).json({ error: "Access denied" });

    const route = await svc.updateExitRoute(req.params.id, req.body);
    res.json(route);
  })
);

/** DELETE /api/hotels/exit-routes/:id  — delete exit route (manager) */
router.delete(
  "/exit-routes/:id",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    // Verify hotel scope before deleting
    const existing = await svc.getExitRouteById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Exit route not found" });
    if (String(existing.hotel_id) !== String(req.user.profile.hotel_id))
      return res.status(403).json({ error: "Access denied" });

    await svc.deleteExitRoute(req.params.id);
    res.json({ ok: true });
  })
);

// ── Floor Plans ──────────────────────────────────────────────────────────────

/** GET /api/hotels/floor-plans/:floor */
router.get(
  "/floor-plans/:floor",
  requireAuth,
  asyncHandler(async (req, res) => {
    const plan = await svc.getFloorPlan(req.user.profile.hotel_id, req.params.floor);
    if (!plan) return res.status(404).json({ error: "Floor plan not found" });
    res.json(plan);
  })
);

/** POST /api/hotels/floor-plans  — upsert floor plan (manager) */
router.post(
  "/floor-plans",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { floor, ...data } = req.body;
    if (!floor) return res.status(400).json({ error: "floor required" });
    const plan = await svc.upsertFloorPlan(req.user.profile.hotel_id, floor, data);
    res.status(201).json(plan);
  })
);

// ── Geofences ────────────────────────────────────────────────────────────────

/** GET /api/hotels/geofences  — list geofences (any auth) */
router.get(
  "/geofences",
  requireAuth,
  asyncHandler(async (req, res) => {
    const hotel = await svc.getHotelById(req.user.profile.hotel_id);
    if (!hotel) return res.status(404).json({ error: "Hotel not found" });
    res.json(hotel.geofences || []);
  })
);

/** POST /api/hotels/geofences  — add geofence (manager) */
router.post(
  "/geofences",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { label, type, auto_action } = req.body;
    if (!label || !type || !auto_action)
      return res.status(400).json({ error: "label, type, and auto_action required" });
    const hotel = await svc.addGeofence(req.user.profile.hotel_id, req.body);
    res.status(201).json(hotel.geofences);
  })
);

/** DELETE /api/hotels/geofences/:id  — remove geofence (manager) */
router.delete(
  "/geofences/:id",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const hotel = await svc.removeGeofence(req.user.profile.hotel_id, req.params.id);
    res.json(hotel.geofences);
  })
);

module.exports = router;
