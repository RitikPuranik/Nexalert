"use strict";
const IncidentReport    = require("../model/incidentReport.model");
const Incident          = require("../../incident/model/incident.model");
const StaffTask         = require("../../incident/model/staffTask.model");
const GuestNotification = require("../../guest/model/guestNotification.model");
const Hotel             = require("../../hotel/model/hotel.model");
const { generateReportNarrative } = require("../../incident/service/gemini.service");

// ── Generate / fetch report ──────────────────────────────────────────────────

async function generateReport(incidentId, requestingHotelId) {
  // Return cached report if already generated (after hotel scope check)
  const existing = await IncidentReport.findOne({ incident_id: incidentId }).lean();
  if (existing) {
    // Return cached — but still enforce hotel scope
    if (String(existing.hotel_id) !== String(requestingHotelId))
      throw Object.assign(new Error("Access denied"), { status: 403 });
    return existing; // Return cached
  }

  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw Object.assign(new Error("Incident not found"), { status: 404 });
  if (String(incident.hotel_id) !== String(requestingHotelId))
    throw Object.assign(new Error("Access denied"), { status: 403 });
  if (!["resolved","false_alarm"].includes(incident.status))
    throw Object.assign(new Error("Incident must be resolved before generating a report"), { status: 400 });

  const [tasks, notifications, hotel] = await Promise.all([
    StaffTask.find({ incident_id: incidentId }).lean(),
    GuestNotification.find({ incident_id: incidentId }).lean(),
    Hotel.findById(incident.hotel_id).lean(),
  ]);

  const timeline = _buildTimeline(incident, tasks, notifications);
  const metrics  = _computeMetrics(incident, tasks, notifications);

  // AI narrative (falls back gracefully on error)
  let aiResult = { executive_summary: null, recommendations: [] };
  try {
    aiResult = await generateReportNarrative({ incident, tasks, notifications, hotel, timeline, metrics });
  } catch (aiErr) {
    console.error("[Report] AI narrative failed:", aiErr.message);
    const mins = metrics.resolution_time_seconds ? Math.round(metrics.resolution_time_seconds / 60) : "?";
    aiResult = {
      executive_summary: `A ${incident.type} incident occurred on floor ${incident.floor} at ${hotel?.name || "the hotel"}. Resolution time: ${mins} minutes. AI summary unavailable — review the timeline manually.`,
      recommendations:   ["Review incident response time","Verify sensor calibration"],
    };
  }

  const drillScore = incident.is_drill ? _computeDrillScore(metrics, metrics.triage_time_seconds) : undefined;

  const report = await IncidentReport.create({
    incident_id:       incidentId,
    hotel_id:          incident.hotel_id,
    is_drill:          incident.is_drill,
    timeline,
    metrics,
    executive_summary: aiResult.executive_summary,
    recommendations:   aiResult.recommendations,
    drill_score:       drillScore,
  });

  return report;
}

async function listReports(hotelId) {
  return IncidentReport.find({ hotel_id: hotelId })
    .populate("incident_id", "type floor status createdAt is_drill")
    .sort({ createdAt: -1 })
    .lean();
}

async function getReport(reportId, hotelId) {
  const report = await IncidentReport.findById(reportId).populate("incident_id").lean();
  if (!report) throw Object.assign(new Error("Report not found"), { status: 404 });
  if (String(report.hotel_id) !== String(hotelId))
    throw Object.assign(new Error("Access denied"), { status: 403 });
  return report;
}

async function getDrillScore(incidentId, hotelId) {
  const report = await IncidentReport.findOne({ incident_id: incidentId, is_drill: true }).lean();
  if (!report) throw Object.assign(new Error("Drill report not found — generate it first via POST /api/reports"), { status: 404 });
  if (String(report.hotel_id) !== String(hotelId))
    throw Object.assign(new Error("Access denied"), { status: 403 });
  return { incident_id: incidentId, drill_score: report.drill_score, metrics: report.metrics, recommendations: report.recommendations };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _buildTimeline(incident, tasks, notifications) {
  const events = [];
  const origin = new Date(incident.createdAt).getTime();

  const add = (ts, event, detail) => {
    if (!ts) return;
    events.push({ elapsed_seconds: Math.round((new Date(ts).getTime() - origin) / 1000), event, detail, timestamp: new Date(ts) });
  };

  add(incident.createdAt,         "Incident created",      `Source: ${incident.source}, Type: ${incident.type}, Floor: ${incident.floor}`);
  add(incident.triage_at,         "AI triage complete",    `Severity: ${incident.severity}, ${tasks.length} tasks created`);
  add(incident.confirmed_at,      "Incident confirmed",    "Manager confirmed incident");
  add(incident.escalated_to_911_at,"Escalated to 911",     "Emergency services contacted");
  add(incident.resolved_at,       "Incident resolved",     "All clear sent to guests");

  for (const t of tasks) {
    add(t.accepted_at,  `Task accepted`,  `"${t.title}" — ${t.assigned_role}`);
    add(t.started_at,   `Task started`,   `"${t.title}"`);
    add(t.completed_at, `Task completed`, `"${t.title}"`);
  }

  const firstNotif = notifications.reduce((a, b) => (new Date(a.createdAt) < new Date(b.createdAt) ? a : b), notifications[0]);
  if (firstNotif) add(firstNotif.createdAt, "Guest alerts sent", `${notifications.length} guests notified`);

  const firstResp = notifications.filter((n) => n.responded_at).sort((a, b) => new Date(a.responded_at) - new Date(b.responded_at))[0];
  if (firstResp) add(firstResp.responded_at, "First guest response", `Room ${firstResp.room}: ${firstResp.guest_response}`);

  return events.sort((a, b) => a.elapsed_seconds - b.elapsed_seconds);
}

function _computeMetrics(incident, tasks, notifications) {
  const triageTime     = incident.triage_at   ? Math.round((new Date(incident.triage_at).getTime()   - new Date(incident.createdAt).getTime()) / 1000) : null;
  const resolutionTime = incident.resolved_at ? Math.round((new Date(incident.resolved_at).getTime() - new Date(incident.createdAt).getTime()) / 1000) : null;

  const delivered   = notifications.filter((n) => ["delivered","sent"].includes(n.delivery_status)).length;
  const responded   = notifications.filter((n) => n.guest_response !== "no_response").length;
  const completed   = tasks.filter((t) => t.status === "completed").length;

  return {
    triage_time_seconds:        triageTime,
    resolution_time_seconds:    resolutionTime,
    task_completion_rate:       tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
    notification_delivery_rate: notifications.length ? Math.round((delivered / notifications.length) * 100) : 0,
    guest_accountability_rate:  notifications.length ? Math.round((responded / notifications.length) * 100) : 0,
    guests_confirmed_safe:      notifications.filter((n) => n.guest_response === "safe").length,
    guests_needed_help:         notifications.filter((n) => n.guest_response === "needs_help").length,
    guests_no_response:         notifications.filter((n) => n.guest_response === "no_response").length,
  };
}

function _computeDrillScore(metrics, triageTimeSecs) {
  const staffResponseScore      = Math.min(100, metrics.task_completion_rate + (triageTimeSecs < 120 ? 10 : 0));
  const taskCompletionScore     = metrics.task_completion_rate;
  const guestAccountabilityScore = metrics.guest_accountability_rate;
  const overall = Math.round(staffResponseScore * 0.35 + taskCompletionScore * 0.35 + guestAccountabilityScore * 0.30);
  return { overall, staff_response_score: staffResponseScore, task_completion_score: taskCompletionScore, guest_accountability_score: guestAccountabilityScore };
}

module.exports = { generateReport, listReports, getReport, getDrillScore };
