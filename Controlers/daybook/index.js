const jwt = require('jsonwebtoken');
const STATUS = require("../../utils/statusCodes");
const MESSAGE = require("../../utils/messages");
const Request = require("../../Modals/Request");
const Event = require("../../Modals/ClientsBookings");
const EventName = require("../../Modals/events");
const EventType = require("../../Modals/eventTypes");
const mongoose = require('mongoose');
const DaybookInflow = require("../../Modals/Daybook/DaybookInflow");
const DaybookAccountsOpenCloseBalance = require("../../Modals/Daybook/DaybookAccountsOpenCloseBalance");

const EVENT_NAME_COLL = EventName.collection.name;
const EVENT_TYPE_COLL = EventType.collection.name;

/**
 * Inflow rows: money received (receivedAmount > 0) and tied to the selected UTC day by:
 * - receivedDate in range, OR
 * - receivedDate missing/null and (advanceDate in range OR advance.updatedAt in range)
 */
function buildInflowAdvanceMatch(start, end) {
  return {
    "eventTypes.advances.receivedAmount": { $gt: 0 },
    $or: [
      {
        "eventTypes.advances.receivedDate": { $gte: start, $lte: end },
      },
      {
        $and: [
          {
            $or: [
              { "eventTypes.advances.receivedDate": null },
              { "eventTypes.advances.receivedDate": { $exists: false } },
            ],
          },
          {
            $or: [
              {
                "eventTypes.advances.advanceDate": { $gte: start, $lte: end },
              },
              {
                "eventTypes.advances.updatedAt": { $gte: start, $lte: end },
              },
            ],
          },
        ],
      },
    ],
  };
}

function mapInflowRow(doc) {
  const et = doc.eventTypes || {};
  const adv = et.advances || {};
  const en = Array.isArray(doc._eventName) ? doc._eventName[0] : doc._eventName;
  const subEt = Array.isArray(doc._eventType) ? doc._eventType[0] : doc._eventType;

  return {
    eventId: doc._id,
    client: {
      clientName: doc.clientName ?? null,
      contactNumber: doc.contactNumber ?? null,
      altContactNumber: doc.altContactNumber ?? null,
      altContactName: doc.altContactName ?? null,
      brideName: doc.brideName ?? null,
      groomName: doc.groomName ?? null,
    },
    event: {
      eventConfirmation: doc.eventConfirmation ?? null,
      note: doc.note ?? null,
      eventName: en
        ? { _id: en._id, name: en.name }
        : null,
      eventType: subEt
        ? { _id: subEt._id, name: subEt.name }
        : null,
      eventTypeWindow: {
        startDate: et.startDate ?? null,
        endDate: et.endDate ?? null,
      },
      agreedAmount: et.agreedAmount ?? null,
      totalPayable: et.totalPayable ?? null,
    },
    advance: {
      advanceNumber: adv.advanceNumber ?? null,
      expectedAmount: adv.expectedAmount ?? null,
      advanceDate: adv.advanceDate ?? null,
      status: adv.status ?? null,
      receivedAmount: adv.receivedAmount ?? 0,
      receivedDate: adv.receivedDate ?? null,
      remarks: adv.remarks ?? "",
      modeOfPayment: adv.modeOfPayment ?? null,
      givenBy: adv.givenBy ?? null,
      collectedBy: adv.collectedBy ?? null,
    },
  };
}

function getUtcDayRange(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  return { start, end };
}

exports.getDaybook = async (req, res) => {
  const token = req.get('Authorization');
  const decodedToken = jwt.decode(token);

  if (!decodedToken || !decodedToken.role) {
    return res.status(STATUS.UNAUTHORISED).json({
      message: MESSAGE.unauthorized,
    });
  }

  // Finance/management roles can view daybook
  const allowedRoles = ['OWNER', 'ADMIN', 'CA', 'ACCOUNTS', 'APPROVER', 'DEPARTMENT'];
  if (!allowedRoles.includes(decodedToken.role)) {
    return res.status(STATUS.UNAUTHORISED).json({
      message: MESSAGE.unauthorized,
    });
  }

  const { startDate, endDate, date } = req.query;
  const start = (startDate || date || '').toString().trim();
  const end = (endDate || date || '').toString().trim();

  const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!start || !end) {
    return res.status(STATUS.BAD_REQUEST).json({
      message: 'startDate and endDate are required',
      example: '/api/daybook?startDate=2026-04-16&endDate=2026-04-20',
    });
  }
  if (!YMD_RE.test(start) || !YMD_RE.test(end)) {
    return res.status(STATUS.BAD_REQUEST).json({
      message: 'Invalid date format',
      example: 'YYYY-MM-DD',
    });
  }

  const startDateObj = new Date(`${start}T00:00:00.000Z`);
  const endDateObj = new Date(`${end}T23:59:59.999Z`);
  if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime())) {
    return res.status(STATUS.BAD_REQUEST).json({ message: 'Invalid startDate/endDate' });
  }
  if (startDateObj > endDateObj) {
    return res.status(STATUS.BAD_REQUEST).json({ message: 'startDate must be <= endDate' });
  }

  const dataLimit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);

  try {
    const inflowQuery = {
      receivedDate: { $gte: start, $lte: end },
    };

    const outflowQuery = {
      is_archived: { $ne: true },
      amount_paid: { $gt: 0 },
      updatedAt: { $gte: startDateObj, $lte: endDateObj },
    };

    const [inflowTotals, outflowTotals, inflowRows, outflowRows, balances] = await Promise.all([
      DaybookInflow.aggregate([
        { $match: inflowQuery },
        {
          $group: {
            _id: null,
            total: { $sum: '$amountReceived' },
            count: { $sum: 1 },
          },
        },
      ]).option({ maxTimeMS: 20000 }),

      Request.aggregate([
        { $match: outflowQuery },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount_paid' },
            count: { $sum: 1 },
          },
        },
      ]).option({ maxTimeMS: 20000 }),

      DaybookInflow.find(inflowQuery)
        .sort({ receivedDate: -1, createdAt: -1 })
        .limit(dataLimit)
        .lean()
        .exec(),

      Request.find(outflowQuery)
        .sort({ updatedAt: -1 })
        .limit(dataLimit)
        .select('_id purpose amount_paid amount_paid_to entity_account status required_date updatedAt createdAt vendor event_reference')
        .populate('vendor', 'id name vendor_code')
        .populate('event_reference', 'id clientName')
        .lean()
        .exec(),

      DaybookAccountsOpenCloseBalance.find({
        balanceDate: { $gte: start, $lte: end },
      })
        .sort({ balanceDate: 1 })
        .lean()
        .exec(),
    ]);

    const inflowTotalsRow = inflowTotals?.[0] || {};
    const outflowTotalsRow = outflowTotals?.[0] || {};

    const inflowTotal = inflowTotalsRow.total || 0;
    const inflowCount = inflowTotalsRow.count || 0;
    const outflowTotal = outflowTotalsRow.total || 0;
    const outflowCount = outflowTotalsRow.count || 0;
    const profitOrLoss = inflowTotal - outflowTotal;

    return res.status(STATUS.SUCCESS).json({
      inflow: {
        count: inflowCount,
        total: inflowTotal,
        data: inflowRows.map((r) => ({
          _id: String(r._id),
          name: r.name,
          receivedDate: r.receivedDate,
          receivedIn: r.receivedIn,
          accountName: r.receivedIn === 'ACCOUNT' ? r.accountName : null,
          amountReceived: r.amountReceived,
          receivedBy: r.receivedBy,
          eventReference: r.event_reference ? String(r.event_reference) : null,
          note: r.note ?? '',
        })),
      },
      outflow: {
        count: outflowCount,
        total: outflowTotal,
        data: outflowRows.map((item) => ({
          _id: String(item._id),
          requestId: item._id,
          purpose: item.purpose,
          amountPaid: item.amount_paid || 0,
          amountPaidTo: item.amount_paid_to || '',
          entityAccount: item.entity_account || '',
          status: item.status,
          requiredDate: item.required_date || null,
          paidAt: item.updatedAt || item.createdAt,
          vendor: item.vendor || null,
          eventReference: item.event_reference || null,
        })),
      },
      profitAndLoss: {
        value: profitOrLoss,
        type: profitOrLoss >= 0 ? 'PROFIT' : 'LOSS',
      },
      accounts: {
        openCloseBalances: (balances || []).map((b) => ({
          _id: String(b._id),
          balanceDate: b.balanceDate,
          cashOpeningBalance: b.cashOpeningBalance,
          cashClosingBalance: b.cashClosingBalance,
          accountOpeningBalance: b.accountOpeningBalance,
          accountClosingBalance: b.accountClosingBalance,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching daybook:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      message: MESSAGE.internalServerError,
      error: error.message,
    });
  }
};

function validateYMD(dateStr) {
  const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof dateStr !== 'string') return false;
  return YMD_RE.test(dateStr.trim());
}

function requireFinanceRole(req, res) {
  const token = req.get('Authorization');
  const decodedToken = jwt.decode(token);
  const allowedRoles = ['OWNER', 'ADMIN', 'CA', 'ACCOUNTS', 'APPROVER', 'DEPARTMENT'];
  if (!decodedToken || !decodedToken.role || !allowedRoles.includes(decodedToken.role)) {
    res.status(STATUS.UNAUTHORISED).json({ message: MESSAGE.unauthorized });
    return null;
  }
  return decodedToken;
}

function validateAmountReceived(n) {
  const x = typeof n === 'string' ? Number(n) : n;
  return Number.isFinite(x) && x >= 0;
}

exports.createInflow = async (req, res) => {
  try {
    const decodedToken = requireFinanceRole(req, res);
    if (!decodedToken) return;

    const {
      name,
      receivedDate,
      receivedIn,
      accountName,
      amountReceived,
      receivedBy,
      eventReference,
      event_reference,
      note,
    } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'name is required' });
    }
    if (!receivedDate || !validateYMD(receivedDate)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'receivedDate must be YYYY-MM-DD' });
    }

    const receivedInNorm = String(receivedIn || '').trim().toUpperCase();
    if (!['CASH', 'ACCOUNT'].includes(receivedInNorm)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'receivedIn must be CASH or ACCOUNT' });
    }

    const allowedAccounts = ['HDFC', 'ICIC', 'DHRUVA', 'MONICA'];
    let accountNameFinal = null;
    if (receivedInNorm === 'ACCOUNT') {
      if (!accountName || typeof accountName !== 'string') {
        return res.status(STATUS.BAD_REQUEST).json({ message: 'accountName is required for ACCOUNT inflows' });
      }
      const acc = accountName.trim().toUpperCase();
      if (!allowedAccounts.includes(acc)) {
        return res.status(STATUS.BAD_REQUEST).json({ message: 'accountName must be one of HDFC|ICIC|DHRUVA|MONICA' });
      }
      accountNameFinal = acc;
    }

    if (!validateAmountReceived(amountReceived)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'amountReceived must be a number >= 0' });
    }
    if (!receivedBy || typeof receivedBy !== 'string' || !receivedBy.trim()) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'receivedBy is required' });
    }

    const eventRefRaw = (eventReference ?? event_reference) ?? null;
    let event_reference_final = null;
    if (eventRefRaw !== null && eventRefRaw !== undefined && String(eventRefRaw).trim() !== '') {
      if (!mongoose.Types.ObjectId.isValid(eventRefRaw)) {
        return res.status(STATUS.BAD_REQUEST).json({ message: 'eventReference must be a valid event id' });
      }
      event_reference_final = new mongoose.Types.ObjectId(String(eventRefRaw).trim());
    }

    let noteFinal = '';
    if (note !== undefined) {
      if (note === null) noteFinal = '';
      else if (typeof note !== 'string') {
        return res.status(STATUS.BAD_REQUEST).json({ message: 'note must be a string' });
      } else noteFinal = note.trim();
    }

    const inflow = await DaybookInflow.create({
      name: name.trim(),
      receivedDate: receivedDate.trim(),
      receivedIn: receivedInNorm,
      accountName: accountNameFinal,
      amountReceived: Number(amountReceived),
      receivedBy: receivedBy.trim(),
      event_reference: event_reference_final,
      note: noteFinal,
      createdBy: decodedToken.uid || decodedToken.id || null,
    });

    const inflowJson = inflow.toJSON ? inflow.toJSON() : inflow;
    return res.status(201).json({
      success: true,
      inflow: {
        _id: String(inflowJson._id || inflowJson.id || inflowJson._id),
        name: inflowJson.name,
        receivedDate: inflowJson.receivedDate,
        receivedIn: inflowJson.receivedIn,
        accountName: inflowJson.receivedIn === 'ACCOUNT' ? inflowJson.accountName : null,
        amountReceived: inflowJson.amountReceived,
        receivedBy: inflowJson.receivedBy,
        eventReference: inflowJson.event_reference ? String(inflowJson.event_reference) : null,
        note: inflowJson.note ?? '',
      },
    });
  } catch (error) {
    console.error('createInflow:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      message: MESSAGE.internalServerError,
      error: error.message,
    });
  }
};

exports.updateInflow = async (req, res) => {
  try {
    const decodedToken = requireFinanceRole(req, res);
    if (!decodedToken) return;

    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Valid inflow id is required' });
    }

    const existing = await DaybookInflow.findById(id);
    if (!existing) {
      return res.status(STATUS.NOT_FOUND).json({ message: 'Inflow not found' });
    }

    // Reuse create validation by calling createInflow logic inline
    const {
      name,
      receivedDate,
      receivedIn,
      accountName,
      amountReceived,
      receivedBy,
      eventReference,
      event_reference,
      note,
    } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'name is required' });
    }
    if (!receivedDate || !validateYMD(receivedDate)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'receivedDate must be YYYY-MM-DD' });
    }

    const receivedInNorm = String(receivedIn || '').trim().toUpperCase();
    if (!['CASH', 'ACCOUNT'].includes(receivedInNorm)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'receivedIn must be CASH or ACCOUNT' });
    }

    const allowedAccounts = ['HDFC', 'ICIC', 'DHRUVA', 'MONICA'];
    let accountNameFinal = null;
    if (receivedInNorm === 'ACCOUNT') {
      if (!accountName || typeof accountName !== 'string') {
        return res.status(STATUS.BAD_REQUEST).json({ message: 'accountName is required for ACCOUNT inflows' });
      }
      const acc = accountName.trim().toUpperCase();
      if (!allowedAccounts.includes(acc)) {
        return res.status(STATUS.BAD_REQUEST).json({ message: 'accountName must be one of HDFC|ICIC|DHRUVA|MONICA' });
      }
      accountNameFinal = acc;
    }

    if (!validateAmountReceived(amountReceived)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'amountReceived must be a number >= 0' });
    }
    if (!receivedBy || typeof receivedBy !== 'string' || !receivedBy.trim()) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'receivedBy is required' });
    }

    const eventRefRaw = (eventReference ?? event_reference) ?? null;
    let event_reference_final = null;
    if (eventRefRaw !== null && eventRefRaw !== undefined && String(eventRefRaw).trim() !== '') {
      if (!mongoose.Types.ObjectId.isValid(eventRefRaw)) {
        return res.status(STATUS.BAD_REQUEST).json({ message: 'eventReference must be a valid event id' });
      }
      event_reference_final = new mongoose.Types.ObjectId(String(eventRefRaw).trim());
    }

    let noteFinal = '';
    if (note !== undefined) {
      if (note === null) noteFinal = '';
      else if (typeof note !== 'string') {
        return res.status(STATUS.BAD_REQUEST).json({ message: 'note must be a string' });
      } else noteFinal = note.trim();
    }

    existing.name = name.trim();
    existing.receivedDate = receivedDate.trim();
    existing.receivedIn = receivedInNorm;
    existing.accountName = accountNameFinal;
    existing.amountReceived = Number(amountReceived);
    existing.receivedBy = receivedBy.trim();
    existing.event_reference = event_reference_final;
    existing.note = noteFinal;
    existing.createdBy = decodedToken.uid || decodedToken.id || existing.createdBy;

    await existing.save();

    const inflowJson = existing.toJSON ? existing.toJSON() : existing;
    return res.status(200).json({
      success: true,
      inflow: {
        _id: String(inflowJson._id || inflowJson.id || inflowJson._id),
        name: inflowJson.name,
        receivedDate: inflowJson.receivedDate,
        receivedIn: inflowJson.receivedIn,
        accountName: inflowJson.receivedIn === 'ACCOUNT' ? inflowJson.accountName : null,
        amountReceived: inflowJson.amountReceived,
        receivedBy: inflowJson.receivedBy,
        eventReference: inflowJson.event_reference ? String(inflowJson.event_reference) : null,
        note: inflowJson.note ?? '',
      },
    });
  } catch (error) {
    console.error('updateInflow:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      message: MESSAGE.internalServerError,
      error: error.message,
    });
  }
};

exports.deleteInflow = async (req, res) => {
  try {
    const decodedToken = requireFinanceRole(req, res);
    if (!decodedToken) return;

    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Valid inflow id is required' });
    }

    const deleted = await DaybookInflow.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(STATUS.NOT_FOUND).json({ message: 'Inflow not found' });
    }

    return res.status(200).json({ success: true, message: 'Inflow deleted successfully' });
  } catch (error) {
    console.error('deleteInflow:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      message: MESSAGE.internalServerError,
      error: error.message,
    });
  }
};

exports.createOpenCloseBalance = async (req, res) => {
  try {
    const decodedToken = requireFinanceRole(req, res);
    if (!decodedToken) return;

    const {
      balanceDate,
      cashOpeningBalance,
      cashClosingBalance,
      accountOpeningBalance,
      accountClosingBalance,
    } = req.body || {};

    if (!balanceDate || !validateYMD(balanceDate)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'balanceDate must be YYYY-MM-DD' });
    }

    const toNonNeg = (v) => {
      const x = typeof v === 'string' ? Number(v) : v;
      return Number.isFinite(x) && x >= 0 ? x : null;
    };

    const cashOpen = toNonNeg(cashOpeningBalance);
    const cashClose = toNonNeg(cashClosingBalance);
    const accOpen = toNonNeg(accountOpeningBalance);
    const accClose = toNonNeg(accountClosingBalance);

    if (cashOpen == null || cashClose == null || accOpen == null || accClose == null) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'All balances must be numbers >= 0' });
    }

    try {
      const created = await DaybookAccountsOpenCloseBalance.create({
        balanceDate: balanceDate.trim(),
        cashOpeningBalance: cashOpen,
        cashClosingBalance: cashClose,
        accountOpeningBalance: accOpen,
        accountClosingBalance: accClose,
        createdBy: decodedToken.uid || decodedToken.id || null,
      });

      return res.status(201).json({ success: true, balance: created.toJSON ? created.toJSON() : created });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ success: false, message: 'Balance already exists for this balanceDate' });
      }
      throw err;
    }
  } catch (error) {
    console.error('createOpenCloseBalance:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      message: MESSAGE.internalServerError,
      error: error.message,
    });
  }
};

exports.updateOpenCloseBalance = async (req, res) => {
  try {
    const decodedToken = requireFinanceRole(req, res);
    if (!decodedToken) return;

    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Valid balance record id is required' });
    }

    const existing = await DaybookAccountsOpenCloseBalance.findById(id);
    if (!existing) {
      return res.status(STATUS.NOT_FOUND).json({ message: 'Balance record not found' });
    }

    const {
      balanceDate,
      cashOpeningBalance,
      cashClosingBalance,
      accountOpeningBalance,
      accountClosingBalance,
    } = req.body || {};

    if (!balanceDate || !validateYMD(balanceDate)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'balanceDate must be YYYY-MM-DD' });
    }

    const toNonNeg = (v) => {
      const x = typeof v === 'string' ? Number(v) : v;
      return Number.isFinite(x) && x >= 0 ? x : null;
    };

    const cashOpen = toNonNeg(cashOpeningBalance);
    const cashClose = toNonNeg(cashClosingBalance);
    const accOpen = toNonNeg(accountOpeningBalance);
    const accClose = toNonNeg(accountClosingBalance);

    if (cashOpen == null || cashClose == null || accOpen == null || accClose == null) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'All balances must be numbers >= 0' });
    }

    existing.balanceDate = balanceDate.trim();
    existing.cashOpeningBalance = cashOpen;
    existing.cashClosingBalance = cashClose;
    existing.accountOpeningBalance = accOpen;
    existing.accountClosingBalance = accClose;

    await existing.save();

    return res.status(200).json({ success: true, balance: existing.toJSON ? existing.toJSON() : existing });
  } catch (error) {
    console.error('updateOpenCloseBalance:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      message: MESSAGE.internalServerError,
      error: error.message,
    });
  }
};

exports.deleteOpenCloseBalance = async (req, res) => {
  try {
    const decodedToken = requireFinanceRole(req, res);
    if (!decodedToken) return;

    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(STATUS.BAD_REQUEST).json({ message: 'Valid balance record id is required' });
    }

    const deleted = await DaybookAccountsOpenCloseBalance.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(STATUS.NOT_FOUND).json({ message: 'Balance record not found' });
    }

    return res.status(200).json({ success: true, message: 'Balance record deleted successfully' });
  } catch (error) {
    console.error('deleteOpenCloseBalance:', error);
    return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
      message: MESSAGE.internalServerError,
      error: error.message,
    });
  }
};

