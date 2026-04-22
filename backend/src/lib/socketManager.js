"use strict";
const { Server }      = require("socket.io");
const admin           = require("../config/firebase");
const UserProfile     = require("../modules/staff/model/userProfile.model");
const StaffPresence   = require("../modules/staff/model/staffPresence.model");
const ChatMessage     = require("../modules/realtime/model/chatMessage.model");
const Incident        = require("../modules/incident/model/incident.model");
const { applyTaskAction } = require("../modules/incident/service/incident.service");

let io = null;

/**
 * Initialise Socket.IO on the HTTP server.
 * Called once from index.js.
 */
function initSocketIO(httpServer, allowedOrigins) {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins || "*",
      methods: ["GET", "POST"],
    },
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  // ── Authentication middleware ───────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const role  = socket.handshake.auth?.role;

      // Allow public responder connections (read-only)
      if (role === "responder") {
        socket.user = { role: "responder", hotelId: socket.handshake.auth?.hotel_id };
        return next();
      }

      if (!token) return next(new Error("Authentication required"));

      const decoded = await admin.auth().verifyIdToken(token);
      const profile = await UserProfile.findOne({ firebase_uid: decoded.uid }).lean();
      if (!profile) return next(new Error("No user profile found"));

      socket.user = {
        uid:       decoded.uid,
        profileId: String(profile._id),
        name:      profile.name || "Staff",
        role:      profile.role,
        hotelId:   String(profile.hotel_id),
        floor:     profile.floor_assignment,
      };
      next();
    } catch (err) {
      next(new Error("Invalid token: " + err.message));
    }
  });

  // ── Connection handler ──────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const user = socket.user;
    console.log(`[Socket.IO] Connected: ${user.name || "responder"} (${user.role}) — hotel ${user.hotelId}`);

    // Join hotel room
    if (user.hotelId) {
      socket.join(`hotel:${user.hotelId}`);
    }

    // ── Join incident room ──────────────────────────────────────────────────
    socket.on("join:incident", (incidentId) => {
      socket.join(`incident:${incidentId}`);
      console.log(`[Socket.IO] ${user.name} joined incident:${incidentId}`);
    });

    socket.on("leave:incident", (incidentId) => {
      socket.leave(`incident:${incidentId}`);
    });

    // ── Staff location pings (client → server, every 10s) ───────────────────
    socket.on("staff:location", async (data) => {
      if (user.role === "responder") return;
      try {
        const { incident_id, coordinates } = data;
        if (!incident_id || !coordinates) return;

        await StaffPresence.findOneAndUpdate(
          { incident_id, staff_id: user.profileId },
          {
            incident_id,
            hotel_id:     user.hotelId,
            staff_id:     user.profileId,
            last_ping_at: new Date(),
            coordinates,
            is_silent:    false,
            status:       "active",
          },
          { upsert: true }
        );

        // Broadcast to war room
        io.to(`incident:${incident_id}`).emit("staff:location:update", {
          staff_id:    user.profileId,
          name:        user.name,
          role:        user.role,
          coordinates,
          ts:          Date.now(),
        });
      } catch (err) {
        console.error("[Socket.IO] staff:location error:", err.message);
      }
    });

    // ── War room chat (bidirectional) ───────────────────────────────────────
    socket.on("warroom:chat", async (data) => {
      if (user.role === "responder") return; // read-only for responders
      try {
        const { incident_id, message } = data;
        if (!incident_id || !message || !message.trim()) return;

        // Verify the incident belongs to this hotel
        const incident = await Incident.findById(incident_id).select("hotel_id").lean();
        if (!incident || String(incident.hotel_id) !== user.hotelId) return;

        const chatMsg = await ChatMessage.create({
          incident_id,
          hotel_id:    user.hotelId,
          sender_id:   user.profileId,
          sender_name: user.name,
          sender_role: user.role,
          message:     message.trim().slice(0, 2000),
        });

        // Broadcast to all in the incident room
        io.to(`incident:${incident_id}`).emit("warroom:chat:message", {
          _id:         chatMsg._id,
          incident_id,
          sender_id:   user.profileId,
          sender_name: user.name,
          sender_role: user.role,
          message:     chatMsg.message,
          ts:          chatMsg.createdAt,
        });
      } catch (err) {
        console.error("[Socket.IO] warroom:chat error:", err.message);
      }
    });

    // ── Task acknowledgement (client → server) ──────────────────────────────
    socket.on("task:ack", async (data) => {
      if (user.role === "responder") return;
      try {
        const { incident_id, task_id, action, notes } = data;
        if (!incident_id || !task_id || !action) return;

        const task = await applyTaskAction(incident_id, task_id, user.profileId, user.hotelId, action, notes);

        // Confirm back to sender
        socket.emit("task:ack:result", { ok: true, task_id, status: task.status });
      } catch (err) {
        socket.emit("task:ack:result", { ok: false, error: err.message });
      }
    });

    // ── Chat history fetch ───────────────────────────────────────────────────
    socket.on("warroom:chat:history", async (data) => {
      try {
        const { incident_id, limit = 50 } = data;
        if (!incident_id) return;

        const messages = await ChatMessage.find({ incident_id })
          .sort({ createdAt: -1 })
          .limit(Math.min(limit, 200))
          .lean();

        socket.emit("warroom:chat:history:result", { incident_id, messages: messages.reverse() });
      } catch (err) {
        console.error("[Socket.IO] chat:history error:", err.message);
      }
    });

    // ── Disconnect ──────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Disconnected: ${user.name || "responder"}`);
    });
  });

  console.log("[Socket.IO] Server initialised");
  return io;
}

/**
 * Get the Socket.IO instance (may be null if not initialised).
 */
function getIO() {
  return io;
}

/**
 * Emit a crisis event to a hotel's Socket.IO room.
 * Called from eventBus.js for dual-emit (SSE + Socket.IO).
 */
function emitToHotelRoom(hotelId, eventType, payload) {
  if (!io) return;
  io.to(`hotel:${hotelId}`).emit(eventType, { ...payload, ts: Date.now() });
}

/**
 * Get the count of active Socket.IO connections.
 */
function getConnectionCount() {
  if (!io) return 0;
  return io.engine?.clientsCount ?? 0;
}

module.exports = { initSocketIO, getIO, emitToHotelRoom, getConnectionCount };
