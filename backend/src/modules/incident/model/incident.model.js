"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const IncidentSchema = new Schema(
  {
    hotel_id: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    type: {
      type: String,
      enum: ["fire","smoke","gas_leak","medical","security","flood","earthquake","sos","unknown"],
      required: true,
    },
    floor:  { type: Number, required: true },
    zone:   String,
    room:   String,
    source: { type: String, enum: ["sensor","guest_sos","staff","manual"], required: true },
    sensor_id:        { type: Schema.Types.ObjectId, ref: "Sensor" },
    sensor_reading:   Number,
    sensor_threshold: Number,
    status: {
      type: String,
      enum: ["detecting","triaging","active","investigating","resolved","false_alarm"],
      default: "detecting",
      index: true,
    },
    is_drill: { type: Boolean, default: false },

    // ── AI triage outputs ──────────────────────────────────────────────────
    severity:        { type: Number, enum: [1, 2, 3] }, // 1=CRITICAL 2=URGENT 3=MONITOR
    severity_reason: String,
    manager_briefing:   String,
    responder_briefing: String,
    recommend_911:        { type: Boolean, default: false },
    recommend_911_reason: String,
    guest_alert_en:        String,
    /** lang code → translated alert text */
    guest_alert_translations: { type: Map, of: String, default: {} },
    evacuation_template: String,
    triage_at:           Date,

    // ── Lifecycle timestamps ───────────────────────────────────────────────
    confirmed_at:         Date,
    resolved_at:          Date,
    escalated_to_911_at:  Date,
    responder_briefing_packet: Schema.Types.Mixed,

    // Denormalised counters (updated as tasks complete)
    tasks_total:     { type: Number, default: 0 },
    tasks_completed: { type: Number, default: 0 },

    // ── AI Correlation fields ────────────────────────────────────────────
    correlated_incidents: [{ type: Schema.Types.ObjectId, ref: "Incident" }],
    correlation_reason:   String,
    is_cascade:           { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Incident", IncidentSchema);
