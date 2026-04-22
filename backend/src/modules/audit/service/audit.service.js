"use strict";
const crypto   = require("crypto");
const AuditLog = require("../model/auditLog.model");

/**
 * Compute SHA-256 hash of an audit entry's key fields.
 */
function computeHash(entry) {
  const payload = JSON.stringify({
    actor:      entry.actor,
    action:     entry.action,
    resource_type: entry.resource_type,
    resource_id:   entry.resource_id,
    hotel_id:      entry.hotel_id,
    incident_id:   entry.incident_id,
    before:        entry.before,
    after:         entry.after,
    prev_hash:     entry.prev_hash,
    ts:            entry.createdAt || new Date().toISOString(),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Append an audit log entry with hash chain linking.
 *
 * @param {Object} params
 * @param {string} params.actor       — user ID, "sensor:<id>", "system", "cron"
 * @param {string} params.actorType   — "staff"|"manager"|"sensor"|"system"|"cron"|"guest"
 * @param {string} params.action      — e.g. "incident:created"
 * @param {string} params.resourceType — e.g. "incident"
 * @param {string} params.resourceId
 * @param {string} [params.hotelId]
 * @param {string} [params.incidentId]
 * @param {*}      [params.before]    — state before change
 * @param {*}      [params.after]     — state after change
 * @param {string} [params.ip]
 * @param {string} [params.details]   — human-readable note
 */
async function logAction({
  actor, actorType, action, resourceType, resourceId,
  hotelId, incidentId, before, after, ip, details,
}) {
  try {
    // Get the hash of the most recent entry for this hotel (or globally)
    const lastEntry = await AuditLog.findOne(
      hotelId ? { hotel_id: hotelId } : {}
    ).sort({ createdAt: -1 }).select("entry_hash").lean();

    const prevHash = lastEntry?.entry_hash || "GENESIS";

    const doc = {
      actor,
      actor_type:    actorType,
      action,
      resource_type: resourceType,
      resource_id:   String(resourceId),
      hotel_id:      hotelId || undefined,
      incident_id:   incidentId || undefined,
      before:        before || null,
      after:         after || null,
      ip:            ip || null,
      details:       details || null,
      prev_hash:     prevHash,
    };

    doc.entry_hash = computeHash(doc);

    await AuditLog.create(doc);
  } catch (err) {
    // Audit logging must NEVER block the calling operation
    console.error("[Audit] Failed to log action:", err.message);
  }
}

/**
 * Query the audit trail with pagination and filters.
 */
async function getAuditTrail({ hotelId, incidentId, resourceType, actor, action, page = 1, limit = 50 }) {
  const filter = {};
  if (hotelId)      filter.hotel_id      = hotelId;
  if (incidentId)   filter.incident_id   = incidentId;
  if (resourceType) filter.resource_type = resourceType;
  if (actor)        filter.actor         = actor;
  if (action)       filter.action        = action;

  const skip = (Math.max(1, page) - 1) * Math.min(limit, 200);

  const [entries, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(limit, 200))
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    entries,
    pagination: {
      page: Math.max(1, page),
      limit: Math.min(limit, 200),
      total,
      pages: Math.ceil(total / Math.min(limit, 200)),
    },
  };
}

/**
 * Verify the hash chain integrity for a hotel.
 * Walks every entry in chronological order and re-computes hashes.
 * Returns { valid, total, broken_at? }
 */
async function verifyChain(hotelId) {
  const entries = await AuditLog.find(hotelId ? { hotel_id: hotelId } : {})
    .sort({ createdAt: 1 })
    .lean();

  if (entries.length === 0) return { valid: true, total: 0 };

  let prevHash = "GENESIS";
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // The entry's prev_hash should match the previous entry's entry_hash
    if (entry.prev_hash !== prevHash) {
      return {
        valid: false,
        total: entries.length,
        broken_at: { index: i, entry_id: entry._id, expected_prev: prevHash, actual_prev: entry.prev_hash },
      };
    }

    // Recompute the entry hash to check it wasn't tampered with
    const recomputed = computeHash(entry);
    if (entry.entry_hash !== recomputed) {
      return {
        valid: false,
        total: entries.length,
        broken_at: { index: i, entry_id: entry._id, reason: "entry_hash mismatch — record may have been tampered" },
      };
    }

    prevHash = entry.entry_hash;
  }

  return { valid: true, total: entries.length };
}

module.exports = { logAction, getAuditTrail, verifyChain };
