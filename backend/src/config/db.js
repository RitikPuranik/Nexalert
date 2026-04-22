"use strict";
const mongoose = require("mongoose");

let connected = false;

async function connectDB() {
  if (connected) return;
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  connected = true;
  console.log("[DB] MongoDB connected");
}

module.exports = { connectDB };
