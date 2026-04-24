const API_BASE = import.meta.env.VITE_API_URL || '';

let _token = localStorage.getItem('nexalert_token') || null;

export function setToken(t) {
  _token = t;
  if (t) localStorage.setItem('nexalert_token', t);
  else localStorage.removeItem('nexalert_token');
}

export function getToken() { return _token; }

export async function api(path, opts = {}) {
  const { method = 'GET', body, headers = {} } = opts;

  const config = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
      ...headers,
    },
  };

  if (body) config.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, config);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Convenience shortcuts
export const get  = (path) => api(path);
export const post = (path, body) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const del  = (path) => api(path, { method: 'DELETE' });
