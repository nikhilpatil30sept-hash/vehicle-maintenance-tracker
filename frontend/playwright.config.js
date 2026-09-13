// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Matches what the e2e specs intercept by default (see e2e/helpers.js) and
// what CI sets for the Cypress job this replaces - kept overridable so a
// developer with a different local port can still run the suite unchanged.
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5001';

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // visual.spec.js gets its own project (chromium only - a screenshot
  // baseline is tied to one specific rendering engine, so comparing it
  // against Firefox/WebKit renders would just be permanent false failures)
  // and is excluded from the three cross-browser projects below via
  // testIgnore. The `visual-regression` CI job runs --project=visual on its
  // own; `e2e-tests` runs the other three and never touches it.
  projects: [
    { name: 'chromium', testIgnore: /visual\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testIgnore: /visual\.spec\.js/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testIgnore: /visual\.spec\.js/, use: { ...devices['Desktop Safari'] } },
    { name: 'visual', testMatch: /visual\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
  ],

  // Boots the CRA dev server itself and waits for it to answer before any
  // test runs - locally or in CI, `npx playwright test` alone is enough.
  // `reuseExistingServer` lets a developer keep their own `npm start` running
  // and just re-run tests against it.
  webServer: {
    command: 'npm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: { REACT_APP_API_BASE: API_BASE },
  },
});
