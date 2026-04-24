"use strict";
const admin = require("../config/firebase");
const UserProfile = require("../modules/staff/model/userProfile.model");

/**
 * Verify Firebase JWT → attach req.user = { uid, profile }
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing auth token" });

  // ── Demo bypass (non-production only) ──────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const demoMap = {
      DEMO_MANAGER_TOKEN: "DEMO_MANAGER_UID",
      DEMO_STAFF_1_TOKEN: "DEMO_STAFF_1",
      DEMO_STAFF_2_TOKEN: "DEMO_STAFF_2",
      DEMO_STAFF_3_TOKEN: "DEMO_STAFF_3",
    };
    const demoUid = demoMap[token];
    if (demoUid) {
      const profile = await UserProfile.findOne({ firebase_uid: demoUid }).lean();
      if (profile) {
        req.user = { uid: demoUid, profile };
        return next();
      }
      return res.status(403).json({ error: "Demo profile not found. Run POST /api/demo/seed first." });
    }
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const profile = await UserProfile.findOne({ firebase_uid: decoded.uid }).lean();
    if (!profile) return res.status(403).json({ error: "No user profile found" });
    req.user = { uid: decoded.uid, profile };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token", detail: err.message });
  }
}

/**
 * Role guard — use after requireAuth.
 * requireRole("manager") or requireRole(["manager","staff"])
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!allowed.includes(req.user.profile.role))
      return res.status(403).json({ error: `Role '${req.user.profile.role}' not permitted` });
    next();
  };
}

/**
 * Hotel scope guard — user must belong to the hotel they're acting on.
 * Reads hotel_id from req.params, req.query, or req.body.
 */
function requireSameHotel(req, res, next) {
  const target = req.params.hotel_id || req.query.hotel_id || req.body?.hotel_id;
  if (!target) return next();
  if (String(req.user.profile.hotel_id) !== String(target))
    return res.status(403).json({ error: "Access denied: different hotel" });
  next();
}

/**
 * Sensor secret — validates x-sensor-secret header.
 */
function requireSensorSecret(req, res, next) {
  const secret = req.headers["x-sensor-secret"];
  if (!secret || secret !== process.env.SENSOR_SECRET)
    return res.status(401).json({ error: "Invalid sensor secret" });
  next();
}

/**
 * Cron secret — accepts x-cron-secret OR a valid manager JWT.
 */
async function requireCronSecret(req, res, next) {
  const cronSecret = req.headers["x-cron-secret"];
  if (cronSecret && cronSecret === process.env.CRON_SECRET) {
    req.isCron = true;
    return next();
  }
  // Fallback: manager JWT
  await requireAuth(req, res, () => {
    if (req.user?.profile?.role !== "manager")
      return res.status(403).json({ error: "Cron or manager access required" });
    next();
  });
}

module.exports = {
  requireAuth,
  requireRole,
  requireSameHotel,
  requireSensorSecret,
  requireCronSecret,
};
