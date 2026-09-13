import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import RecordList from '../components/RecordList';

const RECORD = {
  id: 1, date: '2026-01-15', task: 'Oil change', cost: 64.99, mileage: 45000,
};

function noop() {}

describe('RecordList - loading and empty states', () => {
  it('shows a loading indicator while loading', () => {
    render(<RecordList records={[]} loading onUpdate={noop} onDelete={noop} />);
    expect(screen.getByText('Loading history...')).toBeInTheDocument();
  });

  it('shows an empty state once loaded with no records', () => {
    render(<RecordList records={[]} loading={false} onUpdate={noop} onDelete={noop} />);
    expect(screen.getByText('No service records yet')).toBeInTheDocument();
  });
});

describe('RecordList - populated', () => {
  it('renders each record with its cost formatted to two decimals', () => {
    render(<RecordList records={[RECORD]} loading={false} onUpdate={noop} onDelete={noop} />);
    expect(screen.getByText('Oil change')).toBeInTheDocument();
    expect(screen.getByText('$64.99')).toBeInTheDocument();
    expect(screen.getByText(/45,000 mi/)).toBeInTheDocument();
  });

  it('shows the scanned-from-receipt indicator only when a fingerprint is present', () => {
    const { rerender } = render(
      <RecordList records={[RECORD]} loading={false} onUpdate={noop} onDelete={noop} />
    );
    expect(screen.queryByLabelText('Scanned from receipt')).not.toBeInTheDocument();

    rerender(
      <RecordList
        records={[{ ...RECORD, receipt_fingerprint: 'abc123' }]}
        loading={false}
        onUpdate={noop}
        onDelete={noop}
      />
    );
    expect(screen.getByLabelText('Scanned from receipt')).toBeInTheDocument();
  });

  it('calls onDelete with the record when its delete button is clicked', async () => {
    const onDelete = jest.fn();
    render(<RecordList records={[RECORD]} loading={false} onUpdate={noop} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Oil change' }));
    expect(onDelete).toHaveBeenCalledWith(RECORD);
  });

  it('edits a record, saves the draft, and returns to the display row', async () => {
    const onUpdate = jest.fn().mockResolvedValue();
    render(<RecordList records={[RECORD]} loading={false} onUpdate={onUpdate} onDelete={noop} />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Oil change' }));
    await userEvent.clear(screen.getByLabelText('Service description'));
    await userEvent.type(screen.getByLabelText('Service description'), 'Tire rotation');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onUpdate).toHaveBeenCalledWith(
      RECORD.id,
      expect.objectContaining({ task: 'Tire rotation' })
    );
    expect(await screen.findByText('Oil change')).toBeInTheDocument();
  });

  it('canceling an edit discards the draft', async () => {
    const onUpdate = jest.fn();
    render(<RecordList records={[RECORD]} loading={false} onUpdate={onUpdate} onDelete={noop} />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Oil change' }));
    await userEvent.clear(screen.getByLabelText('Service description'));
    await userEvent.type(screen.getByLabelText('Service description'), 'Tire rotation');
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Oil change')).toBeInTheDocument();
  });

  it('renders multiple records in the given order', () => {
    const second = { ...RECORD, id: 2, task: 'Tire rotation', cost: 30 };
    render(<RecordList records={[RECORD, second]} loading={false} onUpdate={noop} onDelete={noop} />);
    const tasks = screen.getAllByText(/Oil change|Tire rotation/).map((el) => el.textContent);
    expect(tasks).toEqual(['Oil change', 'Tire rotation']);
  });
});
