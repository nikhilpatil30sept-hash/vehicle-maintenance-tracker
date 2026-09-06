/**
 * CarKeeper end-to-end suite.
 *
 * API responses are stubbed with cy.intercept so the suite is deterministic and
 * needs no database, while still running in a real browser. That matters for the
 * form-validation specs below: jsdom does not implement HTML constraint
 * validation, so native `required` enforcement can only be verified here.
 */

const API = Cypress.env('apiBase') || 'http://localhost:5001';

const VEHICLE = {
  id: 1, make: 'Honda', model: 'Civic', year: 2020,
  license_plate: 'ABC123', current_mileage: 50000,
};

const RECORD = {
  id: 7, date: '2026-01-15', task: 'Oil change',
  cost: 89.99, mileage: 49000, category: 'General', receipt_fingerprint: null,
};

/** Put a valid session in localStorage and stub the authenticated endpoints. */
function signIn({ vehicles = [VEHICLE], records = [RECORD], summary } = {}) {
  cy.window().then((win) => {
    win.localStorage.setItem('carkeeper_token', 'test-token');
    win.localStorage.setItem('carkeeper_user', JSON.stringify({ id: 1, email: 'test@example.com' }));
  });
  cy.intercept('GET', `${API}/vehicles`, { statusCode: 200, body: vehicles }).as('getVehicles');
  cy.intercept('GET', `${API}/summary`, {
    statusCode: 200,
    body: summary || { vehicle_count: vehicles.length, total_cost: 89.99 },
  }).as('getSummary');
  cy.intercept('GET', `${API}/records*`, { statusCode: 200, body: records }).as('getRecords');
}

describe('Authentication', () => {
  beforeEach(() => {
    cy.visit('/', { onBeforeLoad: (win) => win.localStorage.clear() });
  });

  it('shows the login screen', () => {
    cy.contains('CarKeeper').should('be.visible');
    cy.get('input[placeholder="Email"]').should('be.visible');
    cy.contains('button', 'Sign In').should('be.visible');
  });

  // The old markup used <div onSubmit>, so `required` never did anything and the
  // form silently posted empty credentials.
  it('blocks submission when required fields are empty', () => {
    cy.intercept('POST', `${API}/login`, cy.spy().as('loginCall'));
    cy.contains('button', 'Sign In').click();

    cy.get('input[placeholder="Email"]').then(($input) => {
      expect($input[0].checkValidity()).to.equal(false);
    });
    cy.get('@loginCall').should('not.have.been.called');
  });

  it('rejects a malformed email address', () => {
    cy.get('input[placeholder="Email"]').type('not-an-email');
    cy.get('input[placeholder*="Password"]').type('password123');
    cy.contains('button', 'Sign In').click();

    cy.get('input[placeholder="Email"]').then(($input) => {
      expect($input[0].validity.typeMismatch).to.equal(true);
    });
  });

  // The password field carries minLength, but React controlled inputs reset the
  // "dirty value" flag when they write .value back, and `tooShort` only applies
  // to user-dirtied values - so the browser does not actually block a short
  // password here. The server is the real enforcement; this checks both halves.
  it('advertises the minimum password length and surfaces the server rejection', () => {
    cy.get('input[placeholder*="Password"]').should('have.attr', 'minlength', '8');

    cy.intercept('POST', `${API}/register`, {
      statusCode: 400,
      body: { error: 'Password must be at least 8 characters' },
    }).as('register');

    cy.contains('button', /Need an account/).click();
    cy.get('input[placeholder="Email"]').type('user@example.com');
    cy.get('input[placeholder*="Password"]').type('short');
    cy.contains('button', 'Create Account').click();

    cy.wait('@register');
    cy.contains('Password must be at least 8 characters').should('be.visible');
  });

  it('submits when Enter is pressed inside the form', () => {
    cy.intercept('POST', `${API}/login`, {
      statusCode: 200,
      body: { token: 'test-token', user: { id: 1, email: 'user@example.com' } },
    }).as('login');
    cy.intercept('GET', `${API}/vehicles`, { body: [] });
    cy.intercept('GET', `${API}/summary`, { body: { vehicle_count: 0, total_cost: 0 } });

    cy.get('input[placeholder="Email"]').type('user@example.com');
    cy.get('input[placeholder*="Password"]').type('password123{enter}');

    cy.wait('@login');
    cy.contains('My Garage').should('be.visible');
  });

  it('shows the server message for bad credentials', () => {
    cy.intercept('POST', `${API}/login`, {
      statusCode: 401,
      body: { error: 'Invalid credentials' },
    }).as('login');

    cy.get('input[placeholder="Email"]').type('user@example.com');
    cy.get('input[placeholder*="Password"]').type('wrongpassword');
    cy.contains('button', 'Sign In').click();

    cy.wait('@login');
    cy.contains('Invalid credentials').should('be.visible');
  });

  it('toggles between sign in and registration', () => {
    cy.contains('button', /Need an account/).click();
    cy.contains('button', 'Create Account').should('be.visible');
    cy.contains('button', /Already have an account/).click();
    cy.contains('button', 'Sign In').should('be.visible');
  });

  it('returns to login after registering', () => {
    cy.intercept('POST', `${API}/register`, { statusCode: 201, body: { msg: 'Success' } }).as('register');

    cy.contains('button', /Need an account/).click();
    cy.get('input[placeholder="Email"]').type('new@example.com');
    cy.get('input[placeholder*="Password"]').type('password123');
    cy.contains('button', 'Create Account').click();

    cy.wait('@register');
    cy.contains('Account created. Please sign in.').should('be.visible');
    cy.contains('button', 'Sign In').should('be.visible');
  });
});

describe('Expired session', () => {
  it('signs out and explains why when the token is rejected', () => {
    // Intercepts must be registered before the visit: the app fires both
    // requests on mount, so registering afterwards lets the real backend answer
    // first (with its own "Invalid authentication token" wording).
    cy.intercept('GET', `${API}/vehicles`, {
      statusCode: 401,
      body: { error: 'Session expired, please log in again' },
    });
    cy.intercept('GET', `${API}/summary`, {
      statusCode: 401,
      body: { error: 'Session expired, please log in again' },
    });

    cy.visit('/', {
      onBeforeLoad: (win) => {
        win.localStorage.setItem('carkeeper_token', 'expired');
        win.localStorage.setItem('carkeeper_user', JSON.stringify({ id: 1, email: 'a@b.com' }));
      },
    });

    cy.contains('Session expired, please log in again').should('be.visible');
    cy.get('input[placeholder="Email"]').should('be.visible');
    cy.window().its('localStorage.carkeeper_token').should('be.undefined');
  });
});

describe('Garage', () => {
  beforeEach(() => {
    cy.visit('/', { onBeforeLoad: (win) => win.localStorage.clear() });
    signIn();
    cy.reload();
    cy.wait('@getVehicles');
  });

  it('lists vehicles and the spend summary', () => {
    cy.contains('My Garage').should('be.visible');
    cy.contains('2020 Honda Civic').should('be.visible');
    cy.contains('ABC123').should('be.visible');
    cy.contains('50,000 miles').should('be.visible');
    cy.contains('$89.99').should('be.visible');
  });

  it('requires make, model, year and mileage before adding a vehicle', () => {
    cy.intercept('POST', `${API}/vehicles`, cy.spy().as('createCall'));
    cy.contains('button', 'Add Vehicle').click();

    cy.get('input[aria-label="Make"]').then(($input) => {
      expect($input[0].checkValidity()).to.equal(false);
    });
    cy.get('@createCall').should('not.have.been.called');
  });

  it('adds a vehicle and refreshes the list', () => {
    cy.intercept('POST', `${API}/vehicles`, {
      statusCode: 201,
      body: { id: 2, make: 'Toyota', model: 'Corolla', year: 2021, license_plate: '', current_mileage: 12000 },
    }).as('createVehicle');

    cy.get('input[aria-label="Year"]').type('2021');
    cy.get('input[aria-label="Make"]').type('Toyota');
    cy.get('input[aria-label="Model"]').type('Corolla');
    cy.get('input[aria-label="Current mileage"]').type('12000');
    cy.contains('button', 'Add Vehicle').click();

    cy.wait('@createVehicle');
    cy.contains('Toyota Corolla added.').should('be.visible');
    cy.get('input[aria-label="Make"]').should('have.value', ''); // cleared on success
  });

  // Uses input the browser accepts (a year below min="1885" never leaves the
  // form) so the request actually reaches the server and the error-display path
  // is what gets exercised.
  it('surfaces a server validation error and keeps the input', () => {
    cy.intercept('POST', `${API}/vehicles`, {
      statusCode: 400,
      body: { error: 'Current mileage must be between 0 and 10000000', field: 'current_mileage' },
    }).as('createVehicle');

    cy.get('input[aria-label="Year"]').type('2021');
    cy.get('input[aria-label="Make"]').type('Honda');
    cy.get('input[aria-label="Model"]').type('Civic');
    cy.get('input[aria-label="Current mileage"]').type('99999999');
    cy.contains('button', 'Add Vehicle').click();

    cy.wait('@createVehicle');
    cy.contains('Current mileage must be between 0 and 10000000').should('be.visible');
    cy.get('input[aria-label="Make"]').should('have.value', 'Honda'); // input preserved
  });

  // The year input rejects out-of-range values before any request is made.
  it('blocks an out-of-range year in the browser', () => {
    cy.intercept('POST', `${API}/vehicles`, cy.spy().as('createCall'));

    cy.get('input[aria-label="Year"]').type('1000');
    cy.get('input[aria-label="Make"]').type('Honda');
    cy.get('input[aria-label="Model"]').type('Civic');
    cy.get('input[aria-label="Current mileage"]').type('100');
    cy.contains('button', 'Add Vehicle').click();

    cy.get('input[aria-label="Year"]').then(($input) => {
      expect($input[0].validity.rangeUnderflow).to.equal(true);
    });
    cy.get('@createCall').should('not.have.been.called');
  });

  it('asks for confirmation before deleting a vehicle', () => {
    cy.intercept('DELETE', `${API}/vehicles/1`, cy.spy().as('deleteCall'));
    cy.on('window:confirm', () => false); // decline

    cy.contains('2020 Honda Civic').parents('[role="button"]').first().trigger('mouseover');
    cy.get('button[aria-label*="Delete Honda"]').click({ force: true });
    cy.get('@deleteCall').should('not.have.been.called');
  });
});

describe('Service records', () => {
  beforeEach(() => {
    cy.visit('/', { onBeforeLoad: (win) => win.localStorage.clear() });
    signIn();
    cy.reload();
    cy.wait('@getVehicles');
    cy.contains('2020 Honda Civic').click();
    cy.wait('@getRecords');
  });

  it('shows the selected vehicle history', () => {
    cy.contains('Service History').should('be.visible');
    cy.contains('Oil change').should('be.visible');
    cy.contains('$89.99').should('be.visible');
    cy.contains('49,000 mi').should('be.visible');
  });

  it('requires the service fields before saving', () => {
    cy.intercept('POST', `${API}/records`, cy.spy().as('createCall'));
    cy.contains('button', 'Save Service Record').click();

    cy.get('input[aria-label="Service description"]').then(($input) => {
      expect($input[0].checkValidity()).to.equal(false);
    });
    cy.get('@createCall').should('not.have.been.called');
  });

  it('rejects a future service date in the browser', () => {
    cy.get('input[aria-label="Service date"]').should('have.attr', 'max');
    cy.get('input[aria-label="Service date"]').then(($input) => {
      const max = $input.attr('max');
      expect(new Date(max) <= new Date()).to.equal(true);
    });
  });

  it('saves a record and re-reads the vehicle rather than guessing the odometer', () => {
    cy.intercept('POST', `${API}/records`, { statusCode: 201, body: { id: 8 } }).as('createRecord');

    cy.get('input[aria-label="Service description"]').type('Backdated service');
    cy.get('input[aria-label="Cost"]').type('20');
    cy.get('input[aria-label="Mileage"]').type('10000');
    cy.contains('button', 'Save Service Record').click();

    cy.wait('@createRecord');
    cy.wait('@getVehicles'); // refetched instead of locally patched
    // Odometer still shows the server value, not the 10,000 just submitted.
    cy.contains('50,000 miles').should('be.visible');
  });

  it('confirms before deleting a record', () => {
    cy.intercept('DELETE', `${API}/records/7`, cy.spy().as('deleteCall'));
    cy.on('window:confirm', () => false);

    cy.contains('Oil change').parents('.group').first().trigger('mouseover');
    cy.get('button[aria-label*="Delete Oil change"]').click({ force: true });
    cy.get('@deleteCall').should('not.have.been.called');
  });
});

describe('Service due indicator', () => {
  beforeEach(() => {
    cy.visit('/', { onBeforeLoad: (win) => win.localStorage.clear() });
  });

  it('flags a vehicle well past its oil change interval', () => {
    signIn({ records: [{ ...RECORD, task: 'Oil change', mileage: 40000, date: '2025-01-01' }] });
    cy.reload();
    cy.wait('@getVehicles');
    cy.contains('2020 Honda Civic').click();
    cy.wait('@getRecords');

    cy.contains('Service Due').should('be.visible');
  });

  // The old check matched the bare word "oil", so an inspection reset the clock.
  it('does not count an oil filter inspection as an oil change', () => {
    signIn({ records: [{ ...RECORD, task: 'Oil filter inspection', mileage: 49500, date: '2026-06-01' }] });
    cy.reload();
    cy.wait('@getVehicles');
    cy.contains('2020 Honda Civic').click();
    cy.wait('@getRecords');

    cy.contains('Service Due').should('be.visible');
  });

  it('stays quiet for a recently serviced vehicle', () => {
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 1);
    signIn({
      records: [{
        ...RECORD, task: 'Oil change', mileage: 49000,
        date: recent.toISOString().split('T')[0],
      }],
    });
    cy.reload();
    cy.wait('@getVehicles');
    cy.contains('2020 Honda Civic').click();
    cy.wait('@getRecords');

    cy.contains('Service History').should('be.visible');
    cy.contains('Service Due').should('not.exist');
  });
});
