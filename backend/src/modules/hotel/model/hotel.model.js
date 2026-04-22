"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const HotelSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    total_floors: { type: Number, required: true, min: 1 },
    /** floor label → access code, e.g. { "3": "A123", "roof": "R999" } */
    access_codes: { type: Map, of: String, default: {} },
    emergency_contacts: [
      {
        role: String,   // "fire_dept" | "ambulance" | "police"
        name: String,
        phone: String,
      },
    ],
    muster_points: [
      {
        label: String,
        description: String,
        coordinates: { lat: Number, lng: Number },
      },
    ],
    /** Per-hotel Twilio number override */
    twilio_from_number: String,
    timezone: { type: String, default: "UTC" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Hotel", HotelSchema);
