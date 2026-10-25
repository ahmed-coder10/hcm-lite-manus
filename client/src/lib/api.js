const TOKEN_KEY = 'hcm.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details || null;
  }
}

/**
 * Single fetch wrapper: adds the JWT, unwraps { data }, and turns API errors
 * into ApiError(message, status, fieldErrors).
 */
export async function api(path, { method = 'GET', body, signal, raw = false } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (raw) return res;

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const message = json?.error?.message || `Request failed (${res.status})`;
    const err = new ApiError(message, res.status, json?.error?.details);
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      setToken(null);
      window.dispatchEvent(new CustomEvent('hcm:unauthorized'));
    }
    throw err;
  }
  return json?.data ?? json;
}

/** Downloads a file that requires the Authorization header. */
export async function downloadFile(path, filename) {
  const res = await api(path, { raw: true });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new ApiError(json?.error?.message || 'Download failed', res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const get = (path, opts) => api(path, opts);
export const post = (path, body, opts) => api(path, { method: 'POST', body, ...opts });
export const patch = (path, body, opts) => api(path, { method: 'PATCH', body, ...opts });
export const del = (path, opts) => api(path, { method: 'DELETE', ...opts });
