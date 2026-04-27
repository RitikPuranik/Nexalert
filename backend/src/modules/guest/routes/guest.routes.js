"use strict";
const Hotel = require("../../hotel/model/hotel.model");
const express   = require("express");
const rateLimit = require("express-rate-limit");
const { requireAuth, requireRole } = require("../../../middleware/auth");
const { asyncHandler } = require("../../../lib/asyncHandler");
const guestSvc   = require("../service/guest.service");
const deadmanSvc = require("../service/deadman.service");

const router = express.Router();

const guestRateLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  message: { error: "Too many requests" },
});

// ── Exit routes (public — for guest display) ──────────────────────────────
const ExitRoute = require("../../hotel/model/exitRoute.model");

/** GET /api/guests/exit-routes?hotel_id=&floor= — fetch exit routes for guest */
router.get(
  "/exit-routes",
  guestRateLimit,
  asyncHandler(async (req, res) => {
    const { hotel_id, floor } = req.query;
    if (!hotel_id || !floor) return res.status(400).json({ error: "hotel_id and floor required" });
    const routes = await ExitRoute.find({
      hotel_id,
      floor: parseInt(floor),
      is_active: true,
    }).lean();
    res.json(routes);
  })
);

// ── Guest location (public — no auth) ────────────────────────────────────────

/** POST /api/guests/locations  — check in a guest */
router.post(
  "/locations",
  guestRateLimit,
  asyncHandler(async (req, res) => {
    let { hotel_id, qr_token, room, floor } = req.body;
    if (!room || !floor)
      return res.status(400).json({ error: "room and floor required" });

    // Support check-in via QR token (resolves hotel_id automatically)
    if (!hotel_id && qr_token) {
      const hotel = await Hotel.findOne({ qr_token }).lean();
      if (!hotel) return res.status(404).json({ error: "Invalid QR code" });
      hotel_id = String(hotel._id);
    }
    if (!hotel_id) return res.status(400).json({ error: "hotel_id or qr_token required" });

    // Validate hotel exists
    const hotel = await Hotel.findById(hotel_id).lean();
    if (!hotel) return res.status(404).json({ error: "Hotel not found. Please scan the correct QR code." });

    const doc = await guestSvc.upsertLocation({ ...req.body, hotel_id });
    res.status(201).json({ ...doc, hotel_name: hotel.name });
  })
);

/** PATCH /api/guests/locations/coordinates  — push GPS position (public) */
router.patch(
  "/locations/coordinates",
  guestRateLimit,
  asyncHandler(async (req, res) => {
    const { hotel_id, room, coordinates } = req.body;
    if (!hotel_id || !room || !coordinates)
      return res.status(400).json({ error: "hotel_id, room, coordinates required" });
    const doc = await guestSvc.updateCoordinates(hotel_id, room, coordinates);
    res.json({ ok: true, coordinates: doc.coordinates });
  })
);

/** PATCH /api/guests/locations/respond  — "I'm Safe" / "I Need Help" (public) */
router.patch(
  "/locations/respond",
  guestRateLimit,
  asyncHandler(async (req, res) => {
    const { hotel_id, room, floor, response, incident_id } = req.body;
    if (!hotel_id || !room || !response)
      return res.status(400).json({ error: "hotel_id, room, response required" });
    if (!["safe","needs_help"].includes(response))
      return res.status(400).json({ error: "response must be 'safe' or 'needs_help'" });
    await guestSvc.recordResponse(hotel_id, room, floor, response, incident_id);
    res.json({ ok: true, response });
  })
);

/** PATCH /api/guests/locations/checkout  — staff checks out a guest */
router.patch(
  "/locations/checkout",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    const { room } = req.body;
    if (!room) return res.status(400).json({ error: "room required" });
    await guestSvc.checkoutGuest(req.user.profile.hotel_id, room);
    res.json({ ok: true });
  })
);

/** GET /api/guests/locations  — all checked-in guests (manager/staff) */
router.get(
  "/locations",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    res.json(await guestSvc.listGuests(req.user.profile.hotel_id, req.query.floor));
  })
);

/** GET /api/guests/notifications  — per-guest notification records for an incident */
router.get(
  "/notifications",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    const { incident_id } = req.query;
    if (!incident_id) return res.status(400).json({ error: "incident_id required" });
    res.json(await guestSvc.listNotifications(incident_id));
  })
);

// ── Dead Man's Switch (public — uses session token) ──────────────────────────

/** POST /api/guests/deadman/ping  — guest taps the heartbeat button */
router.post(
  "/deadman/ping",
  guestRateLimit,
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "token required" });
    const result = await deadmanSvc.ping(token);
    res.json(result);
  })
);

/** POST /api/guests/deadman/resolve  — staff marks a session resolved */
router.post(
  "/deadman/resolve",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: "session_id required" });

    // Verify hotel scope BEFORE resolving
    const sessions = await deadmanSvc.listActiveSessions(req.user.profile.hotel_id, null);
    const belongs = sessions.some(s => String(s._id) === String(session_id));
    if (!belongs) return res.status(403).json({ error: "Access denied or session not found" });

    await deadmanSvc.resolveSession(session_id, req.user.profile._id);
    res.json({ ok: true });
  })
);

/** GET /api/guests/deadman/sessions  — active/escalated sessions (manager/staff) */
router.get(
  "/deadman/sessions",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    res.json(
      await deadmanSvc.listActiveSessions(req.user.profile.hotel_id, req.query.incident_id)
    );
  })
);

module.exports = router;
