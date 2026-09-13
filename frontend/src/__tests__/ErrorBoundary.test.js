import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ErrorBoundary from '../components/ErrorBoundary';

function Bomb({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error('Simulated render crash');
  }
  return <p>Rendered fine</p>;
}

describe('ErrorBoundary', () => {
  // React logs the caught error to the console by design (componentDidCatch);
  // silence it here so the test output isn't full of an error we expect.
  let consoleErrorSpy;
  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Rendered fine')).toBeInTheDocument();
  });

  it('shows the fallback screen with the error message once a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Simulated render crash')).toBeInTheDocument();
    expect(screen.queryByText('Rendered fine')).not.toBeInTheDocument();
  });

  it('falls back to a generic message when the thrown value has none', () => {
    function BombNoMessage() {
      // eslint-disable-next-line no-throw-literal
      throw { not: 'an Error instance' };
    }
    render(
      <ErrorBoundary>
        <BombNoMessage />
      </ErrorBoundary>
    );
    expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
  });

  it('reloads the page when "Reload CarKeeper" is clicked', async () => {
    const reloadSpy = jest.fn();
    // jsdom's window.location isn't configurable directly in newer jsdom
    // versions; replacing the whole object is the supported workaround.
    const originalLocation = window.location;
    delete window.location;
    window.location = { ...originalLocation, reload: reloadSpy };

    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reload CarKeeper' }));
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    window.location = originalLocation;
  });
});
