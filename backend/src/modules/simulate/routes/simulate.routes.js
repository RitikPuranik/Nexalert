"use strict";
const express = require("express");
const { requireAuth, requireRole, requireCronSecret } = require("../../../middleware/auth");
const { asyncHandler } = require("../../../lib/asyncHandler");
const { runCascadingFailure, runSingleDrill } = require("../service/simulate.service");
const { deepHealthCheck } = require("../service/healthDeep.service");

const router = express.Router();

// ── Cascading failure simulation ─────────────────────────────────────────────

/**
 * POST /api/simulate/cascading-failure
 * Triggers a full cascading crisis scenario for demo.
 * Auth: cron secret or manager JWT. Non-production only.
 */
router.post(
  "/cascading-failure",
  requireCronSecret,
  asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV === "production" && !req.query.force) {
      return res.status(403).json({ error: "Simulations disabled in production. Use ?force=true to override." });
    }

    const { hotel_id } = req.body;
    if (!hotel_id) return res.status(400).json({ error: "hotel_id required" });

    // Run simulation (takes ~10-15 seconds due to staggered sensor events)
    const result = await runCascadingFailure(hotel_id);
    res.json({ ok: true, simulation: result });
  })
);

// ── Single drill ─────────────────────────────────────────────────────────────

/**
 * POST /api/simulate/single-drill
 * Fire a single sensor breach for quick testing.
 * Auth: manager JWT.
 */
router.post(
  "/single-drill",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { floor, type } = req.body;
    if (!floor) return res.status(400).json({ error: "floor required" });

    const result = await runSingleDrill(req.user.profile.hotel_id, parseInt(floor), type || "fire");
    res.json({ ok: true, result });
  })
);

// ── Deep health check ────────────────────────────────────────────────────────

/**
 * GET /api/system/health/deep
 * Comprehensive system health report.
 * Auth: cron secret or manager JWT.
 */
router.get(
  "/health/deep",
  requireCronSecret,
  asyncHandler(async (_req, res) => {
    const report = await deepHealthCheck();
    const statusCode = report.status === "healthy" ? 200 : 503;
    res.status(statusCode).json(report);
  })
);

module.exports = router;
