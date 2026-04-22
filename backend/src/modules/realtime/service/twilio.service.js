"use strict";
const Twilio = require("twilio");

let _client = null;

function getClient() {
  if (_client) return _client;
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  _client = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return _client;
}

/**
 * Send an SMS.
 * Returns the Twilio message SID, or null if unconfigured / failed.
 */
async function sendSMS({ to, body, from }) {
  const client = getClient();
  if (!client) {
    console.warn("[Twilio] Not configured — SMS skipped");
    return null;
  }
  const fromNumber = from || process.env.TWILIO_FROM_NUMBER;
  if (!fromNumber) {
    console.warn("[Twilio] No from number — SMS skipped");
    return null;
  }
  try {
    const msg = await client.messages.create({ to, from: fromNumber, body });
    return msg.sid;
  } catch (err) {
    console.error("[Twilio] SMS failed:", err.message);
    return null;
  }
}

module.exports = { sendSMS };
