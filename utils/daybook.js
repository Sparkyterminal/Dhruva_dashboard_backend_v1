/**
 * Daybook V2 shared rules (money math, sources, dates, day-wise balances).
 * Contract: Routes/daybook/DAYBOOK_V2_CONTRACT.md
 *
 * Every create, update and read path must use these functions, so the server never trusts
 * client-sent net/actual amounts.
 */

/** Fixed bank-account list, shared with the frontend (src/Dashboard/Accounts/DayBook/daybookConfig.js). */
const ACCOUNT_NAMES = [
  'Dhruva Kumar H P-HDFC bank-5540',
  'Skyblue -HDFC-5540',
  'Skyblue -ICICI-1458',
  'Monica',
];

const CASH_SOURCE = 'Cash';
/** All balance sources, in display order. */
const SOURCES = [CASH_SOURCE, ...ACCOUNT_NAMES];

const PAYMENT_MODES = ['CASH', 'ACCOUNT'];

/** Hard cap on the number of days walked when computing balances (about 10 years). */
const MAX_BALANCE_DAYS = 3660;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

/** True for a real calendar date in YYYY-MM-DD form. */
function isValidYmd(value) {
  if (typeof value !== 'string' || !YMD_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Add one calendar day to YYYY-MM-DD (plain date arithmetic, no time zones). */
function nextDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a), both YYYY-MM-DD. */
function daysBetween(a, b) {
  const toMs = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toMs(b) - toMs(a)) / 86400000);
}

/** Parse a money field: finite number (or numeric string), rounded to 2 decimals. null if invalid. */
function toMoney(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return round2(n);
}

/** Money field that defaults to 0 when omitted. null if present but invalid. */
function toOptionalMoney(value) {
  if (value === undefined || value === null || value === '') return 0;
  return toMoney(value);
}

function computeNetAmountReceived({ amountReceived, gstAmount, tdsAmount }) {
  return round2((Number(amountReceived) || 0) - (Number(gstAmount) || 0) - (Number(tdsAmount) || 0));
}

function computeActualAmountPaid({ amountPaid, tdsAmount, gstAmount }) {
  return round2((Number(amountPaid) || 0) - (Number(tdsAmount) || 0) + (Number(gstAmount) || 0));
}

/** Balance source for a row: "Cash" for CASH, else the account name. */
function sourceOf(mode, accountName) {
  return mode === 'CASH' ? CASH_SOURCE : accountName;
}

/**
 * Validate mode + accountName (inflow receivedIn / outflow paidFrom).
 * Returns { mode, accountName } or { error }.
 */
function validateModeAndAccount(modeRaw, accountNameRaw, modeField) {
  const mode = typeof modeRaw === 'string' ? modeRaw.trim().toUpperCase() : '';
  if (!PAYMENT_MODES.includes(mode)) {
    return { error: `${modeField} must be CASH or ACCOUNT` };
  }
  if (mode === 'CASH') {
    return { mode, accountName: null };
  }
  const accountName = typeof accountNameRaw === 'string' ? accountNameRaw.trim() : '';
  if (!ACCOUNT_NAMES.includes(accountName)) {
    return { error: `accountName must be one of: ${ACCOUNT_NAMES.join(' | ')}` };
  }
  return { mode, accountName };
}

/**
 * Validate an inflow body and compute netAmountReceived (section 1 rules).
 * Returns { value } (fields to store, except eventReference) or { error }.
 */
function validateInflowInput(body) {
  const b = body || {};
  const clientName = typeof b.clientName === 'string' ? b.clientName.trim() : '';
  if (!clientName) return { error: 'clientName is required' };

  if (!isValidYmd(b.eventDate)) return { error: 'eventDate must be a valid date in YYYY-MM-DD format' };
  if (!isValidYmd(b.receivedDate)) return { error: 'receivedDate must be a valid date in YYYY-MM-DD format' };

  const mode = validateModeAndAccount(b.receivedIn, b.accountName, 'receivedIn');
  if (mode.error) return { error: mode.error };

  const amountReceived = toMoney(b.amountReceived);
  if (amountReceived == null || amountReceived <= 0) {
    return { error: 'amountReceived must be a number > 0' };
  }
  const gstAmount = toOptionalMoney(b.gstAmount);
  const tdsAmount = toOptionalMoney(b.tdsAmount);
  if (gstAmount == null || gstAmount < 0) return { error: 'gstAmount must be a number >= 0' };
  if (tdsAmount == null || tdsAmount < 0) return { error: 'tdsAmount must be a number >= 0' };

  if (mode.mode === 'CASH' && (gstAmount !== 0 || tdsAmount !== 0)) {
    return { error: 'gstAmount and tdsAmount must be 0 when receivedIn is CASH' };
  }
  if (round2(gstAmount + tdsAmount) > amountReceived) {
    return { error: 'gstAmount + tdsAmount cannot exceed amountReceived' };
  }

  if (b.note != null && typeof b.note !== 'string') return { error: 'note must be a string' };

  return {
    value: {
      clientName,
      eventDate: b.eventDate,
      receivedDate: b.receivedDate,
      receivedIn: mode.mode,
      accountName: mode.accountName,
      amountReceived,
      gstAmount,
      tdsAmount,
      netAmountReceived: computeNetAmountReceived({ amountReceived, gstAmount, tdsAmount }),
      note: typeof b.note === 'string' ? b.note.trim() : '',
    },
  };
}

/**
 * Validate an outflow body and compute actualAmountPaid (section 1 rules).
 * Returns { value } (fields to store, except the vendor snapshot) or { error }.
 */
function validateOutflowInput(body) {
  const b = body || {};
  if (!isValidYmd(b.paidDate)) return { error: 'paidDate must be a valid date in YYYY-MM-DD format' };

  const mode = validateModeAndAccount(b.paidFrom, b.accountName, 'paidFrom');
  if (mode.error) return { error: mode.error };

  const amountPaid = toMoney(b.amountPaid);
  if (amountPaid == null || amountPaid <= 0) return { error: 'amountPaid must be a number > 0' };

  const tdsAmount = toOptionalMoney(b.tdsAmount);
  const gstAmount = toOptionalMoney(b.gstAmount);
  if (tdsAmount == null || tdsAmount < 0) return { error: 'tdsAmount must be a number >= 0' };
  if (gstAmount == null || gstAmount < 0) return { error: 'gstAmount must be a number >= 0' };
  if (tdsAmount > amountPaid) return { error: 'tdsAmount cannot exceed amountPaid' };

  if (b.note != null && typeof b.note !== 'string') return { error: 'note must be a string' };

  return {
    value: {
      paidDate: b.paidDate,
      paidFrom: mode.mode,
      accountName: mode.accountName,
      amountPaid,
      tdsAmount,
      gstAmount,
      actualAmountPaid: computeActualAmountPaid({ amountPaid, tdsAmount, gstAmount }),
      note: typeof b.note === 'string' ? b.note.trim() : '',
    },
  };
}

/**
 * Validate the opening-balance body. Every source exactly once; amounts may be 0 or negative.
 * Returns { value: { asOfDate, balances } } (balances in SOURCES order) or { error }.
 */
function validateOpeningBalanceInput(body) {
  const b = body || {};
  if (!isValidYmd(b.asOfDate)) return { error: 'asOfDate must be a valid date in YYYY-MM-DD format' };
  if (!Array.isArray(b.balances)) return { error: 'balances must be an array' };

  const bySource = new Map();
  for (const item of b.balances) {
    const source = typeof item?.source === 'string' ? item.source.trim() : '';
    if (!SOURCES.includes(source)) {
      return { error: `Unknown source "${source}". Allowed: ${SOURCES.join(' | ')}` };
    }
    if (bySource.has(source)) return { error: `Source "${source}" is listed more than once` };
    const amount = toMoney(item.amount);
    if (amount == null) return { error: `amount for "${source}" must be a number` };
    bySource.set(source, amount);
  }
  const missing = SOURCES.filter((s) => !bySource.has(s));
  if (missing.length) return { error: `balances must include every source. Missing: ${missing.join(' | ')}` };

  return {
    value: {
      asOfDate: b.asOfDate,
      balances: SOURCES.map((source) => ({ source, amount: bySource.get(source) })),
    },
  };
}

/**
 * Day-wise balances (contract section 2 reference algorithm).
 * Walks from asOfDate so the carry-forward is right, returns only days in [startDate, endDate].
 *
 * inflowSums / outflowSums: [{ date, source, amount }] (already netted, any granularity).
 * Rows whose source is not in SOURCES are ignored for balances.
 */
function computeBalanceDays({ asOfDate, opening, startDate, endDate, inflowSums, outflowSums }) {
  const key = (date, source) => `${date}|${source}`;
  const inByKey = new Map();
  const outByKey = new Map();
  for (const r of inflowSums || []) {
    if (!SOURCES.includes(r.source)) continue;
    const k = key(r.date, r.source);
    inByKey.set(k, (inByKey.get(k) || 0) + (Number(r.amount) || 0));
  }
  for (const r of outflowSums || []) {
    if (!SOURCES.includes(r.source)) continue;
    const k = key(r.date, r.source);
    outByKey.set(k, (outByKey.get(k) || 0) + (Number(r.amount) || 0));
  }

  const carry = {};
  SOURCES.forEach((s) => { carry[s] = Number(opening?.[s]) || 0; });

  const days = [];
  for (let d = asOfDate; d <= endDate; d = nextDay(d)) {
    const row = {};
    SOURCES.forEach((s) => {
      const inflow = inByKey.get(key(d, s)) || 0;
      const outflow = outByKey.get(key(d, s)) || 0;
      const openingAmt = carry[s];
      const closing = round2(openingAmt + inflow - outflow);
      row[s] = { opening: openingAmt, inflow: round2(inflow), outflow: round2(outflow), closing };
      carry[s] = closing;
    });
    if (d >= startDate) {
      const totals = SOURCES.reduce(
        (t, s) => ({
          opening: t.opening + row[s].opening,
          inflow: t.inflow + row[s].inflow,
          outflow: t.outflow + row[s].outflow,
          closing: t.closing + row[s].closing,
        }),
        { opening: 0, inflow: 0, outflow: 0, closing: 0 }
      );
      days.push({
        date: d,
        cash: row[CASH_SOURCE],
        accounts: ACCOUNT_NAMES.map((accountName) => ({ accountName, ...row[accountName] })),
        totals: {
          opening: round2(totals.opening),
          inflow: round2(totals.inflow),
          outflow: round2(totals.outflow),
          closing: round2(totals.closing),
        },
      });
    }
  }
  return days;
}

module.exports = {
  ACCOUNT_NAMES,
  CASH_SOURCE,
  SOURCES,
  PAYMENT_MODES,
  MAX_BALANCE_DAYS,
  round2,
  isValidYmd,
  nextDay,
  daysBetween,
  computeNetAmountReceived,
  computeActualAmountPaid,
  sourceOf,
  validateInflowInput,
  validateOutflowInput,
  validateOpeningBalanceInput,
  computeBalanceDays,
};
