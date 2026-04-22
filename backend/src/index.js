"use strict";
require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const { connectDB } = require("./config/db");

// ── Route modules ────────────────────────────────────────────────────────────
const hotelRoutes    = require("./modules/hotel/routes/hotel.routes");
const sensorRoutes   = require("./modules/sensor/routes/sensor.routes");
const staffRoutes    = require("./modules/staff/routes/staff.routes");
const guestRoutes    = require("./modules/guest/routes/guest.routes");
const incidentRoutes = require("./modules/incident/routes/incident.routes");
const reportRoutes   = require("./modules/report/routes/report.routes");
const realtimeRoutes = require("./modules/realtime/routes/realtime.routes");

const app = express();

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : "*",
  methods: ["GET","POST","PATCH","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","x-sensor-secret","x-cron-secret"],
}));

// ── Body parser (skip for SSE route) ─────────────────────────────────────────
app.use((req, _res, next) => {
  if (req.path === "/api/realtime/sse") return next();
  express.json({ limit: "2mb" })(req, _res, next);
});

// ── DB connection (lazy — re-used across serverless invocations) ──────────────
app.use(async (_req, res, next) => {
  try { await connectDB(); next(); }
  catch (err) { res.status(503).json({ error: "Database unavailable" }); }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "NexAlert API", version: "2.0.0", time: new Date().toISOString() });
});

// ── Module routes ─────────────────────────────────────────────────────────────
app.use("/api/hotels",    hotelRoutes);
app.use("/api/sensors",   sensorRoutes);
app.use("/api/staff",     staffRoutes);
app.use("/api/guests",    guestRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/reports",   reportRoutes);
app.use("/api/realtime",  realtimeRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));

// ── Global error handler (catches asyncHandler rejections) ────────────────────
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  console.error(`[Error] ${status}:`, err.message);
  res.status(status).json({ error: err.message || "Internal server error" });
});

// ── Local dev server ──────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`[Server] NexAlert API on http://localhost:${PORT}`));
}

module.exports = app;
