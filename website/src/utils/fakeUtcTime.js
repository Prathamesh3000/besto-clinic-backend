/**
 * Display helpers for the "fake UTC" time convention.
 *
 * BestoClinic stores local IST times with a Z suffix
 * (e.g., "2025-06-15T10:00:00.000Z" means 10:00 AM IST, not UTC).
 *
 * Using new Date(s).toLocaleTimeString() adds the browser's TZ offset,
 * showing the wrong time. These helpers use getUTC*() to read the stored
 * local time as-is.
 *
 * ONLY use these for appointment scheduledAt and schedule-related fields.
 * Chat timestamps, notifications, etc. are real UTC — use normal locale
 * methods for those.
 */

/**
 * Format a fake-UTC ISO string as "hh:mm AM/PM"
 */
export function displayTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '--:--';
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Format a fake-UTC ISO string as "dd Mon yyyy"
 */
export function displayDate(isoString) {
  if (!isoString) return 'N/A';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'N/A';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Format a fake-UTC ISO string as "dd Mon yyyy, hh:mm AM/PM"
 */
export function displayDateTime(isoString) {
  if (!isoString) return '';
  return `${displayDate(isoString)}, ${displayTime(isoString)}`;
}

/**
 * Convert a fake-UTC value into a real Date whose LOCAL components equal the
 * stored wall clock. Needed for libraries that lay out by local getters
 * (react-big-calendar reads getHours()/getMinutes()); handing them the raw Date
 * renders every appointment +5:30 out of position.
 *
 *   "2026-06-12T10:00:00.000Z"  ->  Date whose getHours() === 10
 */
export function fakeUtcToLocal(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  return new Date(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), 0, 0,
  );
}

/**
 * Inverse of fakeUtcToLocal — turn a local Date (e.g. a calendar slot the user
 * clicked) back into the fake-UTC ISO string the API expects.
 */
export function localToFakeUtc(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}:00.000Z`;
}

/**
 * Minutes past midnight for a fake-UTC ISO string, in clinic wall-clock terms.
 * Use this for any layout/positioning maths on appointment times — date-fns
 * startOfDay()/differenceInMinutes() read local time and will be +5:30 out.
 */
export function fakeUtcMinutes(isoString) {
  if (!isoString) return 0;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 0;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Current time as minutes past midnight on the clinic's wall clock (IST),
 * independent of the browser's timezone. Pair with fakeUtcMinutes() so a
 * "now" marker lines up with appointment positions.
 */
export function clinicNowMinutes(at = new Date()) {
  const ist = new Date(at.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/**
 * Format a fake-UTC ISO string as "Weekday, dd Mon"
 */
export function displayDayDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
