const DEFAULT_TIMEOUT = 30000;

export const TOKEN_KEY = 'carkeeper_token';
export const USER_KEY = 'carkeeper_user';

// In development an unset REACT_APP_API_BASE used to silently fall through to the
// production backend, so local work hit live data. Fail loudly instead.
function resolveApiBase() {
  const configured = process.env.REACT_APP_API_BASE;
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'development') {
    throw new Error(
      'REACT_APP_API_BASE is not set. Copy frontend/.env.example to frontend/.env ' +
      '(or run ./dev.sh, which creates it for you).'
    );
  }
  return 'https://my-flask-backend-3ehc.onrender.com';
}

export const API_BASE = resolveApiBase();

/** Error carrying the HTTP status, so callers can branch on it. */
export class ApiError extends Error {
  constructor(message, status, field) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.field = field;
  }
}

/** Thrown for deterministic failures that must not be retried. */
export class AuthError extends ApiError {
  constructor(message) {
    super(message, 401);
    this.name = 'AuthError';
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser() {
  // Corrupt storage used to throw here and white-screen the whole app.
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    clearSession();
    return null;
  }
}

let onUnauthorized = null;

/** Register a callback invoked whenever the API rejects our token. */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

/**
 * Perform an API request.
 *
 * Uses fetch + AbortController so requests actually time out, and rejects with
 * an ApiError carrying the status rather than a bare string.
 */
export async function request(method, path, body = null, { timeout = DEFAULT_TIMEOUT } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response;
  try {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError('Request timed out. Check your connection and try again.', 0);
    }
    throw new ApiError('Cannot reach the server. Is the backend running?', 0);
  } finally {
    clearTimeout(timer);
  }

  let payload = {};
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (response.ok) return payload;

  const message = payload.error || `Request failed (${response.status})`;

  if (response.status === 401) {
    // An expired or invalid token previously left the user on a broken, empty
    // dashboard forever. Tear the session down and let the app return to login.
    clearSession();
    if (onUnauthorized) onUnauthorized(message);
    throw new AuthError(message);
  }

  throw new ApiError(message, response.status, payload.field);
}

export const api = {
  login: (credentials) => request('POST', '/login', credentials),
  register: (credentials) => request('POST', '/register', credentials),
  listVehicles: () => request('GET', '/vehicles'),
  createVehicle: (vehicle) => request('POST', '/vehicles', vehicle),
  updateVehicle: (id, vehicle) => request('PUT', `/vehicles/${id}`, vehicle),
  deleteVehicle: (id) => request('DELETE', `/vehicles/${id}`),
  listRecords: (vehicleId) => request('GET', `/records?vehicle_id=${encodeURIComponent(vehicleId)}`),
  createRecord: (record) => request('POST', '/records', record),
  updateRecord: (id, record) => request('PUT', `/records/${id}`, record),
  deleteRecord: (id) => request('DELETE', `/records/${id}`),
  summary: () => request('GET', '/summary'),
  ocr: (image, mimeType) => request('POST', '/api/ocr', { image, mime_type: mimeType }, { timeout: 45000 }),
};
