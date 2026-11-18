const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const STATUS = require('../../utils/statusCodes');
const MESSAGE = require('../../utils/messages');
const SpreadsheetWorkbook = require('../../Modals/SpreadsheetWorkbook');
const Event = require('../../Modals/ClientsBookings');
const { getDataCutoffDate, isYmdBeforeCutoff } = require('../../utils/dataCutoff');

/** Modules allowed to store workbooks. */
const ALLOWED_MODULES = [
  'client-leads',
  'budget-report',
  'daily-expenses',
  'daybook-inflow',
  'daybook-outflow',
];

/** Modules whose key is a business date YYYY-MM-DD. */
const DATE_KEY_MODULES = new Set([
  'daily-expenses',
  'daybook-inflow',
  'daybook-outflow',
]);

const DAYBOOK_KIND_BY_MODULE = {
  'daybook-inflow': 'inflow',
  'daybook-outflow': 'outflow',
};

/** Soft max size for workbookData JSON (~12 MB). */
const MAX_WORKBOOK_BYTES = 12 * 1024 * 1024;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const SPREADSHEET_ROLES = [
  'OWNER',
  'ADMIN',
  'MARKETING',
  'ACCOUNTS',
  'APPROVER',
  'DEPARTMENT',
  'CA',
];

function getAuthContext(req) {
  const token = req.get('Authorization');
  const decoded = token ? jwt.decode(token) : null;
  return {
    userId: req.userId || decoded?.uid || decoded?.id || null,
    role: decoded?.role || null,
  };
}

function requireSpreadsheetAccess(req, res, { optional = false } = {}) {
  const { userId, role } = getAuthContext(req);
  if (optional) {
    return { userId, role };
  }
  if (!userId || !role) {
    res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    return null;
  }
  if (!SPREADSHEET_ROLES.includes(role)) {
    res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    return null;
  }
  return { userId, role };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function estimateWorkbookBytes(workbookData) {
  try {
    return Buffer.byteLength(JSON.stringify(workbookData), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isDateKeyModule(moduleName) {
  return DATE_KEY_MODULES.has(moduleName);
}

function normalizeMeta(meta, key, moduleName, eventDoc = null) {
  const next = isPlainObject(meta) ? { ...meta } : {};
  if (moduleName === 'budget-report') {
    if (!next.eventId && key) next.eventId = String(key);
    if (eventDoc) {
      if (eventDoc.eventConfirmation) {
        next.eventConfirmation = eventDoc.eventConfirmation;
      }
      if (!next.clientName && eventDoc.clientName) {
        next.clientName = eventDoc.clientName;
      }
      const eventNameLabel =
        eventDoc.eventName && typeof eventDoc.eventName === 'object'
          ? eventDoc.eventName.name
          : null;
      if (!next.eventName && eventNameLabel) {
        next.eventName = eventNameLabel;
      }
    }
  }
  if (isDateKeyModule(moduleName)) {
    next.date = String(key);
  }
  if (DAYBOOK_KIND_BY_MODULE[moduleName]) {
    next.kind = DAYBOOK_KIND_BY_MODULE[moduleName];
  }
  return next;
}

function isValidDateKey(value) {
  return DATE_KEY_RE.test(String(value || '').trim());
}

/**
 * Validate YYYY-MM-DD and that it is a real calendar date.
 * Returns false and sends 400 if invalid.
 */
function assertBusinessDateKey(key, res) {
  const dateKey = String(key || '').trim();
  if (!isValidDateKey(dateKey)) {
    res.status(STATUS.BAD_REQUEST).json({
      message: 'key must be a business date in YYYY-MM-DD format',
      field: 'key',
      example: '2026-07-18',
    });
    return false;
  }

  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    res.status(STATUS.BAD_REQUEST).json({
      message: 'key is not a valid calendar date',
      field: 'key',
    });
    return false;
  }

  return true;
}

function defaultTitleForModule(moduleName, key) {
  if (moduleName === 'budget-report') return 'Budget Report';
  if (moduleName === 'client-leads') return 'Leads Tracker Excel';
  if (moduleName === 'daily-expenses') return `Daily Expenses — ${key}`;
  if (moduleName === 'daybook-inflow') return `Daybook Inflow — ${key}`;
  if (moduleName === 'daybook-outflow') return `Daybook Outflow — ${key}`;
  return '';
}

function deriveWorkbookSheetMeta(workbookData) {
  if (!isPlainObject(workbookData)) {
    return { sheetCount: 0, sheetNames: [] };
  }
  const order = Array.isArray(workbookData.sheetOrder)
    ? workbookData.sheetOrder
    : Object.keys(workbookData.sheets || {});
  const sheets = workbookData.sheets || {};
  const sheetNames = order
    .map((id) => (sheets[id] && sheets[id].name) || id)
    .filter(Boolean);
  return {
    sheetCount: order.length,
    sheetNames,
  };
}

/**
 * Prefer client title, then workbookData.name, then existing, then module default.
 * Never overwrite a non-empty client title with a hardcoded string.
 */
function resolveWorkbookTitle({
  title,
  workbookData,
  moduleName,
  key,
  existingTitle,
}) {
  if (title != null && String(title).trim() !== '') {
    return String(title).trim();
  }
  if (
    isPlainObject(workbookData) &&
    typeof workbookData.name === 'string' &&
    workbookData.name.trim() !== ''
  ) {
    return workbookData.name.trim();
  }
  if (existingTitle != null && String(existingTitle).trim() !== '') {
    return String(existingTitle).trim();
  }
  return defaultTitleForModule(moduleName, key);
}

/**
 * Keep client meta (sheetNames/sheetCount/…) and fill gaps from the opaque workbook.
 * Does not rewrite sheets[*].name inside workbookData.
 */
function finalizeMeta(meta, key, moduleName, workbookData, eventDoc = null) {
  const next = normalizeMeta(meta, key, moduleName, eventDoc);
  const derived = deriveWorkbookSheetMeta(workbookData);
  if (!Array.isArray(next.sheetNames) || next.sheetNames.length === 0) {
    next.sheetNames = derived.sheetNames;
  }
  if (next.sheetCount == null || next.sheetCount === '') {
    next.sheetCount = derived.sheetCount;
  }
  return next;
}

function emptyMetaForModule(moduleName, key) {
  if (!isDateKeyModule(moduleName)) return {};
  const meta = { date: key };
  if (DAYBOOK_KIND_BY_MODULE[moduleName]) {
    meta.kind = DAYBOOK_KIND_BY_MODULE[moduleName];
  }
  return meta;
}

function formatUpdatedBy(updatedBy) {
  if (!updatedBy) return null;
  return {
    _id: String(updatedBy._id || updatedBy),
    id: String(updatedBy._id || updatedBy),
    first_name: updatedBy.first_name,
    last_name: updatedBy.last_name,
  };
}

function formatWorkbookResponse(doc, { includeWorkbookData = true } = {}) {
  if (!doc) return null;
  const meta = doc.meta && typeof doc.meta === 'object' ? doc.meta : {};
  const payload = {
    _id: String(doc._id),
    id: String(doc._id),
    module: doc.module,
    key: doc.key,
    title: doc.title || '',
    meta,
    // Convenience for list UI (also available under meta.sheetNames)
    sheetNames: Array.isArray(meta.sheetNames) ? meta.sheetNames : [],
    sheetCount:
      meta.sheetCount != null
        ? meta.sheetCount
        : Array.isArray(meta.sheetNames)
          ? meta.sheetNames.length
          : 0,
    version: doc.version,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdBy: doc.createdBy || null,
    updatedBy: formatUpdatedBy(doc.updatedBy),
  };
  if (includeWorkbookData) {
    payload.workbookData = doc.workbookData;
  }
  return payload;
}

/** Budget report Excel is allowed for Confirmed Event and InProgress only. */
const BUDGET_REPORT_ELIGIBLE_CONFIRMATIONS = new Set([
  'Confirmed Event',
  'InProgress',
]);

/**
 * Budget-report keys must be Confirmed Event or InProgress event ids.
 * Returns the event lean doc on success, or false after sending an error response.
 */
async function assertBudgetReportEventKey(key, res) {
  if (!mongoose.Types.ObjectId.isValid(key)) {
    res.status(STATUS.BAD_REQUEST).json({
      message: 'key must be a valid event _id for module budget-report',
      field: 'key',
    });
    return false;
  }

  let event = await Event.findById(key)
    .select('_id eventConfirmation clientName eventName')
    .populate('eventName', 'id name')
    .lean();
  if (!event) {
    const raw = await Event.collection.findOne({ _id: String(key) });
    if (raw) {
      event = await Event.hydrate(raw)
        .populate('eventName', 'id name')
        .then((doc) => doc.toObject());
    }
  }

  if (!event) {
    res.status(STATUS.NOT_FOUND).json({
      message: 'Event not found for budget-report key',
      field: 'key',
    });
    return false;
  }

  if (!BUDGET_REPORT_ELIGIBLE_CONFIRMATIONS.has(event.eventConfirmation)) {
    res.status(STATUS.BAD_REQUEST).json({
      message:
        'Budget report Excel is only allowed for Confirmed Event or InProgress bookings.',
      field: 'key',
      eventConfirmation: event.eventConfirmation || null,
    });
    return false;
  }

  return event;
}

/**
 * GET /spreadsheet-workbooks?module=...&list=1
 * Optional filters for date-keyed modules: date | from | to (YYYY-MM-DD)
 * Metadata-only list (no workbookData).
 */
async function listWorkbooks(req, res, moduleName) {
  const query = { module: moduleName };

  let date = String(req.query.date || '').trim();
  let from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();

  const cutoffYmd = isDateKeyModule(moduleName)
    ? await getDataCutoffDate()
    : null;

  if (cutoffYmd) {
    if (date && isYmdBeforeCutoff(date, cutoffYmd)) {
      return res.status(STATUS.SUCCESS).json({
        data: [],
        workbooks: [],
        items: [],
        count: 0,
      });
    }
    if (!date) {
      if (!from || isYmdBeforeCutoff(from, cutoffYmd)) from = cutoffYmd;
    }
  }

  if (date) {
    if (!isValidDateKey(date)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'date must be YYYY-MM-DD',
        field: 'date',
      });
    }
    query.$or = [{ key: date }, { 'meta.date': date }];
  } else if (from || to) {
    if (from && !isValidDateKey(from)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'from must be YYYY-MM-DD',
        field: 'from',
      });
    }
    if (to && !isValidDateKey(to)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'to must be YYYY-MM-DD',
        field: 'to',
      });
    }
    if (from && to && from > to) {
      return res.status(STATUS.SUCCESS).json({
        data: [],
        workbooks: [],
        items: [],
        count: 0,
      });
    }

    const keyRange = {};
    if (from) keyRange.$gte = from;
    if (to) keyRange.$lte = to;
    query.key = keyRange;
  }

  const sort = isDateKeyModule(moduleName) ? { key: -1 } : { updatedAt: -1 };

  const docs = await SpreadsheetWorkbook.find(query)
    .select('-workbookData')
    .populate('updatedBy', 'first_name last_name')
    .populate('createdBy', 'first_name last_name')
    .sort(sort)
    .lean();

  const data = (docs || []).map((doc) =>
    formatWorkbookResponse(doc, { includeWorkbookData: false })
  );

  return res.status(STATUS.SUCCESS).json({
    data,
    workbooks: data,
    items: data,
    count: data.length,
  });
}

/**
 * GET /spreadsheet-workbooks?module=...&key=...
 * GET /spreadsheet-workbooks?module=...&list=1
 */
exports.getWorkbook = async (req, res) => {
  try {
    const moduleName = String(req.query.module || '').trim();
    const auth = requireSpreadsheetAccess(req, res, {
      optional: moduleName === 'client-leads',
    });
    if (!auth) return;
    const listMode =
      req.query.list === '1' ||
      req.query.list === 'true' ||
      String(req.query.list || '').toLowerCase() === 'yes';

    if (!moduleName) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'module query param is required',
        field: 'module',
      });
    }

    if (!ALLOWED_MODULES.includes(moduleName)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: `Unsupported module. Allowed: ${ALLOWED_MODULES.join(', ')}`,
        field: 'module',
      });
    }

    if (listMode) {
      return listWorkbooks(req, res, moduleName);
    }

    const key =
      moduleName === 'client-leads'
        ? String(req.query.key || 'default').trim() || 'default'
        : String(req.query.key || '').trim();

    if (!key) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'key query param is required (or pass list=1 for metadata list)',
        field: 'key',
      });
    }

    if (isDateKeyModule(moduleName)) {
      if (!assertBusinessDateKey(key, res)) return;
      const cutoffYmd = await getDataCutoffDate();
      if (cutoffYmd && isYmdBeforeCutoff(key, cutoffYmd)) {
        return res.status(STATUS.SUCCESS).json({
          module: moduleName,
          key,
          title: '',
          workbookData: null,
          meta: emptyMetaForModule(moduleName, key),
          version: 0,
          updatedAt: null,
          updatedBy: null,
        });
      }
    }

    const doc = await SpreadsheetWorkbook.findOne({ module: moduleName, key })
      .populate('updatedBy', 'first_name last_name')
      .populate('createdBy', 'first_name last_name')
      .lean();

    if (!doc) {
      return res.status(STATUS.SUCCESS).json({
        module: moduleName,
        key,
        title: '',
        workbookData: null,
        meta: emptyMetaForModule(moduleName, key),
        version: 0,
        updatedAt: null,
        updatedBy: null,
      });
    }

    return res.status(STATUS.SUCCESS).json(formatWorkbookResponse(doc));
  } catch (error) {
    console.error('getWorkbook error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      message: MESSAGE.internalServerError,
      error: error.message,
    });
  }
};

/**
 * PUT /spreadsheet-workbooks
 * Create or upsert workbook with optimistic concurrency via version.
 * Always replaces workbookData wholesale (multi-sheet safe).
 */
exports.upsertWorkbook = async (req, res) => {
  try {
    const {
      module: moduleNameRaw,
      key: keyRaw,
      title,
      workbookData,
      version,
      meta,
    } = req.body || {};

    const moduleName = String(moduleNameRaw || '').trim();
    const auth = requireSpreadsheetAccess(req, res, {
      optional: moduleName === 'client-leads',
    });
    if (!auth) return;
    const key =
      moduleName === 'client-leads'
        ? String(keyRaw || 'default').trim() || 'default'
        : String(keyRaw || '').trim();

    if (!moduleName) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'module is required',
        field: 'module',
      });
    }

    if (!ALLOWED_MODULES.includes(moduleName)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: `Unsupported module. Allowed: ${ALLOWED_MODULES.join(', ')}`,
        field: 'module',
      });
    }

    if (!key) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'key is required',
        field: 'key',
      });
    }

    let budgetEvent = null;
    if (moduleName === 'budget-report') {
      budgetEvent = await assertBudgetReportEventKey(key, res);
      if (!budgetEvent) return;
    }

    if (isDateKeyModule(moduleName)) {
      if (!assertBusinessDateKey(key, res)) return;
    }

    if (!isPlainObject(workbookData)) {
      return res.status(STATUS.VALIDATION_FAILED).json({
        message: 'workbookData is required and must be a plain object',
        field: 'workbookData',
      });
    }

    const bytes = estimateWorkbookBytes(workbookData);
    if (bytes > MAX_WORKBOOK_BYTES) {
      return res.status(413).json({
        message: `workbookData exceeds max size of ${MAX_WORKBOOK_BYTES} bytes`,
        maxBytes: MAX_WORKBOOK_BYTES,
        actualBytes: bytes,
      });
    }

    const existing = await SpreadsheetWorkbook.findOne({ module: moduleName, key });

    if (!existing) {
      const created = await SpreadsheetWorkbook.create({
        module: moduleName,
        key,
        title: resolveWorkbookTitle({
          title,
          workbookData,
          moduleName,
          key,
        }),
        // Wholesale store — do not rewrite sheets[*].name or other nested keys.
        workbookData,
        meta: finalizeMeta(meta, key, moduleName, workbookData, budgetEvent),
        version: 1,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      });

      const populated = await SpreadsheetWorkbook.findById(created._id)
        .populate('updatedBy', 'first_name last_name')
        .populate('createdBy', 'first_name last_name')
        .lean();

      return res.status(STATUS.SUCCESS).json(formatWorkbookResponse(populated));
    }

    const clientVersion = version == null ? null : Number(version);
    if (clientVersion == null || Number.isNaN(clientVersion)) {
      return res.status(STATUS.VALIDATION_FAILED).json({
        message: 'version is required when updating an existing workbook',
        field: 'version',
        currentVersion: existing.version,
      });
    }

    if (clientVersion !== existing.version) {
      return res.status(409).json({
        message: 'Workbook was updated by another user. Please reload.',
        currentVersion: existing.version,
      });
    }

    const metaSource = meta !== undefined ? meta : existing.meta;
    const normalizedMeta = finalizeMeta(
      metaSource,
      key,
      moduleName,
      workbookData,
      budgetEvent
    );

    // Wholesale replace — never deep-merge sheets/cellData or strip sheet names.
    existing.set('workbookData', workbookData);
    existing.markModified('workbookData');
    existing.set('meta', normalizedMeta);
    existing.markModified('meta');
    existing.version = existing.version + 1;
    existing.updatedBy = auth.userId;
    existing.title = resolveWorkbookTitle({
      title: title !== undefined ? title : existing.title,
      workbookData,
      moduleName,
      key,
      existingTitle: existing.title,
    });

    await existing.save();

    const populated = await SpreadsheetWorkbook.findById(existing._id)
      .populate('updatedBy', 'first_name last_name')
      .populate('createdBy', 'first_name last_name')
      .lean();

    return res.status(STATUS.SUCCESS).json(formatWorkbookResponse(populated));
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        message: 'Workbook was updated by another user. Please reload.',
      });
    }
    console.error('upsertWorkbook error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      message: MESSAGE.internalServerError,
      error: error.message,
    });
  }
};

/**
 * DELETE /spreadsheet-workbooks?module=...&key=...
 */
exports.deleteWorkbook = async (req, res) => {
  try {
    const moduleName = String(req.query.module || '').trim();
    const auth = requireSpreadsheetAccess(req, res, {
      optional: moduleName === 'client-leads',
    });
    if (!auth) return;
    const key =
      moduleName === 'client-leads'
        ? String(req.query.key || 'default').trim() || 'default'
        : String(req.query.key || '').trim();

    if (!moduleName) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'module query param is required',
        field: 'module',
      });
    }

    if (!ALLOWED_MODULES.includes(moduleName)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: `Unsupported module. Allowed: ${ALLOWED_MODULES.join(', ')}`,
        field: 'module',
      });
    }

    if (!key) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'key query param is required',
        field: 'key',
      });
    }

    if (isDateKeyModule(moduleName)) {
      if (!assertBusinessDateKey(key, res)) return;
    }

    const deleted = await SpreadsheetWorkbook.findOneAndDelete({
      module: moduleName,
      key,
    });

    if (!deleted) {
      return res.status(STATUS.NOT_FOUND).json({
        message: 'Workbook not found',
      });
    }

    return res.status(STATUS.SUCCESS).json({
      message: 'Workbook deleted successfully',
      module: moduleName,
      key,
    });
  } catch (error) {
    console.error('deleteWorkbook error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      message: MESSAGE.internalServerError,
      error: error.message,
    });
  }
};

/**
 * Convenience: GET /client-leads/excel
 */
exports.getClientLeadsExcel = async (req, res) => {
  req.query.module = 'client-leads';
  req.query.key = 'default';
  return exports.getWorkbook(req, res);
};

/**
 * Convenience: PUT /client-leads/excel
 */
exports.putClientLeadsExcel = async (req, res) => {
  req.body = {
    ...(req.body || {}),
    module: 'client-leads',
    key: 'default',
    title:
      req.body?.title != null && String(req.body.title).trim() !== ''
        ? req.body.title
        : 'Leads Tracker Excel',
  };
  return exports.upsertWorkbook(req, res);
};

function deepCopyJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * POST /spreadsheet-workbooks/clone
 * Deep-copy full multi-sheet workbookData onto a new (module, targetKey).
 */
exports.cloneWorkbook = async (req, res) => {
  const auth = requireSpreadsheetAccess(req, res);
  if (!auth) return;

  try {
    const {
      module: moduleNameRaw,
      sourceKey: sourceKeyRaw,
      targetKey: targetKeyRaw,
      title,
      meta,
    } = req.body || {};

    const moduleName = String(moduleNameRaw || '').trim();
    const sourceKey = String(sourceKeyRaw || '').trim();
    const targetKey = String(targetKeyRaw || '').trim();

    if (!moduleName) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'module is required',
        field: 'module',
      });
    }

    if (!ALLOWED_MODULES.includes(moduleName)) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: `Unsupported module. Allowed: ${ALLOWED_MODULES.join(', ')}`,
        field: 'module',
      });
    }

    if (moduleName !== 'budget-report') {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'clone currently supports module budget-report only',
        field: 'module',
      });
    }

    if (!sourceKey || !targetKey) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'sourceKey and targetKey are required',
        field: !sourceKey ? 'sourceKey' : 'targetKey',
      });
    }

    if (sourceKey === targetKey) {
      return res.status(STATUS.BAD_REQUEST).json({
        message: 'sourceKey and targetKey must be different',
        field: 'targetKey',
      });
    }

    const sourceEvent = await assertBudgetReportEventKey(sourceKey, res);
    if (!sourceEvent) return;

    const targetEvent = await assertBudgetReportEventKey(targetKey, res);
    if (!targetEvent) return;

    const source = await SpreadsheetWorkbook.findOne({
      module: moduleName,
      key: sourceKey,
    }).lean();

    if (!source) {
      return res.status(STATUS.NOT_FOUND).json({
        message: 'Source budget report not found',
      });
    }

    const existingTarget = await SpreadsheetWorkbook.findOne({
      module: moduleName,
      key: targetKey,
    })
      .select('_id version')
      .lean();

    if (existingTarget) {
      return res.status(409).json({
        message: 'Target event already has a budget report',
        currentVersion: existingTarget.version,
      });
    }

    const workbookData = deepCopyJson(source.workbookData);
    const bytes = estimateWorkbookBytes(workbookData);
    if (bytes > MAX_WORKBOOK_BYTES) {
      return res.status(413).json({
        message: `cloned workbookData exceeds max size of ${MAX_WORKBOOK_BYTES} bytes`,
        maxBytes: MAX_WORKBOOK_BYTES,
        actualBytes: bytes,
      });
    }

    const sheetMeta = deriveWorkbookSheetMeta(workbookData);
    const mergedMeta = normalizeMeta(
      {
        ...(isPlainObject(source.meta) ? source.meta : {}),
        ...(isPlainObject(meta) ? meta : {}),
        ...sheetMeta,
        eventId: targetKey,
      },
      targetKey,
      moduleName,
      targetEvent
    );

    const defaultTitleParts = [
      mergedMeta.eventName,
      mergedMeta.clientName,
    ].filter(Boolean);
    const defaultTitle = defaultTitleParts.length
      ? `Budget Report — ${defaultTitleParts.join(' - ')}`
      : source.title || 'Budget Report';

    const created = await SpreadsheetWorkbook.create({
      module: moduleName,
      key: targetKey,
      title:
        title != null && String(title).trim() !== ''
          ? String(title).trim()
          : defaultTitle,
      workbookData,
      meta: mergedMeta,
      version: 1,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    });

    const populated = await SpreadsheetWorkbook.findById(created._id)
      .select('-workbookData')
      .populate('updatedBy', 'first_name last_name')
      .populate('createdBy', 'first_name last_name')
      .lean();

    return res
      .status(201)
      .json(formatWorkbookResponse(populated, { includeWorkbookData: false }));
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        message: 'Target event already has a budget report',
      });
    }
    console.error('cloneWorkbook error:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      message: MESSAGE.internalServerError,
      error: error.message,
    });
  }
};
