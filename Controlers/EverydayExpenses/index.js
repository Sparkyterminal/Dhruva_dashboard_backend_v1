/**
 * Everyday Expenses.
 * Contract: Routes/EverydayExpenses/EVERYDAY_EXPENSES_CONTRACT.md
 *
 * Access (contract section 1) is enforced here, never in the frontend:
 *   - ADMIN: 403 on everything (loadExpenseUser).
 *   - Everyone else: own expenses, categories, /me.
 *   - Reviewers (utils/reviewerAccess isExpenseReviewer: role CA/APPROVER/OWNER, or any department named
 *     "HR" / "HR DEPARTMENT"): everything else, but never reject/repay their own entries.
 *   req.expenseUser.isReviewer is computed ONCE here and is the only reviewer flag endpoints read.
 * Money: utils/everydayExpenses.js calculateExpense() only. Lock: utils/clock.js (server clock).
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const STATUS = require('../../utils/statusCodes');
const MESSAGE = require('../../utils/messages');
const clock = require('../../utils/clock');
const billStorage = require('../../utils/billStorage');
const EE = require('../../utils/everydayExpenses');
const User = require('../../Modals/User');
const Department = require('../../Modals/Department');
const Expense = require('../../Modals/EverydayExpenses/Expense');
const Category = require('../../Modals/EverydayExpenses/Category');
const Grade = require('../../Modals/EverydayExpenses/Grade');
const Settings = require('../../Modals/EverydayExpenses/Settings');
const Audit = require('../../Modals/EverydayExpenses/Audit');
const { loadUserAccess } = require('../../utils/reviewerAccess');

const KEY_ROOT = 'everyday-expenses/';
const QUERY_MAX_MS = 20000;

const isObjectId = (id) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;

function serverError(res, where, error) {
  console.error(`everydayExpenses.${where}:`, error);
  return res.status(STATUS.INTERNAL_SERVER_ERROR).json({ message: MESSAGE.internalServerError, error: error.message });
}

function titleCase(s) {
  return String(s || '').replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function displayName(user) {
  return titleCase(`${user.first_name || ''} ${user.last_name || ''}`.trim());
}

async function audit(req, { action, entity, entityId, before = null, after = null }) {
  try {
    await Audit.create({
      action,
      entity,
      entityId: entityId == null ? null : String(entityId),
      actorId: req.expenseUser.id,
      actorName: req.expenseUser.name,
      at: clock.now(),
      before,
      after,
    });
  } catch (err) {
    // The audit log must not silently disappear: surface it in logs. The main write already happened.
    console.error('everydayExpenses.audit failed:', action, entityId, err.message);
  }
}

// ---------------------------------------------------------------------------
// Access middleware
// ---------------------------------------------------------------------------

/** Loads the caller from the DB (role + departments are never trusted from the client). */
exports.loadExpenseUser = async (req, res, next) => {
  try {
    if (!req.userId || !isObjectId(String(req.userId))) {
      return res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    }
    const access = await loadUserAccess(req.userId);
    if (!access) {
      return res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    }
    if (access.role === 'ADMIN') {
      return res.status(STATUS.FORBIDDEN).json({ message: 'Admin has no access to Everyday Expenses' });
    }
    req.expenseUser = access;
    return next();
  } catch (error) {
    return serverError(res, 'loadExpenseUser', error);
  }
};

exports.requireReviewer = (req, res, next) => {
  if (!req.expenseUser?.isReviewer) {
    return res.status(STATUS.FORBIDDEN).json({ message: 'Only expense reviewers can do this' });
  }
  return next();
};

// ---------------------------------------------------------------------------
// Settings, grades, seed
// ---------------------------------------------------------------------------

async function getSettingsDoc() {
  const doc = await Settings.findOneAndUpdate(
    { singleton: 'default' },
    { $setOnInsert: { singleton: 'default', ...EE.DEFAULT_SETTINGS } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return doc;
}

function publicSettings(doc) {
  return {
    claimWindowDays: doc.claimWindowDays,
    maxBillFiles: doc.maxBillFiles,
    maxBillSizeMB: doc.maxBillSizeMB,
    billTypes: EE.BILL_TYPES,
  };
}

/** Inserts the section 6 seed categories exactly once (guarded by settings.categoriesSeededAt). */
async function ensureSeeded() {
  const settings = await getSettingsDoc();
  if (settings.categoriesSeededAt) return;
  for (const c of EE.SEED_CATEGORIES) {
    try {
      await Category.updateOne({ group: c.group, name: c.name }, { $setOnInsert: c }, { upsert: true });
    } catch (err) {
      if (err.code !== 11000) throw err; // concurrent seed: already inserted
    }
  }
  await Settings.updateOne({ singleton: 'default' }, { $set: { categoriesSeededAt: clock.now() } });
}

async function gradeOf(userId) {
  const g = await Grade.findOne({ userId }).select('grade').lean();
  return g?.grade || EE.DEFAULT_GRADE;
}

/** GET /everyday-expenses/me */
exports.getMe = async (req, res) => {
  try {
    const [settings, grade] = await Promise.all([getSettingsDoc(), gradeOf(req.expenseUser.objectId)]);
    return res.status(STATUS.SUCCESS).json({
      serverTime: clock.now().toISOString(),
      userId: req.expenseUser.id,
      isReviewer: req.expenseUser.isReviewer,
      grade,
      settings: publicSettings(settings),
    });
  } catch (error) {
    return serverError(res, 'getMe', error);
  }
};

/** PUT /everyday-expenses/settings (reviewers) */
exports.putSettings = async (req, res) => {
  try {
    const body = req.body || {};
    const before = await getSettingsDoc();
    const set = {};
    for (const key of Object.keys(EE.SETTINGS_LIMITS)) {
      if (body[key] === undefined) continue;
      const n = Number(body[key]);
      const [min, max] = EE.SETTINGS_LIMITS[key];
      if (!Number.isInteger(n) || n < min || n > max) {
        return res.status(STATUS.BAD_REQUEST).json({
          message: `${key} must be a whole number between ${min} and ${max}`,
          fields: { [key]: `${min}–${max}` },
        });
      }
      set[key] = n;
    }
    if (!Object.keys(set).length) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Send at least one of claimWindowDays, maxBillFiles, maxBillSizeMB' });
    }
    set.updatedBy = req.expenseUser.objectId;
    const saved = await Settings.findOneAndUpdate({ singleton: 'default' }, { $set: set }, { new: true }).lean();
    await audit(req, { action: 'SETTINGS', entity: 'settings', entityId: 'default', before: publicSettings(before), after: publicSettings(saved) });
    return res.status(STATUS.SUCCESS).json({ serverTime: clock.now().toISOString(), settings: publicSettings(saved) });
  } catch (error) {
    return serverError(res, 'putSettings', error);
  }
};

/** GET /everyday-expenses/people (reviewers) */
exports.getPeople = async (req, res) => {
  try {
    const users = await User.find({ is_active: true, is_archived: { $ne: true } })
      .select('first_name last_name role department')
      .lean()
      .maxTimeMS(QUERY_MAX_MS);
    const deptIds = [...new Set(users.flatMap((u) => (u.department?.department || []).map(String)))];
    const [depts, grades] = await Promise.all([
      Department.find({ _id: { $in: deptIds }, is_active: true, is_archived: false }).select('name').lean(),
      Grade.find({ userId: { $in: users.map((u) => u._id) } }).select('userId grade').lean(),
    ]);
    const deptName = new Map(depts.map((d) => [String(d._id), d.name]));
    const gradeBy = new Map(grades.map((g) => [String(g.userId), g.grade]));
    const people = users
      .map((u) => ({
        userId: String(u._id),
        name: displayName(u),
        departments: (u.department?.department || []).map((id) => deptName.get(String(id))).filter(Boolean),
        role: u.role,
        grade: gradeBy.get(String(u._id)) || EE.DEFAULT_GRADE,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return res.status(STATUS.SUCCESS).json({ people });
  } catch (error) {
    return serverError(res, 'getPeople', error);
  }
};

/** PUT /everyday-expenses/grades (reviewers). All-or-nothing validation, then upsert. */
exports.putGrades = async (req, res) => {
  try {
    const list = req.body?.grades;
    if (!Array.isArray(list) || list.length === 0) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'grades must be a non-empty array of { userId, grade }' });
    }
    if (list.length > 1000) return res.status(STATUS.BAD_REQUEST).json({ message: 'Too many grades: max 1000 per call' });
    const byUser = new Map();
    for (const item of list) {
      const userId = typeof item?.userId === 'string' ? item.userId.trim() : '';
      if (!isObjectId(userId)) return res.status(STATUS.BAD_REQUEST).json({ message: `Invalid userId "${userId}"`, fields: { userId } });
      if (!EE.GRADES.includes(item.grade)) {
        return res.status(STATUS.BAD_REQUEST).json({ message: `grade must be one of ${EE.GRADES.join(', ')}`, fields: { grade: String(item.grade) } });
      }
      byUser.set(userId, item.grade);
    }
    const ids = [...byUser.keys()];
    const found = await User.find({ _id: { $in: ids } }).select('_id').lean();
    if (found.length !== ids.length) {
      const have = new Set(found.map((u) => String(u._id)));
      return res.status(404).json({ message: 'User not found', fields: { userId: ids.filter((id) => !have.has(id)) } });
    }
    const before = await Grade.find({ userId: { $in: ids } }).select('userId grade').lean();
    await Grade.bulkWrite(
      ids.map((userId) => ({
        updateOne: {
          filter: { userId },
          update: { $set: { grade: byUser.get(userId), updatedBy: req.expenseUser.objectId } },
          upsert: true,
        },
      }))
    );
    await audit(req, {
      action: 'GRADES',
      entity: 'grade',
      before: before.map((g) => ({ userId: String(g.userId), grade: g.grade })),
      after: ids.map((userId) => ({ userId, grade: byUser.get(userId) })),
    });
    return res.status(STATUS.SUCCESS).json({ updated: ids.length, grades: ids.map((userId) => ({ userId, grade: byUser.get(userId) })) });
  } catch (error) {
    return serverError(res, 'putGrades', error);
  }
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function formatCategory(c) {
  return {
    _id: String(c._id),
    group: c.group,
    name: c.name,
    calcType: c.calcType,
    unitLabel: c.unitLabel ?? null,
    rate: c.rate ?? null,
    cap: c.cap ?? null,
    capByGrade: c.capByGrade ?? null,
    requiresBill: !!c.requiresBill,
    maxClaimsPerDay: c.maxClaimsPerDay ?? null,
    afterTime: c.afterTime ?? null,
    companyProvidedZero: !!c.companyProvidedZero,
    approvalAbove: c.approvalAbove ?? null,
    guidance: c.guidance || '',
    sortOrder: c.sortOrder ?? 0,
    active: c.active !== false,
  };
}

/** GET /everyday-expenses/categories?includeInactive= */
exports.getCategories = async (req, res) => {
  try {
    await ensureSeeded();
    const includeInactive = req.expenseUser.isReviewer && String(req.query.includeInactive) === 'true';
    const rows = await Category.find(includeInactive ? {} : { active: true })
      .sort({ sortOrder: 1, group: 1, name: 1 })
      .lean();
    return res.status(STATUS.SUCCESS).json({ serverTime: clock.now().toISOString(), categories: rows.map(formatCategory) });
  } catch (error) {
    return serverError(res, 'getCategories', error);
  }
};

function pickCategoryFields(body) {
  const out = {};
  for (const k of EE.CATEGORY_FIELDS) if (body && body[k] !== undefined) out[k] = body[k];
  return out;
}

/** POST /everyday-expenses/categories (reviewers) */
exports.createCategory = async (req, res) => {
  try {
    await ensureSeeded();
    const v = EE.validateCategory(pickCategoryFields(req.body));
    if (v.error) return res.status(STATUS.BAD_REQUEST).json({ message: v.error, fields: v.fields });
    const created = await Category.create(v.value);
    const out = formatCategory(created.toObject());
    await audit(req, { action: 'CATEGORY_CREATE', entity: 'category', entityId: created._id, after: out });
    return res.status(STATUS.CREATED).json(out);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ code: 'CONFLICT', message: 'A category with this name already exists in this group' });
    }
    return serverError(res, 'createCategory', error);
  }
};

/** PUT /everyday-expenses/categories/:id (reviewers). Merges the body onto the current category. */
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(STATUS.BAD_REQUEST).json({ message: 'Valid category id is required' });
    const existing = await Category.findById(id);
    if (!existing) return res.status(404).json({ message: 'Category not found' });
    const before = formatCategory(existing.toObject());
    const v = EE.validateCategory({ ...before, ...pickCategoryFields(req.body) });
    if (v.error) return res.status(STATUS.BAD_REQUEST).json({ message: v.error, fields: v.fields });
    existing.set(v.value);
    await existing.save();
    const out = formatCategory(existing.toObject());
    await audit(req, { action: 'CATEGORY_EDIT', entity: 'category', entityId: id, before, after: out });
    return res.status(STATUS.SUCCESS).json(out);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ code: 'CONFLICT', message: 'A category with this name already exists in this group' });
    }
    return serverError(res, 'updateCategory', error);
  }
};

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

function formatExpense(e) {
  return {
    _id: String(e._id),
    userId: String(e.userId),
    userName: e.userName || '',
    departments: e.departments || [],
    categoryId: String(e.categoryId),
    categorySnapshot: e.categorySnapshot,
    gradeAtSubmit: e.gradeAtSubmit,
    expenseDate: e.expenseDate,
    addedDay: e.addedDay,
    amount: e.amount ?? null,
    units: e.units ?? null,
    dutyEndTime: e.dutyEndTime ?? null,
    companyProvided: !!e.companyProvided,
    priorApproval: e.priorApproval ?? null,
    note: e.note || '',
    bills: (e.bills || []).map((b) => ({ key: b.key, name: b.name, size: b.size, contentType: b.contentType })),
    reimbursable: e.reimbursable,
    cappedBy: e.cappedBy ?? null,
    status: e.status,
    rejection: e.rejection ?? null,
    repayment: e.repayment ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    editableUntil: e.editableUntil,
  };
}

function userPrefix(userId) {
  return `${KEY_ROOT}${userId}/`;
}

/** Validates bills for a save. Returns { value } or { error, fields }. */
async function validateBills(rawBills, userId, settings) {
  if (rawBills === undefined || rawBills === null) return { value: [] };
  if (!Array.isArray(rawBills)) return { error: 'bills must be an array', fields: { bills: 'must be an array' } };
  if (rawBills.length > settings.maxBillFiles) {
    return { error: `At most ${settings.maxBillFiles} bills per expense`, fields: { bills: `max ${settings.maxBillFiles}` } };
  }
  const prefix = userPrefix(userId);
  const maxBytes = settings.maxBillSizeMB * 1024 * 1024;
  const seen = new Set();
  const bills = [];
  for (const b of rawBills) {
    const key = typeof b?.key === 'string' ? b.key : '';
    if (!key.startsWith(prefix) || key.includes('..') || key.length > 512) {
      return { error: 'Bill key does not belong to you', fields: { bills: key } };
    }
    if (seen.has(key)) continue;
    seen.add(key);
    if (!EE.BILL_TYPES.includes(b.contentType)) {
      return { error: `Bill type not allowed: ${b.contentType}`, fields: { bills: key } };
    }
    const size = Number(b.size);
    if (!Number.isInteger(size) || size <= 0 || size > maxBytes) {
      return { error: `Each bill must be at most ${settings.maxBillSizeMB} MB`, fields: { bills: key } };
    }
    bills.push({ key, name: typeof b.name === 'string' ? b.name.slice(0, 255) : '', size, contentType: b.contentType });
  }
  if (bills.length && !billStorage.isConfigured()) {
    return { error: 'Bill storage is not configured on the server', fields: { bills: 'storage unavailable' }, status: 503 };
  }
  const heads = await Promise.all(bills.map((b) => billStorage.headBill(b.key)));
  for (let i = 0; i < bills.length; i++) {
    if (!heads[i].exists) return { error: `Bill not uploaded: ${bills[i].name || bills[i].key}`, fields: { bills: bills[i].key } };
    if (heads[i].size !== bills[i].size) {
      return { error: `Bill size does not match the uploaded file: ${bills[i].name || bills[i].key}`, fields: { bills: bills[i].key } };
    }
  }
  return { value: bills };
}

/**
 * Validates the body and computes everything to store (shared by create and edit).
 * Returns { value } or { error, fields, status }.
 */
async function buildExpense(req, { existing = null } = {}) {
  const body = req.body || {};
  const me = req.expenseUser;
  const now = clock.now();
  const settings = await getSettingsDoc();

  const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
  if (!isObjectId(categoryId)) return { error: 'categoryId is required', fields: { categoryId: 'required' } };
  const category = await Category.findById(categoryId).lean();
  if (!category) return { error: 'Category not found', fields: { categoryId: 'not found' } };
  const sameCategory = existing && String(existing.categoryId) === categoryId;
  if (category.active === false && !sameCategory) {
    return { error: 'This category is no longer available', fields: { categoryId: 'inactive' } };
  }

  const expenseDate = body.expenseDate;
  if (!EE.isValidYmd(expenseDate)) return { error: 'expenseDate must be a valid YYYY-MM-DD date', fields: { expenseDate: 'invalid' } };
  const today = EE.istYmd(now);
  if (expenseDate > today) return { error: 'expenseDate cannot be in the future', fields: { expenseDate: 'future' } };
  const earliest = EE.addDays(today, -settings.claimWindowDays);
  if (expenseDate < earliest) {
    return {
      error: `expenseDate must be within the last ${settings.claimWindowDays} days (from ${earliest})`,
      fields: { expenseDate: `>= ${earliest}` },
    };
  }

  if (body.note != null && typeof body.note !== 'string') return { error: 'note must be a string', fields: { note: 'string' } };
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';

  // Cheap shape checks on bills first, so the rules engine sees the real count.
  const bills = await validateBills(body.bills, me.id, settings);
  if (bills.error) return bills;

  const sameDayFilter = {
    userId: me.objectId,
    categoryId: category._id,
    expenseDate,
    status: { $ne: 'REJECTED' },
  };
  if (existing) sameDayFilter._id = { $ne: existing._id };
  const sameDayClaims = category.maxClaimsPerDay != null ? await Expense.countDocuments(sameDayFilter) : 0;

  const grade = await gradeOf(me.objectId);
  const calc = EE.calculateExpense({
    category,
    grade,
    input: { ...body, bills: bills.value },
    sameDayClaims,
  });
  if (calc.error) return calc;

  return {
    value: {
      categoryId: category._id,
      categorySnapshot: EE.categorySnapshot(category),
      gradeAtSubmit: grade,
      expenseDate,
      note,
      bills: bills.value,
      ...calc.value,
    },
  };
}

function sendBuildError(res, built) {
  return res.status(built.status || STATUS.BAD_REQUEST).json({ message: built.error, fields: built.fields });
}

function lockedResponse(res) {
  return res.status(409).json({ code: 'LOCKED', message: 'This expense is locked.' });
}

/** POST /everyday-expenses */
exports.createExpense = async (req, res) => {
  try {
    const built = await buildExpense(req);
    if (built.error) return sendBuildError(res, built);
    const now = clock.now();
    const me = req.expenseUser;
    const created = await Expense.create({
      ...built.value,
      userId: me.objectId,
      userName: me.name,
      departments: me.departments,
      addedDay: EE.istYmd(now),
      editableUntil: EE.nextIstMidnight(now),
      status: 'SUBMITTED',
      rejection: null,
      repayment: null,
    });
    const out = formatExpense(created.toObject());
    await audit(req, { action: 'CREATE', entity: 'expense', entityId: created._id, after: out });
    return res.status(STATUS.CREATED).json({ ...out, serverTime: clock.now().toISOString() });
  } catch (error) {
    return serverError(res, 'createExpense', error);
  }
};

/** Loads the caller's own expense for edit/delete. Sends the error response and returns null on failure. */
async function loadOwnUnlocked(req, res) {
  const { id } = req.params;
  if (!isObjectId(id)) {
    res.status(STATUS.BAD_REQUEST).json({ message: 'Valid expense id is required' });
    return null;
  }
  const expense = await Expense.findById(id);
  if (!expense) {
    res.status(404).json({ message: 'Expense not found' });
    return null;
  }
  if (String(expense.userId) !== req.expenseUser.id) {
    res.status(STATUS.FORBIDDEN).json({ message: 'You can only change your own expenses' });
    return null;
  }
  if (EE.isLocked(expense, clock.now())) {
    lockedResponse(res);
    return null;
  }
  if (expense.status !== 'SUBMITTED') {
    res.status(409).json({ code: 'CONFLICT', message: `This expense was already ${expense.status.toLowerCase()} and can no longer be changed.` });
    return null;
  }
  return expense;
}

/** PUT /everyday-expenses/:id (own entry, before the lock) */
exports.updateExpense = async (req, res) => {
  try {
    const expense = await loadOwnUnlocked(req, res);
    if (!expense) return;
    const built = await buildExpense(req, { existing: expense });
    if (built.error) return sendBuildError(res, built);

    // Re-check the lock after the (async) validation, using the server clock.
    if (EE.isLocked(expense, clock.now())) return lockedResponse(res);

    const before = formatExpense(expense.toObject());
    const now = clock.now();
    // Atomic: only if still SUBMITTED and still before the lock at write time.
    const updated = await Expense.findOneAndUpdate(
      { _id: expense._id, userId: expense.userId, status: 'SUBMITTED', editableUntil: { $gt: now } },
      { $set: { ...built.value, updatedAt: now } },
      { new: true, timestamps: false }
    ).lean();
    if (!updated) {
      const current = await Expense.findById(expense._id).select('status').lean();
      if (current && current.status !== 'SUBMITTED') {
        return res.status(409).json({ code: 'CONFLICT', message: 'This expense was reviewed meanwhile and can no longer be changed.' });
      }
      return lockedResponse(res);
    }

    const removedKeys = before.bills.map((b) => b.key).filter((k) => !updated.bills.some((b) => b.key === k));
    billStorage.deleteBills(removedKeys);

    const out = formatExpense(updated);
    await audit(req, { action: 'EDIT', entity: 'expense', entityId: expense._id, before, after: out });
    return res.status(STATUS.SUCCESS).json({ ...out, serverTime: clock.now().toISOString() });
  } catch (error) {
    return serverError(res, 'updateExpense', error);
  }
};

/** DELETE /everyday-expenses/:id (own entry, before the lock) */
exports.deleteExpense = async (req, res) => {
  try {
    const expense = await loadOwnUnlocked(req, res);
    if (!expense) return;
    const before = formatExpense(expense.toObject());
    const deleted = await Expense.findOneAndDelete({
      _id: expense._id,
      userId: expense.userId,
      status: 'SUBMITTED',
      editableUntil: { $gt: clock.now() },
    }).lean();
    if (!deleted) {
      const current = await Expense.findById(expense._id).select('status').lean();
      if (current && current.status !== 'SUBMITTED') {
        return res.status(409).json({ code: 'CONFLICT', message: 'This expense was reviewed meanwhile and can no longer be changed.' });
      }
      return lockedResponse(res);
    }
    billStorage.deleteBills(before.bills.map((b) => b.key));
    await audit(req, { action: 'DELETE', entity: 'expense', entityId: expense._id, before });
    return res.status(STATUS.SUCCESS).json({ message: 'Expense deleted', id: before._id, serverTime: clock.now().toISOString() });
  } catch (error) {
    return serverError(res, 'deleteExpense', error);
  }
};

/** Totals per contract 4.4: spent/reimbursable exclude REJECTED; repaid = REPAID; pending = SUBMITTED. */
function totalsGroupStage(extraId = null) {
  const notRejected = { $ne: ['$status', 'REJECTED'] };
  const sumIf = (cond, field) => ({ $sum: { $cond: [cond, { $ifNull: [field, 0] }, 0] } });
  return {
    $group: {
      _id: extraId,
      count: { $sum: 1 },
      spent: sumIf(notRejected, '$amount'),
      reimbursable: sumIf(notRejected, '$reimbursable'),
      repaid: sumIf({ $eq: ['$status', 'REPAID'] }, '$reimbursable'),
      pending: sumIf({ $eq: ['$status', 'SUBMITTED'] }, '$reimbursable'),
      rejected: sumIf({ $eq: ['$status', 'REJECTED'] }, '$reimbursable'),
    },
  };
}

const r2 = (n) => EE.round2(Number(n) || 0);

/** GET /everyday-expenses/mine?month=YYYY-MM (defaults to the current IST month) */
exports.getMine = async (req, res) => {
  try {
    const month = req.query.month ? String(req.query.month).trim() : EE.istYmd(clock.now()).slice(0, 7);
    if (!EE.isValidMonth(month)) return res.status(STATUS.BAD_REQUEST).json({ message: 'month must be YYYY-MM' });
    const match = {
      userId: req.expenseUser.objectId,
      expenseDate: { $gte: `${month}-01`, $lte: `${month}-31` },
    };
    const [rows, totalsRows] = await Promise.all([
      Expense.find(match).sort({ expenseDate: -1, createdAt: -1 }).lean().maxTimeMS(QUERY_MAX_MS),
      Expense.aggregate([{ $match: match }, totalsGroupStage()]).option({ maxTimeMS: QUERY_MAX_MS }),
    ]);
    const t = totalsRows[0] || {};
    return res.status(STATUS.SUCCESS).json({
      serverTime: clock.now().toISOString(),
      expenses: rows.map(formatExpense),
      totals: { spent: r2(t.spent), reimbursable: r2(t.reimbursable), repaid: r2(t.repaid), pending: r2(t.pending) },
    });
  } catch (error) {
    return serverError(res, 'getMine', error);
  }
};

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** GET /everyday-expenses (reviewers) */
exports.getOverview = async (req, res) => {
  try {
    const q = req.query;
    const match = {};
    const startDate = q.startDate ? String(q.startDate).trim() : '';
    const endDate = q.endDate ? String(q.endDate).trim() : '';
    if (startDate && !EE.isValidYmd(startDate)) return res.status(STATUS.BAD_REQUEST).json({ message: 'startDate must be YYYY-MM-DD' });
    if (endDate && !EE.isValidYmd(endDate)) return res.status(STATUS.BAD_REQUEST).json({ message: 'endDate must be YYYY-MM-DD' });
    if (startDate && endDate && startDate > endDate) return res.status(STATUS.BAD_REQUEST).json({ message: 'startDate must be <= endDate' });
    if (startDate || endDate) {
      match.expenseDate = {};
      if (startDate) match.expenseDate.$gte = startDate;
      if (endDate) match.expenseDate.$lte = endDate;
    }
    if (q.userId) {
      if (!isObjectId(String(q.userId))) return res.status(STATUS.BAD_REQUEST).json({ message: 'Invalid userId' });
      match.userId = new mongoose.Types.ObjectId(String(q.userId));
    }
    if (q.categoryId) {
      if (!isObjectId(String(q.categoryId))) return res.status(STATUS.BAD_REQUEST).json({ message: 'Invalid categoryId' });
      match.categoryId = new mongoose.Types.ObjectId(String(q.categoryId));
    }
    if (q.status) {
      if (!EE.STATUSES.includes(String(q.status))) {
        return res.status(STATUS.BAD_REQUEST).json({ message: `status must be one of ${EE.STATUSES.join(', ')}` });
      }
      match.status = String(q.status);
    }
    if (q.department && String(q.department).trim()) {
      match.departments = { $regex: `^${escapeRegex(String(q.department).trim())}$`, $options: 'i' };
    }

    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const limit = Math.min(Math.max(parseInt(q.limit, 10) || 100, 1), 500);

    const [total, rows, totalsRows, byPersonRows] = await Promise.all([
      Expense.countDocuments(match).maxTimeMS(QUERY_MAX_MS),
      Expense.find(match)
        .sort({ expenseDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .maxTimeMS(QUERY_MAX_MS),
      Expense.aggregate([{ $match: match }, totalsGroupStage()]).option({ maxTimeMS: QUERY_MAX_MS }),
      Expense.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            ...totalsGroupStage('$userId').$group,
            name: { $first: '$userName' },
          },
        },
        { $sort: { name: 1 } },
      ]).option({ maxTimeMS: QUERY_MAX_MS }),
    ]);

    const t = totalsRows[0] || {};
    return res.status(STATUS.SUCCESS).json({
      serverTime: clock.now().toISOString(),
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      total,
      totals: {
        spent: r2(t.spent),
        reimbursable: r2(t.reimbursable),
        repaid: r2(t.repaid),
        pending: r2(t.pending),
        rejected: r2(t.rejected),
      },
      byPerson: byPersonRows.map((p) => ({
        userId: String(p._id),
        name: p.name || '',
        count: p.count,
        spent: r2(p.spent),
        reimbursable: r2(p.reimbursable),
        repaid: r2(p.repaid),
        pending: r2(p.pending),
      })),
      expenses: rows.map(formatExpense),
    });
  } catch (error) {
    return serverError(res, 'getOverview', error);
  }
};

/** Shared per-id decision runner for reject / repay. Never fails the whole call for one bad id. */
async function runDecision(req, res, { action, buildSet }) {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(STATUS.BAD_REQUEST).json({ message: 'ids must be a non-empty array' });
  if (ids.length > EE.MAX_BULK_IDS) {
    return res.status(STATUS.BAD_REQUEST).json({ message: `Too many ids: max ${EE.MAX_BULK_IDS} per call` });
  }
  const me = req.expenseUser;
  const updated = [];
  const failed = [];
  const unique = [...new Set(ids.map((x) => (typeof x === 'string' ? x.trim() : String(x ?? ''))))];

  for (let i = 0; i < unique.length; i += 10) {
    await Promise.all(
      unique.slice(i, i + 10).map(async (id) => {
        try {
          if (!isObjectId(id)) return failed.push({ id, message: 'Invalid id' });
          const now = clock.now();
          const before = await Expense.findOneAndUpdate(
            { _id: id, status: 'SUBMITTED', userId: { $ne: me.objectId } },
            buildSet(now),
            { new: false, timestamps: false }
          ).lean();
          if (before) {
            const after = await Expense.findById(id).lean();
            updated.push(id);
            await audit(req, {
              action,
              entity: 'expense',
              entityId: id,
              before: { status: before.status, rejection: before.rejection ?? null, repayment: before.repayment ?? null },
              after: { status: after.status, rejection: after.rejection ?? null, repayment: after.repayment ?? null },
            });
            return;
          }
          const current = await Expense.findById(id).select('status userId').lean();
          if (!current) return failed.push({ id, message: 'Not found' });
          if (String(current.userId) === me.id) return failed.push({ id, message: 'Cannot settle your own claim' });
          return failed.push({ id, message: `Not in SUBMITTED (status is ${current.status})` });
        } catch (err) {
          console.error(`everydayExpenses.${action}`, id, err);
          return failed.push({ id, message: 'Update failed' });
        }
      })
    );
  }
  const order = new Map(unique.map((id, i) => [id, i]));
  updated.sort((a, b) => order.get(a) - order.get(b));
  failed.sort((a, b) => order.get(a.id) - order.get(b.id));
  return res.status(STATUS.SUCCESS).json({ updated, failed });
}

/** POST /everyday-expenses/reject (reviewers) */
exports.rejectExpenses = async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 3) return res.status(STATUS.BAD_REQUEST).json({ message: 'reason is required (at least 3 characters)', fields: { reason: 'min 3' } });
  return runDecision(req, res, {
    action: 'REJECT',
    buildSet: (now) => ({
      $set: {
        status: 'REJECTED',
        rejection: { reason: reason.slice(0, 1000), by: req.expenseUser.id, byName: req.expenseUser.name, at: now },
        updatedAt: now,
      },
    }),
  });
};

/** POST /everyday-expenses/repay (reviewers). repayment.amount = the entry's reimbursable. */
exports.repayExpenses = async (req, res) => {
  const { date, mode } = req.body || {};
  if (!EE.isValidYmd(date)) return res.status(STATUS.BAD_REQUEST).json({ message: 'date must be YYYY-MM-DD', fields: { date: 'invalid' } });
  if (!EE.REPAY_MODES.includes(mode)) {
    return res.status(STATUS.BAD_REQUEST).json({ message: `mode must be one of ${EE.REPAY_MODES.join(', ')}`, fields: { mode: 'invalid' } });
  }
  if (req.body.reference != null && typeof req.body.reference !== 'string') {
    return res.status(STATUS.BAD_REQUEST).json({ message: 'reference must be a string', fields: { reference: 'string' } });
  }
  const reference = typeof req.body.reference === 'string' ? req.body.reference.trim().slice(0, 200) : '';
  return runDecision(req, res, {
    action: 'REPAY',
    // Pipeline update so amount is copied from this entry's own reimbursable.
    buildSet: (now) => [
      {
        $set: {
          status: 'REPAID',
          // $literal: user text must never be read as a field path (e.g. a reference starting with "$").
          repayment: {
            date: { $literal: date },
            mode: { $literal: mode },
            reference: { $literal: reference },
            amount: '$reimbursable',
            by: { $literal: req.expenseUser.id },
            byName: { $literal: req.expenseUser.name },
            at: { $literal: now },
          },
          updatedAt: now,
        },
      },
    ],
  });
};

// ---------------------------------------------------------------------------
// Bills (S3)
// ---------------------------------------------------------------------------

function safeFileName(name) {
  const base = String(name || 'bill').split(/[\\/]/).pop();
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+/, '').slice(-80);
  return cleaned || 'bill';
}

/** POST /everyday-expenses/uploads/presign */
exports.presignUpload = async (req, res) => {
  try {
    if (!billStorage.isConfigured()) return res.status(503).json({ message: 'Bill storage is not configured on the server' });
    const settings = await getSettingsDoc();
    const { fileName, contentType } = req.body || {};
    const size = Number(req.body?.size);
    if (!EE.BILL_TYPES.includes(contentType)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: `contentType must be one of ${EE.BILL_TYPES.join(', ')}`, fields: { contentType: 'not allowed' } });
    }
    if (!Number.isInteger(size) || size <= 0 || size > settings.maxBillSizeMB * 1024 * 1024) {
      return res.status(STATUS.BAD_REQUEST).json({ message: `size must be 1 byte to ${settings.maxBillSizeMB} MB`, fields: { size: 'too large' } });
    }
    const month = EE.istYmd(clock.now()).slice(0, 7);
    const key = `${userPrefix(req.expenseUser.id)}${month}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
    const uploadUrl = await billStorage.presignPut({ key, contentType, size });
    return res.status(STATUS.SUCCESS).json({ uploadUrl, key, expiresIn: billStorage.URL_EXPIRES_IN });
  } catch (error) {
    return serverError(res, 'presignUpload', error);
  }
};

/** GET /everyday-expenses/uploads/url?key= (own keys, or any bill on an entry for reviewers) */
exports.getBillUrl = async (req, res) => {
  try {
    if (!billStorage.isConfigured()) return res.status(503).json({ message: 'Bill storage is not configured on the server' });
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    if (!key.startsWith(KEY_ROOT) || key.includes('..') || key.length > 512) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Invalid key' });
    }
    const own = key.startsWith(userPrefix(req.expenseUser.id));
    if (!own) {
      if (!req.expenseUser.isReviewer) return res.status(STATUS.FORBIDDEN).json({ message: 'You can only open your own bills' });
      const onEntry = await Expense.exists({ 'bills.key': key });
      if (!onEntry) return res.status(404).json({ message: 'Bill not found' });
    }
    const url = await billStorage.presignGet({ key });
    return res.status(STATUS.SUCCESS).json({ url, expiresIn: billStorage.URL_EXPIRES_IN });
  } catch (error) {
    return serverError(res, 'getBillUrl', error);
  }
};
