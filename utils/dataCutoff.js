const Settings = require('../Modals/Settings');

const SETTINGS_KEY = 'dataVisibilityCutoffDate';
const DEFAULT_CUTOFF = '2026-04-01';
/** Previous contract value — upgrade in place so live APIs do not stay on March. */
const LEGACY_CUTOFF = '2026-03-01';
const CACHE_TTL_MS = 60 * 1000;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

let cache = { value: undefined, expiresAt: 0 };

function normalizeCutoffYmd(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (YMD_RE.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

/** Inclusive UTC midnight for YYYY-MM-DD. */
function cutoffToUtcDate(ymd) {
  const normalized = normalizeCutoffYmd(ymd);
  if (!normalized) return null;
  return new Date(`${normalized}T00:00:00.000Z`);
}

function isBeforeCutoffValue(value, minValue) {
  if (value == null || minValue == null) return false;
  if (value instanceof Date || minValue instanceof Date) {
    return new Date(value).getTime() < new Date(minValue).getTime();
  }
  return String(value) < String(minValue);
}

/**
 * Raise an existing Mongo comparison object so $gte is at least minValue.
 */
function raiseGte(existing, minValue) {
  if (minValue == null) return existing;
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    return { $gte: minValue };
  }
  const next = { ...existing };
  if (next.$gte == null || isBeforeCutoffValue(next.$gte, minValue)) {
    next.$gte = minValue;
  }
  return next;
}

async function ensureCutoffSeeded() {
  const existing = await Settings.findOne({ key: SETTINGS_KEY }).lean();
  const current = existing ? normalizeCutoffYmd(existing.value) : null;

  if (current && current !== LEGACY_CUTOFF) {
    return current;
  }

  const updated = await Settings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: { key: SETTINGS_KEY, value: DEFAULT_CUTOFF } },
    { upsert: true, new: true }
  ).lean();
  return normalizeCutoffYmd(updated?.value) || DEFAULT_CUTOFF;
}

/**
 * Cached YYYY-MM-DD cutoff (inclusive). Seeds/migrates to 2026-04-01.
 * Clearing the settings value disables the filter.
 */
async function getDataCutoffDate() {
  const now = Date.now();
  if (cache.expiresAt > now && cache.value !== undefined) {
    return cache.value;
  }

  try {
    const doc = await Settings.findOne({ key: SETTINGS_KEY }).lean();
    let value = normalizeCutoffYmd(doc?.value);
    if (!doc || value === LEGACY_CUTOFF) {
      value = await ensureCutoffSeeded();
    }
    cache = { value: value || null, expiresAt: now + CACHE_TTL_MS };
    return cache.value;
  } catch (err) {
    console.error('getDataCutoffDate:', err.message);
    if (cache.value !== undefined) return cache.value;
    cache = { value: DEFAULT_CUTOFF, expiresAt: now + CACHE_TTL_MS };
    return DEFAULT_CUTOFF;
  }
}

function applyDateFieldCutoff(query, field, cutoffYmd, { asDate = true } = {}) {
  if (!query || !cutoffYmd) return query;
  const minValue = asDate ? cutoffToUtcDate(cutoffYmd) : String(cutoffYmd);
  if (!minValue) return query;
  query[field] = raiseGte(query[field], minValue);
  return query;
}

function toDateExpr(path) {
  return {
    $convert: { input: path, to: 'date', onError: null, onNull: null },
  };
}

/**
 * At least one eventTypes[] row matching optional start/end/venue filters.
 * Converts startDate/endDate so ISO strings (not BSON Date) still match —
 * some imported bookings store dates as strings, which Date $gte ignores.
 */
function applyEventTypesElemFilter(query, { startGte, endLte, venueIds, subVenueIds } = {}) {
  if (!query) return query;

  const conds = [];
  if (startGte) {
    conds.push({ $gte: [toDateExpr('$$et.startDate'), startGte] });
  }
  if (endLte) {
    conds.push({ $lte: [toDateExpr('$$et.endDate'), endLte] });
  }
  if (venueIds && venueIds.length) {
    conds.push({ $in: ['$$et.venueLocation', venueIds] });
  }
  if (subVenueIds && subVenueIds.length) {
    conds.push({ $in: ['$$et.subVenueLocation', subVenueIds] });
  }
  if (!conds.length) return query;

  const clause = {
    $expr: {
      $gt: [
        {
          $size: {
            $filter: {
              input: { $ifNull: ['$eventTypes', []] },
              as: 'et',
              cond: conds.length === 1 ? conds[0] : { $and: conds },
            },
          },
        },
        0,
      ],
    },
  };

  const and = Array.isArray(query.$and) ? query.$and : [];
  query.$and = [...and, clause];
  if (query.eventTypes) delete query.eventTypes;
  return query;
}

/**
 * Unconditional floor: at least one eventTypes[].startDate >= cutoff.
 * Coerces string dates; does not require the client to send startDate.
 */
function applyEventTypesStartDateCutoff(query, cutoffYmd) {
  if (!query || !cutoffYmd) return query;
  const d = cutoffToUtcDate(cutoffYmd);
  if (!d) return query;
  return applyEventTypesElemFilter(query, { startGte: d });
}

function mergeCutoffIntoStartDate(clientStart, cutoffYmd) {
  const cutoffDate = cutoffToUtcDate(cutoffYmd);
  if (!cutoffDate) return clientStart || null;
  if (!clientStart || clientStart.getTime() < cutoffDate.getTime()) return cutoffDate;
  return clientStart;
}

function isYmdBeforeCutoff(ymd, cutoffYmd) {
  if (!ymd || !cutoffYmd) return false;
  return String(ymd) < String(cutoffYmd);
}

module.exports = {
  SETTINGS_KEY,
  DEFAULT_CUTOFF,
  getDataCutoffDate,
  cutoffToUtcDate,
  raiseGte,
  applyDateFieldCutoff,
  applyEventTypesStartDateCutoff,
  applyEventTypesElemFilter,
  mergeCutoffIntoStartDate,
  isYmdBeforeCutoff,
  normalizeCutoffYmd,
};
