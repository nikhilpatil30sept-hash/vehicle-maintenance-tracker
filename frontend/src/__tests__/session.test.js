import React from 'react';
import { render, screen } from '@testing-library/react';

import App from '../App';
import { TOKEN_KEY, USER_KEY } from '../api';

// Deliberately NOT mocking ../api here: this exercises the real request layer so
// the global 401 handling is verified end to end. Previously an expired token
// left the user stranded on an empty dashboard with every call failing silently.

function jsonResponse(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

describe('expired session', () => {
  it('signs the user out and returns to login when the API rejects the token', async () => {
    localStorage.setItem(TOKEN_KEY, 'expired-token');
    localStorage.setItem(USER_KEY, JSON.stringify({ id: 1, email: 'a@b.com' }));

    global.fetch.mockReturnValue(
      jsonResponse(401, { error: 'Session expired, please log in again' })
    );

    render(<App />);

    // Back on the login screen...
    expect(await screen.findByPlaceholderText('Email')).toBeInTheDocument();
    // ...with the reason shown...
    expect(await screen.findByText('Session expired, please log in again')).toBeInTheDocument();
    // ...and the dead credentials cleared.
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });

  it('keeps the user signed in when the API responds normally', async () => {
    localStorage.setItem(TOKEN_KEY, 'good-token');
    localStorage.setItem(USER_KEY, JSON.stringify({ id: 1, email: 'a@b.com' }));

    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/summary')) {
        return jsonResponse(200, { vehicle_count: 0, total_cost: 0 });
      }
      return jsonResponse(200, []);
    });

    render(<App />);

    expect(await screen.findByText('My Garage')).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_KEY)).toBe('good-token');
  });

  it('reports an unreachable backend instead of failing silently', async () => {
    localStorage.setItem(TOKEN_KEY, 'good-token');
    localStorage.setItem(USER_KEY, JSON.stringify({ id: 1, email: 'a@b.com' }));

    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<App />);

    expect(await screen.findByText(/Cannot reach the server/)).toBeInTheDocument();
  });
});
