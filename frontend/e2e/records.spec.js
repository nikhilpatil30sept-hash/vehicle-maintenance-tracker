const { test, expect } = require('@playwright/test');
const { API, RECORD, signIn, label } = require('./helpers');

test.describe('Service records', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    await page.getByText('2020 Honda Civic').click();
    await expect(page.getByText('Service History')).toBeVisible();
  });

  test('shows the selected vehicle history', async ({ page }) => {
    // Scoped to the record row: the vehicle's $89.99 total spend and this
    // record's $89.99 cost are both on screen at once, so an unscoped
    // getByText('$89.99') would match two elements.
    const row = page.locator('.group').filter({ hasText: 'Oil change' });
    await expect(row).toBeVisible();
    await expect(row.getByText('$89.99')).toBeVisible();
    await expect(row.getByText('49,000 mi')).toBeVisible();
  });

  test('requires the service fields before saving', async ({ page }) => {
    let created = false;
    await page.route(`${API}/records`, (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      created = true;
      return route.fulfill({ status: 201, body: '{}' });
    });

    await page.getByRole('button', { name: 'Save Service Record' }).click();

    const valid = await label(page, 'Service description').evaluate((el) => el.checkValidity());
    expect(valid).toBe(false);
    expect(created).toBe(false);
  });

  test('rejects a future service date in the browser', async ({ page }) => {
    const dateInput = label(page, 'Service date');
    const max = await dateInput.getAttribute('max');
    expect(max).toBeTruthy();
    expect(new Date(max) <= new Date()).toBe(true);
  });

  // The old code set current_mileage locally from the submitted value, so a
  // backdated record made the UI disagree with the server's max() rule.
  test('saves a record and re-reads the vehicle rather than guessing the odometer', async ({ page }) => {
    await page.route(`${API}/records`, (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 8 }) });
    });

    await label(page, 'Service description').fill('Backdated service');
    await label(page, 'Cost').fill('20');
    await label(page, 'Mileage').fill('10000');

    const vehiclesRefetched = page.waitForResponse(
      (resp) => resp.url().startsWith(`${API}/vehicles`) && resp.request().method() === 'GET'
    );
    await page.getByRole('button', { name: 'Save Service Record' }).click();
    await vehiclesRefetched;

    // Odometer still reflects the server value, not the 10,000 just submitted.
    await expect(page.getByText('50,000 miles')).toBeVisible();
  });

  test('confirms before deleting a record', async ({ page }) => {
    let deleteCalled = false;
    await page.route(`${API}/records/${RECORD.id}`, (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      deleteCalled = true;
      return route.fulfill({ status: 200, body: '{}' });
    });
    page.once('dialog', (dialog) => dialog.dismiss());

    const row = page.locator('.group').filter({ hasText: 'Oil change' });
    await row.hover();
    await page.getByRole('button', { name: /Delete Oil change/ }).click();

    expect(deleteCalled).toBe(false);
  });
});
