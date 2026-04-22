"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const GuestLocationSchema = new Schema(
  {
    hotel_id:   { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    room:       { type: String, required: true },
    floor:      { type: Number, required: true },
    name:       String,
    phone:      String,
    language:   { type: String, default: "en" },
    needs_accessibility:  { type: Boolean, default: false },
    accessibility_notes:  String,
    /** Live GPS — updated by the guest's QR page every 15 s */
    coordinates:          { lat: Number, lng: Number, accuracy: Number },
    coordinates_updated_at: Date,
    /** Safe / needs_help / no_response */
    guest_response: {
      type: String,
      enum: ["safe","needs_help","no_response"],
      default: "no_response",
    },
    responded_at:  Date,
    check_in:      Date,
    check_out:     Date,
    is_checked_in: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

GuestLocationSchema.index({ hotel_id: 1, floor: 1 });
GuestLocationSchema.index({ hotel_id: 1, room: 1 });

module.exports = mongoose.model("GuestLocation", GuestLocationSchema);
