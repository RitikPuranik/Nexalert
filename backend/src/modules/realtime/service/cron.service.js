"use strict";
const Incident = require("../../incident/model/incident.model");
const { checkSessions }      = require("../../guest/service/deadman.service");
const { checkStaffPresence } = require("../../staff/service/staff.service");
const { checkEscalationPolicies } = require("../../incident/service/escalation.service");
const { emitCrisisEvent }    = require("../../../lib/eventBus");
const { sendToRole }         = require("../../../lib/fcm.service");

/**
 * Main cron handler — called every 30 s by Vercel Cron or UptimeRobot.
 *
 * 1. Fetch all active incidents across ALL hotels
 * 2. Group by hotel
 * 3. For each hotel: run deadman session checks
 * 4. For each incident in that hotel: run staff presence staleness checks
 * 5. Emit per-hotel cron:check summary events
 */
async function runCronCheck() {
  const start = Date.now();

  const activeIncidents = await Incident.find({
    status: { $in: ["detecting","triaging","active","investigating"] },
  }).select("_id hotel_id floor type status").lean();

  // Group by hotel
  const byHotel = {};
  for (const inc of activeIncidents) {
    const hid = String(inc.hotel_id);
    if (!byHotel[hid]) byHotel[hid] = [];
    byHotel[hid].push(inc);
  }

  const summary = {
    hotels_checked:               0,
    incidents_checked:            activeIncidents.length,
    deadman_sessions_checked:     0,
    deadman_sessions_escalated:   0,
    staff_presence_checked:       0,
    staff_silenced:               0,
    escalation_policies_checked:  0,
    escalations_triggered:        0,
    duration_ms:                  0,
  };

  for (const [hotelId, incidents] of Object.entries(byHotel)) {
    summary.hotels_checked++;
    try {
      // Deadman check for this hotel
      const dm = await checkSessions(hotelId);
      summary.deadman_sessions_checked   += dm.checked;
      summary.deadman_sessions_escalated += dm.escalated;

      // FCM push to managers on deadman escalation
      if (dm.escalated > 0) {
        sendToRole(hotelId, "manager",
          `⚠️ ${dm.escalated} Guest(s) Unresponsive`,
          `Dead man's switch escalation: ${dm.escalated} guest(s) have stopped responding. Check war room immediately.`,
          { escalated: String(dm.escalated) }, "high"
        ).catch(console.error);
      }

      // Staff presence check per incident
      let hotelPresenceChecked = 0;
      let hotelStaffSilenced   = 0;
      for (const incident of incidents) {
        const sp = await checkStaffPresence(hotelId, incident._id);
        hotelPresenceChecked += sp.checked;
        hotelStaffSilenced   += sp.silenced;
      }
      summary.staff_presence_checked += hotelPresenceChecked;
      summary.staff_silenced         += hotelStaffSilenced;

      // SLA Escalation policy checks
      try {
        const esc = await checkEscalationPolicies(hotelId);
        summary.escalation_policies_checked += esc.policies_checked;
        summary.escalations_triggered       += esc.escalations_triggered;
      } catch (escErr) {
        console.error(`[Cron] Escalation check failed for hotel ${hotelId}:`, escErr.message);
      }

      emitCrisisEvent(hotelId, "cron:check", {
        active_incidents:   incidents.length,
        deadman_escalated:  dm.escalated,
        staff_silenced:     hotelStaffSilenced,
        ts:                 Date.now(),
      });
    } catch (hotelErr) {
      console.error(`[Cron] Error processing hotel ${hotelId}:`, hotelErr.message);
      // Continue to next hotel — one failure must not block others
    }
  }

  summary.duration_ms = Date.now() - start;
  console.log("[Cron] Check complete:", summary);
  return summary;
}

module.exports = { runCronCheck };
