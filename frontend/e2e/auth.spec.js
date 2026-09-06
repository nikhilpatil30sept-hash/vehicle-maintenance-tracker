const { test, expect } = require('@playwright/test');
const { API } = require('./helpers');

test.describe('Authentication', () => {
  test('shows the login screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('CarKeeper')).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  // The old markup used <div onSubmit>, so `required` never did anything and
  // the form silently posted empty credentials.
  test('blocks submission when required fields are empty', async ({ page }) => {
    let loginCalled = false;
    await page.route(`${API}/login`, (route) => {
      loginCalled = true;
      return route.fulfill({ status: 200, body: '{}' });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Sign In' }).click();

    const valid = await page.getByPlaceholder('Email').evaluate((el) => el.checkValidity());
    expect(valid).toBe(false);
    expect(loginCalled).toBe(false);
  });

  test('rejects a malformed email address', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Email').fill('not-an-email');
    await page.getByPlaceholder(/Password/).fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    const typeMismatch = await page.getByPlaceholder('Email').evaluate((el) => el.validity.typeMismatch);
    expect(typeMismatch).toBe(true);
  });

  // The password field carries minLength, but a React controlled input
  // resets the "dirty value" flag when it writes .value back, and
  // `tooShort` only applies to user-dirtied values - so the browser does not
  // actually block a short password here. The server is the real
  // enforcement; this checks both halves.
  test('advertises the minimum password length and surfaces the server rejection', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder(/Password/)).toHaveAttribute('minlength', '8');

    await page.route(`${API}/register`, (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Password must be at least 8 characters' }),
      })
    );

    await page.getByRole('button', { name: /Need an account/ }).click();
    await page.getByPlaceholder('Email').fill('user@example.com');
    await page.getByPlaceholder(/Password/).fill('short');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
  });

  test('submits when Enter is pressed inside the form', async ({ page }) => {
    await page.route(`${API}/login`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'test-token', user: { id: 1, email: 'user@example.com' } }),
      })
    );
    await page.route(`${API}/vehicles`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );
    await page.route(`${API}/summary`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ vehicle_count: 0, total_cost: 0 }),
      })
    );

    await page.goto('/');
    await page.getByPlaceholder('Email').fill('user@example.com');
    await page.getByPlaceholder(/Password/).fill('password123');
    await page.getByPlaceholder(/Password/).press('Enter');

    await expect(page.getByText('My Garage')).toBeVisible();
  });

  test('shows the server message for bad credentials', async ({ page }) => {
    await page.route(`${API}/login`, (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Invalid credentials' }) })
    );

    await page.goto('/');
    await page.getByPlaceholder('Email').fill('user@example.com');
    await page.getByPlaceholder(/Password/).fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Invalid credentials')).toBeVisible();
  });

  test('toggles between sign in and registration', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Need an account/ }).click();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();

    await page.getByRole('button', { name: /Already have an account/ }).click();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('returns to login after registering', async ({ page }) => {
    await page.route(`${API}/register`, (route) =>
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ msg: 'Success' }) })
    );

    await page.goto('/');
    await page.getByRole('button', { name: /Need an account/ }).click();
    await page.getByPlaceholder('Email').fill('new@example.com');
    await page.getByPlaceholder(/Password/).fill('password123');
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByText('Account created. Please sign in.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });
});

test.describe('Expired session', () => {
  test('signs out and explains why when the token is rejected', async ({ page }) => {
    // Routes must be registered before the visit: the app fires both
    // requests on mount.
    await page.route(`${API}/vehicles`, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Session expired, please log in again' }),
      })
    );
    await page.route(`${API}/summary`, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Session expired, please log in again' }),
      })
    );
    await page.addInitScript(() => {
      window.localStorage.setItem('carkeeper_token', 'expired');
      window.localStorage.setItem('carkeeper_user', JSON.stringify({ id: 1, email: 'a@b.com' }));
    });

    await page.goto('/');

    await expect(page.getByText('Session expired, please log in again')).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    const token = await page.evaluate(() => window.localStorage.getItem('carkeeper_token'));
    expect(token).toBeNull();
  });
});
