/**
 * Incidents Module — API Routes
 *
 * Routes:
 *   GET  /api/incidents              List incidents (role-filtered)
 *   POST /api/incidents/sos          Guest SOS submission
 *   GET  /api/incidents/sos          Poll for triage completion
 *   GET  /api/incidents/[id]         Single incident detail
 *   PATCH /api/incidents/[id]        Confirm / dismiss / resolve
 *   GET  /api/incidents/[id]/tasks   Task list for incident
 *   PATCH /api/incidents/[id]/tasks/[taskId]  Staff task action
 */

export { GET as listIncidents, PATCH as patchIncident } from './list'
export { GET as getIncident, PATCH as updateIncident } from './detail'
export { GET as getIncidentTasks, PATCH as updateTask } from './tasks'
export { POST as submitSOS, GET as pollSOS } from './sos'
