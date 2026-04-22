"use strict";
const express   = require("express");
const rateLimit = require("express-rate-limit");
const { requireAuth, requireRole, requireSensorSecret } = require("../../../middleware/auth");
const { asyncHandler } = require("../../../lib/asyncHandler");
const svc = require("../service/sensor.service");

const router = express.Router();

// 60 events / min per sensor (keyed by sensor_id in body)
const sensorRateLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyGenerator: (req) => req.body?.sensor_id || req.ip,
  message: { error: "Rate limit exceeded for this sensor" },
});

/**
 * POST /api/sensors/event
 * ESP32 sends every reading here. Authenticated via x-sensor-secret header.
 */
router.post(
  "/event",
  requireSensorSecret,
  sensorRateLimit,
  asyncHandler(async (req, res) => {
    const { sensor_id, value, threshold } = req.body;
    if (!sensor_id || value === undefined || threshold === undefined)
      return res.status(400).json({ error: "sensor_id, value, and threshold required" });

    const result = await svc.processSensorEvent(sensor_id, value, threshold);
    res.status(result.status === "incident_created" ? 201 : 200).json(result);
  })
);

/** GET /api/sensors  — list hotel sensors (manager/staff) */
router.get(
  "/",
  requireAuth,
  requireRole(["manager","staff"]),
  asyncHandler(async (req, res) => {
    res.json(await svc.listSensors(req.user.profile.hotel_id));
  })
);

/** POST /api/sensors  — register new sensor (manager) */
router.post(
  "/",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { sensor_id, type, floor, threshold } = req.body;
    if (!sensor_id || !type || !floor || threshold === undefined)
      return res.status(400).json({ error: "sensor_id, type, floor, threshold required" });
    try {
      const sensor = await svc.registerSensor(req.user.profile.hotel_id, req.body);
      res.status(201).json(sensor);
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: "Sensor ID already exists" });
      throw err;
    }
  })
);

/** PATCH /api/sensors/:id  — update sensor (manager) */
router.patch(
  "/:id",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    // Verify the sensor belongs to this manager's hotel before updating
    const existing = await svc.getSensorById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Sensor not found" });
    if (String(existing.hotel_id) !== String(req.user.profile.hotel_id))
      return res.status(403).json({ error: "Access denied" });

    const sensor = await svc.updateSensor(req.params.id, req.body);
    res.json(sensor);
  })
);

/** GET /api/sensors/events  — recent sensor events (manager) */
router.get(
  "/events",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    res.json(await svc.recentEvents(req.user.profile.hotel_id, parseInt(req.query.limit) || 100));
  })
);

module.exports = router;
