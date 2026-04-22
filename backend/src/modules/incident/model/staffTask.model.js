"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const StaffTaskSchema = new Schema(
  {
    incident_id:  { type: Schema.Types.ObjectId, ref: "Incident",    required: true, index: true },
    hotel_id:     { type: Schema.Types.ObjectId, ref: "Hotel",       required: true, index: true },
    assigned_role: { type: String, required: true }, // "security" | "housekeeping" | "medical" | ...
    assigned_to:   { type: Schema.Types.ObjectId, ref: "UserProfile" }, // set on accept
    title:        String,
    description:  String,
    priority:     { type: Number, min: 1, max: 10 },
    status: {
      type: String,
      enum: ["pending","accepted","in_progress","completed","skipped"],
      default: "pending",
    },
    accepted_at:   Date,
    started_at:    Date,
    completed_at:  Date,
    notes:         String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("StaffTask", StaffTaskSchema);
