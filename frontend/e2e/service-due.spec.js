const { test, expect } = require('@playwright/test');
const { signIn } = require('./helpers');

test.describe('Service due indicator', () => {
  test('flags a vehicle well past its oil change interval', async ({ page }) => {
    await signIn(page, {
      records: [{ id: 7, task: 'Oil change', cost: 89.99, mileage: 40000, date: '2025-01-01', category: 'General', receipt_fingerprint: null }],
    });
    await page.goto('/');
    await page.getByText('2020 Honda Civic').click();
    await expect(page.getByText('Service History')).toBeVisible();

    await expect(page.getByText('Service Due')).toBeVisible();
  });

  // The old check matched the bare word "oil", so an inspection reset the clock.
  test('does not count an oil filter inspection as an oil change', async ({ page }) => {
    await signIn(page, {
      records: [{ id: 7, task: 'Oil filter inspection', cost: 89.99, mileage: 49500, date: '2026-06-01', category: 'General', receipt_fingerprint: null }],
    });
    await page.goto('/');
    await page.getByText('2020 Honda Civic').click();
    await expect(page.getByText('Service History')).toBeVisible();

    await expect(page.getByText('Service Due')).toBeVisible();
  });

  test('stays quiet for a recently serviced vehicle', async ({ page }) => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 1);
    await signIn(page, {
      records: [{
        id: 7, task: 'Oil change', cost: 89.99, mileage: 49000,
        date: recent.toISOString().split('T')[0], category: 'General', receipt_fingerprint: null,
      }],
    });
    await page.goto('/');
    await page.getByText('2020 Honda Civic').click();

    await expect(page.getByText('Service History')).toBeVisible();
    await expect(page.getByText('Service Due')).not.toBeVisible();
  });
});
