import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import VehicleCard from '../components/VehicleCard';

const VEHICLE = {
  id: 1, make: 'Honda', model: 'Civic', year: 2020,
  license_plate: 'ABC123', current_mileage: 50000,
};

function setup(props = {}) {
  const onSelect = jest.fn();
  const onUpdate = jest.fn().mockResolvedValue();
  const onDelete = jest.fn();
  render(
    <VehicleCard
      vehicle={VEHICLE}
      isSelected={false}
      serviceStatus={{ due: false }}
      onSelect={onSelect}
      onUpdate={onUpdate}
      onDelete={onDelete}
      {...props}
    />
  );
  return { onSelect, onUpdate, onDelete };
}

describe('VehicleCard - display mode', () => {
  it('shows the vehicle details', () => {
    setup();
    expect(screen.getByText('2020 Honda Civic')).toBeInTheDocument();
    expect(screen.getByText(/ABC123/)).toBeInTheDocument();
    expect(screen.getByText(/50,000 miles/)).toBeInTheDocument();
  });

  it('calls onSelect when the card is clicked', async () => {
    const { onSelect } = setup();
    await userEvent.click(screen.getByText('2020 Honda Civic'));
    expect(onSelect).toHaveBeenCalledWith(VEHICLE);
  });

  it('calls onSelect on Enter and Space, for keyboard users', async () => {
    const { onSelect } = setup();
    // The outer card is the only role=button element with aria-pressed set
    // (Edit/Delete are plain buttons without it), so this targets it
    // unambiguously instead of matching all three buttons on the card.
    const card = screen.getByRole('button', { pressed: false });
    card.focus();
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(card, { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('shows a "No plate" fallback when the vehicle has none', () => {
    setup({ vehicle: { ...VEHICLE, license_plate: '' } });
    expect(screen.getByText(/No plate/)).toBeInTheDocument();
  });

  it('shows the Service Due badge when serviceStatus.due is true, and not otherwise', () => {
    const { rerender } = render(
      <VehicleCard
        vehicle={VEHICLE}
        isSelected={false}
        serviceStatus={{ due: false }}
        onSelect={() => {}}
        onUpdate={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.queryByText('Service Due')).not.toBeInTheDocument();

    rerender(
      <VehicleCard
        vehicle={VEHICLE}
        isSelected={false}
        serviceStatus={{ due: true, reason: 'Over the 6,000 mile interval' }}
        onSelect={() => {}}
        onUpdate={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByText('Service Due')).toBeInTheDocument();
  });

  it('deleting stops propagation so onSelect is not also triggered', async () => {
    const { onDelete, onSelect } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Honda Civic' }));
    expect(onDelete).toHaveBeenCalledWith(VEHICLE);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('VehicleCard - editing', () => {
  it('starting to edit does not also select the card', async () => {
    const { onSelect } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Honda Civic' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Make')).toBeInTheDocument();
  });

  it('seeds the edit form from the current vehicle, saves, and exits edit mode', async () => {
    const { onUpdate } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Edit Honda Civic' }));
    expect(screen.getByLabelText('Make')).toHaveValue('Honda');

    await userEvent.clear(screen.getByLabelText('Make'));
    await userEvent.type(screen.getByLabelText('Make'), 'Toyota');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onUpdate).toHaveBeenCalledWith(
      VEHICLE.id,
      expect.objectContaining({ make: 'Toyota' })
    );
    // The card only re-renders with new data once the parent passes an
    // updated `vehicle` prop, so it goes back to displaying the original
    // (unchanged) vehicle here - not the draft - and the edit form is gone.
    expect(await screen.findByText('2020 Honda Civic')).toBeInTheDocument();
    expect(screen.queryByLabelText('Make')).not.toBeInTheDocument();
  });

  it('canceling discards the draft without calling onUpdate', async () => {
    const { onUpdate } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Edit Honda Civic' }));
    await userEvent.clear(screen.getByLabelText('Make'));
    await userEvent.type(screen.getByLabelText('Make'), 'Toyota');
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('2020 Honda Civic')).toBeInTheDocument();
  });

  it('stays in edit mode (draft preserved) when the save fails', async () => {
    const onUpdate = jest.fn().mockRejectedValue(new Error('network down'));
    setup({ onUpdate });

    await userEvent.click(screen.getByRole('button', { name: 'Edit Honda Civic' }));
    await userEvent.clear(screen.getByLabelText('Make'));
    await userEvent.type(screen.getByLabelText('Make'), 'Toyota');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await screen.findByRole('button', { name: /save/i });
    expect(screen.getByLabelText('Make')).toHaveValue('Toyota');
  });
});
