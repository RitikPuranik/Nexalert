"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const RoomSchema = new Schema(
  {
    hotel_id:    { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    room_number: { type: String, required: true, trim: true },
    floor:       { type: Number, required: true },
    type:        { type: String, enum: ["single","double","suite","deluxe","penthouse"], default: "single" },
    status:      { type: String, enum: ["available","occupied","maintenance","reserved"], default: "available" },
    /** Staff assigned to this room for housekeeping/maintenance */
    assigned_staff_id: { type: Schema.Types.ObjectId, ref: "UserProfile" },
    notes:       String,
  },
  { timestamps: true }
);

RoomSchema.index({ hotel_id: 1, room_number: 1 }, { unique: true });
RoomSchema.index({ hotel_id: 1, floor: 1 });
RoomSchema.index({ hotel_id: 1, status: 1 });

module.exports = mongoose.model("Room", RoomSchema);
