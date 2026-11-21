/**
 * Employee Statistics: bookings and amounts per employee, month by month.
 * Contract: Routes/EmployeeStats/EMPLOYEE_STATS_CONTRACT.md
 *
 * Access: reviewers only (utils/reviewerAccess, the same rule as Everyday Expenses).
 * Definitions: utils/employeeStats.js. Money: utils/bookingMoney.js (shared with Bookings screens).
 */
const mongoose = require('mongoose');
const STATUS = require('../../utils/statusCodes');
const MESSAGE = require('../../utils/messages');
const clock = require('../../utils/clock');
const { loadUserAccess, normDepartmentName, displayName } = require('../../utils/reviewerAccess');
const { getDataCutoffDate } = require('../../utils/dataCutoff');
const { isValidYmd, istYmd, istDayRange } = require('../../utils/bookingDates');
const { getEventNameLabel } = require('../../utils/bookingMoney');
const ES = require('../../utils/employeeStats');
const Event = require('../../Modals/ClientsBookings');
const User = require('../../Modals/User');
const Department = require('../../Modals/Department');
require('../../Modals/events'); // EventName model, for populate

const QUERY_MAX_MS = 25000;
const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map(); // per Lambda container: key -> { at, body }

const BOOKING_SELECT =
  '_id clientName createdAt createdBy bookedBy eventConfirmation advancePaymentType eventName ' +
  'eventTypes.startDate eventTypes.totalPayable eventTypes.advances.advanceNumber ' +
  'eventTypes.advances.receivedAmount eventTypes.advances.expectedAmount';

function serverError(res, where, error) {
  console.error(`employeeStats.${where}:`, error);
  return res.status(STATUS.INTERNAL_SERVER_ERROR).json({ message: MESSAGE.internalServerError, error: error.message });
}

const nowIso = () => clock.now().toISOString();

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/** Reviewers only; ADMIN, ACCOUNTS, MARKETING and everyone else get 403. */
exports.requireStatsReviewer = async (req, res, next) => {
  try {
    if (!req.userId || !mongoose.Types.ObjectId.isValid(String(req.userId))) {
      return res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    }
    const access = await loadUserAccess(req.userId);
    if (!access) return res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    if (!access.isReviewer) {
      return res.status(STATUS.FORBIDDEN).json({ message: 'You do not have access to Employee Statistics' });
    }
    req.statsUser = access;
    return next();
  } catch (error) {
    return serverError(res, 'requireStatsReviewer', error);
  }
};

// ---------------------------------------------------------------------------
// Shared query parsing
// ---------------------------------------------------------------------------

function badRequest(message, extra = {}) {
  return { error: { status: STATUS.BAD_REQUEST, body: { message, ...extra } } };
}

/**
 * Parses from/to/dateBasis and applies the data floor.
 * Returns { from, to, dateBasis, floor, empty } or { error }. `empty` = the whole range is
 * before the floor (nothing can be returned).
 */
async function parseRange(q) {
  const from = String(q.from || '').trim();
  const to = String(q.to || '').trim();
  if (!isValidYmd(from) || !isValidYmd(to)) return badRequest('from and to are required as YYYY-MM-DD');
  if (to < from) return badRequest('to must be on or after from');
  if (ES.monthsBetween(from, to).length > ES.MAX_RANGE_MONTHS) {
    return badRequest(`from and to can be at most ${ES.MAX_RANGE_MONTHS} months apart`);
  }
  const dateBasis = q.dateBasis ? String(q.dateBasis).trim() : 'booked';
  if (!ES.DATE_BASES.includes(dateBasis)) return badRequest(`dateBasis must be one of ${ES.DATE_BASES.join(', ')}`);
  const floor = await getDataCutoffDate(); // YYYY-MM-DD or null
  const clampedFrom = floor && from < floor ? floor : from;
  return { from: clampedFrom, to, dateBasis, floor, empty: clampedFrom > to };
}

/** userId filter: repeat the param or comma-separate; "unassigned" = the Unassigned row. */
function parseUserIds(q) {
  const raw = [].concat(q.userId || []).flatMap((v) => String(v).split(',')).map((s) => s.trim()).filter(Boolean);
  if (!raw.length) return { ids: null };
  for (const id of raw) {
    if (id !== ES.UNASSIGNED && !mongoose.Types.ObjectId.isValid(id)) return badRequest(`Invalid userId "${id}"`);
  }
  return { ids: new Set(raw.map((id) => (id === ES.UNASSIGNED ? ES.UNASSIGNED : id))) };
}

/**
 * Loads the bookings whose counting day (dateBasis) falls in [from, to] (IST days).
 * Mongo narrows by date; the exact day is computed in JS (first event date needs every ceremony).
 * Returns { bookings: [{ doc, day, userId }], noEventDate: [docs] }.
 */
async function loadBookings({ from, to, dateBasis }) {
  const { start, end } = istDayRange(from, to);
  let match;
  if (dateBasis === 'booked') {
    match = { createdAt: { $gte: start, $lte: end } };
  } else {
    // First event date in range ⇒ some ceremony starts in range (exact min checked below).
    match = { 'eventTypes.startDate': { $gte: start, $lte: end } };
  }
  const docs = await Event.find(match).select(BOOKING_SELECT).populate('eventName', 'name').lean().maxTimeMS(QUERY_MAX_MS);
  const bookings = [];
  for (const doc of docs) {
    const day = ES.bookingDay(doc, dateBasis);
    if (!day || day < from || day > to) continue;
    bookings.push({ doc, day, userId: ES.creditedUserId(doc) });
  }
  return { bookings };
}

/** Bookings with no event date at all (dateBasis=event), credited per employee. */
async function loadNoEventDate() {
  const docs = await Event.find({ 'eventTypes.startDate': { $not: { $type: 'date' } } })
    .select('_id createdBy bookedBy eventTypes.startDate')
    .lean()
    .maxTimeMS(QUERY_MAX_MS);
  return docs.filter((d) => !ES.firstEventDate(d)).map((d) => ({ doc: d, userId: ES.creditedUserId(d) }));
}

/** userId → { name, departments[] } for the given ids (active departments only). */
async function loadPeople(userIds) {
  const ids = [...userIds].filter((id) => id && mongoose.Types.ObjectId.isValid(id));
  const users = ids.length
    ? await User.find({ _id: { $in: ids } }).select('first_name last_name department is_active').lean()
    : [];
  const deptIds = [...new Set(users.flatMap((u) => (u.department?.department || []).map(String)))];
  const depts = deptIds.length
    ? await Department.find({ _id: { $in: deptIds }, is_active: true, is_archived: false }).select('name').lean()
    : [];
  const deptName = new Map(depts.map((d) => [String(d._id), String(d.name || '').trim()]));
  const out = new Map();
  for (const u of users) {
    out.set(String(u._id), {
      name: displayName(u) || 'Unknown user',
      departments: (u.department?.department || []).map((id) => deptName.get(String(id))).filter(Boolean),
      isActive: u.is_active !== false,
    });
  }
  return out;
}

function personOf(people, userId) {
  if (userId === null) return { name: 'Unassigned', departments: [] };
  return people.get(userId) || { name: 'Unknown user', departments: [] };
}

/** Keeps a credited employee when they pass the department / userId filters. */
function makeEmployeeFilter({ department, userIds, people }) {
  const dept = department ? normDepartmentName(department) : null;
  return (userId) => {
    if (userIds) {
      const key = userId === null ? ES.UNASSIGNED : userId;
      if (!userIds.has(key)) return false;
    }
    if (dept) {
      if (userId === null) return false;
      if (!personOf(people, userId).departments.some((d) => normDepartmentName(d) === dept)) return false;
    }
    return true;
  };
}

function statusKeyOf(doc) {
  return ES.STATUS_KEYS[doc.eventConfirmation] || null;
}

// ---------------------------------------------------------------------------
// GET /employee-stats/filters
// ---------------------------------------------------------------------------

exports.getFilters = async (req, res) => {
  try {
    const [floor, creditedRaw, depts] = await Promise.all([
      getDataCutoffDate(),
      Event.aggregate([
        { $project: { u: { $ifNull: ['$bookedBy', '$createdBy'] } } },
        { $match: { u: { $ne: null } } },
        { $group: { _id: '$u' } },
      ]).option({ maxTimeMS: QUERY_MAX_MS }),
      Department.find({ is_active: true, is_archived: false }).select('name').lean(),
    ]);
    const people = await loadPeople(new Set(creditedRaw.map((r) => String(r._id))));
    const employees = [...people.entries()]
      .filter(([, p]) => p.isActive)
      .map(([userId, p]) => ({ userId, name: p.name, departments: p.departments }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

    let dataFrom = floor || null;
    if (!dataFrom) {
      const first = await Event.findOne({}).sort({ createdAt: 1 }).select('createdAt').lean();
      dataFrom = first?.createdAt ? istYmd(new Date(first.createdAt)) : null;
    }
    const departments = [...new Set(depts.map((d) => String(d.name || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

    return res.status(STATUS.SUCCESS).json({
      serverTime: nowIso(),
      today: istYmd(clock.now()),
      dataFrom,
      departments,
      employees,
    });
  } catch (error) {
    return serverError(res, 'getFilters', error);
  }
};

// ---------------------------------------------------------------------------
// GET /employee-stats
// ---------------------------------------------------------------------------

/** Per-employee sums over `bookings`, by month index (months[]) and overall. */
function rollUp(bookings, months, keep) {
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const byUser = new Map(); // userId|null -> { sums, byMonth: [sums] }
  const unknownStatus = { count: 0 };
  for (const b of bookings) {
    if (!keep(b.userId)) continue;
    const statusKey = statusKeyOf(b.doc);
    if (!statusKey) { unknownStatus.count += 1; continue; }
    const money = ES.bookingMoney(b.doc);
    const key = b.userId;
    if (!byUser.has(key)) byUser.set(key, { sums: ES.emptySums(), byMonth: months.map(() => ES.emptySums()) });
    const row = byUser.get(key);
    ES.addBooking(row.sums, statusKey, money);
    const i = monthIndex.get(b.day.slice(0, 7));
    if (i !== undefined) ES.addBooking(row.byMonth[i], statusKey, money);
  }
  return { byUser, unknownStatus: unknownStatus.count };
}

exports.getStats = async (req, res) => {
  try {
    const range = await parseRange(req.query);
    if (range.error) return res.status(range.error.status).json(range.error.body);
    const users = parseUserIds(req.query);
    if (users.error) return res.status(users.error.status).json(users.error.body);
    const department = req.query.department ? String(req.query.department).trim() : '';

    const cacheKey = `${req.statsUser.id}|${JSON.stringify({ ...req.query })}`;
    const hit = cache.get(cacheKey);
    if (hit && clock.now().getTime() - hit.at < CACHE_TTL_MS) {
      return res.status(STATUS.SUCCESS).json({ ...hit.body, serverTime: nowIso() });
    }

    const { from, to, dateBasis, floor } = range;
    const months = range.empty ? [] : ES.monthsBetween(from, to);
    const prev = range.empty ? null : ES.previousPeriod(from, to);
    const prevAllowed = prev && (!floor || prev.from >= floor);

    const [cur, prv, noDate] = await Promise.all([
      range.empty ? { bookings: [] } : loadBookings({ from, to, dateBasis }),
      prevAllowed ? loadBookings({ from: prev.from, to: prev.to, dateBasis }) : { bookings: [] },
      dateBasis === 'event' ? loadNoEventDate() : [],
    ]);

    const credited = new Set([...cur.bookings, ...prv.bookings, ...noDate].map((b) => b.userId).filter(Boolean));
    const people = await loadPeople(credited);
    const keep = makeEmployeeFilter({ department, userIds: users.ids, people });

    const curRoll = rollUp(cur.bookings, months, keep);
    const prevRoll = prevAllowed ? rollUp(prv.bookings, [], keep) : null;

    const employees = [...curRoll.byUser.entries()].map(([userId, row]) => {
      const p = personOf(people, userId);
      const prevRow = prevRoll ? prevRoll.byUser.get(userId) : null;
      return {
        userId,
        name: p.name,
        departments: p.departments,
        totals: ES.finalizeTotals(row.sums),
        previous: prevRoll ? ES.finalizeTotals(prevRow ? prevRow.sums : ES.emptySums()) : null,
        byMonth: months.map((month, i) => ({ month, ...ES.finalizeTotals(row.byMonth[i]) })),
      };
    });
    employees.sort(ES.compareEmployees);

    const totalSums = ES.emptySums();
    const monthSums = months.map(() => ES.emptySums());
    for (const row of curRoll.byUser.values()) {
      ES.addSums(totalSums, row.sums);
      row.byMonth.forEach((m, i) => ES.addSums(monthSums[i], m));
    }
    let previous = null;
    if (prevRoll) {
      const ps = ES.emptySums();
      for (const row of prevRoll.byUser.values()) ES.addSums(ps, row.sums);
      previous = ES.finalizeTotals(ps);
    }

    const body = {
      range: { from, to, dateBasis },
      previousRange: prevAllowed ? { from: prev.from, to: prev.to } : null,
      excluded: {
        noEventDate: noDate.filter((b) => keep(b.userId)).length,
        unknownStatus: curRoll.unknownStatus,
      },
      months,
      totals: ES.finalizeTotals(totalSums),
      previous,
      monthly: months.map((month, i) => ({ month, ...ES.finalizeTotals(monthSums[i]) })),
      employees,
      monthlyTop: months.map((month, i) => ({ month, ...ES.monthTop(employees, i) })),
    };

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { at: clock.now().getTime(), body });
    return res.status(STATUS.SUCCESS).json({ serverTime: nowIso(), ...body });
  } catch (error) {
    return serverError(res, 'getStats', error);
  }
};

// ---------------------------------------------------------------------------
// GET /employee-stats/:userId/bookings
// ---------------------------------------------------------------------------

exports.getEmployeeBookings = async (req, res) => {
  try {
    const target = String(req.params.userId || '').trim();
    if (target !== ES.UNASSIGNED && !mongoose.Types.ObjectId.isValid(target)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'userId must be a user id or "unassigned"' });
    }
    const range = await parseRange(req.query);
    if (range.error) return res.status(range.error.status).json(range.error.body);

    const month = req.query.month ? String(req.query.month).trim() : '';
    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'month must be YYYY-MM' });
    }
    const statusRaw = req.query.status ? String(req.query.status).trim().toLowerCase() : '';
    const statusValue = statusRaw ? ES.STATUS_QUERY[statusRaw] : null;
    if (statusRaw && !statusValue) {
      return res.status(STATUS.BAD_REQUEST).json({ message: `status must be one of ${Object.keys(ES.STATUS_QUERY).join(', ')}` });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    let rows = [];
    if (!range.empty) {
      const { bookings } = await loadBookings(range);
      const wanted = target === ES.UNASSIGNED ? null : target;
      rows = bookings.filter((b) => b.userId === wanted
        && (!month || b.day.slice(0, 7) === month)
        && (!statusValue || b.doc.eventConfirmation === statusValue));
    }
    rows.sort((a, b) => new Date(b.doc.createdAt) - new Date(a.doc.createdAt) || (String(a.doc._id) < String(b.doc._id) ? 1 : -1));

    const total = rows.length;
    const pageRows = rows.slice((page - 1) * limit, page * limit).map(({ doc }) => {
      const money = ES.bookingMoney(doc);
      const confirmed = doc.eventConfirmation === 'Confirmed Event';
      const cancelled = doc.eventConfirmation === 'Cancelled';
      const first = ES.firstEventDate(doc);
      return {
        _id: String(doc._id),
        clientName: doc.clientName ?? null,
        eventName: getEventNameLabel(doc),
        eventConfirmation: doc.eventConfirmation ?? null,
        bookedOn: doc.createdAt ? istYmd(new Date(doc.createdAt)) : null,
        eventDate: first ? istYmd(first) : null,
        bookedAmount: confirmed ? money.total : 0,
        receivedAmount: confirmed ? money.received : 0,
        pendingAmount: confirmed ? money.pending : 0,
        expectedAmount: confirmed ? null : cancelled ? 0 : money.total,
      };
    });

    return res.status(STATUS.SUCCESS).json({
      serverTime: nowIso(),
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      total,
      bookings: pageRows,
    });
  } catch (error) {
    return serverError(res, 'getEmployeeBookings', error);
  }
};
