"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserProfileSchema = new Schema(
  {
    firebase_uid:    { type: String, required: true, unique: true, index: true },
    hotel_id:        { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    name:            String,
    email:           String,
    phone:           String,
    role:            { type: String, enum: ["manager","staff","responder"], required: true },
    floor_assignment: Number,
    zone_assignment:  String,
    is_on_duty:      { type: Boolean, default: false },
    last_duty_at:    Date,
    fcm_token:       String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserProfile", UserProfileSchema);
