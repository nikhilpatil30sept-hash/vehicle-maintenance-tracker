import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App from '../App';
import { api, TOKEN_KEY, USER_KEY } from '../api';

jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return {
    ...actual,
    api: {
      login: jest.fn(),
      register: jest.fn(),
      listVehicles: jest.fn(),
      createVehicle: jest.fn(),
      updateVehicle: jest.fn(),
      deleteVehicle: jest.fn(),
      listRecords: jest.fn(),
      createRecord: jest.fn(),
      updateRecord: jest.fn(),
      deleteRecord: jest.fn(),
      summary: jest.fn(),
      ocr: jest.fn(),
    },
  };
});

const VEHICLE = {
  id: 1, make: 'Honda', model: 'Civic', year: 2020,
  license_plate: 'ABC123', current_mileage: 50000,
};

function signedIn() {
  localStorage.setItem(TOKEN_KEY, 'valid-token');
  localStorage.setItem(USER_KEY, JSON.stringify({ id: 1, email: 'a@b.com' }));
}

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  api.listVehicles.mockResolvedValue([VEHICLE]);
  api.summary.mockResolvedValue({ vehicle_count: 1, total_cost: 250.5 });
  api.listRecords.mockResolvedValue([]);
});

describe('authentication', () => {
  it('shows the login screen when signed out', async () => {
    render(<App />);
    expect(await screen.findByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('signs in and loads the garage', async () => {
    api.login.mockResolvedValue({ token: 't', user: { id: 1, email: 'a@b.com' } });
    render(<App />);

    await userEvent.type(await screen.findByPlaceholderText('Email'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText(/Password/), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('My Garage')).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_KEY)).toBe('t');
    expect(await screen.findByText('2020 Honda Civic')).toBeInTheDocument();
  });

  it('shows the server message when credentials are rejected', async () => {
    api.login.mockRejectedValue(Object.assign(new Error('Invalid credentials'), { status: 401 }));
    render(<App />);

    await userEvent.type(await screen.findByPlaceholderText('Email'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText(/Password/), 'wrongpassword');
    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  // The inputs sit inside a real <form> and carry validation attributes, so the
  // browser enforces them. The previous markup used <div onSubmit>, where every
  // `required` was inert. jsdom does not run constraint validation, so the
  // attributes are asserted here and real enforcement is covered in Cypress.
  it('marks the credential fields as required and validated', async () => {
    render(<App />);
    const email = await screen.findByPlaceholderText('Email');
    const password = screen.getByPlaceholderText(/Password/);

    expect(email).toBeRequired();
    expect(email).toHaveAttribute('type', 'email');
    expect(password).toBeRequired();
    expect(password).toHaveAttribute('minLength', '8');
    expect(email.closest('form')).not.toBeNull();
  });

  it('switches to registration and back', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /Need an account/ }));
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Already have an account/ }));
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('restores a stored session on load', async () => {
    signedIn();
    render(<App />);
    expect(await screen.findByText('My Garage')).toBeInTheDocument();
  });

  // Expiry is driven by the real api layer's global 401 handler, so it is
  // covered end-to-end in session.test.js against a mocked fetch instead.
});

describe('vehicles', () => {
  it('creates a vehicle and refreshes the garage', async () => {
    signedIn();
    api.createVehicle.mockResolvedValue({ ...VEHICLE, id: 2, make: 'Toyota', model: 'Corolla' });
    render(<App />);
    await screen.findByText('My Garage');

    await userEvent.type(screen.getByLabelText('Year'), '2021');
    await userEvent.type(screen.getByLabelText('Make'), 'Toyota');
    await userEvent.type(screen.getByLabelText('Model'), 'Corolla');
    await userEvent.type(screen.getByLabelText('Current mileage'), '12000');
    await userEvent.click(screen.getByRole('button', { name: 'Add Vehicle' }));

    await waitFor(() => expect(api.createVehicle).toHaveBeenCalledWith(
      expect.objectContaining({ year: '2021', make: 'Toyota', model: 'Corolla', current_mileage: '12000' })
    ));
    // Two initial calls (mount) + one refresh after creation.
    await waitFor(() => expect(api.listVehicles).toHaveBeenCalledTimes(2));
  });

  it('surfaces a validation error from the server', async () => {
    signedIn();
    api.createVehicle.mockRejectedValue(
      Object.assign(new Error('Year must be between 1885 and 2028'), { status: 400 })
    );
    render(<App />);
    await screen.findByText('My Garage');

    await userEvent.type(screen.getByLabelText('Year'), '1000');
    await userEvent.type(screen.getByLabelText('Make'), 'Honda');
    await userEvent.type(screen.getByLabelText('Model'), 'Civic');
    await userEvent.type(screen.getByLabelText('Current mileage'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Add Vehicle' }));

    expect(await screen.findByText('Year must be between 1885 and 2028')).toBeInTheDocument();
  });

  it('asks for confirmation before deleting', async () => {
    signedIn();
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    await screen.findByText('2020 Honda Civic');

    await userEvent.click(screen.getByRole('button', { name: /Delete Honda Civic/ }));
    expect(window.confirm).toHaveBeenCalled();
    expect(api.deleteVehicle).not.toHaveBeenCalled();
  });
});

describe('service records', () => {
  it('loads history when a vehicle is selected', async () => {
    signedIn();
    api.listRecords.mockResolvedValue([
      { id: 9, date: '2026-01-15', task: 'Oil change', cost: 50, mileage: 51000, receipt_fingerprint: null },
    ]);
    render(<App />);

    await userEvent.click(await screen.findByText('2020 Honda Civic'));

    expect(await screen.findByText('Oil change')).toBeInTheDocument();
    expect(api.listRecords).toHaveBeenCalledWith(1);
  });

  // The old code set current_mileage locally from the submitted value, so a
  // backdated record made the UI disagree with the server's max() rule.
  it('re-reads the vehicle after saving instead of guessing the odometer', async () => {
    signedIn();
    api.createRecord.mockResolvedValue({ id: 10 });
    render(<App />);
    await userEvent.click(await screen.findByText('2020 Honda Civic'));
    await screen.findByRole('button', { name: 'Save Service Record' });

    await userEvent.type(screen.getByLabelText('Service description'), 'Old backdated service');
    await userEvent.type(screen.getByLabelText('Cost'), '20');
    await userEvent.type(screen.getByLabelText('Mileage'), '10000');
    await userEvent.click(screen.getByRole('button', { name: 'Save Service Record' }));

    await waitFor(() => expect(api.createRecord).toHaveBeenCalled());
    // Odometer still reflects the server value, not the 10,000 just submitted.
    await waitFor(() => expect(api.listVehicles).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/50,000 miles/)).toBeInTheDocument();
  });

  it('confirms before deleting a record', async () => {
    signedIn();
    api.listRecords.mockResolvedValue([
      { id: 9, date: '2026-01-15', task: 'Oil change', cost: 50, mileage: 51000 },
    ]);
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    await userEvent.click(await screen.findByText('2020 Honda Civic'));

    await userEvent.click(await screen.findByRole('button', { name: /Delete Oil change/ }));
    expect(window.confirm).toHaveBeenCalled();
    expect(api.deleteRecord).not.toHaveBeenCalled();
  });
});

describe('service due badge', () => {
  it('flags a vehicle overdue for an oil change', async () => {
    signedIn();
    api.listRecords.mockResolvedValue([
      { id: 1, date: '2025-01-01', task: 'Oil change', cost: 50, mileage: 40000 },
    ]);
    render(<App />);
    await userEvent.click(await screen.findByText('2020 Honda Civic'));

    expect(await screen.findByText('Service Due')).toBeInTheDocument();
  });

  it('does not flag a recently serviced vehicle', async () => {
    signedIn();
    const recent = new Date();
    recent.setMonth(recent.getMonth() - 1);
    api.listRecords.mockResolvedValue([
      { id: 1, date: recent.toISOString().split('T')[0], task: 'Oil change', cost: 50, mileage: 49000 },
    ]);
    render(<App />);
    await userEvent.click(await screen.findByText('2020 Honda Civic'));
    await screen.findByRole('button', { name: 'Save Service Record' });

    expect(screen.queryByText('Service Due')).not.toBeInTheDocument();
  });
});

describe('summary', () => {
  it('renders the total spend', async () => {
    signedIn();
    render(<App />);
    const header = await screen.findByText('Total Investment');
    expect(within(header.parentElement).getByText('$250.50')).toBeInTheDocument();
  });
});
