"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const StaffPresenceSchema = new Schema(
  {
    incident_id: { type: Schema.Types.ObjectId, ref: "Incident", required: true, index: true },
    hotel_id:    { type: Schema.Types.ObjectId, ref: "Hotel",    required: true },
    staff_id:    { type: Schema.Types.ObjectId, ref: "UserProfile", required: true },
    task_id:     { type: Schema.Types.ObjectId, ref: "StaffTask" },
    last_ping_at: { type: Date, default: Date.now },
    /** GPS position sent with each ping */
    coordinates:  { lat: Number, lng: Number, accuracy: Number },
    is_silent:   { type: Boolean, default: false },
    silence_flagged_at: Date,
    status:      { type: String, enum: ["active","resolved"], default: "active" },
  },
  { timestamps: true }
);

StaffPresenceSchema.index({ incident_id: 1, staff_id: 1 }, { unique: true });

module.exports = mongoose.model("StaffPresence", StaffPresenceSchema);
