const { test, expect } = require('@playwright/test');
const { API, VEHICLE, signIn, label } = require('./helpers');

test.describe('Garage', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto('/');
    await expect(page.getByText('My Garage')).toBeVisible();
  });

  test('lists vehicles and the spend summary', async ({ page }) => {
    await expect(page.getByText('2020 Honda Civic')).toBeVisible();
    await expect(page.getByText('ABC123')).toBeVisible();
    await expect(page.getByText('50,000 miles')).toBeVisible();
    await expect(page.getByText('$89.99')).toBeVisible();
  });

  test('requires make, model, year and mileage before adding a vehicle', async ({ page }) => {
    let created = false;
    await page.route(`${API}/vehicles`, (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      created = true;
      return route.fulfill({ status: 201, body: '{}' });
    });

    await page.getByRole('button', { name: 'Add Vehicle' }).click();

    const valid = await label(page, 'Make').evaluate((el) => el.checkValidity());
    expect(valid).toBe(false);
    expect(created).toBe(false);
  });

  test('adds a vehicle and refreshes the list', async ({ page }) => {
    await page.route(`${API}/vehicles`, (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 2, make: 'Toyota', model: 'Corolla', year: 2021, license_plate: '', current_mileage: 12000 }),
      });
    });

    await label(page, 'Year').fill('2021');
    await label(page, 'Make').fill('Toyota');
    await label(page, 'Model').fill('Corolla');
    await label(page, 'Current mileage').fill('12000');
    await page.getByRole('button', { name: 'Add Vehicle' }).click();

    await expect(page.getByText('Toyota Corolla added.')).toBeVisible();
    await expect(label(page, 'Make')).toHaveValue(''); // cleared on success
  });

  // Uses input the browser accepts (a year below min="1885" never leaves the
  // form) so the request actually reaches the mock and the error-display
  // path is what gets exercised.
  test('surfaces a server validation error and keeps the input', async ({ page }) => {
    await page.route(`${API}/vehicles`, (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Current mileage must be between 0 and 10000000', field: 'current_mileage' }),
      });
    });

    await label(page, 'Year').fill('2021');
    await label(page, 'Make').fill('Honda');
    await label(page, 'Model').fill('Civic');
    await label(page, 'Current mileage').fill('99999999');
    await page.getByRole('button', { name: 'Add Vehicle' }).click();

    await expect(page.getByText('Current mileage must be between 0 and 10000000')).toBeVisible();
    await expect(label(page, 'Make')).toHaveValue('Honda'); // input preserved
  });

  test('blocks an out-of-range year in the browser', async ({ page }) => {
    let created = false;
    await page.route(`${API}/vehicles`, (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      created = true;
      return route.fulfill({ status: 201, body: '{}' });
    });

    await label(page, 'Year').fill('1000');
    await label(page, 'Make').fill('Honda');
    await label(page, 'Model').fill('Civic');
    await label(page, 'Current mileage').fill('100');
    await page.getByRole('button', { name: 'Add Vehicle' }).click();

    const rangeUnderflow = await label(page, 'Year').evaluate((el) => el.validity.rangeUnderflow);
    expect(rangeUnderflow).toBe(true);
    expect(created).toBe(false);
  });

  test('asks for confirmation before deleting a vehicle', async ({ page }) => {
    let deleteCalled = false;
    await page.route(`${API}/vehicles/${VEHICLE.id}`, (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      deleteCalled = true;
      return route.fulfill({ status: 200, body: '{}' });
    });
    page.once('dialog', (dialog) => dialog.dismiss()); // decline

    const card = page.locator('[role="button"]').filter({ hasText: '2020 Honda Civic' });
    await card.hover();
    await page.getByRole('button', { name: /Delete Honda Civic/ }).click();

    expect(deleteCalled).toBe(false);
  });
});
