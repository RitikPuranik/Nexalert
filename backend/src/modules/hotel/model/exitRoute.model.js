"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const ExitRouteSchema = new Schema(
  {
    hotel_id: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    floor: { type: Number, required: true, index: true },
    label: { type: String, required: true },       // e.g. "Stairwell A"
    description: String,
    is_accessible: { type: Boolean, default: false },
    muster_point: String,
    muster_coordinates: { lat: Number, lng: Number },
    /** Zones this route does NOT pass through — used for safe-route selection */
    avoids_zones: [String],
    /** GPS waypoints for the guest's on-screen route */
    path_coordinates: [{ lat: Number, lng: Number }],
    estimated_time_seconds: Number,
    is_active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ExitRoute", ExitRouteSchema);
