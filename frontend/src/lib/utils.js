/**
 * Utility helpers for NexAlert frontend
 */

// Incident type → emoji icon
export const INCIDENT_ICONS = {
  fire:       '🔥',
  smoke:      '💨',
  gas_leak:   '☁️',
  medical:    '🏥',
  security:   '🔒',
  flood:      '🌊',
  earthquake: '🌍',
  sos:        '🆘',
  unknown:    '❓',
};

// Severity → label
export const SEVERITY_LABELS = {
  1: 'CRITICAL',
  2: 'URGENT',
  3: 'MONITOR',
};

// Status → label
export const STATUS_LABELS = {
  detecting:     'Detecting',
  triaging:      'Triaging',
  active:        'Active',
  investigating: 'Investigating',
  resolved:      'Resolved',
  false_alarm:   'False Alarm',
};

/**
 * Time ago (compact)
 */
export function timeAgo(date) {
  const now = Date.now();
  const d = new Date(date).getTime();
  const diff = Math.max(0, now - d);

  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;

  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;

  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;

  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

/**
 * Format a date for display
 */
export function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(date) {
  return new Date(date).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Initials from name
 */
export function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/**
 * SSE event type → category
 */
export function eventCategory(type) {
  if (type.startsWith('incident')) return 'incident';
  if (type.startsWith('task'))     return 'task';
  if (type.startsWith('guest'))    return 'guest';
  if (type.startsWith('sensor'))   return 'sensor';
  return 'system';
}
