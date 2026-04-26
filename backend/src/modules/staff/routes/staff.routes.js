"use strict";
const express = require("express");
const { requireAuth, requireRole } = require("../../../middleware/auth");
const { asyncHandler } = require("../../../lib/asyncHandler");
const { emitCrisisEvent } = require("../../../lib/eventBus");
const svc = require("../service/staff.service");

const router = express.Router();

/** PATCH /api/staff/duty  — toggle on/off duty */
router.patch(
  "/duty",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    const { is_on_duty } = req.body;
    if (typeof is_on_duty !== "boolean")
      return res.status(400).json({ error: "is_on_duty (boolean) required" });
    const profile = await svc.setDutyStatus(req.user.profile._id, is_on_duty);
    res.json({ ok: true, is_on_duty: profile.is_on_duty });
  })
);

/** POST /api/staff/presence/ping  — heartbeat + GPS update during incident */
router.post(
  "/presence/ping",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    const { incident_id, coordinates } = req.body;
    if (!incident_id) return res.status(400).json({ error: "incident_id required" });
    const { profile } = req.user;
    await svc.recordPresencePing(profile.hotel_id, profile._id, incident_id, coordinates);
    emitCrisisEvent(profile.hotel_id, "staff:ping", {
      incident_id,
      staff_id:   profile._id,
      staff_name: profile.name,
      coordinates: coordinates || null,
    });
    res.json({ ok: true });
  })
);

/** GET /api/staff/presence  — active presence for an incident */
router.get(
  "/presence",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    if (!req.query.incident_id)
      return res.status(400).json({ error: "incident_id required" });
    res.json(await svc.getPresence(req.query.incident_id));
  })
);

/** GET /api/staff/my-tasks  — pending/active tasks for the authed staff member */
router.get(
  "/my-tasks",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    const { profile } = req.user;
    res.json(await svc.getMyTasks(profile.hotel_id, profile._id, profile.role));
  })
);

/** GET /api/staff/profile  — own profile */
router.get(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(req.user.profile);
  })
);

/** PATCH /api/staff/profile  — update own profile */
router.patch(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await svc.updateProfile(req.user.profile._id, req.body);
    res.json(profile);
  })
);

/** POST /api/staff/register  — manager creates a staff/manager account */
router.post(
  "/register",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { firebase_uid, role } = req.body;
    if (!firebase_uid || !role)
      return res.status(400).json({ error: "firebase_uid and role required" });
    try {
      const profile = await svc.registerStaff(req.user.profile.hotel_id, req.body);
      res.status(201).json(profile);
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: "User already registered" });
      throw err;
    }
  })
);

/** GET /api/staff/team  — all staff for the hotel (manager) */
router.get(
  "/team",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    res.json(await svc.getTeam(req.user.profile.hotel_id));
  })
);

/** GET /api/staff/guest-locations  — real-time guest GPS (staff = own floor, manager = all) */
router.get(
  "/guest-locations",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    const { profile } = req.user;
    const guests = await svc.getGuestLocations(
      profile.hotel_id,
      profile.role,
      profile.floor_assignment,
      req.query.floor
    );
    res.json(guests);
  })
);


/** PATCH /api/staff/:id/duty  — manager toggles duty for any team member */
router.patch(
  "/:id/duty",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { is_on_duty } = req.body;
    if (typeof is_on_duty !== "boolean")
      return res.status(400).json({ error: "is_on_duty (boolean) required" });
    // Verify staff belongs to same hotel
    const UserProfile = require("../model/userProfile.model");
    const target = await UserProfile.findOne({ _id: req.params.id, hotel_id: req.user.profile.hotel_id }).lean();
    if (!target) return res.status(404).json({ error: "Staff not found" });
    const profile = await svc.setDutyStatus(req.params.id, is_on_duty);
    res.json({ ok: true, is_on_duty: profile.is_on_duty });
  })
);

module.exports = router;
