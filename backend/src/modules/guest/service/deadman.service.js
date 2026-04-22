"use strict";
const DeadmanSession = require("../model/deadmanSession.model");
const { emitCrisisEvent } = require("../../../lib/eventBus");
const { generateToken } = require("../../../lib/tokens");

// ── Session lifecycle ────────────────────────────────────────────────────────

async function createSession(incidentId, hotelId, guestLocationId, room, floor) {
  return DeadmanSession.create({
    incident_id:       incidentId,
    hotel_id:          hotelId,
    guest_location_id: guestLocationId,
    room,
    floor,
    token:            generateToken(),
    status:           "active",
    interval_seconds: 120,
    escalate_after:   2,
    missed_pings:     0,
    last_ping_at:     new Date(),
  });
}

async function ping(token) {
  const session = await DeadmanSession.findOne({ token, status: "active" });
  if (!session) throw Object.assign(new Error("Session not found or already resolved"), { status: 404 });

  session.missed_pings = 0;
  session.last_ping_at = new Date();
  await session.save();

  emitCrisisEvent(session.hotel_id, "deadman:ping", {
    session_id: session._id,
    room:       session.room,
    floor:      session.floor,
  });

  return { ok: true, next_ping_in: session.interval_seconds };
}

async function resolveSession(sessionId, resolvedBy) {
  const session = await DeadmanSession.findById(sessionId);
  if (!session) throw Object.assign(new Error("Session not found"), { status: 404 });

  session.status      = "resolved";
  session.resolved_at = new Date();
  session.resolved_by = resolvedBy;
  await session.save();

  emitCrisisEvent(session.hotel_id, "deadman:resolved", {
    session_id:  session._id,
    room:        session.room,
    floor:       session.floor,
    resolved_by: resolvedBy,
  });

  return session;
}

async function listActiveSessions(hotelId, incidentId) {
  const filter = { hotel_id: hotelId, status: { $in: ["active","escalated"] } };
  if (incidentId) filter.incident_id = incidentId;
  return DeadmanSession.find(filter).lean();
}

async function expireSessionsForIncident(incidentId) {
  return DeadmanSession.updateMany(
    { incident_id: incidentId, status: { $in: ["active","escalated"] } },
    { status: "expired" }
  );
}

// ── Cron: check session staleness ────────────────────────────────────────────

async function checkSessions(hotelId) {
  const sessions = await DeadmanSession.find({ hotel_id: hotelId, status: "active" }).lean();
  const escalated = [];

  for (const session of sessions) {
    const elapsed = (Date.now() - new Date(session.last_ping_at).getTime()) / 1000;
    const intervalsPassed = Math.floor(elapsed / session.interval_seconds);

    if (intervalsPassed >= session.escalate_after) {
      await DeadmanSession.findByIdAndUpdate(session._id, {
        status:       "escalated",
        missed_pings:  intervalsPassed,
        escalated_at:  new Date(),
      });
      emitCrisisEvent(hotelId, "deadman:escalated", {
        session_id:   session._id,
        incident_id:  session.incident_id,
        room:         session.room,
        floor:        session.floor,
        missed_pings: intervalsPassed,
      });
      escalated.push(session._id);
    } else if (intervalsPassed > 0) {
      await DeadmanSession.findByIdAndUpdate(session._id, { missed_pings: intervalsPassed });
    }
  }

  return { checked: sessions.length, escalated: escalated.length };
}

module.exports = {
  createSession,
  ping,
  resolveSession,
  listActiveSessions,
  expireSessionsForIncident,
  checkSessions,
};
