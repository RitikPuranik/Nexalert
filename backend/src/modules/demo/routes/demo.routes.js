"use strict";
const express  = require("express");
const { asyncHandler } = require("../../../lib/asyncHandler");

const Hotel         = require("../../hotel/model/hotel.model");
const UserProfile   = require("../../staff/model/userProfile.model");
const GuestLocation = require("../../guest/model/guestLocation.model");
const Sensor        = require("../../sensor/model/sensor.model");
const { createDefaultPolicies } = require("../../incident/service/escalation.service");
const Room = require("../../hotel/model/room.model");
const crypto = require("crypto");

const router = express.Router();

const DEMO_HOTEL_NAME = "NexAlert Grand Hotel";
const DEMO_MANAGER_UID = "DEMO_MANAGER_UID";
const DEMO_STAFF_UIDS  = ["DEMO_STAFF_1", "DEMO_STAFF_2", "DEMO_STAFF_3"];

/**
 * POST /api/demo/seed
 * Idempotent — safe to call multiple times.
 * Creates a full demo hotel with staff, guests, sensors.
 * NO AUTH REQUIRED — only works when NODE_ENV !== "production".
 */
router.post(
  "/seed",
  asyncHandler(async (_req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Demo seed disabled in production" });
    }

    // ── 1. Hotel ─────────────────────────────────────────────────────────────
    let hotel = await Hotel.findOne({ name: DEMO_HOTEL_NAME }).lean();
    if (!hotel) {
      hotel = await Hotel.create({
        name:         DEMO_HOTEL_NAME,
        total_floors: 5,
        address:      "123 Innovation Ave, Tech City, TC 90210",
        access_codes: new Map([
          ["main_lobby",    "8842"],
          ["parking_gate",  "3391"],
          ["roof_access",   "7120"],
          ["service_tunnel","5577"],
        ]),
        emergency_contacts: [
          { name: "Fire Dept", phone: "+1-555-0199", role: "fire" },
          { name: "Hospital", phone: "+1-555-0177", role: "medical" },
          { name: "Police",   phone: "+1-555-0155", role: "security" },
        ],
        muster_points: [
          { label: "Main Lobby Courtyard", floor: 1, coordinates: { lat: 34.0522, lng: -118.2437 } },
          { label: "Parking Lot B",        floor: 0, coordinates: { lat: 34.0525, lng: -118.2440 } },
        ],
        geofences: [
          {
            label: "Lobby Safe Zone",
            type: "circle",
            center: { lat: 34.0522, lng: -118.2437 },
            radius_meters: 50,
            floor: 1,
            auto_action: "mark_safe",
          },
          {
            label: "Muster Point B",
            type: "circle",
            center: { lat: 34.0525, lng: -118.2440 },
            radius_meters: 30,
            floor: 0,
            auto_action: "muster_arrival",
          },
        ],
        timezone: "America/Los_Angeles",
      });

      // Create default escalation policies
      await createDefaultPolicies(hotel._id);
    }

    const hotelId = hotel._id;

    // ── 2. Manager ────────────────────────────────────────────────────────────
    let manager = await UserProfile.findOne({ firebase_uid: DEMO_MANAGER_UID }).lean();
    if (!manager) {
      manager = await UserProfile.create({
        firebase_uid: DEMO_MANAGER_UID,
        hotel_id:     hotelId,
        name:         "Alex Rivera",
        email:        "demo@nexalert.io",
        phone:        "+1-555-0100",
        role:         "manager",
        is_on_duty:   true,
        last_duty_at: new Date(),
      });
    }

    // ── 3. Staff ──────────────────────────────────────────────────────────────
    const staffData = [
      { uid: DEMO_STAFF_UIDS[0], name: "Jordan Chen",     role: "staff", floor: 2, zone: "east_wing",  phone: "+1-555-0201" },
      { uid: DEMO_STAFF_UIDS[1], name: "Priya Sharma",    role: "staff", floor: 3, zone: "west_wing",  phone: "+1-555-0202" },
      { uid: DEMO_STAFF_UIDS[2], name: "Marcus Williams", role: "staff", floor: 1, zone: "main_lobby", phone: "+1-555-0203" },
    ];

    const staff = [];
    for (const s of staffData) {
      let profile = await UserProfile.findOne({ firebase_uid: s.uid }).lean();
      if (!profile) {
        profile = await UserProfile.create({
          firebase_uid:    s.uid,
          hotel_id:        hotelId,
          name:            s.name,
          role:            s.role,
          floor_assignment: s.floor,
          zone_assignment: s.zone,
          phone:           s.phone,
          email:           `${s.name.toLowerCase().replace(/\s/g, ".")}@nexalert.io`,
          is_on_duty:      true,
          last_duty_at:    new Date(),
        });
      }
      staff.push(profile);
    }

    // ── 4. Guests ─────────────────────────────────────────────────────────────
    const guestData = [
      { room: "201", floor: 2, name: "Emily Parker",   language: "en", phone: "+1-555-1201" },
      { room: "202", floor: 2, name: "Takeshi Yamada",  language: "ja", phone: "+81-90-1234-5678" },
      { room: "203", floor: 2, name: "Sofia Martinez",  language: "es", phone: "+34-612-345-678" },
      { room: "301", floor: 3, name: "Hans Mueller",    language: "de", phone: "+49-170-1234567" },
      { room: "302", floor: 3, name: "Aisha Patel",     language: "hi", phone: "+91-98765-43210", needs_accessibility: true, accessibility_notes: "Wheelchair user" },
      { room: "303", floor: 3, name: "Chen Wei",        language: "zh", phone: "+86-138-0000-1234" },
      { room: "401", floor: 4, name: "James O'Brien",   language: "en", phone: "+1-555-1401" },
      { room: "402", floor: 4, name: "Fatima Al-Rashid", language: "ar", phone: "+971-50-123-4567" },
      { room: "501", floor: 5, name: "Pierre Dubois",   language: "fr", phone: "+33-6-12-34-56-78" },
      { room: "502", floor: 5, name: "Maria Rossi",     language: "it", phone: "+39-340-123-4567" },
    ];

    for (const g of guestData) {
      await GuestLocation.findOneAndUpdate(
        { hotel_id: hotelId, room: g.room },
        {
          hotel_id:          hotelId,
          room:              g.room,
          floor:             g.floor,
          name:              g.name,
          language:          g.language,
          phone:             g.phone,
          is_checked_in:     true,
          needs_accessibility: g.needs_accessibility || false,
          accessibility_notes: g.accessibility_notes || null,
        },
        { upsert: true, new: true }
      );
    }

    // ── 5. Sensors ────────────────────────────────────────────────────────────
    const sensorData = [
      { id: "SMOKE_F2_EAST",  type: "smoke",  floor: 2, zone: "east_wing",  threshold: 300 },
      { id: "HEAT_F2_EAST",   type: "heat",   floor: 2, zone: "east_wing",  threshold: 65 },
      { id: "SMOKE_F3_WEST",  type: "smoke",  floor: 3, zone: "west_wing",  threshold: 300 },
      { id: "GAS_F3_KITCHEN", type: "gas",    floor: 3, zone: "kitchen",    threshold: 50 },
      { id: "FLOOD_F1_LOBBY", type: "flood",  floor: 1, zone: "main_lobby", threshold: 10 },
      { id: "SMOKE_F4_HALL",  type: "smoke",  floor: 4, zone: "hallway",    threshold: 300 },
      { id: "HEAT_F5_ROOF",   type: "heat",   floor: 5, zone: "roof_deck",  threshold: 70 },
      { id: "CO2_F1_PARKING", type: "co2",    floor: 1, zone: "parking",    threshold: 1000 },
    ];

    for (const s of sensorData) {
      await Sensor.findOneAndUpdate(
        { sensor_id: s.id },
        {
          hotel_id:             hotelId,
          sensor_id:            s.id,
          type:                 s.type,
          floor:                s.floor,
          zone:                 s.zone,
          threshold:            s.threshold,
          is_active:            true,
          location_description: `${s.type} sensor — floor ${s.floor}, ${s.zone}`,
        },
        { upsert: true, new: true }
      );
    }

    // ── QR Token ─────────────────────────────────────────────────────────────
    if (!hotel.qr_token) {
      await Hotel.findByIdAndUpdate(hotelId, { qr_token: crypto.randomBytes(16).toString("hex") });
    }
    const freshHotel = await Hotel.findById(hotelId).lean();

    // ── Rooms ─────────────────────────────────────────────────────────────────
    const roomCount = await Room.countDocuments({ hotel_id: hotelId });
    if (roomCount === 0) {
      const demoRooms = [];
      for (let floor = 1; floor <= 5; floor++) {
        for (let r = 1; r <= 8; r++) {
          demoRooms.push({
            hotel_id: hotelId,
            room_number: String(floor * 100 + r),
            floor,
            type: r <= 2 ? "suite" : r <= 5 ? "double" : "single",
            status: "available",
          });
        }
      }
      await Room.insertMany(demoRooms, { ordered: false });
    }

    res.json({
      ok: true,
      message: "Demo data seeded successfully",
      data: {
        hotel_id:    String(hotelId),
        hotel_name:  hotel.name,
        qr_token:    freshHotel.qr_token,
        manager: {
          id:          String(manager._id),
          name:        manager.name,
          email:       manager.email,
          demo_token:  "DEMO_MANAGER_TOKEN",
        },
        staff_count:   staff.length,
        guest_count:   guestData.length,
        sensor_count:  sensorData.length,
        instructions:  "Use 'Authorization: Bearer DEMO_MANAGER_TOKEN' for all authenticated requests.",
      },
    });
  })
);

/**
 * GET /api/demo/status
 * Check if demo data exists.
 */
router.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const hotel = await Hotel.findOne({ name: DEMO_HOTEL_NAME }).lean();
    if (!hotel) return res.json({ seeded: false });

    const [managerCount, staffCount, guestCount, sensorCount] = await Promise.all([
      UserProfile.countDocuments({ hotel_id: hotel._id, role: "manager" }),
      UserProfile.countDocuments({ hotel_id: hotel._id, role: "staff" }),
      GuestLocation.countDocuments({ hotel_id: hotel._id, is_checked_in: true }),
      Sensor.countDocuments({ hotel_id: hotel._id, is_active: true }),
    ]);

    res.json({
      seeded:     true,
      hotel_id:   String(hotel._id),
      hotel_name: hotel.name,
      managers:   managerCount,
      staff:      staffCount,
      guests:     guestCount,
      sensors:    sensorCount,
    });
  })
);

module.exports = router;
