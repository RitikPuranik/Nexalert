"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const SensorSchema = new Schema(
  {
    hotel_id: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    sensor_id: { type: String, required: true, unique: true },
    type: { type: String, enum: ["smoke","heat","gas","motion","flood","co2"], required: true },
    floor: { type: Number, required: true },
    zone: String,
    room: String,
    location_description: String,
    threshold: { type: Number, required: true },
    is_active: { type: Boolean, default: true },
    last_event_at: Date,
    coordinates: { lat: Number, lng: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sensor", SensorSchema);
