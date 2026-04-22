"use strict";
const express = require("express");
const { requireAuth, requireRole } = require("../../../middleware/auth");
const { asyncHandler } = require("../../../lib/asyncHandler");
const { getAuditTrail, verifyChain } = require("../service/audit.service");

const router = express.Router();

/**
 * GET /api/audit
 * Paginated audit trail. Manager only.
 * Query params: hotel_id, incident_id, resource_type, actor, action, page, limit
 */
router.get(
  "/",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const { incident_id, resource_type, actor, action, page, limit } = req.query;
    const result = await getAuditTrail({
      hotelId:      req.user.profile.hotel_id,
      incidentId:   incident_id,
      resourceType: resource_type,
      actor,
      action,
      page:  parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });
    res.json(result);
  })
);

/**
 * GET /api/audit/verify
 * Verify hash chain integrity. Manager only.
 */
router.get(
  "/verify",
  requireAuth,
  requireRole("manager"),
  asyncHandler(async (req, res) => {
    const result = await verifyChain(req.user.profile.hotel_id);
    res.json(result);
  })
);

module.exports = router;
