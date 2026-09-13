/**
 * Automated accessibility scans (axe-core) layered onto screens the rest of
 * the e2e suite already reaches. Not a substitute for manual/keyboard/screen
 * reader testing - axe only catches what's mechanically detectable (missing
 * labels, contrast, ARIA misuse, etc) - but it catches those for free on
 * every push since Playwright is already driving a real browser here.
 */
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { signIn } = require('./helpers');

async function scan(page) {
  return new AxeBuilder({ page }).analyze();
}

function describeViolations(violations) {
  return violations
    .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
    .join('\n');
}

test.describe('Accessibility', () => {
  test('sign-in screen has no detectable violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('Email')).toBeVisible();

    const results = await scan(page);
    expect(results.violations, describeViolations(results.violations)).toEqual([]);
  });

  test('the garage dashboard has no detectable violations', async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    await expect(page.getByText('My Garage')).toBeVisible();
    await expect(page.getByText('2020 Honda Civic')).toBeVisible();

    const results = await scan(page);
    expect(results.violations, describeViolations(results.violations)).toEqual([]);
  });

  test('a selected vehicle with its record form and history has no detectable violations', async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    await page.getByText('2020 Honda Civic').click();
    await expect(page.getByText('Add Service')).toBeVisible();
    await expect(page.getByText('Service History')).toBeVisible();

    const results = await scan(page);
    expect(results.violations, describeViolations(results.violations)).toEqual([]);
  });
});
