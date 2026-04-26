export const INCIDENT_ICONS = {
  fire:'🔥', smoke:'💨', gas_leak:'☁️', medical:'🏥',
  security:'🔒', flood:'🌊', earthquake:'🌍', sos:'🆘', unknown:'❓',
};
export const SEVERITY_LABELS = { 1:'CRITICAL', 2:'URGENT', 3:'MONITOR' };
export const STATUS_LABELS = {
  detecting:'Detecting', triaging:'Triaging', active:'Active',
  investigating:'Investigating', resolved:'Resolved', false_alarm:'False Alarm',
};
export const ROLE_ICONS = {
  manager:'👔', security:'🛡️', maintenance:'🔧', medical:'🩺',
  staff:'👤', responder:'🚒', concierge:'🛎️',
};

export function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.floor(diff/1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s/60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}
export function formatTime(date) {
  return new Date(date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
export function formatDateTime(date) {
  return new Date(date).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}
export function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
}
export function eventCategory(type='') {
  if (type.startsWith('incident')) return 'incident';
  if (type.startsWith('task'))     return 'task';
  if (type.startsWith('guest'))    return 'guest';
  if (type.startsWith('sensor'))   return 'sensor';
  if (type.startsWith('staff'))    return 'staff';
  if (type.startsWith('deadman'))  return 'deadman';
  return 'system';
}

// QR URL builder for guests — uses qr_token when available (more secure)
export function buildGuestQR(hotelId, room, floor, qrToken) {
  const base = window.location.origin.replace('5173','5174');
  if (qrToken) {
    return `${base}/?t=${qrToken}&room=${room}&floor=${floor}`;
  }
  return `${base}/?hotel_id=${hotelId}&room=${room}&floor=${floor}`;
}

// Build hotel-level QR (no room/floor — guest fills those in)
export function buildHotelQR(qrToken, baseUrl) {
  const base = baseUrl || window.location.origin.replace('5173','5174');
  return `${base}/?t=${qrToken}`;
}
