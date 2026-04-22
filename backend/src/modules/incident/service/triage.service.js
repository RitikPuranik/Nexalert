"use strict";
const Incident          = require("../model/incident.model");
const StaffTask         = require("../model/staffTask.model");
const Hotel             = require("../../hotel/model/hotel.model");
const ExitRoute         = require("../../hotel/model/exitRoute.model");
const GuestLocation     = require("../../guest/model/guestLocation.model");
const GuestNotification = require("../../guest/model/guestNotification.model");
const DeadmanSession    = require("../../guest/model/deadmanSession.model");
const { runAITriage }   = require("./gemini.service");
const { sendSMS }       = require("../../realtime/service/twilio.service");
const { emitCrisisEvent } = require("../../../lib/eventBus");
const { generateToken } = require("../../../lib/tokens");
const { sendToHotelStaff, severityToPriority } = require("../../../lib/fcm.service");
const { logAction } = require("../../audit/service/audit.service");

// ── Fallback triage (used when Gemini fails) ─────────────────────────────────

function fallbackTriage(incident) {
  const isFireLike = ["fire","smoke","gas_leak"].includes(incident.type);
  return {
    severity:         isFireLike ? 1 : 2,
    severity_reason:  "Automated fallback — AI unavailable.",
    manager_briefing: "AI triage failed. Assess manually and follow hotel emergency protocols.",
    responder_briefing: `Automated fallback. Floor ${incident.floor}. Type: ${incident.type}. Manual assessment required.`,
    recommend_911:        isFireLike,
    recommend_911_reason: isFireLike ? "Fire-type incident — recommend immediate 911 call." : null,
    staff_tasks: [
      { title: "Investigate Incident",      description: `Proceed to floor ${incident.floor} and assess.`,               assigned_role: "security",    priority: 10 },
      { title: "Assist Guests on Floor",    description: `Check all guests on floor ${incident.floor} and assist evacuation.`, assigned_role: "housekeeping", priority: 8 },
      { title: "Coordinate at Front Desk",  description: "Coordinate with emergency services.",                           assigned_role: "front_desk",   priority: 7 },
    ],
    guest_alert_en: `${incident.is_drill ? "[DRILL] " : ""}An emergency has been detected on your floor. Follow staff instructions and prepare to evacuate if directed.`,
    guest_alert_translations: {},
    evacuation_template: "Room {{room}}: Evacuate via {{exit_label}} and proceed to {{muster_point}}.",
  };
}

// ── Personalised exit builder ────────────────────────────────────────────────

function buildPersonalisedExit(guest, exits, incidentZone, template) {
  let candidates = exits.filter((e) => e.is_active !== false);

  // Avoid routes through the incident zone
  if (incidentZone) {
    const safe = candidates.filter((e) => !e.avoids_zones?.includes(incidentZone));
    if (safe.length > 0) candidates = safe;
  }

  // Prefer accessible routes for guests who need them
  if (guest.needs_accessibility) {
    const accessible = candidates.filter((e) => e.is_accessible);
    if (accessible.length > 0) candidates = accessible;
  }

  const best = candidates[0] || exits[0];
  if (!best) return { exit: null, instruction: template || "" };

  const instruction = (template || "Room {{room}}: Evacuate via {{exit_label}} to {{muster_point}}.")
    .replace(/{{room}}/g,        guest.room)
    .replace(/{{exit_label}}/g,  best.label)
    .replace(/{{muster_point}}/g, best.muster_point || "designated muster point");

  return { exit: best, instruction };
}

// ── Main triage pipeline ─────────────────────────────────────────────────────

async function runTriagePipeline(incidentId) {
  let incident;
  try {
    // ── Step 1: Mark as triaging ────────────────────────────────────────────
    incident = await Incident.findByIdAndUpdate(
      incidentId,
      { status: "triaging" },
      { new: true }
    ).lean();
    if (!incident) throw new Error("Incident not found: " + incidentId);

    emitCrisisEvent(incident.hotel_id, "incident:updated", { incident_id: incidentId, status: "triaging" });

    // ── Step 2: Load context (3 parallel queries) ───────────────────────────
    const [hotel, guests, exits] = await Promise.all([
      Hotel.findById(incident.hotel_id).lean(),
      GuestLocation.find({ hotel_id: incident.hotel_id, floor: incident.floor, is_checked_in: true }).lean(),
      ExitRoute.find({ hotel_id: incident.hotel_id, floor: incident.floor, is_active: true }).lean(),
    ]);
    if (!hotel) throw new Error("Hotel not found: " + incident.hotel_id);

    // ── Step 3: AI triage (with hardcoded fallback) ─────────────────────────
    let triage;
    try {
      triage = await runAITriage({ incident, hotel, guests, exits });
    } catch (aiErr) {
      console.error("[Triage] Gemini failed, using fallback:", aiErr.message);
      triage = fallbackTriage(incident);
    }

    // ── Step 4: Create staff tasks ──────────────────────────────────────────
    const taskDocs = (triage.staff_tasks || []).map((t) => ({
      incident_id:   incidentId,
      hotel_id:      incident.hotel_id,
      assigned_role: t.assigned_role,
      title:         t.title,
      description:   t.description,
      priority:      t.priority,
      status:        "pending",
    }));
    const insertedTasks = taskDocs.length > 0 ? await StaffTask.insertMany(taskDocs) : [];

    // ── Step 5: Build personalised exits and prepare notification + deadman docs ──
    const notificationDocs = [];
    const deadmanDocs = [];

    for (const guest of guests) {
      const { instruction } = buildPersonalisedExit(guest, exits, incident.zone, triage.evacuation_template);
      const lang = guest.language || "en";
      const alertText = lang === "en"
        ? triage.guest_alert_en
        : (triage.guest_alert_translations?.[lang] || triage.guest_alert_en);

      notificationDocs.push({
        incident_id:       incidentId,
        hotel_id:          incident.hotel_id,
        guest_location_id: guest._id,
        room:              guest.room,
        floor:             guest.floor,
        language:          lang,
        alert_text:        alertText,
        evacuation_instruction: instruction,
        channel:           guest.phone ? "sms" : "in_app",
        delivery_status:   "pending",
        guest_response:    "no_response",
      });

      deadmanDocs.push({
        incident_id:       incidentId,
        hotel_id:          incident.hotel_id,
        guest_location_id: guest._id,
        room:              guest.room,
        floor:             guest.floor,
        token:             generateToken(),
        status:            "active",
        interval_seconds:  120,
        escalate_after:    2,
        missed_pings:      0,
        last_ping_at:      new Date(),
      });
    }

    // ── Step 6: Persist AI outputs and activate incident ────────────────────
    await Incident.findByIdAndUpdate(incidentId, {
      status:           "active",
      severity:         triage.severity,
      severity_reason:  triage.severity_reason,
      manager_briefing: triage.manager_briefing,
      responder_briefing: triage.responder_briefing,
      recommend_911:    triage.recommend_911,
      recommend_911_reason: triage.recommend_911_reason,
      guest_alert_en:   triage.guest_alert_en,
      guest_alert_translations: triage.guest_alert_translations || {},
      evacuation_template: triage.evacuation_template,
      triage_at:        new Date(),
      tasks_total:      insertedTasks.length,
      tasks_completed:  0,
    });

    emitCrisisEvent(incident.hotel_id, "triage:complete", {
      incident_id:    incidentId,
      severity:       triage.severity,
      tasks_created:  insertedTasks.length,
      guests_alerted: notificationDocs.length,
    });

    // FCM push to all on-duty staff after triage
    const severityLabels = { 1: "🚨 CRITICAL", 2: "⚠️ URGENT", 3: "ℹ️ MONITOR" };
    sendToHotelStaff(
      incident.hotel_id,
      `${severityLabels[triage.severity] || "⚠️"} ${incident.type.toUpperCase()} — Floor ${incident.floor}`,
      triage.manager_briefing || `${incident.type} incident on floor ${incident.floor}. ${insertedTasks.length} tasks assigned.`,
      { incident_id: String(incidentId), severity: String(triage.severity), floor: String(incident.floor) },
      severityToPriority(triage.severity)
    ).catch(console.error);

    // ── Step 7: Dispatch alerts + create deadman sessions (parallel) ────────
    const [insertedNotifications] = await Promise.all([
      notificationDocs.length > 0 ? GuestNotification.insertMany(notificationDocs) : Promise.resolve([]),
      deadmanDocs.length > 0 ? DeadmanSession.insertMany(deadmanDocs) : Promise.resolve([]),
    ]);

    // SMS dispatch — fire-and-forget per guest
    const fromNumber = hotel.twilio_from_number || process.env.TWILIO_FROM_NUMBER;
    for (const notif of insertedNotifications) {
      if (notif.channel === "sms") {
        const guest = guests.find((g) => String(g._id) === String(notif.guest_location_id));
        if (guest?.phone) {
          sendSMS({ to: guest.phone, body: `${notif.alert_text}\n\n${notif.evacuation_instruction}`, from: fromNumber })
            .then((sid) =>
              GuestNotification.findByIdAndUpdate(notif._id, { sms_sid: sid, delivery_status: sid ? "sent" : "failed" }).exec()
            )
            .catch(() =>
              GuestNotification.findByIdAndUpdate(notif._id, { delivery_status: "failed" }).exec()
            );
        }
      }
    }

    emitCrisisEvent(incident.hotel_id, "incident:updated", {
      incident_id: incidentId,
      status:      "active",
      severity:    triage.severity,
      floor:       incident.floor,
      type:        incident.type,
    });

    // ── Step 8: Precautionary alerts to adjacent floors for CRITICAL incidents ──
    if (triage.severity === 1) {
      await escalateAdjacentFloors(incidentId, incident, hotel, triage);
    }

    console.log(`[Triage] ${incidentId} done. Severity: ${triage.severity}, Tasks: ${insertedTasks.length}, Guests: ${notificationDocs.length}`);
  } catch (err) {
    console.error("[Triage] Pipeline failed:", incidentId, err.message);
    // Never leave an incident stuck in 'triaging'
    if (incident) {
      await Incident.findByIdAndUpdate(incidentId, {
        status:           "active",
        severity:         2,
        severity_reason:  "Triage pipeline error — manual assessment required.",
        manager_briefing: "System error during triage. Please assess this incident manually.",
        triage_at:        new Date(),
      }).catch(() => {});
    }
  }
}

// ── Adjacent-floor precautionary alerts ─────────────────────────────────────

async function escalateAdjacentFloors(incidentId, incident, hotel, triage) {
  const adjacent = [incident.floor - 1, incident.floor + 1].filter((f) => f >= 1 && f <= hotel.total_floors);

  for (const floor of adjacent) {
    const [adjGuests, adjExits] = await Promise.all([
      GuestLocation.find({ hotel_id: incident.hotel_id, floor, is_checked_in: true }).lean(),
      ExitRoute.find({ hotel_id: incident.hotel_id, floor, is_active: true }).lean(),
    ]);

    const alertText = `${incident.is_drill ? "[DRILL] " : ""}A ${incident.type} emergency has been reported on floor ${incident.floor}. Prepare to evacuate and await instructions.`;

    const notifDocs = adjGuests.map((guest) => {
      const { instruction } = buildPersonalisedExit(guest, adjExits, null, triage.evacuation_template);
      return {
        incident_id:       incidentId,
        hotel_id:          incident.hotel_id,
        guest_location_id: guest._id,
        room:              guest.room,
        floor:             guest.floor,
        language:          guest.language || "en",
        alert_text:        alertText,
        evacuation_instruction: instruction,
        channel:           guest.phone ? "sms" : "in_app",
        delivery_status:   "pending",
        guest_response:    "no_response",
        is_precautionary:  true,
      };
    });

    if (notifDocs.length > 0) {
      await GuestNotification.insertMany(notifDocs);
      emitCrisisEvent(incident.hotel_id, "sensor:escalation", {
        incident_id:  incidentId,
        floor,
        message:      `Precautionary alerts sent to floor ${floor}`,
        guest_count:  notifDocs.length,
      });
    }
  }
}

module.exports = { runTriagePipeline, buildPersonalisedExit, fallbackTriage };
