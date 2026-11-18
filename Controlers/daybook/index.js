/**
 * Daybook V2: a pure manual ledger.
 * Contract: Routes/daybook/DAYBOOK_V2_CONTRACT.md
 *
 * - Inflow and outflow are typed in by Accounts (no merging of requests or booking advances).
 * - Balances are computed on read from one stored opening balance (never typed per day).
 * - All money math lives in utils/daybook.js. Never trust net/actual amounts from the client.
 */
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const STATUS = require('../../utils/statusCodes');
const MESSAGE = require('../../utils/messages');
const Event = require('../../Modals/ClientsBookings');
const Vendor = require('../../Modals/Vendor');
const DaybookInflow = require('../../Modals/Daybook/DaybookInflow');
const DaybookOutflow = require('../../Modals/Daybook/DaybookOutflow');
const DaybookOpeningBalance = require('../../Modals/Daybook/DaybookOpeningBalance');
const {
  MAX_BALANCE_DAYS,
  round2,
  isValidYmd,
  daysBetween,
  computeNetAmountReceived,
  computeActualAmountPaid,
  sourceOf,
  validateInflowInput,
  validateOutflowInput,
  validateOpeningBalanceInput,
  computeBalanceDays,
} = require('../../utils/daybook');

const FINANCE_ROLES = ['OWNER', 'ADMIN', 'CA', 'ACCOUNTS', 'APPROVER', 'DEPARTMENT'];
const QUERY_MAX_MS = 20000;

/** Returns the decoded token, or sends 401 and returns null. */
function requireFinanceRole(req, res) {
  const decodedToken = jwt.decode(req.get('Authorization'));
  if (!decodedToken || !decodedToken.role || !FINANCE_ROLES.includes(decodedToken.role)) {
    res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    return null;
  }
  return decodedToken;
}

function userIdOf(decodedToken, req) {
  return decodedToken?.uid || decodedToken?.id || req.userId || null;
}

function serverError(res, where, error) {
  console.error(`daybook.${where}:`, error);
  return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
    message: MESSAGE.internalServerError,
    error: error.message,
  });
}

async function getOpeningBalanceDoc() {
  return DaybookOpeningBalance.findOne({ singleton: 'default' }).lean().maxTimeMS(QUERY_MAX_MS);
}

/** Sends 400 and returns false when `date` is before the opening balance's asOfDate. */
async function assertOnOrAfterAsOfDate(date, field, res) {
  const opening = await getOpeningBalanceDoc();
  if (opening?.asOfDate && date < opening.asOfDate) {
    res.status(STATUS.BAD_REQUEST).json({
      message: `${field} cannot be before the Daybook start date (${opening.asOfDate})`,
      field,
    });
    return false;
  }
  return true;
}

const EVENT_REFERENCE_POPULATE = {
  path: 'eventReference',
  select: '_id clientName eventName',
  populate: { path: 'eventName', select: '_id name' },
};

function formatEventReference(ref) {
  if (!ref) return null;
  if (typeof ref === 'string' || ref instanceof mongoose.Types.ObjectId) return String(ref);
  return {
    _id: String(ref._id),
    clientName: ref.clientName ?? null,
    name: ref.eventName && typeof ref.eventName === 'object' ? ref.eventName.name ?? null : null,
  };
}

function mapInflowRow(r) {
  const amountReceived = Number(r.amountReceived) || 0;
  const gstAmount = Number(r.gstAmount) || 0;
  const tdsAmount = Number(r.tdsAmount) || 0;
  return {
    _id: String(r._id),
    // Legacy (pre-V2) rows used `name`; kept readable until the section 5 cleanup runs.
    clientName: r.clientName ?? r.name ?? '',
    eventDate: r.eventDate ?? null,
    eventReference: formatEventReference(r.eventReference),
    receivedDate: r.receivedDate,
    receivedIn: r.receivedIn,
    accountName: r.receivedIn === 'ACCOUNT' ? r.accountName ?? null : null,
    amountReceived,
    gstAmount,
    tdsAmount,
    netAmountReceived: computeNetAmountReceived({ amountReceived, gstAmount, tdsAmount }),
    note: r.note ?? '',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function mapOutflowRow(r) {
  const amountPaid = Number(r.amountPaid) || 0;
  const tdsAmount = Number(r.tdsAmount) || 0;
  const gstAmount = Number(r.gstAmount) || 0;
  return {
    _id: String(r._id),
    vendor: r.vendorId
      ? { _id: String(r.vendorId), name: r.vendorName ?? '', vendor_code: r.vendorCode ?? '' }
      : null,
    paidDate: r.paidDate,
    paidFrom: r.paidFrom,
    accountName: r.paidFrom === 'ACCOUNT' ? r.accountName ?? null : null,
    amountPaid,
    tdsAmount,
    gstAmount,
    actualAmountPaid: computeActualAmountPaid({ amountPaid, tdsAmount, gstAmount }),
    note: r.note ?? '',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function formatOpeningBalance(doc) {
  if (!doc) return { asOfDate: null, balances: [] };
  return {
    asOfDate: doc.asOfDate,
    balances: (doc.balances || []).map((b) => ({ source: b.source, amount: b.amount })),
  };
}

/** Sum of net inflow / actual outflow per (date, source) for the balance walk. */
async function sumBySourceAndDate({ asOfDate, endDate }) {
  const [inRows, outRows] = await Promise.all([
    DaybookInflow.aggregate([
      { $match: { receivedDate: { $gte: asOfDate, $lte: endDate } } },
      {
        $group: {
          _id: { date: '$receivedDate', mode: '$receivedIn', accountName: '$accountName' },
          amount: { $sum: { $ifNull: ['$netAmountReceived', '$amountReceived'] } },
        },
      },
    ]).option({ maxTimeMS: QUERY_MAX_MS }),
    DaybookOutflow.aggregate([
      { $match: { paidDate: { $gte: asOfDate, $lte: endDate } } },
      {
        $group: {
          _id: { date: '$paidDate', mode: '$paidFrom', accountName: '$accountName' },
          amount: { $sum: '$actualAmountPaid' },
        },
      },
    ]).option({ maxTimeMS: QUERY_MAX_MS }),
  ]);
  const toSums = (rows) =>
    rows.map((r) => ({
      date: r._id.date,
      source: sourceOf(r._id.mode, r._id.accountName),
      amount: r.amount,
    }));
  return { inflowSums: toSums(inRows), outflowSums: toSums(outRows) };
}

/**
 * GET /api/daybook?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=200
 */
exports.getDaybook = async (req, res) => {
  if (!requireFinanceRole(req, res)) return;

  const startDate = String(req.query.startDate || req.query.date || '').trim();
  const endDate = String(req.query.endDate || req.query.date || '').trim();

  if (!startDate || !endDate) {
    return res.status(STATUS.BAD_REQUEST).json({
      message: 'startDate and endDate are required',
      example: '/api/daybook?startDate=2026-11-01&endDate=2026-11-30',
    });
  }
  if (!isValidYmd(startDate) || !isValidYmd(endDate)) {
    return res.status(STATUS.BAD_REQUEST).json({ message: 'startDate and endDate must be valid YYYY-MM-DD dates' });
  }
  if (startDate > endDate) {
    return res.status(STATUS.BAD_REQUEST).json({ message: 'startDate must be <= endDate' });
  }
  if (daysBetween(startDate, endDate) > MAX_BALANCE_DAYS) {
    return res.status(STATUS.BAD_REQUEST).json({ message: `Date range cannot exceed ${MAX_BALANCE_DAYS} days` });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);

  try {
    const inflowMatch = { receivedDate: { $gte: startDate, $lte: endDate } };
    const outflowMatch = { paidDate: { $gte: startDate, $lte: endDate } };

    const [opening, inflowTotalsRows, outflowTotalsRows, inflowRows, outflowRows] = await Promise.all([
      getOpeningBalanceDoc(),
      DaybookInflow.aggregate([
        { $match: inflowMatch },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            gross: { $sum: '$amountReceived' },
            gst: { $sum: { $ifNull: ['$gstAmount', 0] } },
            tds: { $sum: { $ifNull: ['$tdsAmount', 0] } },
            net: { $sum: { $ifNull: ['$netAmountReceived', '$amountReceived'] } },
          },
        },
      ]).option({ maxTimeMS: QUERY_MAX_MS }),
      DaybookOutflow.aggregate([
        { $match: outflowMatch },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            amountPaid: { $sum: '$amountPaid' },
            tds: { $sum: { $ifNull: ['$tdsAmount', 0] } },
            gst: { $sum: { $ifNull: ['$gstAmount', 0] } },
            actual: { $sum: '$actualAmountPaid' },
          },
        },
      ]).option({ maxTimeMS: QUERY_MAX_MS }),
      DaybookInflow.find(inflowMatch)
        .sort({ receivedDate: -1, createdAt: -1 })
        .limit(limit)
        .populate(EVENT_REFERENCE_POPULATE)
        .lean()
        .maxTimeMS(QUERY_MAX_MS),
      DaybookOutflow.find(outflowMatch)
        .sort({ paidDate: -1, createdAt: -1 })
        .limit(limit)
        .lean()
        .maxTimeMS(QUERY_MAX_MS),
    ]);

    const it = inflowTotalsRows[0] || {};
    const ot = outflowTotalsRows[0] || {};
    const inflowNet = round2(it.net || 0);
    const outflowActual = round2(ot.actual || 0);
    const surplus = round2(inflowNet - outflowActual);

    let days = [];
    if (opening?.asOfDate && endDate >= opening.asOfDate) {
      if (daysBetween(opening.asOfDate, endDate) > MAX_BALANCE_DAYS) {
        return res.status(STATUS.BAD_REQUEST).json({
          message: `endDate is more than ${MAX_BALANCE_DAYS} days after the Daybook start date (${opening.asOfDate})`,
        });
      }
      const openingMap = {};
      (opening.balances || []).forEach((b) => { openingMap[b.source] = Number(b.amount) || 0; });
      const { inflowSums, outflowSums } = await sumBySourceAndDate({ asOfDate: opening.asOfDate, endDate });
      days = computeBalanceDays({
        asOfDate: opening.asOfDate,
        opening: openingMap,
        startDate,
        endDate,
        inflowSums,
        outflowSums,
      });
    }

    return res.status(STATUS.SUCCESS).json({
      inflow: {
        count: it.count || 0,
        totals: {
          gross: round2(it.gross || 0),
          gst: round2(it.gst || 0),
          tds: round2(it.tds || 0),
          net: inflowNet,
        },
        data: inflowRows.map(mapInflowRow),
      },
      outflow: {
        count: ot.count || 0,
        totals: {
          amountPaid: round2(ot.amountPaid || 0),
          tds: round2(ot.tds || 0),
          gst: round2(ot.gst || 0),
          actual: outflowActual,
        },
        data: outflowRows.map(mapOutflowRow),
      },
      surplusDeficit: { value: surplus, type: surplus >= 0 ? 'SURPLUS' : 'DEFICIT' },
      openingBalanceSet: !!opening?.asOfDate,
      balances: { days },
    });
  } catch (error) {
    return serverError(res, 'getDaybook', error);
  }
};

/** Validates eventReference. Returns { value } (ObjectId or null) or { error }. */
async function resolveEventReference(raw) {
  if (raw === undefined || raw === null || raw === '') return { value: null };
  const id = typeof raw === 'object' && raw._id ? String(raw._id) : String(raw).trim();
  if (!mongoose.Types.ObjectId.isValid(id)) return { error: 'eventReference must be a valid event id' };
  const exists = await Event.exists({ _id: id });
  if (!exists) return { error: 'eventReference event not found' };
  return { value: new mongoose.Types.ObjectId(id) };
}

/** Validates vendorId and returns the snapshot fields, or { error }. */
async function resolveVendor(raw) {
  const id = raw == null ? '' : String(raw).trim();
  if (!id) return { error: 'vendorId is required' };
  if (!mongoose.Types.ObjectId.isValid(id)) return { error: 'vendorId must be a valid vendor id' };
  const vendor = await Vendor.findById(id).select('_id name vendor_code').lean();
  if (!vendor) return { error: 'vendorId vendor not found' };
  return {
    value: { vendorId: vendor._id, vendorName: vendor.name || '', vendorCode: vendor.vendor_code || '' },
  };
}

async function loadInflowResponse(id) {
  const doc = await DaybookInflow.findById(id).populate(EVENT_REFERENCE_POPULATE).lean();
  return mapInflowRow(doc);
}

function badId(res, what) {
  return res.status(STATUS.BAD_REQUEST).json({ message: `Valid ${what} id is required` });
}

/** POST /api/daybook/inflows */
exports.createInflow = async (req, res) => {
  const decodedToken = requireFinanceRole(req, res);
  if (!decodedToken) return;
  try {
    const parsed = validateInflowInput(req.body);
    if (parsed.error) return res.status(STATUS.BAD_REQUEST).json({ message: parsed.error });

    const eventRef = await resolveEventReference(req.body.eventReference);
    if (eventRef.error) return res.status(STATUS.BAD_REQUEST).json({ message: eventRef.error, field: 'eventReference' });

    if (!(await assertOnOrAfterAsOfDate(parsed.value.receivedDate, 'receivedDate', res))) return;

    const created = await DaybookInflow.create({
      ...parsed.value,
      eventReference: eventRef.value,
      createdBy: userIdOf(decodedToken, req),
    });
    return res.status(STATUS.CREATED).json(await loadInflowResponse(created._id));
  } catch (error) {
    return serverError(res, 'createInflow', error);
  }
};

/** PUT /api/daybook/inflows/:id (full replace of the editable fields) */
exports.updateInflow = async (req, res) => {
  if (!requireFinanceRole(req, res)) return;
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return badId(res, 'inflow');

    const existing = await DaybookInflow.findById(id);
    if (!existing) return res.status(404).json({ message: 'Inflow not found' });

    const parsed = validateInflowInput(req.body);
    if (parsed.error) return res.status(STATUS.BAD_REQUEST).json({ message: parsed.error });

    const eventRef = await resolveEventReference(req.body.eventReference);
    if (eventRef.error) return res.status(STATUS.BAD_REQUEST).json({ message: eventRef.error, field: 'eventReference' });

    if (!(await assertOnOrAfterAsOfDate(parsed.value.receivedDate, 'receivedDate', res))) return;

    existing.set({ ...parsed.value, eventReference: eventRef.value });
    // Drop legacy (pre-V2) fields when an old row is edited into the new shape.
    existing.set('name', undefined, { strict: false });
    existing.set('receivedBy', undefined, { strict: false });
    existing.set('event_reference', undefined, { strict: false });
    await existing.save();

    return res.status(STATUS.SUCCESS).json(await loadInflowResponse(existing._id));
  } catch (error) {
    return serverError(res, 'updateInflow', error);
  }
};

/** DELETE /api/daybook/inflows/:id */
exports.deleteInflow = async (req, res) => {
  if (!requireFinanceRole(req, res)) return;
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return badId(res, 'inflow');
    const deleted = await DaybookInflow.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Inflow not found' });
    return res.status(STATUS.SUCCESS).json({ success: true, message: 'Inflow deleted successfully', id: String(id) });
  } catch (error) {
    return serverError(res, 'deleteInflow', error);
  }
};

/** POST /api/daybook/outflows */
exports.createOutflow = async (req, res) => {
  const decodedToken = requireFinanceRole(req, res);
  if (!decodedToken) return;
  try {
    const parsed = validateOutflowInput(req.body);
    if (parsed.error) return res.status(STATUS.BAD_REQUEST).json({ message: parsed.error });

    const vendor = await resolveVendor(req.body.vendorId);
    if (vendor.error) return res.status(STATUS.BAD_REQUEST).json({ message: vendor.error, field: 'vendorId' });

    if (!(await assertOnOrAfterAsOfDate(parsed.value.paidDate, 'paidDate', res))) return;

    const created = await DaybookOutflow.create({
      ...parsed.value,
      ...vendor.value,
      createdBy: userIdOf(decodedToken, req),
    });
    return res.status(STATUS.CREATED).json(mapOutflowRow(created.toObject()));
  } catch (error) {
    return serverError(res, 'createOutflow', error);
  }
};

/** PUT /api/daybook/outflows/:id (full replace; vendor snapshot refreshed) */
exports.updateOutflow = async (req, res) => {
  if (!requireFinanceRole(req, res)) return;
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return badId(res, 'outflow');

    const existing = await DaybookOutflow.findById(id);
    if (!existing) return res.status(404).json({ message: 'Outflow not found' });

    const parsed = validateOutflowInput(req.body);
    if (parsed.error) return res.status(STATUS.BAD_REQUEST).json({ message: parsed.error });

    const vendor = await resolveVendor(req.body.vendorId);
    if (vendor.error) return res.status(STATUS.BAD_REQUEST).json({ message: vendor.error, field: 'vendorId' });

    if (!(await assertOnOrAfterAsOfDate(parsed.value.paidDate, 'paidDate', res))) return;

    existing.set({ ...parsed.value, ...vendor.value });
    await existing.save();
    return res.status(STATUS.SUCCESS).json(mapOutflowRow(existing.toObject()));
  } catch (error) {
    return serverError(res, 'updateOutflow', error);
  }
};

/** DELETE /api/daybook/outflows/:id */
exports.deleteOutflow = async (req, res) => {
  if (!requireFinanceRole(req, res)) return;
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return badId(res, 'outflow');
    const deleted = await DaybookOutflow.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Outflow not found' });
    return res.status(STATUS.SUCCESS).json({ success: true, message: 'Outflow deleted successfully', id: String(id) });
  } catch (error) {
    return serverError(res, 'deleteOutflow', error);
  }
};

/** GET /api/daybook/opening-balance */
exports.getOpeningBalance = async (req, res) => {
  if (!requireFinanceRole(req, res)) return;
  try {
    return res.status(STATUS.SUCCESS).json(formatOpeningBalance(await getOpeningBalanceDoc()));
  } catch (error) {
    return serverError(res, 'getOpeningBalance', error);
  }
};

/** PUT /api/daybook/opening-balance (upsert of the single document) */
exports.putOpeningBalance = async (req, res) => {
  const decodedToken = requireFinanceRole(req, res);
  if (!decodedToken) return;
  try {
    const parsed = validateOpeningBalanceInput(req.body);
    if (parsed.error) return res.status(STATUS.BAD_REQUEST).json({ message: parsed.error });
    const { asOfDate, balances } = parsed.value;

    // Entries dated before asOfDate would silently drop out of the balances.
    const [inflowsBefore, outflowsBefore] = await Promise.all([
      DaybookInflow.countDocuments({ receivedDate: { $lt: asOfDate } }).maxTimeMS(QUERY_MAX_MS),
      DaybookOutflow.countDocuments({ paidDate: { $lt: asOfDate } }).maxTimeMS(QUERY_MAX_MS),
    ]);
    if (inflowsBefore > 0 || outflowsBefore > 0) {
      return res.status(409).json({
        message: `Cannot set asOfDate to ${asOfDate}: ${inflowsBefore} inflow(s) and ${outflowsBefore} outflow(s) are dated before it. Move or delete them first, or choose an earlier date.`,
        inflowsBefore,
        outflowsBefore,
      });
    }

    const saved = await DaybookOpeningBalance.findOneAndUpdate(
      { singleton: 'default' },
      { $set: { asOfDate, balances, updatedBy: userIdOf(decodedToken, req) } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();

    return res.status(STATUS.SUCCESS).json(formatOpeningBalance(saved));
  } catch (error) {
    return serverError(res, 'putOpeningBalance', error);
  }
};
