// Service-interval logic.
//
// The previous check matched any task containing "oil" or "maintenance", so
// "oil filter inspection" or "scheduled maintenance check" reset the clock even
// though no oil was changed. It also ignored time entirely, and applied one
// hardcoded 5,000-mile interval to every vehicle.

export const DEFAULT_OIL_INTERVAL_MILES = 5000;
export const DEFAULT_OIL_INTERVAL_MONTHS = 6;

// Requires an actual oil-change phrase rather than the bare word "oil".
// Covers both tenses ("oil change", "oil changed", "changed the oil").
const OIL_CHANGE_PATTERN =
  /\b(oil\s*(and\s*|&\s*)?(filter\s*)?chang(e|ed)|chang(e|ed)\s*(the\s*)?oil|lof|lube[\s,]*oil[\s,]*filter)\b/i;

export function isOilChange(task) {
  return typeof task === 'string' && OIL_CHANGE_PATTERN.test(task);
}

function monthsBetween(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/**
 * Determine whether a vehicle is due for an oil change.
 *
 * Returns { due, reason, lastChange } where `lastChange` is the most recent
 * qualifying record, or null if there has never been one.
 */
export function getOilChangeStatus(vehicle, records, options = {}) {
  const intervalMiles = options.intervalMiles || vehicle?.oil_interval_miles || DEFAULT_OIL_INTERVAL_MILES;
  const intervalMonths = options.intervalMonths || vehicle?.oil_interval_months || DEFAULT_OIL_INTERVAL_MONTHS;
  const today = options.today || new Date();

  if (!vehicle) return { due: false, reason: null, lastChange: null };

  const oilChanges = (records || []).filter((r) => isOilChange(r.task));

  if (oilChanges.length === 0) {
    // No history at all. Only flag once the odometer suggests one is overdue,
    // rather than nagging about a freshly added vehicle.
    const mileage = Number(vehicle.current_mileage) || 0;
    return {
      due: mileage > intervalMiles,
      reason: mileage > intervalMiles ? 'No oil change on record' : null,
      lastChange: null,
    };
  }

  // "Most recent" by date, falling back to mileage when dates tie.
  const lastChange = oilChanges.reduce((latest, r) => {
    const a = new Date(r.date).getTime() || 0;
    const b = new Date(latest.date).getTime() || 0;
    if (a !== b) return a > b ? r : latest;
    return (Number(r.mileage) || 0) > (Number(latest.mileage) || 0) ? r : latest;
  });

  const milesSince = (Number(vehicle.current_mileage) || 0) - (Number(lastChange.mileage) || 0);
  const lastDate = new Date(lastChange.date);
  const monthsSince = isNaN(lastDate.getTime()) ? 0 : monthsBetween(lastDate, today);

  if (milesSince > intervalMiles) {
    return {
      due: true,
      reason: `${milesSince.toLocaleString()} miles since last oil change`,
      lastChange,
    };
  }
  if (monthsSince >= intervalMonths) {
    return {
      due: true,
      reason: `${monthsSince} months since last oil change`,
      lastChange,
    };
  }
  return { due: false, reason: null, lastChange };
}
