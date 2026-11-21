/**
 * Employee Statistics: shared definitions (contract section 2). Pure functions, no DB.
 * Contract: Routes/EmployeeStats/EMPLOYEE_STATS_CONTRACT.md
 *
 * Money per booking reuses the Bookings-screen rules (utils/bookingMoney.js), so this page and
 * the Bookings screens can never disagree.
 */
const { computeBookingAmountFromEventTypes, getBookingReceivedAmount } = require('./bookingMoney');
const { istYmd, toDate } = require('./bookingDates');

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const round4 = (x) => Math.round((x + Number.EPSILON) * 10000) / 10000;

const STATUS_KEYS = {
  'Confirmed Event': 'confirmed',
  InProgress: 'inProgress',
  'Almost Booked': 'almostBooked',
  Cancelled: 'cancelled',
};

/** ?status= values on /:userId/bookings → stored eventConfirmation. */
const STATUS_QUERY = {
  confirmed: 'Confirmed Event',
  inprogress: 'InProgress',
  almostbooked: 'Almost Booked',
  cancelled: 'Cancelled',
};

const DATE_BASES = ['booked', 'event'];
const MAX_RANGE_MONTHS = 36;
const UNASSIGNED = 'unassigned';

/** Employee a booking is credited to: bookedBy, falling back to createdBy. null = Unassigned. */
function creditedUserId(b) {
  const v = b?.bookedBy || b?.createdBy;
  return v ? String(v._id || v) : null;
}

/** Earliest eventTypes[].startDate as a Date, or null. */
function firstEventDate(b) {
  let min = null;
  for (const t of b?.eventTypes || []) {
    const d = toDate(t?.startDate);
    if (d && (!min || d < min)) min = d;
  }
  return min;
}

/** The IST day (YYYY-MM-DD) the booking counts on for dateBasis, or null (event basis, no date). */
function bookingDay(b, dateBasis) {
  if (dateBasis === 'event') {
    const d = firstEventDate(b);
    return d ? istYmd(d) : null;
  }
  const c = toDate(b?.createdAt);
  return c ? istYmd(c) : null;
}

/** total / received / pending of one booking (rules shared with the Bookings screens). */
function bookingMoney(b) {
  const total = round2(Number(computeBookingAmountFromEventTypes(b)) || 0);
  const received = round2(Number(getBookingReceivedAmount(b)) || 0);
  return { total, received, pending: round2(Math.max(total - received, 0)) };
}

function emptySums() {
  return {
    bookings: 0, confirmed: 0, inProgress: 0, almostBooked: 0, cancelled: 0,
    bookedAmount: 0, receivedAmount: 0, pendingAmount: 0, pipelineAmount: 0,
  };
}

/** Add one booking (with precomputed statusKey + money) into a sums object. */
function addBooking(sums, statusKey, money) {
  sums.bookings += 1;
  sums[statusKey] += 1;
  if (statusKey === 'confirmed') {
    sums.bookedAmount += money.total;
    sums.receivedAmount += money.received;
    sums.pendingAmount += money.pending;
  } else if (statusKey === 'inProgress' || statusKey === 'almostBooked') {
    sums.pipelineAmount += money.total;
  }
  return sums;
}

function addSums(into, from) {
  for (const k of Object.keys(into)) into[k] += from[k] || 0;
  return into;
}

/** Sums → the public "Totals" object (contract section 2). */
function finalizeTotals(sums) {
  const t = {
    bookings: sums.bookings,
    confirmed: sums.confirmed,
    inProgress: sums.inProgress,
    almostBooked: sums.almostBooked,
    cancelled: sums.cancelled,
    bookedAmount: round2(sums.bookedAmount),
    receivedAmount: round2(sums.receivedAmount),
    pendingAmount: round2(sums.pendingAmount),
    pipelineAmount: round2(sums.pipelineAmount),
  };
  t.conversionRate = t.bookings ? round4(t.confirmed / t.bookings) : null;
  t.avgBookingValue = t.confirmed ? round2(t.bookedAmount / t.confirmed) : null;
  return t;
}

/** Every calendar month (YYYY-MM) touching [fromYmd, toYmd], in order. */
function monthsBetween(fromYmd, toYmd) {
  if (!fromYmd || !toYmd || fromYmd > toYmd) return [];
  const out = [];
  let [y, m] = fromYmd.slice(0, 7).split('-').map(Number);
  const [ty, tm] = toYmd.slice(0, 7).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const ms = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((ms(b) - ms(a)) / 86400000);
}

/** Same-length period ending the day before `from`. */
function previousPeriod(fromYmd, toYmd) {
  const len = daysBetween(fromYmd, toYmd) + 1;
  const to = addDays(fromYmd, -1);
  return { from: addDays(to, -(len - 1)), to };
}

const nameCollator = new Intl.Collator('en', { sensitivity: 'base' });
const byName = (a, b) => nameCollator.compare(a.name || '', b.name || '');

/** Employees sort: bookedAmount desc, then confirmed desc, then name A–Z. */
function compareEmployees(a, b) {
  return (b.totals.bookedAmount - a.totals.bookedAmount)
    || (b.totals.confirmed - a.totals.confirmed)
    || byName(a, b);
}

/**
 * monthlyTop for one month index. Unassigned is never a "top employee".
 * byAmount: highest bookedAmount (ties: more confirmed, then name); byBookings: most confirmed
 * (ties: higher bookedAmount, then name). null when nobody has a confirmed booking that month.
 */
function monthTop(employees, i) {
  const rows = employees
    .filter((e) => e.userId !== null)
    .map((e) => ({ userId: e.userId, name: e.name, m: e.byMonth[i] }))
    .filter((r) => r.m.confirmed > 0);
  if (!rows.length) return { byAmount: null, byBookings: null };
  const a = [...rows].sort((x, y) => (y.m.bookedAmount - x.m.bookedAmount) || (y.m.confirmed - x.m.confirmed) || byName(x, y))[0];
  const b = [...rows].sort((x, y) => (y.m.confirmed - x.m.confirmed) || (y.m.bookedAmount - x.m.bookedAmount) || byName(x, y))[0];
  return {
    byAmount: { userId: a.userId, name: a.name, bookedAmount: a.m.bookedAmount, confirmed: a.m.confirmed },
    byBookings: { userId: b.userId, name: b.name, confirmed: b.m.confirmed, bookedAmount: b.m.bookedAmount },
  };
}

module.exports = {
  STATUS_KEYS,
  STATUS_QUERY,
  DATE_BASES,
  MAX_RANGE_MONTHS,
  UNASSIGNED,
  round2,
  creditedUserId,
  firstEventDate,
  bookingDay,
  bookingMoney,
  emptySums,
  addBooking,
  addSums,
  finalizeTotals,
  monthsBetween,
  addDays,
  previousPeriod,
  compareEmployees,
  monthTop,
};
