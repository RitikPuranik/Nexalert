"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const DeadmanSessionSchema = new Schema(
  {
    incident_id:       { type: Schema.Types.ObjectId, ref: "Incident",      required: true, index: true },
    hotel_id:          { type: Schema.Types.ObjectId, ref: "Hotel",         required: true },
    guest_location_id: { type: Schema.Types.ObjectId, ref: "GuestLocation", required: true },
    room:              String,
    floor:             Number,
    token:             { type: String, required: true, unique: true, index: true },
    status:            { type: String, enum: ["active","escalated","resolved","expired"], default: "active", index: true },
    interval_seconds:  { type: Number, default: 120 },
    escalate_after:    { type: Number, default: 2 },   // missed intervals before escalation
    missed_pings:      { type: Number, default: 0 },
    last_ping_at:      { type: Date,   default: Date.now },
    escalated_at:      Date,
    resolved_at:       Date,
    resolved_by:       { type: Schema.Types.ObjectId, ref: "UserProfile" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DeadmanSession", DeadmanSessionSchema);
