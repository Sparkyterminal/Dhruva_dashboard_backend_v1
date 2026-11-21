/**
 * Everyday Expenses shared rules: grades, IST day/lock helpers, category validation,
 * the reimbursement rules engine, and seed data.
 * Contract: Routes/EverydayExpenses/EVERYDAY_EXPENSES_CONTRACT.md
 *
 * calculateExpense() is the ONLY place reimbursable amounts are computed. Create, edit and
 * any recalculation must go through it.
 */

const GRADES = ['JUNIOR_STAFF', 'EXECUTIVE', 'SENIOR_EXECUTIVE', 'MANAGER'];
const DEFAULT_GRADE = 'JUNIOR_STAFF';
const GRADE_LABELS = {
  JUNIOR_STAFF: 'Junior Staff',
  EXECUTIVE: 'Executive',
  SENIOR_EXECUTIVE: 'Senior Executive',
  MANAGER: 'Manager',
};

const CALC_TYPES = ['ACTUAL', 'PER_UNIT', 'CAPPED_PER_UNIT', 'FIXED_MAX'];
const STATUSES = ['SUBMITTED', 'REJECTED', 'REPAID'];
const REPAY_MODES = ['CASH', 'BANK', 'UPI'];
// The reviewer rule lives in utils/reviewerAccess.js (shared with Employee Statistics); re-exported here.
const { REVIEWER_ROLES, REVIEWER_DEPARTMENT_NAMES, normDepartmentName, isExpenseReviewer } = require('./reviewerAccess');

const BILL_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const DEFAULT_SETTINGS = { claimWindowDays: 7, maxBillFiles: 5, maxBillSizeMB: 10 };
const SETTINGS_LIMITS = {
  claimWindowDays: [0, 365],
  maxBillFiles: [1, 20],
  maxBillSizeMB: [1, 25],
};

/** Max ids per reject / repay call. */
const MAX_BULK_IDS = 200;

const COMPANY_PROVIDED_NOTE = 'Arranged by company/venue/client';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

function isValidYmd(value) {
  if (typeof value !== 'string' || !YMD_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isValidMonth(value) {
  return typeof value === 'string' && MONTH_RE.test(value);
}

function isValidHhmm(value) {
  return typeof value === 'string' && HHMM_RE.test(value);
}

/** Add n calendar days to YYYY-MM-DD (plain dates, no time zones). */
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The IST calendar date (YYYY-MM-DD) of an instant. */
function istYmd(date) {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 00:00:00.000 IST of the day after `date`'s IST day. */
function nextIstMidnight(date) {
  return new Date(`${addDays(istYmd(date), 1)}T00:00:00.000+05:30`);
}

function isLocked(expense, now) {
  return !expense.editableUntil || now.getTime() >= new Date(expense.editableUntil).getTime();
}

/** "₹3,000" / "₹1,999.99" (Indian digit grouping). */
function rupees(n) {
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** "21:00" → "9:00 PM" */
function to12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function plural(label, n) {
  if (!label) return '';
  return n === 1 ? label : `${label}s`;
}

/** Parse a positive/non-negative number. Returns null when missing or invalid. */
function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const CATEGORY_FIELDS = [
  'group', 'name', 'calcType', 'unitLabel', 'rate', 'cap', 'capByGrade', 'requiresBill',
  'maxClaimsPerDay', 'afterTime', 'companyProvidedZero', 'approvalAbove', 'guidance',
  'sortOrder', 'active',
];

/**
 * Validate a full category (after merging a PUT body onto the existing one).
 * Returns { value } with normalized fields, or { error, fields }.
 */
function validateCategory(input) {
  const c = input || {};
  const fields = {};
  const out = {};

  out.group = typeof c.group === 'string' ? c.group.trim() : '';
  if (!out.group) fields.group = 'group is required';
  out.name = typeof c.name === 'string' ? c.name.trim() : '';
  if (!out.name) fields.name = 'name is required';

  out.calcType = c.calcType;
  if (!CALC_TYPES.includes(c.calcType)) fields.calcType = `calcType must be one of ${CALC_TYPES.join(', ')}`;

  const optPositive = (key) => {
    if (c[key] === undefined || c[key] === null || c[key] === '') return null;
    const n = toNumber(c[key]);
    if (n == null || n <= 0) {
      fields[key] = `${key} must be a number > 0 or null`;
      return null;
    }
    return round2(n);
  };
  out.rate = optPositive('rate');
  out.cap = optPositive('cap');
  out.approvalAbove = optPositive('approvalAbove');

  out.unitLabel = typeof c.unitLabel === 'string' && c.unitLabel.trim() ? c.unitLabel.trim() : null;

  out.capByGrade = null;
  if (c.capByGrade !== undefined && c.capByGrade !== null) {
    if (typeof c.capByGrade !== 'object' || Array.isArray(c.capByGrade)) {
      fields.capByGrade = 'capByGrade must be an object or null';
    } else {
      const unknown = Object.keys(c.capByGrade).filter((g) => !GRADES.includes(g));
      if (unknown.length) fields.capByGrade = `Unknown grade(s): ${unknown.join(', ')}`;
      const cbg = {};
      for (const g of GRADES) {
        const n = toNumber(c.capByGrade[g]);
        if (n == null || n <= 0) {
          fields.capByGrade = `capByGrade must have a number > 0 for every grade (${GRADES.join(', ')})`;
          break;
        }
        cbg[g] = round2(n);
      }
      if (!fields.capByGrade) out.capByGrade = cbg;
    }
  }

  if (c.maxClaimsPerDay === undefined || c.maxClaimsPerDay === null || c.maxClaimsPerDay === '') {
    out.maxClaimsPerDay = null;
  } else {
    const n = toNumber(c.maxClaimsPerDay);
    if (n == null || !Number.isInteger(n) || n < 1) fields.maxClaimsPerDay = 'maxClaimsPerDay must be a whole number >= 1 or null';
    else out.maxClaimsPerDay = n;
  }

  if (c.afterTime === undefined || c.afterTime === null || c.afterTime === '') {
    out.afterTime = null;
  } else if (!isValidHhmm(c.afterTime)) {
    fields.afterTime = 'afterTime must be HH:mm (24-hour) or null';
  } else {
    out.afterTime = c.afterTime;
  }

  const bool = (key, dflt) => {
    if (c[key] === undefined || c[key] === null) return dflt;
    if (typeof c[key] !== 'boolean') {
      fields[key] = `${key} must be a boolean`;
      return dflt;
    }
    return c[key];
  };
  out.requiresBill = bool('requiresBill', true);
  out.companyProvidedZero = bool('companyProvidedZero', false);
  out.active = bool('active', true);

  out.guidance = c.guidance == null ? '' : String(c.guidance).trim();
  if (c.sortOrder === undefined || c.sortOrder === null || c.sortOrder === '') {
    out.sortOrder = 0;
  } else {
    const n = toNumber(c.sortOrder);
    if (n == null) fields.sortOrder = 'sortOrder must be a number';
    else out.sortOrder = n;
  }

  // calcType-specific rules
  if (out.calcType === 'PER_UNIT' && !(out.rate > 0)) fields.rate = 'PER_UNIT needs rate > 0';
  if (out.calcType === 'CAPPED_PER_UNIT' && !(out.cap > 0) && !out.capByGrade) {
    fields.cap = 'CAPPED_PER_UNIT needs cap > 0 or a full capByGrade';
  }
  if (out.calcType === 'FIXED_MAX' && !(out.cap > 0)) fields.cap = 'FIXED_MAX needs cap > 0';
  if ((out.calcType === 'PER_UNIT' || out.calcType === 'CAPPED_PER_UNIT') && !out.unitLabel) {
    fields.unitLabel = `unitLabel is required for ${out.calcType}`;
  }

  if (Object.keys(fields).length) {
    return { error: Object.values(fields)[0], fields };
  }
  return { value: out };
}

/** The part of a category stored on each expense (snapshot rule). */
function categorySnapshot(category) {
  return {
    name: category.name,
    group: category.group,
    calcType: category.calcType,
    rate: category.rate ?? null,
    cap: category.cap ?? null,
    capByGrade: category.capByGrade ?? null,
    unitLabel: category.unitLabel ?? null,
  };
}

// ---------------------------------------------------------------------------
// Rules engine
// ---------------------------------------------------------------------------

/**
 * Validate the employee's input and compute the reimbursable amount.
 *
 * @param {object} p
 * @param {object} p.category  full category (rules + switches)
 * @param {string} p.grade     grade at submit (defaults to JUNIOR_STAFF)
 * @param {object} p.input     { amount, units, dutyEndTime, companyProvided, priorApproval, bills }
 * @param {number} p.sameDayClaims  the user's other non-rejected entries for this category + date
 * @returns {{ value: { amount, units, dutyEndTime, companyProvided, priorApproval, reimbursable, cappedBy } } | { error, fields? }}
 */
function calculateExpense({ category, grade, input, sameDayClaims = 0 }) {
  const g = GRADES.includes(grade) ? grade : DEFAULT_GRADE;
  const i = input || {};
  const calcType = category.calcType;

  // --- input parsing -------------------------------------------------------
  if (i.companyProvided !== undefined && i.companyProvided !== null && typeof i.companyProvided !== 'boolean') {
    return { error: 'companyProvided must be a boolean', fields: { companyProvided: 'must be a boolean' } };
  }
  const companyProvided = i.companyProvided === true;

  let dutyEndTime = null;
  if (i.dutyEndTime !== undefined && i.dutyEndTime !== null && i.dutyEndTime !== '') {
    if (!isValidHhmm(i.dutyEndTime)) {
      return { error: 'dutyEndTime must be HH:mm (24-hour)', fields: { dutyEndTime: 'must be HH:mm' } };
    }
    dutyEndTime = i.dutyEndTime;
  }

  let priorApproval = null;
  if (i.priorApproval !== undefined && i.priorApproval !== null) {
    if (typeof i.priorApproval !== 'object' || Array.isArray(i.priorApproval)) {
      return { error: 'priorApproval must be an object like { approvedBy }', fields: { priorApproval: 'invalid' } };
    }
    const approvedBy = typeof i.priorApproval.approvedBy === 'string' ? i.priorApproval.approvedBy.trim() : '';
    priorApproval = approvedBy ? { approvedBy } : null;
  }

  const rawAmount = i.amount;
  const hasAmount = !(rawAmount === undefined || rawAmount === null || rawAmount === '');
  const amountNum = hasAmount ? toNumber(rawAmount) : null;
  if (hasAmount && (amountNum == null || amountNum <= 0)) {
    return { error: 'amount must be a number > 0', fields: { amount: 'must be > 0' } };
  }
  const amount = amountNum == null ? null : round2(amountNum);

  const rawUnits = i.units;
  const hasUnits = !(rawUnits === undefined || rawUnits === null || rawUnits === '');
  const unitsNum = hasUnits ? toNumber(rawUnits) : null;
  if (hasUnits && (unitsNum == null || unitsNum <= 0)) {
    return { error: 'units must be a number > 0', fields: { units: 'must be > 0' } };
  }

  // --- 1. companyProvidedZero ---------------------------------------------
  if (category.companyProvidedZero && companyProvided) {
    return {
      value: {
        amount: calcType === 'PER_UNIT' ? null : amount,
        units: unitsNum == null ? null : round2(unitsNum),
        dutyEndTime,
        companyProvided: true,
        priorApproval,
        reimbursable: 0,
        cappedBy: COMPANY_PROVIDED_NOTE,
      },
    };
  }

  // --- required inputs per calcType -----------------------------------------
  let units = null;
  if (calcType === 'PER_UNIT') {
    if (unitsNum == null) return { error: `units (${category.unitLabel || 'units'}) is required`, fields: { units: 'required' } };
    units = round2(unitsNum);
  } else {
    if (amount == null) return { error: 'amount is required', fields: { amount: 'required' } };
    if (calcType === 'CAPPED_PER_UNIT') {
      if (unitsNum == null || !Number.isInteger(unitsNum) || unitsNum < 1) {
        return {
          error: `units (${plural(category.unitLabel || 'unit', 2)}) must be a whole number >= 1`,
          fields: { units: 'whole number >= 1' },
        };
      }
      units = unitsNum;
    }
  }

  // --- 2. afterTime ---------------------------------------------------------
  if (category.afterTime) {
    if (!dutyEndTime) {
      return { error: 'dutyEndTime is required for this category', fields: { dutyEndTime: 'required' } };
    }
    const qualifies = dutyEndTime > category.afterTime || dutyEndTime < '06:00';
    if (!qualifies) {
      return {
        error: `Not eligible: duty must end after ${to12h(category.afterTime)}`,
        fields: { dutyEndTime: 'not eligible' },
      };
    }
  }

  // --- 3. maxClaimsPerDay ---------------------------------------------------
  if (category.maxClaimsPerDay != null && sameDayClaims >= category.maxClaimsPerDay) {
    return {
      error: `Only ${category.maxClaimsPerDay} claim${category.maxClaimsPerDay === 1 ? '' : 's'} per day allowed for ${category.name}`,
      fields: { expenseDate: 'claim limit reached' },
    };
  }

  // --- 4. approvalAbove -----------------------------------------------------
  if (category.approvalAbove != null && amount != null && amount > category.approvalAbove) {
    if (!priorApproval) {
      return {
        error: `Prior approval required above ${rupees(category.approvalAbove)}: enter who approved it`,
        fields: { 'priorApproval.approvedBy': 'required' },
      };
    }
  }

  // --- 5. requiresBill ------------------------------------------------------
  if (category.requiresBill && !(Array.isArray(i.bills) && i.bills.length > 0)) {
    return { error: 'At least one bill is required for this category', fields: { bills: 'required' } };
  }

  // --- calculation ----------------------------------------------------------
  let reimbursable;
  let cappedBy = null;
  if (calcType === 'ACTUAL') {
    reimbursable = amount;
    if (category.cap != null && amount > category.cap) {
      reimbursable = category.cap;
      cappedBy = `Capped at ${rupees(category.cap)}`;
    }
  } else if (calcType === 'PER_UNIT') {
    reimbursable = round2(units * category.rate);
    cappedBy = `${rupees(category.rate)} per ${category.unitLabel} × ${units} ${category.unitLabel}`;
  } else if (calcType === 'CAPPED_PER_UNIT') {
    const gradeLimit = category.capByGrade ? category.capByGrade[g] : null;
    const limit = gradeLimit ?? category.cap;
    const total = round2(limit * units);
    reimbursable = Math.min(amount, total);
    if (amount > total) {
      cappedBy = gradeLimit != null
        ? `${category.name} limit ${rupees(total)} for ${units} ${plural(category.unitLabel, units)} (${GRADE_LABELS[g]})`
        : `Capped at ${rupees(limit)} per ${category.unitLabel} × ${units} ${plural(category.unitLabel, units)}`;
    }
  } else if (calcType === 'FIXED_MAX') {
    reimbursable = Math.min(amount, category.cap);
    if (amount > category.cap) {
      cappedBy = `Capped at ${rupees(category.cap)} per ${category.maxClaimsPerDay === 1 ? 'day' : 'claim'}`;
    }
  } else {
    return { error: 'Category has an unknown calcType' };
  }

  return {
    value: {
      amount: calcType === 'PER_UNIT' ? null : amount,
      units,
      dutyEndTime,
      companyProvided,
      priorApproval,
      reimbursable: round2(reimbursable),
      cappedBy,
    },
  };
}

// ---------------------------------------------------------------------------
// Seed categories (contract section 6)
// ---------------------------------------------------------------------------

const LOCAL_TRAVEL_GUIDANCE = 'Use economical modes; bill or digital receipt required.';

const SEED_CATEGORIES = [
  {
    group: 'Food', name: 'Night shift food', calcType: 'FIXED_MAX', cap: 200, afterTime: '21:00',
    maxClaimsPerDay: 1, companyProvidedZero: true,
    guidance: 'Only for approved assignments; original food bill required; not payable if food was arranged by the company, venue or client.',
  },
  ...['Auto-rickshaw', 'Taxi/Cab', 'Metro', 'Bus', 'Parking', 'Toll'].map((name) => ({
    group: 'Local travel', name, calcType: 'ACTUAL', guidance: LOCAL_TRAVEL_GUIDANCE,
  })),
  {
    group: 'Mileage', name: 'Two-wheeler', calcType: 'PER_UNIT', unitLabel: 'km', rate: 5, requiresBill: false,
    guidance: 'Distance may be verified with Google Maps or approved route records.',
  },
  {
    group: 'Mileage', name: 'Four-wheeler', calcType: 'PER_UNIT', unitLabel: 'km', rate: 12, requiresBill: false,
    guidance: 'Distance may be verified with Google Maps or approved route records.',
  },
  {
    group: 'Outstation', name: 'Train / Bus / Flight ticket', calcType: 'ACTUAL',
    guidance: 'Executives & Coordinators: Sleeper Train / Economy Bus. Senior Executives: AC Train / Economy Flight (if approved). Managers: AC Train / Economy Flight. Needs prior approval.',
  },
  {
    group: 'Accommodation', name: 'Hotel', calcType: 'CAPPED_PER_UNIT', unitLabel: 'night',
    capByGrade: { JUNIOR_STAFF: 1500, EXECUTIVE: 2000, SENIOR_EXECUTIVE: 2000, MANAGER: 3000 },
    guidance: 'No minibar, alcohol, laundry, spa, guest or entertainment charges.',
  },
  {
    group: 'Daily allowance', name: 'Meals', calcType: 'CAPPED_PER_UNIT', unitLabel: 'day', cap: 600,
    companyProvidedZero: true,
  },
  {
    group: 'Daily allowance', name: 'Miscellaneous', calcType: 'CAPPED_PER_UNIT', unitLabel: 'day', cap: 200,
  },
  {
    group: 'Event purchases', name: 'Event purchase', calcType: 'ACTUAL', approvalAbove: 2000,
    guidance: 'Materials, props, stationery, production supplies, emergency needs. GST invoice wherever possible.',
  },
].map((c, idx) => {
  const v = validateCategory({ requiresBill: true, ...c, sortOrder: (idx + 1) * 10 });
  if (v.error) throw new Error(`Invalid seed category ${c.name}: ${v.error}`);
  return v.value;
});

module.exports = {
  GRADES,
  DEFAULT_GRADE,
  GRADE_LABELS,
  CALC_TYPES,
  STATUSES,
  REPAY_MODES,
  REVIEWER_ROLES,
  REVIEWER_DEPARTMENT_NAMES,
  BILL_TYPES,
  DEFAULT_SETTINGS,
  SETTINGS_LIMITS,
  MAX_BULK_IDS,
  CATEGORY_FIELDS,
  SEED_CATEGORIES,
  round2,
  isValidYmd,
  isValidMonth,
  isValidHhmm,
  addDays,
  istYmd,
  nextIstMidnight,
  isLocked,
  normDepartmentName,
  isExpenseReviewer,
  rupees,
  validateCategory,
  categorySnapshot,
  calculateExpense,
};
