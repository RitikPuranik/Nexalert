"use strict";
const admin       = require("../config/firebase");
const UserProfile = require("../modules/staff/model/userProfile.model");

/**
 * Send a push notification to a single device.
 *
 * @param {string} token    — FCM registration token
 * @param {string} title    — notification title
 * @param {string} body     — notification body
 * @param {Object} [data]   — key-value data payload
 * @param {string} [priority] — "high" (bypasses DND) or "normal"
 * @returns {string|null}   — FCM message ID or null on failure
 */
async function sendPush(token, title, body, data = {}, priority = "high") {
  if (!token) return null;
  try {
    // Ensure all data values are strings (FCM requirement)
    const stringData = {};
    for (const [k, v] of Object.entries(data)) {
      stringData[k] = String(v);
    }

    const messageId = await admin.messaging().send({
      token,
      notification: { title, body },
      data: stringData,
      android: { priority },
      apns: {
        payload: {
          aps: {
            sound: priority === "high" ? "critical_alert.caf" : "default",
            "content-available": 1,
          },
        },
      },
    });
    return messageId;
  } catch (err) {
    // Token may be stale — log but never block
    console.error(`[FCM] Push failed for token ${token.slice(0, 12)}…:`, err.message);
    return null;
  }
}

/**
 * Push a notification to ALL on-duty staff at a hotel.
 *
 * @param {string} hotelId
 * @param {string} title
 * @param {string} body
 * @param {Object} [data]
 * @param {string} [priority]
 * @returns {{ sent: number, failed: number }}
 */
async function sendToHotelStaff(hotelId, title, body, data = {}, priority = "high") {
  const staff = await UserProfile.find({
    hotel_id:   hotelId,
    is_on_duty: true,
    fcm_token:  { $exists: true, $ne: null },
  }).select("fcm_token name").lean();

  if (staff.length === 0) return { sent: 0, failed: 0 };

  const results = await Promise.allSettled(
    staff.map((s) => sendPush(s.fcm_token, title, body, data, priority))
  );

  const sent   = results.filter((r) => r.status === "fulfilled" && r.value).length;
  const failed = results.length - sent;

  console.log(`[FCM] Hotel ${hotelId}: ${sent} sent, ${failed} failed`);
  return { sent, failed };
}

/**
 * Push a notification to all on-duty staff with a specific role at a hotel.
 *
 * @param {string} hotelId
 * @param {string} role     — "manager", "staff", "responder"
 * @param {string} title
 * @param {string} body
 * @param {Object} [data]
 * @param {string} [priority]
 * @returns {{ sent: number, failed: number }}
 */
async function sendToRole(hotelId, role, title, body, data = {}, priority = "high") {
  const staff = await UserProfile.find({
    hotel_id:   hotelId,
    role,
    is_on_duty: true,
    fcm_token:  { $exists: true, $ne: null },
  }).select("fcm_token").lean();

  if (staff.length === 0) return { sent: 0, failed: 0 };

  const results = await Promise.allSettled(
    staff.map((s) => sendPush(s.fcm_token, title, body, data, priority))
  );

  const sent   = results.filter((r) => r.status === "fulfilled" && r.value).length;
  const failed = results.length - sent;

  return { sent, failed };
}

/**
 * Map incident severity to FCM priority.
 */
function severityToPriority(severity) {
  return severity === 1 ? "high" : "normal";
}

module.exports = { sendPush, sendToHotelStaff, sendToRole, severityToPriority };
