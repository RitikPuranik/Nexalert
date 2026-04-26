"use strict";
const express = require("express");
const { requireAuth, requireRole } = require("../../../middleware/auth");
const { asyncHandler } = require("../../../lib/asyncHandler");
const svc = require("../service/room.service");

const router = express.Router();

/** GET /api/rooms  — list all rooms (with guest + staff data) */
router.get(
  "/",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    const rooms = await svc.listRooms(req.user.profile.hotel_id, req.query);
    res.json(rooms);
  })
);

/** GET /api/rooms/summary  — availability summary */
router.get(
  "/summary",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    res.json(await svc.getRoomSummary(req.user.profile.hotel_id));
  })
);

/** POST /api/rooms  — create a single room (manager) */
router.post(
  "/",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { room_number, floor, type, status, notes } = req.body;
    if (!room_number || !floor) return res.status(400).json({ error: "room_number and floor required" });
    try {
      const room = await svc.createRoom(req.user.profile.hotel_id, { room_number, floor: parseInt(floor), type, status, notes });
      res.status(201).json(room);
    } catch(err) {
      if (err.code === 11000) return res.status(409).json({ error: "Room already exists" });
      throw err;
    }
  })
);

/** POST /api/rooms/bulk  — bulk create rooms (manager) */
router.post(
  "/bulk",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { rooms } = req.body;
    if (!Array.isArray(rooms) || rooms.length === 0)
      return res.status(400).json({ error: "rooms array required" });
    const created = await svc.bulkCreateRooms(req.user.profile.hotel_id, rooms);
    res.status(201).json({ created: created.length });
  })
);

/** PATCH /api/rooms/:id  — update room (manager) */
router.patch(
  "/:id",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const allowed = ["status","type","notes","assigned_staff_id"];
    const updates = Object.fromEntries(allowed.filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]]));
    res.json(await svc.updateRoom(req.user.profile.hotel_id, req.params.id, updates));
  })
);

/** PATCH /api/rooms/:id/assign  — assign staff to room (manager) */
router.patch(
  "/:id/assign",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    res.json(await svc.assignStaff(req.user.profile.hotel_id, req.params.id, req.body.staff_id));
  })
);

/** DELETE /api/rooms/:id  — delete room (manager) */
router.delete(
  "/:id",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    await svc.deleteRoom(req.user.profile.hotel_id, req.params.id);
    res.json({ ok: true });
  })
);

module.exports = router;
