/**
 * k6 load test for the CarKeeper backend.
 *
 * Run against a disposable Flask + Postgres instance in CI (see the
 * "Load test (k6)" job in .github/workflows/ci.yml) - never against the
 * real Render deployment. This job is informational, not a required
 * branch-protection check: performance thresholds are noisier than
 * correctness tests and a shared CI runner's performance varies run to run,
 * so failing a merge over it would cause false alarms. See loadtest/README.md.
 *
 * IMPORTANT: /login is rate-limited to 10 attempts / 5 minutes per source
 * IP (see LOGIN_MAX_ATTEMPTS in app.py). Every VU in this test shares one
 * IP (the CI runner), so this script deliberately makes only a handful of
 * /login calls total across the whole run - see loginSample below - and
 * stresses the password-hashing path via /register instead, which has no
 * such limit. Do not add more /login traffic without accounting for this.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:5001';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const FAKE_IMAGE_B64 = 'ZmFrZS1pbWFnZS1ieXRlcy1mb3ItbG9hZC10ZXN0aW5n'; // arbitrary base64, never decoded as a real image

export const options = {
  scenarios: {
    // The real bottleneck candidate: generate_password_hash on every call,
    // hit concurrently with a fresh, never-seen-before email each iteration.
    register: {
      executor: 'constant-vus',
      vus: 8,
      duration: '20s',
      exec: 'registerScenario',
    },
    // Deliberately tiny and fixed - see the file-level comment. 4 iterations
    // here + 1 in setup() = 5 total /login calls, well under the 10/5min cap.
    loginSample: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 4,
      maxDuration: '30s',
      exec: 'loginScenario',
    },
    read: {
      executor: 'constant-vus',
      vus: 10,
      duration: '20s',
      exec: 'readScenario',
    },
    write: {
      executor: 'constant-vus',
      vus: 5,
      duration: '20s',
      exec: 'writeScenario',
    },
    ocr: {
      executor: 'constant-vus',
      vus: 3,
      duration: '20s',
      exec: 'ocrScenario',
    },
  },
  thresholds: {
    'http_req_duration{scenario:register}': ['p(95)<800'],
    'http_req_duration{scenario:loginSample}': ['p(95)<500'],
    'http_req_duration{scenario:read}': ['p(95)<300'],
    'http_req_duration{scenario:write}': ['p(95)<400'],
    'http_req_duration{scenario:ocr}': ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const SHARED_PASSWORD = 'loadtest-shared-pw';
const SHARED_EMAIL = 'loadtest-shared@example.com';

// Runs once before any VU starts, regardless of VU count - creates the
// fixed account/vehicle that the read/write/ocr scenarios share, so they're
// measuring endpoint latency rather than paying registration cost every
// iteration.
export function setup() {
  http.post(
    `${BASE_URL}/register`,
    JSON.stringify({ email: SHARED_EMAIL, password: SHARED_PASSWORD }),
    { headers: JSON_HEADERS }
  );

  const loginRes = http.post(
    `${BASE_URL}/login`,
    JSON.stringify({ email: SHARED_EMAIL, password: SHARED_PASSWORD }),
    { headers: JSON_HEADERS }
  );
  const token = loginRes.json('token');
  const authHeaders = { Authorization: `Bearer ${token}`, ...JSON_HEADERS };

  const vehicleRes = http.post(
    `${BASE_URL}/vehicles`,
    JSON.stringify({ make: 'Honda', model: 'Civic', year: 2020, current_mileage: 0 }),
    { headers: authHeaders }
  );
  const vehicleId = vehicleRes.json('id');

  return { token, vehicleId };
}

export function registerScenario() {
  const email = `loadtest-${__VU}-${__ITER}-${Date.now()}@example.com`;
  const res = http.post(
    `${BASE_URL}/register`,
    JSON.stringify({ email, password: 'loadtest-unique-pw' }),
    { headers: JSON_HEADERS }
  );
  check(res, { 'register: 201': (r) => r.status === 201 });
  sleep(1);
}

export function loginScenario() {
  const res = http.post(
    `${BASE_URL}/login`,
    JSON.stringify({ email: SHARED_EMAIL, password: SHARED_PASSWORD }),
    { headers: JSON_HEADERS }
  );
  check(res, { 'login: 200': (r) => r.status === 200 });
  sleep(2);
}

export function readScenario(data) {
  const authHeaders = { Authorization: `Bearer ${data.token}` };

  const vehiclesRes = http.get(`${BASE_URL}/vehicles`, { headers: authHeaders });
  check(vehiclesRes, { 'list vehicles: 200': (r) => r.status === 200 });

  const summaryRes = http.get(`${BASE_URL}/summary`, { headers: authHeaders });
  check(summaryRes, { 'summary: 200': (r) => r.status === 200 });

  sleep(1);
}

export function writeScenario(data) {
  const authHeaders = { Authorization: `Bearer ${data.token}`, ...JSON_HEADERS };

  const res = http.post(
    `${BASE_URL}/records`,
    JSON.stringify({
      vehicle_id: data.vehicleId,
      date: '2024-01-01',
      task: 'Oil change',
      cost: 49.99,
      mileage: 100,
    }),
    { headers: authHeaders }
  );
  check(res, { 'create record: 201': (r) => r.status === 201 });

  sleep(1);
}

export function ocrScenario(data) {
  const authHeaders = { Authorization: `Bearer ${data.token}`, ...JSON_HEADERS };

  const res = http.post(
    `${BASE_URL}/api/ocr`,
    JSON.stringify({ image: FAKE_IMAGE_B64, mime_type: 'image/jpeg' }),
    { headers: authHeaders }
  );
  check(res, { 'ocr: 200': (r) => r.status === 200 });

  sleep(1);
}
