"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const ChatMessageSchema = new Schema(
  {
    incident_id: { type: Schema.Types.ObjectId, ref: "Incident", required: true, index: true },
    hotel_id:    { type: Schema.Types.ObjectId, ref: "Hotel",    required: true, index: true },
    sender_id:   { type: Schema.Types.ObjectId, ref: "UserProfile", required: true },
    sender_name: { type: String, required: true },
    sender_role: { type: String, enum: ["manager", "staff", "responder"], required: true },
    message:     { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true }
);

ChatMessageSchema.index({ incident_id: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
