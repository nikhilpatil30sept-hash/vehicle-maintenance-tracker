import {
  request, api, ApiError, AuthError,
  getStoredUser, clearSession, setUnauthorizedHandler,
  TOKEN_KEY, USER_KEY,
} from '../api';

function mockResponse(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

beforeEach(() => {
  localStorage.clear();
  setUnauthorizedHandler(null);
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('request', () => {
  it('attaches the bearer token when one is stored', async () => {
    localStorage.setItem(TOKEN_KEY, 'abc123');
    global.fetch.mockReturnValue(mockResponse(200, { ok: true }));

    await request('GET', '/vehicles');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer abc123');
  });

  it('omits the Authorization header when signed out', async () => {
    global.fetch.mockReturnValue(mockResponse(200, {}));
    await request('GET', '/health');
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('rejects with the server-provided message and status', async () => {
    global.fetch.mockReturnValue(mockResponse(400, { error: 'Date is required', field: 'date' }));

    await expect(request('POST', '/records', {})).rejects.toMatchObject({
      message: 'Date is required',
      status: 400,
      field: 'date',
    });
  });

  it('surfaces an unreachable backend as a readable error', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('GET', '/vehicles')).rejects.toThrow(/Cannot reach the server/);
  });

  it('tolerates a non-JSON error body', async () => {
    global.fetch.mockReturnValue(mockResponse(500, '<html>Internal Server Error</html>'));
    await expect(request('GET', '/vehicles')).rejects.toThrow(/Request failed \(500\)/);
  });

  it('returns the parsed body on success', async () => {
    global.fetch.mockReturnValue(mockResponse(200, [{ id: 1, make: 'Honda' }]));
    await expect(request('GET', '/vehicles')).resolves.toEqual([{ id: 1, make: 'Honda' }]);
  });
});

describe('401 handling', () => {
  it('clears the session and notifies the handler', async () => {
    localStorage.setItem(TOKEN_KEY, 'expired');
    localStorage.setItem(USER_KEY, JSON.stringify({ id: 1 }));
    const onUnauthorized = jest.fn();
    setUnauthorizedHandler(onUnauthorized);

    global.fetch.mockReturnValue(mockResponse(401, { error: 'Session expired, please log in again' }));

    await expect(request('GET', '/vehicles')).rejects.toBeInstanceOf(AuthError);

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledWith('Session expired, please log in again');
  });

  it('marks AuthError distinctly from other ApiErrors', async () => {
    global.fetch.mockReturnValue(mockResponse(401, { error: 'nope' }));
    const err = await request('GET', '/vehicles').catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe('AuthError');
  });
});

describe('getStoredUser', () => {
  it('returns the parsed user', () => {
    localStorage.setItem(USER_KEY, JSON.stringify({ id: 7, email: 'a@b.com' }));
    expect(getStoredUser()).toEqual({ id: 7, email: 'a@b.com' });
  });

  // Corrupt storage previously threw inside a useEffect and white-screened the app.
  it('returns null and clears the session when storage is corrupt', () => {
    localStorage.setItem(USER_KEY, '{not valid json');
    localStorage.setItem(TOKEN_KEY, 'stale');
    expect(getStoredUser()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(getStoredUser()).toBeNull();
  });
});

describe('api helpers', () => {
  it('encodes the vehicle id in the records query', async () => {
    global.fetch.mockReturnValue(mockResponse(200, []));
    await api.listRecords('1 OR 1=1');
    expect(global.fetch.mock.calls[0][0]).toContain('vehicle_id=1%20OR%201%3D1');
  });

  it('sends the OCR image and mime type in the documented shape', async () => {
    global.fetch.mockReturnValue(mockResponse(200, { text: '{}' }));
    await api.ocr('BASE64DATA', 'image/png');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual({ image: 'BASE64DATA', mime_type: 'image/png' });
  });
});

describe('clearSession', () => {
  it('removes both stored keys', () => {
    localStorage.setItem(TOKEN_KEY, 't');
    localStorage.setItem(USER_KEY, '{}');
    clearSession();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });
});
