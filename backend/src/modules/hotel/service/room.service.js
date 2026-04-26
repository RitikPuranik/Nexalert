"use strict";
const Room        = require("../model/room.model");
const GuestLocation = require("../../guest/model/guestLocation.model");

async function listRooms(hotelId, { floor, status } = {}) {
  const filter = { hotel_id: hotelId };
  if (floor)  filter.floor  = parseInt(floor);
  if (status) filter.status = status;

  const rooms = await Room.find(filter)
    .populate("assigned_staff_id", "name role floor_assignment")
    .sort({ floor: 1, room_number: 1 })
    .lean();

  // Attach live guest info
  const checkedIn = await GuestLocation.find({ hotel_id: hotelId, is_checked_in: true }).lean();
  const guestMap = {};
  checkedIn.forEach(g => { guestMap[g.room] = g; });

  return rooms.map(r => ({
    ...r,
    guest: guestMap[r.room_number] || null,
  }));
}

async function createRoom(hotelId, data) {
  return Room.create({ hotel_id: hotelId, ...data });
}

async function bulkCreateRooms(hotelId, rooms) {
  const docs = rooms.map(r => ({ hotel_id: hotelId, ...r }));
  return Room.insertMany(docs, { ordered: false });
}

async function updateRoom(hotelId, roomId, data) {
  const room = await Room.findOneAndUpdate(
    { _id: roomId, hotel_id: hotelId },
    data,
    { new: true }
  ).populate("assigned_staff_id", "name role");
  if (!room) throw Object.assign(new Error("Room not found"), { status: 404 });
  return room;
}

async function deleteRoom(hotelId, roomId) {
  const room = await Room.findOneAndDelete({ _id: roomId, hotel_id: hotelId });
  if (!room) throw Object.assign(new Error("Room not found"), { status: 404 });
  return room;
}

async function assignStaff(hotelId, roomId, staffId) {
  return updateRoom(hotelId, roomId, { assigned_staff_id: staffId || null });
}

async function getRoomSummary(hotelId) {
  const rooms = await Room.find({ hotel_id: hotelId }).lean();
  const checkedIn = await GuestLocation.find({ hotel_id: hotelId, is_checked_in: true }).lean();
  const occupiedRooms = new Set(checkedIn.map(g => g.room));

  const total      = rooms.length;
  const available  = rooms.filter(r => r.status === "available" && !occupiedRooms.has(r.room_number)).length;
  const occupied   = rooms.filter(r => occupiedRooms.has(r.room_number)).length;
  const maintenance= rooms.filter(r => r.status === "maintenance").length;
  const reserved   = rooms.filter(r => r.status === "reserved").length;

  const byFloor = {};
  rooms.forEach(r => {
    if (!byFloor[r.floor]) byFloor[r.floor] = { total: 0, available: 0, occupied: 0 };
    byFloor[r.floor].total++;
    if (occupiedRooms.has(r.room_number)) byFloor[r.floor].occupied++;
    else if (r.status === "available")    byFloor[r.floor].available++;
  });

  return { total, available, occupied, maintenance, reserved, byFloor };
}

module.exports = { listRooms, createRoom, bulkCreateRooms, updateRoom, deleteRoom, assignStaff, getRoomSummary };
