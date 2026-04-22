"use strict";
const EscalationPolicy = require("../model/escalationPolicy.model");
const Incident         = require("../model/incident.model");
const StaffTask        = require("../model/staffTask.model");
const { emitCrisisEvent }  = require("../../../lib/eventBus");
const { sendToHotelStaff, sendToRole } = require("../../../lib/fcm.service");
const { logAction }        = require("../../audit/service/audit.service");

/**
 * Check all escalation policies for a hotel and execute overdue actions.
 * Called from the cron service every 30 seconds.
 *
 * @param {string} hotelId
 * @returns {{ policies_checked, escalations_triggered, actions_executed }}
 */
async function checkEscalationPolicies(hotelId) {
  const policies = await EscalationPolicy.find({ hotel_id: hotelId, is_active: true }).lean();
  if (policies.length === 0) return { policies_checked: 0, escalations_triggered: 0, actions_executed: 0 };

  const now = Date.now();
  let escalationsTriggered = 0;
  let actionsExecuted = 0;

  for (const policy of policies) {
    try {
      const overdueItems = await _findOverdueItems(policy, hotelId, now);

      for (const item of overdueItems) {
        escalationsTriggered++;

        for (const action of policy.actions) {
          await _executeAction(action, policy, item, hotelId);
          actionsExecuted++;
        }

        logAction({
          actor:        "system",
          actorType:    "cron",
          action:       `escalation:${policy.trigger}`,
          resourceType: item.type,
          resourceId:   item.id,
          hotelId,
          incidentId:   item.incident_id || item.id,
          details:      `SLA breached: ${policy.trigger} after ${policy.threshold_seconds}s — actions: ${policy.actions.join(", ")}`,
        });
      }
    } catch (err) {
      console.error(`[Escalation] Policy ${policy._id} failed:`, err.message);
    }
  }

  return {
    policies_checked:     policies.length,
    escalations_triggered: escalationsTriggered,
    actions_executed:      actionsExecuted,
  };
}

/**
 * Find items that have exceeded their SLA threshold.
 */
async function _findOverdueItems(policy, hotelId, nowMs) {
  const cutoff = new Date(nowMs - policy.threshold_seconds * 1000);
  const items = [];

  switch (policy.trigger) {
    case "incident_unconfirmed": {
      // Incidents that are "active" (post-triage) but not yet confirmed by manager
      const filter = {
        hotel_id:     hotelId,
        status:       "active",
        confirmed_at: null,
        triage_at:    { $lte: cutoff },
      };
      if (policy.severity_filter?.length > 0) filter.severity = { $in: policy.severity_filter };

      const incidents = await Incident.find(filter).select("_id floor type severity").lean();
      for (const inc of incidents) {
        items.push({ type: "incident", id: inc._id, incident_id: inc._id, data: inc });
      }
      break;
    }

    case "incident_unresolved": {
      const filter = {
        hotel_id:    hotelId,
        status:      { $in: ["active", "investigating"] },
        resolved_at: null,
        createdAt:   { $lte: cutoff },
      };
      if (policy.severity_filter?.length > 0) filter.severity = { $in: policy.severity_filter };

      const incidents = await Incident.find(filter).select("_id floor type severity").lean();
      for (const inc of incidents) {
        items.push({ type: "incident", id: inc._id, incident_id: inc._id, data: inc });
      }
      break;
    }

    case "task_unaccepted": {
      const tasks = await StaffTask.find({
        hotel_id:  hotelId,
        status:    "pending",
        createdAt: { $lte: cutoff },
      }).select("_id incident_id title assigned_role priority").lean();
      for (const task of tasks) {
        items.push({ type: "task", id: task._id, incident_id: task.incident_id, data: task });
      }
      break;
    }

    case "task_incomplete": {
      const tasks = await StaffTask.find({
        hotel_id:  hotelId,
        status:    { $in: ["accepted", "in_progress"] },
        createdAt: { $lte: cutoff },
      }).select("_id incident_id title assigned_role priority").lean();
      for (const task of tasks) {
        items.push({ type: "task", id: task._id, incident_id: task.incident_id, data: task });
      }
      break;
    }
  }

  return items;
}

/**
 * Execute a single escalation action.
 */
async function _executeAction(action, policy, item, hotelId) {
  switch (action) {
    case "notify_manager":
      await sendToRole(hotelId, "manager",
        "⚠️ SLA Escalation",
        `${policy.trigger}: ${item.type} ${item.id} has not been addressed within ${policy.threshold_seconds}s.`,
        { incident_id: String(item.incident_id), escalation: "true" },
        "high"
      );
      break;

    case "notify_all_staff":
      await sendToHotelStaff(hotelId,
        "⚠️ Attention Required",
        `${item.type === "task" ? "An unaccepted task" : "An incident"} needs immediate attention.`,
        { incident_id: String(item.incident_id) },
        "normal"
      );
      break;

    case "auto_confirm":
      if (item.type === "incident") {
        await Incident.findByIdAndUpdate(item.id, {
          confirmed_at: new Date(),
          $push: { /* status stays active, just mark confirmed */ },
        });
        // Note: we don't change status since it's already "active"
        emitCrisisEvent(hotelId, "incident:updated", {
          incident_id: item.id,
          action:      "auto_confirmed",
          reason:      "SLA escalation policy",
        });
      }
      break;

    case "auto_escalate_911":
      if (item.type === "incident") {
        await Incident.findByIdAndUpdate(item.id, {
          recommend_911:        true,
          recommend_911_reason: `Auto-escalated by SLA policy: ${policy.trigger} exceeded ${policy.threshold_seconds}s threshold.`,
          escalated_to_911_at:  new Date(),
        });
        emitCrisisEvent(hotelId, "incident:updated", {
          incident_id: item.id,
          action:      "auto_escalate_911",
          reason:      "SLA escalation policy",
        });
      }
      break;

    case "fcm_critical_alert":
      await sendToHotelStaff(hotelId,
        "🚨 CRITICAL ESCALATION",
        `SLA BREACH: ${policy.trigger} — immediate action required!`,
        { incident_id: String(item.incident_id), critical: "true" },
        "high"
      );
      break;

    case "log_warning":
      // Already logged in the caller
      break;
  }
}

/**
 * Create sensible default escalation policies for a new hotel.
 */
async function createDefaultPolicies(hotelId) {
  const defaults = [
    {
      hotel_id:          hotelId,
      trigger:           "incident_unconfirmed",
      threshold_seconds: 300, // 5 minutes
      actions:           ["notify_manager", "fcm_critical_alert"],
      severity_filter:   [1, 2],
      description:       "Alert managers if an incident is not confirmed within 5 minutes",
      is_active:         true,
    },
    {
      hotel_id:          hotelId,
      trigger:           "task_unaccepted",
      threshold_seconds: 180, // 3 minutes
      actions:           ["notify_all_staff", "log_warning"],
      severity_filter:   [],
      description:       "Alert all staff if a task is not accepted within 3 minutes",
      is_active:         true,
    },
    {
      hotel_id:          hotelId,
      trigger:           "incident_unresolved",
      threshold_seconds: 1800, // 30 minutes
      actions:           ["notify_manager", "auto_escalate_911"],
      severity_filter:   [1],
      description:       "Auto-escalate to 911 if a CRITICAL incident is unresolved for 30 minutes",
      is_active:         true,
    },
  ];

  return EscalationPolicy.insertMany(defaults);
}

/**
 * CRUD helpers.
 */
async function listPolicies(hotelId) {
  return EscalationPolicy.find({ hotel_id: hotelId }).sort({ trigger: 1 }).lean();
}

async function createPolicy(hotelId, data) {
  return EscalationPolicy.create({ hotel_id: hotelId, ...data });
}

async function updatePolicy(policyId, hotelId, updates) {
  const policy = await EscalationPolicy.findById(policyId);
  if (!policy) throw Object.assign(new Error("Policy not found"), { status: 404 });
  if (String(policy.hotel_id) !== String(hotelId))
    throw Object.assign(new Error("Access denied"), { status: 403 });

  Object.assign(policy, updates);
  await policy.save();
  return policy;
}

async function deletePolicy(policyId, hotelId) {
  const policy = await EscalationPolicy.findById(policyId);
  if (!policy) throw Object.assign(new Error("Policy not found"), { status: 404 });
  if (String(policy.hotel_id) !== String(hotelId))
    throw Object.assign(new Error("Access denied"), { status: 403 });
  await policy.deleteOne();
  return { ok: true };
}

module.exports = {
  checkEscalationPolicies,
  createDefaultPolicies,
  listPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
};
