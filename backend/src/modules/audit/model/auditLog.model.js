"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const AuditLogSchema = new Schema(
  {
    /** Who performed the action */
    actor:      { type: String, required: true },               // user ID, "sensor:<id>", "system", "cron"
    actor_type: { type: String, enum: ["staff", "manager", "sensor", "system", "cron", "guest"], required: true },

    /** What happened */
    action: { type: String, required: true, index: true },      // "incident:created", "task:accepted", "manager:resolve" …

    /** What was affected */
    resource_type: { type: String, required: true, index: true }, // "incident", "task", "guest_response", "sensor_event" …
    resource_id:   { type: String, required: true },

    /** Scope */
    hotel_id:    { type: Schema.Types.ObjectId, ref: "Hotel", index: true },
    incident_id: { type: Schema.Types.ObjectId, ref: "Incident", index: true },

    /** State diff */
    before: Schema.Types.Mixed,  // snapshot before change (null for creates)
    after:  Schema.Types.Mixed,  // snapshot after change

    /** Metadata */
    ip:       String,
    details:  String,            // human-readable description

    /** Tamper-proof hash chain */
    prev_hash: { type: String, default: "GENESIS" },  // SHA-256 of previous entry
    entry_hash: String,                                 // SHA-256 of this entry
  },
  {
    timestamps: true,
    // Prevent updates/deletes at the ODM level
    strict: true,
  }
);

AuditLogSchema.index({ hotel_id: 1, createdAt: -1 });
AuditLogSchema.index({ incident_id: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", AuditLogSchema);
