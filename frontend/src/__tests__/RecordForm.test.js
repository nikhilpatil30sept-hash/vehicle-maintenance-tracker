import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import RecordForm from '../components/RecordForm';
import { api, AuthError, ApiError } from '../api';

jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return {
    ...actual,
    api: { ocr: jest.fn() },
  };
});

const VEHICLE = { id: 1, make: 'Honda', model: 'Civic', year: 2020, current_mileage: 50000 };

function setup() {
  const onCreate = jest.fn().mockResolvedValue();
  const onNotify = jest.fn();
  render(<RecordForm vehicle={VEHICLE} onCreate={onCreate} onNotify={onNotify} />);
  return { onCreate, onNotify };
}

function makeFile({ name = 'receipt.jpg', type = 'image/jpeg', size = 1024 } = {}) {
  const file = new File([new Uint8Array(size)], name, { type });
  return file;
}

async function uploadFile(file) {
  const input = document.querySelector('input[type="file"]');
  await userEvent.upload(input, file);
}

beforeEach(() => {
  api.ocr.mockReset();
});

describe('RecordForm - manual entry', () => {
  it('submits the filled-in fields plus the vehicle id, then resets the form', async () => {
    const { onCreate } = setup();

    await userEvent.type(screen.getByLabelText('Service description'), 'Oil change');
    await userEvent.type(screen.getByLabelText('Cost'), '49.99');
    await userEvent.type(screen.getByLabelText('Mileage'), '51000');
    await userEvent.click(screen.getByRole('button', { name: /save service record/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'Oil change', cost: '49.99', mileage: '51000', vehicle_id: 1 })
    );
    await waitFor(() => expect(screen.getByLabelText('Service description')).toHaveValue(''));
  });

  it('keeps the entered values when onCreate rejects', async () => {
    const onCreate = jest.fn().mockRejectedValue(new Error('offline'));
    render(<RecordForm vehicle={VEHICLE} onCreate={onCreate} onNotify={jest.fn()} />);

    await userEvent.type(screen.getByLabelText('Service description'), 'Brake pads');
    await userEvent.type(screen.getByLabelText('Cost'), '120');
    await userEvent.type(screen.getByLabelText('Mileage'), '51500');
    await userEvent.click(screen.getByRole('button', { name: /save service record/i }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Service description')).toHaveValue('Brake pads');
  });
});

describe('RecordForm - receipt scanning', () => {
  it('rejects a non-image file without calling the OCR API', async () => {
    const { onNotify } = setup();
    await uploadFile(makeFile({ type: 'text/plain', name: 'notes.txt' }));
    expect(onNotify).toHaveBeenCalledWith('Please upload an image file', 'error');
    expect(api.ocr).not.toHaveBeenCalled();
  });

  it('rejects a file over 5MB without calling the OCR API', async () => {
    const { onNotify } = setup();
    await uploadFile(makeFile({ size: 6 * 1024 * 1024 }));
    expect(onNotify).toHaveBeenCalledWith('That image is larger than 5 MB. Try a smaller photo.', 'error');
    expect(api.ocr).not.toHaveBeenCalled();
  });

  it('lists extracted items on success, and filling one in clears the list', async () => {
    const { onNotify } = setup();
    api.ocr.mockResolvedValue({
      text: JSON.stringify({
        date: '2026-02-01',
        mileage: 52000,
        items: [{ task: 'Oil change', cost: 59.99 }, { task: 'Tire rotation', cost: 25 }],
      }),
      receipt_fingerprint: 'fp-123',
    });

    await uploadFile(makeFile());

    expect(await screen.findByText('Select service to add:')).toBeInTheDocument();
    expect(screen.getByText('Oil change')).toBeInTheDocument();
    expect(screen.getByText('Tire rotation')).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith('Found 2 service item(s). Pick one to add.', 'success');

    await userEvent.click(screen.getByText('Oil change'));
    expect(screen.getByLabelText('Service description')).toHaveValue('Oil change');
    expect(screen.getByLabelText('Cost')).toHaveValue(59.99);
    expect(screen.getByText('Scanned from receipt')).toBeInTheDocument();
    expect(screen.queryByText('Select service to add:')).not.toBeInTheDocument();
  });

  it('reports an error and does not show a picker when the receipt has no items', async () => {
    const { onNotify } = setup();
    api.ocr.mockResolvedValue({ text: JSON.stringify({ items: [] }), receipt_fingerprint: '' });

    await uploadFile(makeFile());

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(
        'No service items found on that receipt. Enter the details manually.',
        'error'
      )
    );
    expect(screen.queryByText('Select service to add:')).not.toBeInTheDocument();
  });

  it('silently ignores an AuthError (session handling is global)', async () => {
    const { onNotify } = setup();
    api.ocr.mockRejectedValue(new AuthError('Session expired'));

    await uploadFile(makeFile());

    await waitFor(() => expect(api.ocr).toHaveBeenCalledTimes(1));
    expect(onNotify).not.toHaveBeenCalledWith(expect.anything(), 'error');
  });

  it('shows the ApiError message when the OCR call fails with one', async () => {
    const { onNotify } = setup();
    api.ocr.mockRejectedValue(new ApiError('Image too blurry to read', 422));

    await uploadFile(makeFile());

    await waitFor(() => expect(onNotify).toHaveBeenCalledWith('Image too blurry to read', 'error'));
  });

  it('shows a generic message when the model reply is not valid JSON', async () => {
    const { onNotify } = setup();
    api.ocr.mockResolvedValue({ text: 'not json at all', receipt_fingerprint: '' });

    await uploadFile(makeFile());

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith('Could not read that receipt. Enter the details manually.', 'error')
    );
  });
});
