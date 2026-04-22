"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const GuestNotificationSchema = new Schema(
  {
    incident_id:       { type: Schema.Types.ObjectId, ref: "Incident",      required: true, index: true },
    hotel_id:          { type: Schema.Types.ObjectId, ref: "Hotel",         required: true },
    guest_location_id: { type: Schema.Types.ObjectId, ref: "GuestLocation", required: true },
    room:              String,
    floor:             Number,
    language:          String,
    alert_text:        String,
    evacuation_instruction: String,
    channel:           { type: String, enum: ["sms","in_app"], default: "in_app" },
    sms_sid:           String,
    delivery_status:   { type: String, enum: ["pending","sent","delivered","failed"], default: "pending" },
    guest_response:    { type: String, enum: ["safe","needs_help","no_response"], default: "no_response" },
    responded_at:      Date,
    all_clear_sent:    { type: Boolean, default: false },
    /** True for the precautionary alerts sent to floors above/below */
    is_precautionary:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GuestNotification", GuestNotificationSchema);
