"use strict";
const mongoose = require("mongoose");
const { Schema } = mongoose;

const EscalationPolicySchema = new Schema(
  {
    hotel_id: { type: Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },

    /** What triggers this policy */
    trigger: {
      type: String,
      enum: ["incident_unconfirmed", "incident_unresolved", "task_unaccepted", "task_incomplete"],
      required: true,
    },

    /** How long to wait before triggering (in seconds) */
    threshold_seconds: { type: Number, required: true, min: 30 },

    /** Actions to execute when threshold is exceeded */
    actions: [{
      type: String,
      enum: [
        "notify_manager",        // FCM push to all managers
        "notify_all_staff",      // FCM push to all on-duty staff
        "auto_confirm",          // auto-confirm incident
        "auto_escalate_911",     // auto-set recommend_911=true
        "fcm_critical_alert",    // high-priority FCM (bypasses DND)
        "log_warning",           // audit log entry only
      ],
    }],

    /** Optional: only apply for certain severity levels */
    severity_filter: [{ type: Number, enum: [1, 2, 3] }],

    is_active: { type: Boolean, default: true },

    /** Description for the dashboard */
    description: String,
  },
  { timestamps: true }
);

EscalationPolicySchema.index({ hotel_id: 1, trigger: 1 });

module.exports = mongoose.model("EscalationPolicy", EscalationPolicySchema);
