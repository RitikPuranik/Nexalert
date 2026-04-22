"use strict";
const mongoose     = require("mongoose");
const Incident     = require("../../incident/model/incident.model");
const { eventBus } = require("../../../lib/eventBus");
const { getConnectionCount } = require("../../../lib/socketManager");

/**
 * Deep health check — reports system-wide status.
 * Useful for monitoring, dashboards, and demo.
 *
 * @returns {Object} comprehensive health report
 */
async function deepHealthCheck() {
  const start = Date.now();
  const checks = {};

  // ── 1. MongoDB latency ───────────────────────────────────────────────────
  try {
    const dbStart = Date.now();
    await mongoose.connection.db.admin().ping();
    checks.mongodb = {
      status:     "ok",
      latency_ms: Date.now() - dbStart,
      state:      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    };
  } catch (err) {
    checks.mongodb = { status: "error", error: err.message };
  }

  // ── 2. Gemini API status ─────────────────────────────────────────────────
  try {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const aiStart = Date.now();
    const result  = await model.generateContent("Reply with exactly: OK");
    const text    = result.response.text().trim();

    checks.gemini = {
      status:     text.includes("OK") ? "ok" : "degraded",
      latency_ms: Date.now() - aiStart,
      response:   text.slice(0, 50),
    };
  } catch (err) {
    checks.gemini = {
      status:  process.env.GEMINI_API_KEY ? "error" : "unconfigured",
      error:   err.message,
    };
  }

  // ── 3. Twilio status ─────────────────────────────────────────────────────
  try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const Twilio = require("twilio");
      const client = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
      checks.twilio = {
        status:       "ok",
        account_name: account.friendlyName,
        account_status: account.status,
      };
    } else {
      checks.twilio = { status: "unconfigured" };
    }
  } catch (err) {
    checks.twilio = { status: "error", error: err.message };
  }

  // ── 4. SSE connections ───────────────────────────────────────────────────
  let totalSSE = 0;
  if (eventBus._listeners) {
    for (const [, listeners] of eventBus._listeners) {
      totalSSE += listeners.size;
    }
  }
  checks.sse = {
    status:       "ok",
    connections:  totalSSE,
    hotels_streaming: eventBus._listeners?.size ?? 0,
  };

  // ── 5. Socket.IO connections ─────────────────────────────────────────────
  checks.socketio = {
    status:      "ok",
    connections: getConnectionCount(),
  };

  // ── 6. Process memory ────────────────────────────────────────────────────
  const mem = process.memoryUsage();
  checks.memory = {
    status:         "ok",
    rss_mb:         Math.round(mem.rss / 1024 / 1024),
    heap_used_mb:   Math.round(mem.heapUsed / 1024 / 1024),
    heap_total_mb:  Math.round(mem.heapTotal / 1024 / 1024),
    external_mb:    Math.round(mem.external / 1024 / 1024),
  };

  // ── 7. Active incidents ──────────────────────────────────────────────────
  try {
    const [active, total] = await Promise.all([
      Incident.countDocuments({ status: { $in: ["detecting", "triaging", "active", "investigating"] } }),
      Incident.countDocuments(),
    ]);
    checks.incidents = {
      status: "ok",
      active,
      total,
    };
  } catch (err) {
    checks.incidents = { status: "error", error: err.message };
  }

  // ── 8. Uptime ───────────────────────────────────────────────────────────
  checks.uptime = {
    status:          "ok",
    process_seconds: Math.round(process.uptime()),
    node_version:    process.version,
    platform:        process.platform,
  };

  // ── Overall status ──────────────────────────────────────────────────────
  const allOk = Object.values(checks).every(
    (c) => c.status === "ok" || c.status === "unconfigured"
  );

  return {
    status:       allOk ? "healthy" : "degraded",
    service:      "NexAlert API",
    version:      "3.0.0",
    check_duration_ms: Date.now() - start,
    checks,
    timestamp:    new Date().toISOString(),
  };
}

module.exports = { deepHealthCheck };
