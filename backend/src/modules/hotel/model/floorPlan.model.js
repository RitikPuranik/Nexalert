"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const FloorPlanSchema = new Schema(
  {
    hotel_id: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    floor: { type: Number, required: true },
    svg_url: String,
    aed_locations: [{ label: String, coordinates: { lat: Number, lng: Number } }],
    hazard_zones: [{ label: String, type: String, coordinates: { lat: Number, lng: Number } }],
    /** Room label → coordinates mapping for the live map */
    rooms: [{ room: String, coordinates: { lat: Number, lng: Number } }],
  },
  { timestamps: true }
);

FloorPlanSchema.index({ hotel_id: 1, floor: 1 }, { unique: true });

module.exports = mongoose.model("FloorPlan", FloorPlanSchema);
