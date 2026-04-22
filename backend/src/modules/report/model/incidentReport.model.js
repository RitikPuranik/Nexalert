"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const IncidentReportSchema = new Schema(
  {
    incident_id: { type: Schema.Types.ObjectId, ref: "Incident", required: true, unique: true },
    hotel_id:    { type: Schema.Types.ObjectId, ref: "Hotel",    required: true, index: true },
    is_drill:    { type: Boolean, default: false },
    timeline: [
      {
        elapsed_seconds: Number,
        event:           String,
        detail:          String,
        timestamp:       Date,
      },
    ],
    metrics: {
      triage_time_seconds:       Number,
      resolution_time_seconds:   Number,
      task_completion_rate:      Number,
      notification_delivery_rate: Number,
      guest_accountability_rate: Number,
      guests_confirmed_safe:     Number,
      guests_needed_help:        Number,
      guests_no_response:        Number,
    },
    executive_summary: String,
    recommendations:   [String],
    drill_score: {
      overall:                  Number,
      staff_response_score:     Number,
      task_completion_score:    Number,
      guest_accountability_score: Number,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("IncidentReport", IncidentReportSchema);
