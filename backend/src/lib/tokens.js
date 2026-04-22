"use strict";
const { v4: uuidv4 } = require("uuid");

/** Generate a 32-char hex token for deadman sessions. */
function generateToken() {
  return uuidv4().replace(/-/g, "");
}

module.exports = { generateToken };
