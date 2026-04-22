"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const SensorEventSchema = new Schema(
  {
    sensor_id:          { type: String, required: true, index: true },
    hotel_id:           { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    value:              Number,
    threshold:          Number,
    triggered_incident: { type: Boolean, default: false },
    incident_id:        { type: Schema.Types.ObjectId, ref: "Incident" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SensorEvent", SensorEventSchema);
