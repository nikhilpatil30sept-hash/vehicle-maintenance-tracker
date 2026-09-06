import { isOilChange, getOilChangeStatus, DEFAULT_OIL_INTERVAL_MILES } from '../maintenance';

describe('isOilChange', () => {
  it('matches real oil change descriptions', () => {
    expect(isOilChange('Oil change')).toBe(true);
    expect(isOilChange('Full synthetic oil and filter change')).toBe(true);
    expect(isOilChange('Lube, Oil, Filter')).toBe(true);
    expect(isOilChange('Changed the oil')).toBe(true);
  });

  // The old substring check matched any task containing "oil" or "maintenance",
  // so unrelated services silently reset the service interval.
  it('does not match services that merely mention oil', () => {
    expect(isOilChange('Oil filter inspection')).toBe(false);
    expect(isOilChange('Checked oil level')).toBe(false);
    expect(isOilChange('Oil leak diagnosis')).toBe(false);
    expect(isOilChange('Scheduled maintenance')).toBe(false);
  });

  it('handles non-string input without throwing', () => {
    expect(isOilChange(null)).toBe(false);
    expect(isOilChange(undefined)).toBe(false);
    expect(isOilChange(42)).toBe(false);
  });
});

describe('getOilChangeStatus', () => {
  const vehicle = { current_mileage: 60000 };
  const today = new Date('2026-07-01');

  it('is due when mileage since the last change exceeds the interval', () => {
    const records = [{ task: 'Oil change', mileage: 54000, date: '2026-06-01' }];
    const status = getOilChangeStatus(vehicle, records, { today });
    expect(status.due).toBe(true);
    expect(status.reason).toMatch(/6,000 miles/);
  });

  it('is not due when within both the mileage and time intervals', () => {
    const records = [{ task: 'Oil change', mileage: 57000, date: '2026-06-01' }];
    expect(getOilChangeStatus(vehicle, records, { today }).due).toBe(false);
  });

  it('is due on elapsed time even when mileage is low', () => {
    const records = [{ task: 'Oil change', mileage: 59900, date: '2025-01-01' }];
    const status = getOilChangeStatus(vehicle, records, { today });
    expect(status.due).toBe(true);
    expect(status.reason).toMatch(/months/);
  });

  it('does not treat an inspection as a completed oil change', () => {
    const records = [
      { task: 'Oil change', mileage: 50000, date: '2025-01-01' },
      { task: 'Oil filter inspection', mileage: 59000, date: '2026-06-01' },
    ];
    // 10,000 miles since the only genuine oil change.
    expect(getOilChangeStatus(vehicle, records, { today }).due).toBe(true);
  });

  it('picks the most recent oil change by date, not array order', () => {
    const records = [
      { task: 'Oil change', mileage: 59000, date: '2026-06-01' },
      { task: 'Oil change', mileage: 40000, date: '2024-01-01' },
    ];
    const status = getOilChangeStatus(vehicle, records, { today });
    expect(status.lastChange.mileage).toBe(59000);
    expect(status.due).toBe(false);
  });

  it('flags a vehicle with no oil history only once it is past the interval', () => {
    expect(getOilChangeStatus({ current_mileage: 100 }, [], { today }).due).toBe(false);
    expect(
      getOilChangeStatus({ current_mileage: DEFAULT_OIL_INTERVAL_MILES + 1 }, [], { today }).due
    ).toBe(true);
  });

  it('respects a per-vehicle interval override', () => {
    const records = [{ task: 'Oil change', mileage: 52000, date: '2026-06-01' }];
    const longInterval = { ...vehicle, oil_interval_miles: 10000 };
    expect(getOilChangeStatus(longInterval, records, { today }).due).toBe(false);
  });

  it('handles a missing vehicle and empty records safely', () => {
    expect(getOilChangeStatus(null, null, { today }).due).toBe(false);
  });
});
