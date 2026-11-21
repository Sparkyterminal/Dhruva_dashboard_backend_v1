/**
 * Booking (client event) date helpers, in India time (IST, UTC+05:30).
 * Dates are stored as UTC instants (midnight IST = 18:30 UTC the previous day), so every
 * "calendar day" comparison here converts to the IST day first.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDate(v) {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** IST calendar day (YYYY-MM-DD) of an instant. */
function istYmd(date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function isValidYmd(value) {
  if (typeof value !== 'string' || !YMD_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** UTC instants bounding an inclusive IST day range. */
function istDayRange(fromYmd, toYmd) {
  return {
    start: new Date(`${fromYmd}T00:00:00.000+05:30`),
    end: new Date(`${toYmd}T23:59:59.999+05:30`),
  };
}

/**
 * Primary event date of a booking (Bookings list, sort=eventDate):
 *   1. the earliest ceremony whose end day (endDate, else startDate) is today or later → group 0
 *   2. else the latest ceremony → group 1 (completed)
 *   3. no ceremony with a start date → group 2
 * @returns {{ group: 0|1|2, date: Date|null, day: string|null }}
 */
function primaryEventInfo(eventDoc, todayYmd) {
  const ceremonies = [];
  for (const t of eventDoc?.eventTypes || []) {
    const start = toDate(t?.startDate);
    if (!start) continue;
    const end = toDate(t?.endDate) || start;
    ceremonies.push({ start, startDay: istYmd(start), endDay: istYmd(end) });
  }
  if (!ceremonies.length) return { group: 2, date: null, day: null };
  const upcoming = ceremonies.filter((c) => c.endDay >= todayYmd);
  if (upcoming.length) {
    const c = upcoming.reduce((a, b) => (b.start < a.start ? b : a));
    return { group: 0, date: c.start, day: c.startDay };
  }
  const c = ceremonies.reduce((a, b) => (b.start > a.start ? b : a));
  return { group: 1, date: c.start, day: c.startDay };
}

const nameCollator = new Intl.Collator('en', { sensitivity: 'base' });

/**
 * Comparator for sort=eventDate: group 0 (upcoming, nearest first), group 1 (completed, most
 * recent first), group 2 (no date); ties by clientName A–Z, then _id (stable across pages).
 * Rows must carry `_pe` = primaryEventInfo(row, today).
 */
function compareByEventDate(a, b) {
  if (a._pe.group !== b._pe.group) return a._pe.group - b._pe.group;
  if (a._pe.group === 0 && a._pe.day !== b._pe.day) return a._pe.day < b._pe.day ? -1 : 1;
  if (a._pe.group === 1 && a._pe.day !== b._pe.day) return a._pe.day > b._pe.day ? -1 : 1;
  const byName = nameCollator.compare(String(a.clientName || ''), String(b.clientName || ''));
  if (byName !== 0) return byName;
  return String(a._id) < String(b._id) ? -1 : String(a._id) > String(b._id) ? 1 : 0;
}

module.exports = {
  IST_OFFSET_MS,
  toDate,
  istYmd,
  isValidYmd,
  istDayRange,
  primaryEventInfo,
  compareByEventDate,
};
