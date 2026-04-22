"use strict";
const express = require("express");
const { requireAuth, requireRole } = require("../../../middleware/auth");
const { asyncHandler } = require("../../../lib/asyncHandler");
const svc = require("../service/report.service");

const router = express.Router();

/** POST /api/reports  — generate (or return cached) post-incident report */
router.post(
  "/",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { incident_id } = req.body;
    if (!incident_id) return res.status(400).json({ error: "incident_id required" });
    const report = await svc.generateReport(incident_id, req.user.profile.hotel_id);
    res.status(201).json(report);
  })
);

/** GET /api/reports  — list all reports for hotel */
router.get(
  "/",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    res.json(await svc.listReports(req.user.profile.hotel_id));
  })
);

/** GET /api/reports/drills/score?incident_id=  — drill evaluation score */
router.get(
  "/drills/score",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { incident_id } = req.query;
    if (!incident_id) return res.status(400).json({ error: "incident_id required" });
    res.json(await svc.getDrillScore(incident_id, req.user.profile.hotel_id));
  })
);

/** GET /api/reports/:id  — single report */
router.get(
  "/:id",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    res.json(await svc.getReport(req.params.id, req.user.profile.hotel_id));
  })
);

module.exports = router;
