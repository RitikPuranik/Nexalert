"use strict";
const express = require("express");
const admin   = require("../../../config/firebase");
const UserProfile = require("../../staff/model/userProfile.model");
const { eventBus, emitCrisisEvent } = require("../../../lib/eventBus");
const { asyncHandler }     = require("../../../lib/asyncHandler");
const { requireAuth, requireRole, requireCronSecret } = require("../../../middleware/auth");
const { buildWarRoom, buildResponderPacket } = require("../service/warroom.service");
const { runCronCheck }     = require("../service/cron.service");

const router = express.Router();

// ── SSE event stream ─────────────────────────────────────────────────────────

/**
 * GET /api/realtime/sse?hotel_id=&role=
 * Opens a persistent SSE connection.
 * Staff/managers must supply a Bearer token.
 * Responders pass role=responder for public read-only access.
 */
router.get("/sse", async (req, res) => {
  const { hotel_id, role, token: queryToken } = req.query;
  if (!hotel_id) return res.status(400).json({ error: "hotel_id required" });

  let userId = "anonymous";

  if (role !== "responder") {
    // Accept token from Authorization header OR from ?token= query param
    // (EventSource API cannot send custom headers, so query param is the workaround)
    const header = req.headers.authorization || "";
    const token  = (header.startsWith("Bearer ") ? header.slice(7) : null) || queryToken;
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      const profile = await UserProfile.findOne({ firebase_uid: decoded.uid }).lean();
      if (!profile) return res.status(403).json({ error: "No user profile" });
      if (String(profile.hotel_id) !== String(hotel_id))
        return res.status(403).json({ error: "Access denied: different hotel" });
      userId = String(profile._id);
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ hotel_id, ts: Date.now() })}\n\n`);

  const unsubscribe = eventBus.subscribe(hotel_id, res, userId);

  // Keepalive every 15 s to prevent proxy / load-balancer timeouts
  const keepalive = setInterval(() => {
    try { res.write(`: keepalive ${Date.now()}\n\n`); }
    catch { clearInterval(keepalive); }
  }, 15_000);

  req.on("close", () => { clearInterval(keepalive); unsubscribe(); });
});

// ── War room ─────────────────────────────────────────────────────────────────

/**
 * GET /api/realtime/warroom?incident_id=
 * Single endpoint returning the full manager dashboard snapshot.
 * Runs 7 parallel DB queries internally.
 */
router.get(
  "/warroom",
  requireAuth,
  requireRole(["manager","responder"]),
  asyncHandler(async (req, res) => {
    const { incident_id } = req.query;
    if (!incident_id) return res.status(400).json({ error: "incident_id required" });
    const data = await buildWarRoom(incident_id, req.user.profile.hotel_id);
    res.json(data);
  })
);

// ── Responder portal (public — no auth) ──────────────────────────────────────

/**
 * GET /api/realtime/responder/portal?incident_id=
 * Fully public. Designed to be shared with fire dept / ambulance crews.
 */
router.get(
  "/responder/portal",
  asyncHandler(async (req, res) => {
    const { incident_id } = req.query;
    if (!incident_id) return res.status(400).json({ error: "incident_id required" });
    const packet = await buildResponderPacket(incident_id);
    res.json(packet);
  })
);

// ── Cron ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/realtime/cron/check
 * Called every 30 s by Vercel Cron (see vercel.json) or UptimeRobot.
 * Auth: x-cron-secret header OR manager JWT.
 */
router.post(
  "/cron/check",
  requireCronSecret,
  asyncHandler(async (req, res) => {
    const summary = await runCronCheck();
    res.json({ ok: true, summary });
  })
);

module.exports = router;
