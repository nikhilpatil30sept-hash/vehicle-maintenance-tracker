/**
 * Shared fixtures/helpers for the Playwright e2e suite.
 *
 * Every spec stubs the backend with page.route rather than running a real
 * Flask API - see the notes in the CI workflow and README for why that's
 * deliberate. Ported from the Cypress suite this replaces
 * (git history: frontend/cypress/e2e/carkeeper_test.cy.js).
 */
const API = process.env.REACT_APP_API_BASE || 'http://localhost:5001';

const VEHICLE = {
  id: 1, make: 'Honda', model: 'Civic', year: 2020,
  license_plate: 'ABC123', current_mileage: 50000,
};

const RECORD = {
  id: 7, date: '2026-01-15', task: 'Oil change',
  cost: 89.99, mileage: 49000, category: 'General', receipt_fingerprint: null,
};

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Put a valid session in localStorage before the app's first script runs -
 * the Playwright equivalent of Cypress's cy.visit(onBeforeLoad). */
async function seedSession(page, user = { id: 1, email: 'test@example.com' }, token = 'test-token') {
  await page.addInitScript(
    ([t, u]) => {
      window.localStorage.setItem('carkeeper_token', t);
      window.localStorage.setItem('carkeeper_user', JSON.stringify(u));
    },
    [token, user]
  );
}

/** Stub the authenticated GET endpoints the dashboard loads on mount. */
async function mockAuthenticatedRoutes(page, { vehicles = [VEHICLE], records = [RECORD], summary } = {}) {
  await page.route(`${API}/vehicles`, (route) => {
    if (route.request().method() === 'GET') return fulfillJson(route, vehicles);
    return route.fallback();
  });
  await page.route(`${API}/summary`, (route) =>
    fulfillJson(route, summary || { vehicle_count: vehicles.length, total_cost: 89.99 })
  );
  await page.route(`${API}/records*`, (route) => {
    if (route.request().method() === 'GET') return fulfillJson(route, records);
    return route.fallback();
  });
}

/** Combines seedSession + mockAuthenticatedRoutes - the common case for any
 * test that starts already signed in. Call before page.goto('/'). */
async function signIn(page, options) {
  await seedSession(page);
  await mockAuthenticatedRoutes(page, options);
}

/** Exact-match label lookup (Playwright's getByLabel does substring matching
 * by default, and "Mileage" would otherwise also match "Current mileage"
 * once both the vehicle form and the record form are on screen together). */
function label(page, text) {
  return page.getByLabel(text, { exact: true });
}

module.exports = { API, VEHICLE, RECORD, fulfillJson, seedSession, mockAuthenticatedRoutes, signIn, label };
